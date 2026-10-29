CREATE TABLE public.guest_message_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  check_in_time text NOT NULL DEFAULT '15:00',
  check_out_time text NOT NULL DEFAULT '11:00',
  account_holder text,
  iban text,
  bic text,
  bank_name text,
  contact_phone text,
  extra_note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.guest_message_settings TO authenticated;
GRANT ALL ON public.guest_message_settings TO service_role;
ALTER TABLE public.guest_message_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY gms_read ON public.guest_message_settings FOR SELECT TO authenticated USING (public.is_organization_member(organization_id));
CREATE POLICY gms_insert ON public.guest_message_settings FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY gms_update ON public.guest_message_settings FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));