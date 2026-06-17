
-- Domain enums
CREATE TYPE public.reservation_channel AS ENUM
  ('booking','airbnb','check24','woocommerce','phone','direct','walkin');

CREATE TYPE public.reservation_status AS ENUM
  ('confirmed','tentative','cancelled','no_show','checked_in','checked_out');

CREATE TYPE public.room_status AS ENUM
  ('available','occupied','checkout_today','cleaning_required',
   'cleaning_in_progress','cleaned','maintenance');

CREATE TYPE public.cleaning_status AS ENUM
  ('pending','accepted','in_progress','completed','problem');

CREATE TYPE public.time_entry_status AS ENUM
  ('active','on_break','completed','manually_adjusted','auto_closed');

-- Audit log
CREATE TABLE public.audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  entity      text NOT NULL,
  entity_id   text,
  action      text NOT NULL,
  diff        jsonb,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs (entity, entity_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx  ON public.audit_logs (actor_id, created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_admins_read ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY audit_logs_actor_read ON public.audit_logs FOR SELECT TO authenticated
  USING (actor_id = auth.uid());
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
  v_id text;
  v_diff jsonb;
BEGIN
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = v_actor;
  EXCEPTION WHEN OTHERS THEN v_email := NULL;
  END;
  IF TG_OP = 'DELETE' THEN
    v_id := COALESCE((to_jsonb(OLD)->>'id'),'');
    v_diff := jsonb_build_object('old', to_jsonb(OLD));
  ELSIF TG_OP = 'INSERT' THEN
    v_id := COALESCE((to_jsonb(NEW)->>'id'),'');
    v_diff := jsonb_build_object('new', to_jsonb(NEW));
  ELSE
    v_id := COALESCE((to_jsonb(NEW)->>'id'),'');
    v_diff := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  END IF;
  INSERT INTO public.audit_logs(actor_id, actor_email, entity, entity_id, action, diff)
  VALUES (v_actor, v_email, TG_TABLE_NAME, v_id, TG_OP, v_diff);
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.attach_audit(target regclass)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'DROP TRIGGER IF EXISTS audit_trg ON %s; CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();',
    target, target);
END $$;

-- Cities
CREATE TABLE public.cities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  country    text NOT NULL DEFAULT 'DE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cities TO authenticated;
GRANT ALL ON public.cities TO service_role;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY cities_read ON public.cities FOR SELECT TO authenticated USING (true);
CREATE POLICY cities_write ON public.cities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cities_set_updated_at BEFORE UPDATE ON public.cities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
SELECT public.attach_audit('public.cities'::regclass);

-- Properties
CREATE TABLE public.properties (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id             uuid NOT NULL REFERENCES public.cities(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  address             text NOT NULL,
  latitude            double precision,
  longitude           double precision,
  geofence_radius_m   integer NOT NULL DEFAULT 300,
  qr_token            text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12),'hex'),
  notes               text,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX properties_city_idx ON public.properties(city_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY properties_read ON public.properties FOR SELECT TO authenticated USING (true);
CREATE POLICY properties_write ON public.properties FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER properties_set_updated_at BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
SELECT public.attach_audit('public.properties'::regclass);

-- Rooms
CREATE TABLE public.rooms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  number       text NOT NULL,
  capacity     integer NOT NULL DEFAULT 2,
  status       public.room_status NOT NULL DEFAULT 'available',
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, number)
);
CREATE INDEX rooms_property_idx ON public.rooms(property_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY rooms_read ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY rooms_write ON public.rooms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER rooms_set_updated_at BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
SELECT public.attach_audit('public.rooms'::regclass);

-- Cleaners
CREATE TABLE public.cleaners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name   text NOT NULL,
  phone       text,
  email       text,
  active      boolean NOT NULL DEFAULT true,
  hourly_rate numeric(10,2),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaners TO authenticated;
GRANT ALL ON public.cleaners TO service_role;
ALTER TABLE public.cleaners ENABLE ROW LEVEL SECURITY;
CREATE POLICY cleaners_admin_all ON public.cleaners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY cleaners_self_read ON public.cleaners FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE TRIGGER cleaners_set_updated_at BEFORE UPDATE ON public.cleaners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
SELECT public.attach_audit('public.cleaners'::regclass);

-- Reservations
CREATE TABLE public.reservations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  property_id    uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  guest_name     text NOT NULL,
  guest_email    text,
  guest_phone    text,
  guests_count   integer NOT NULL DEFAULT 1,
  check_in       date NOT NULL,
  check_out      date NOT NULL,
  channel        public.reservation_channel NOT NULL DEFAULT 'direct',
  status         public.reservation_status  NOT NULL DEFAULT 'confirmed',
  revenue        numeric(10,2) NOT NULL DEFAULT 0,
  notes          text,
  external_id    text,
  ical_uid       text,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id)
);
CREATE INDEX reservations_room_dates_idx ON public.reservations(room_id, check_in, check_out);
CREATE INDEX reservations_property_idx   ON public.reservations(property_id);
CREATE INDEX reservations_channel_idx    ON public.reservations(channel);

CREATE OR REPLACE FUNCTION public.validate_reservation_dates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.check_out <= NEW.check_in THEN
    RAISE EXCEPTION 'check_out must be after check_in';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reservations_validate_dates
  BEFORE INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.validate_reservation_dates();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY reservations_read ON public.reservations FOR SELECT TO authenticated USING (true);
CREATE POLICY reservations_write ON public.reservations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE TRIGGER reservations_set_updated_at BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
SELECT public.attach_audit('public.reservations'::regclass);

