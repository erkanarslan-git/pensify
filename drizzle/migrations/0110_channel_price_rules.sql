CREATE TABLE public.property_channel_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  channel public.reservation_channel NOT NULL,
  adjust_percent numeric NOT NULL DEFAULT 0 CHECK (adjust_percent BETWEEN -90 AND 200),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, channel)
);
GRANT SELECT ON public.property_channel_prices TO authenticated;
GRANT ALL ON public.property_channel_prices TO service_role;
ALTER TABLE public.property_channel_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read channel prices" ON public.property_channel_prices FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id) AND public.can_access_property(property_id));

CREATE OR REPLACE FUNCTION public.save_channel_price(_property_id uuid, _channel public.reservation_channel, _percent numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public._require_room_manager(_property_id);
  IF _percent IS NULL OR _percent < -90 OR _percent > 200 THEN RAISE EXCEPTION 'invalid_percent' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.property_channel_prices(organization_id, property_id, channel, adjust_percent, updated_by, updated_at)
  VALUES (v_org, _property_id, _channel, _percent, auth.uid(), now())
  ON CONFLICT (property_id, channel) DO UPDATE SET adjust_percent = EXCLUDED.adjust_percent, updated_by = auth.uid(), updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.save_channel_price(uuid, public.reservation_channel, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_channel_price(uuid, public.reservation_channel, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.quote_room_price_for_channel(_room_id uuid, _check_in date, _check_out date, _guests integer, _channel public.reservation_channel)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total numeric; v_pct numeric;
BEGIN
  v_total := public.quote_room_price(_room_id, _check_in, _check_out, _guests);
  IF v_total IS NULL THEN RETURN NULL; END IF;
  SELECT cp.adjust_percent INTO v_pct FROM public.property_channel_prices cp
    JOIN public.rooms r ON r.property_id = cp.property_id
   WHERE r.id = _room_id AND cp.channel = _channel;
  RETURN round(v_total * (1 + coalesce(v_pct, 0) / 100), 2);
END $$;
REVOKE ALL ON FUNCTION public.quote_room_price_for_channel(uuid, date, date, integer, public.reservation_channel) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_room_price_for_channel(uuid, date, date, integer, public.reservation_channel) TO authenticated, service_role;