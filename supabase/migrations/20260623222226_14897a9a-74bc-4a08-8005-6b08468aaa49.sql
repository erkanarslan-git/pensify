
-- =============================================
-- app_settings
-- =============================================
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_admin_read" ON public.app_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "app_settings_admin_write" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER app_settings_set_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed defaults
INSERT INTO public.app_settings(key, value) VALUES
  ('dispatch.morning_time', '"08:00"'::jsonb),
  ('dispatch.timezone', '"Europe/Istanbul"'::jsonb),
  ('dispatch.enabled', 'true'::jsonb),
  ('dispatch.message_template',
    to_jsonb('Günaydın {ad}! Bugün {N} oda temizliğin var:

{liste}

Başlat: "1 <sıra>" · Bitir: "2 <sıra>"
Örn: "1 3" = 3. odayı başlat.

Veya doğrudan linke tıklayarak GPS ile giriş/çıkış yapabilirsin.'::text)),
  ('dispatch.last_run_date', '""'::jsonb);

-- =============================================
-- dispatch_messages
-- =============================================
CREATE TABLE public.dispatch_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id uuid NOT NULL REFERENCES public.cleaners(id) ON DELETE CASCADE,
  scheduled_for date NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('auto','manual','resend')),
  task_ids uuid[] NOT NULL DEFAULT '{}',
  body text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('queued','sent','delivered','failed')),
  provider text NOT NULL DEFAULT 'simulation',
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dispatch_messages_cleaner_date_idx ON public.dispatch_messages(cleaner_id, scheduled_for DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_messages TO authenticated;
GRANT ALL ON public.dispatch_messages TO service_role;

ALTER TABLE public.dispatch_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_msg_admin_all" ON public.dispatch_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "dispatch_msg_cleaner_read_own" ON public.dispatch_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = dispatch_messages.cleaner_id AND c.user_id = auth.uid()));

-- =============================================
-- dispatch_replies
-- =============================================
CREATE TABLE public.dispatch_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id uuid NOT NULL REFERENCES public.cleaners(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.dispatch_messages(id) ON DELETE SET NULL,
  raw_text text NOT NULL,
  parsed_action text CHECK (parsed_action IN ('start','end','unknown')),
  task_id uuid REFERENCES public.cleaning_tasks(id) ON DELETE SET NULL,
  applied boolean NOT NULL DEFAULT false,
  applied_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  received_via text NOT NULL DEFAULT 'simulation'
);

CREATE INDEX dispatch_replies_cleaner_idx ON public.dispatch_replies(cleaner_id, received_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_replies TO authenticated;
GRANT ALL ON public.dispatch_replies TO service_role;

ALTER TABLE public.dispatch_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_replies_admin_all" ON public.dispatch_replies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "dispatch_replies_cleaner_read_own" ON public.dispatch_replies
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = dispatch_replies.cleaner_id AND c.user_id = auth.uid()));