-- Cleaning tasks
CREATE TABLE public.cleaning_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  property_id  uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  cleaner_id   uuid REFERENCES public.cleaners(id) ON DELETE SET NULL,
  due_at       timestamptz NOT NULL,
  status       public.cleaning_status NOT NULL DEFAULT 'pending',
  photos_count integer NOT NULL DEFAULT 0,
  notes        text,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cleaning_tasks_due_idx     ON public.cleaning_tasks(due_at);
CREATE INDEX cleaning_tasks_cleaner_idx ON public.cleaning_tasks(cleaner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_tasks TO authenticated;
GRANT ALL ON public.cleaning_tasks TO service_role;
ALTER TABLE public.cleaning_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY cleaning_tasks_admin ON public.cleaning_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY cleaning_tasks_cleaner_read ON public.cleaning_tasks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = cleaning_tasks.cleaner_id AND c.user_id = auth.uid()));
CREATE POLICY cleaning_tasks_cleaner_update ON public.cleaning_tasks FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = cleaning_tasks.cleaner_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = cleaning_tasks.cleaner_id AND c.user_id = auth.uid()));
CREATE TRIGGER cleaning_tasks_set_updated_at BEFORE UPDATE ON public.cleaning_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
SELECT public.attach_audit('public.cleaning_tasks'::regclass);

-- Time entries
CREATE TABLE public.time_entries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id            uuid NOT NULL REFERENCES public.cleaners(id) ON DELETE CASCADE,
  property_id           uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  clock_in_at           timestamptz NOT NULL DEFAULT now(),
  clock_in_lat          double precision,
  clock_in_lng          double precision,
  clock_in_accuracy_m   double precision,
  clock_out_at          timestamptz,
  clock_out_lat         double precision,
  clock_out_lng         double precision,
  break_minutes         integer NOT NULL DEFAULT 0,
  break_started_at      timestamptz,
  status                public.time_entry_status NOT NULL DEFAULT 'active',
  source                text NOT NULL DEFAULT 'qr',
  manual_override_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  manual_override_at    timestamptz,
  notes                 text,
  paid_at               timestamptz,
  paid_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_amount           numeric(10,2),
  payment_period_start  date,
  payment_period_end    date,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_entries_cleaner_idx  ON public.time_entries(cleaner_id, clock_in_at DESC);
CREATE INDEX time_entries_property_idx ON public.time_entries(property_id, clock_in_at DESC);
CREATE UNIQUE INDEX time_entries_one_open_per_cleaner
  ON public.time_entries(cleaner_id) WHERE clock_out_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY time_entries_admin ON public.time_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY time_entries_self_read ON public.time_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = time_entries.cleaner_id AND c.user_id = auth.uid()));
CREATE POLICY time_entries_self_insert ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = time_entries.cleaner_id AND c.user_id = auth.uid()));
CREATE POLICY time_entries_self_update ON public.time_entries FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = time_entries.cleaner_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = time_entries.cleaner_id AND c.user_id = auth.uid()));
CREATE TRIGGER time_entries_set_updated_at BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
SELECT public.attach_audit('public.time_entries'::regclass);

-- Channel integrations
CREATE TABLE public.channel_integrations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  channel            public.reservation_channel NOT NULL,
  ical_url           text,
  api_credentials    jsonb,
  enabled            boolean NOT NULL DEFAULT true,
  last_sync_at       timestamptz,
  last_sync_status   text,
  last_sync_error    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, channel)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_integrations TO authenticated;
GRANT ALL ON public.channel_integrations TO service_role;
ALTER TABLE public.channel_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_integrations_admin ON public.channel_integrations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER channel_integrations_set_updated_at BEFORE UPDATE ON public.channel_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
SELECT public.attach_audit('public.channel_integrations'::regclass);

-- =====================================================
-- SEED: 4 cities, 6 pensions, 4 rooms each
-- =====================================================
WITH new_cities AS (
  INSERT INTO public.cities(name) VALUES
    ('Bünde'), ('Löhne'), ('Bielefeld'), ('Osnabrück')
  RETURNING id, name
),
new_props AS (
  INSERT INTO public.properties(city_id, name, address, latitude, longitude)
  SELECT id, 'Pension Bünde — Borriestr.',          'Borriestraße, 32257 Bünde, DE',          52.1989, 8.5847 FROM new_cities WHERE name='Bünde'
  UNION ALL SELECT id, 'Pension Bünde — Carl-Diem-Str.',     'Carl-Diem-Straße, 32257 Bünde, DE',      52.1995, 8.5910 FROM new_cities WHERE name='Bünde'
  UNION ALL SELECT id, 'Pension Bünde — Vinckestr.',         'Vinckestraße, 32257 Bünde, DE',          52.2025, 8.5805 FROM new_cities WHERE name='Bünde'
  UNION ALL SELECT id, 'Pension Löhne — Löhnerstr.',         'Löhner Straße, 32584 Löhne, DE',         52.1956, 8.6892 FROM new_cities WHERE name='Löhne'
  UNION ALL SELECT id, 'Pension Bielefeld — Senner Hellweg', 'Senner Hellweg, 33689 Bielefeld, DE',    52.0302, 8.5325 FROM new_cities WHERE name='Bielefeld'
  UNION ALL SELECT id, 'Pension Osnabrück — Klarastr.',      'Klarastraße, 49074 Osnabrück, DE',       52.2799, 8.0472 FROM new_cities WHERE name='Osnabrück'
  RETURNING id
)
INSERT INTO public.rooms(property_id, number, capacity, status)
SELECT p.id, n.num::text, 2, 'available'::public.room_status
FROM new_props p CROSS JOIN (VALUES (1),(2),(3),(4)) AS n(num);
