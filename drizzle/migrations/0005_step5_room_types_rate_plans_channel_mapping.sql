-- Adım 5: room_types, rate_plans, occupancy_rates, kanal eşleştirme tabloları

CREATE TABLE public.room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  capacity INT NOT NULL DEFAULT 2 CHECK (capacity > 0),
  base_occupancy INT NOT NULL DEFAULT 1 CHECK (base_occupancy > 0),
  size_sqm NUMERIC,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE public.rate_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  room_type_id UUID NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  base_price NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
  min_stay INT NOT NULL DEFAULT 1 CHECK (min_stay > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, room_type_id, code)
);

CREATE TABLE public.occupancy_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rate_plan_id UUID NOT NULL REFERENCES public.rate_plans(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  min_stay INT CHECK (min_stay IS NULL OR min_stay > 0),
  closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, rate_plan_id, date)
);

CREATE TABLE public.channel_room_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('booking_com','airbnb','expedia','woobook','direct')),
  room_type_id UUID NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  rate_plan_id UUID REFERENCES public.rate_plans(id) ON DELETE SET NULL,
  external_room_id TEXT,
  external_rate_id TEXT,
  sync_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, channel, room_type_id)
);

-- Aynı organizasyon tutarlılığı: rate_plan ve room_type aynı org'a ait olmalı
CREATE OR REPLACE FUNCTION public.enforce_same_org_rate_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  SELECT organization_id INTO v_org FROM public.room_types WHERE id = NEW.room_type_id;
  IF v_org IS NULL OR v_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'room_type belongs to a different organization';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER rate_plans_same_org BEFORE INSERT OR UPDATE ON public.rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_rate_plan();

CREATE OR REPLACE FUNCTION public.enforce_same_org_occupancy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  SELECT organization_id INTO v_org FROM public.rate_plans WHERE id = NEW.rate_plan_id;
  IF v_org IS NULL OR v_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'rate_plan belongs to a different organization';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER occupancy_rates_same_org BEFORE INSERT OR UPDATE ON public.occupancy_rates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_occupancy();

CREATE OR REPLACE FUNCTION public.enforce_same_org_channel_mapping()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  SELECT organization_id INTO v_org FROM public.room_types WHERE id = NEW.room_type_id;
  IF v_org IS NULL OR v_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'room_type belongs to a different organization';
  END IF;
  IF NEW.rate_plan_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.rate_plans WHERE id = NEW.rate_plan_id;
    IF v_org IS NULL OR v_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'rate_plan belongs to a different organization';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER channel_room_mappings_same_org BEFORE INSERT OR UPDATE ON public.channel_room_mappings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_channel_mapping();

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.occupancy_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_room_mappings TO authenticated;
GRANT ALL ON public.room_types TO service_role;
GRANT ALL ON public.rate_plans TO service_role;
GRANT ALL ON public.occupancy_rates TO service_role;
GRANT ALL ON public.channel_room_mappings TO service_role;

-- RLS: okuma tüm org üyelerine, yazma owner/admin/operations_manager
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occupancy_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_room_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY room_types_select ON public.room_types FOR SELECT TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager','property_manager','reception','cleaner']::public.org_role[]));
CREATE POLICY room_types_write ON public.room_types FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::public.org_role[]))
  WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::public.org_role[]));

CREATE POLICY rate_plans_select ON public.rate_plans FOR SELECT TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager','property_manager','reception','cleaner']::public.org_role[]));
CREATE POLICY rate_plans_write ON public.rate_plans FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::public.org_role[]))
  WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::public.org_role[]));

CREATE POLICY occupancy_rates_select ON public.occupancy_rates FOR SELECT TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager','property_manager','reception','cleaner']::public.org_role[]));
CREATE POLICY occupancy_rates_write ON public.occupancy_rates FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::public.org_role[]))
  WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::public.org_role[]));

CREATE POLICY channel_room_mappings_select ON public.channel_room_mappings FOR SELECT TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager','property_manager','reception']::public.org_role[]));
CREATE POLICY channel_room_mappings_write ON public.channel_room_mappings FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::public.org_role[]))
  WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::public.org_role[]));

CREATE INDEX idx_rate_plans_room_type ON public.rate_plans(room_type_id);
CREATE INDEX idx_occupancy_rates_plan_date ON public.occupancy_rates(rate_plan_id, date);
CREATE INDEX idx_channel_mappings_org ON public.channel_room_mappings(organization_id, channel);