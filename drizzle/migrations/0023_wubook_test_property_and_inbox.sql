ALTER TABLE public.channel_accounts
  ADD COLUMN IF NOT EXISTS wubook_acode text,
  ADD COLUMN IF NOT EXISTS wubook_lcode text,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_push_url_check jsonb,
  ADD COLUMN IF NOT EXISTS last_webhook_test jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS channel_accounts_org_provider_lcode_uq
  ON public.channel_accounts (organization_id, provider, wubook_lcode) WHERE wubook_lcode IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS channel_accounts_one_test_per_org_uq
  ON public.channel_accounts (organization_id, provider) WHERE is_test;

CREATE TABLE public.wubook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.channel_accounts(id) ON DELETE CASCADE,
  lcode text NOT NULL,
  rcode text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('test','booking')),
  status text NOT NULL CHECK (status IN ('test_received','received_not_processed','processed','failed')),
  meta jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, lcode, rcode, event_type)
);
GRANT SELECT ON public.wubook_inbox TO authenticated;
GRANT ALL ON public.wubook_inbox TO service_role;
ALTER TABLE public.wubook_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins read wubook inbox" ON public.wubook_inbox
  FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));
CREATE INDEX wubook_inbox_org_received_idx ON public.wubook_inbox (organization_id, received_at DESC);