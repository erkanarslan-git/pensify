CREATE TABLE public.channel_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'wubook',
  property_code text,
  secret_name text,
  enabled boolean NOT NULL DEFAULT false,
  dry_run boolean NOT NULL DEFAULT true,
  last_push_at timestamptz,
  last_pull_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_accounts TO authenticated;
GRANT ALL ON public.channel_accounts TO service_role;
ALTER TABLE public.channel_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read channel accounts" ON public.channel_accounts FOR SELECT TO authenticated
  USING (public.has_organization_permission(organization_id, 'manage_integrations'));
CREATE POLICY "integration managers write channel accounts" ON public.channel_accounts FOR ALL TO authenticated
  USING (public.has_organization_permission(organization_id, 'manage_integrations'))
  WITH CHECK (public.has_organization_permission(organization_id, 'manage_integrations'));
CREATE TRIGGER channel_accounts_set_updated_at BEFORE UPDATE ON public.channel_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.integration_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'wubook',
  event text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX integration_outbox_pending_idx ON public.integration_outbox (status, next_attempt_at) WHERE status IN ('pending','retry');
CREATE INDEX integration_outbox_org_idx ON public.integration_outbox (organization_id, created_at DESC);
GRANT SELECT, UPDATE ON public.integration_outbox TO authenticated;
GRANT ALL ON public.integration_outbox TO service_role;
ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration managers read outbox" ON public.integration_outbox FOR SELECT TO authenticated
  USING (public.has_organization_permission(organization_id, 'manage_integrations'));
CREATE POLICY "integration managers retry outbox" ON public.integration_outbox FOR UPDATE TO authenticated
  USING (public.has_organization_permission(organization_id, 'manage_integrations'))
  WITH CHECK (public.has_organization_permission(organization_id, 'manage_integrations'));

CREATE OR REPLACE FUNCTION public.enqueue_channel_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r jsonb := to_jsonb(COALESCE(NEW, OLD)); o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
        v_event text; v_payload jsonb;
BEGIN
  IF TG_TABLE_NAME = 'reservations' THEN
    IF TG_OP = 'UPDATE' AND (r->>'room_id', r->>'check_in', r->>'check_out', r->>'status')
       IS NOT DISTINCT FROM (o->>'room_id', o->>'check_in', o->>'check_out', o->>'status') THEN RETURN NULL; END IF;
    v_event := 'availability';
    v_payload := jsonb_build_object('room_ids', jsonb_build_array(r->>'room_id', o->>'room_id') - 'null',
      'from', LEAST(r->>'check_in', COALESCE(o->>'check_in', r->>'check_in')),
      'to', GREATEST(r->>'check_out', COALESCE(o->>'check_out', r->>'check_out')),
      'reservation_id', r->>'id', 'channel', r->>'channel', 'op', TG_OP);
  ELSIF TG_TABLE_NAME = 'rate_plans' THEN
    IF TG_OP = 'UPDATE' AND (r->>'base_price', r->>'min_stay', r->>'active') IS NOT DISTINCT FROM (o->>'base_price', o->>'min_stay', o->>'active') THEN RETURN NULL; END IF;
    v_event := 'rates'; v_payload := jsonb_build_object('rate_plan_id', r->>'id', 'op', TG_OP);
  ELSE
    v_event := 'rates'; v_payload := jsonb_build_object('rate_plan_id', r->>'rate_plan_id', 'date', r->>'date', 'op', TG_OP);
  END IF;
  INSERT INTO public.integration_outbox(organization_id, event, payload)
  VALUES ((r->>'organization_id')::uuid, v_event, v_payload);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_channel_event() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER channel_outbox_trg AFTER INSERT OR UPDATE OR DELETE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.enqueue_channel_event();
CREATE TRIGGER channel_outbox_trg AFTER INSERT OR UPDATE OR DELETE ON public.rate_plans FOR EACH ROW EXECUTE FUNCTION public.enqueue_channel_event();
CREATE TRIGGER channel_outbox_trg AFTER INSERT OR UPDATE OR DELETE ON public.occupancy_rates FOR EACH ROW EXECUTE FUNCTION public.enqueue_channel_event();