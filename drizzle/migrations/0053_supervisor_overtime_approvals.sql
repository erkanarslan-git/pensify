CREATE TABLE public.employee_overtime_rates (
 cleaner_id uuid PRIMARY KEY REFERENCES public.cleaners(id), organization_id uuid NOT NULL REFERENCES public.organizations(id), hourly_rate numeric NOT NULL CHECK(hourly_rate >= 0), updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.employee_overtime_rates TO authenticated;
GRANT ALL ON public.employee_overtime_rates TO service_role;
ALTER TABLE public.employee_overtime_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY overtime_rates_admin_read ON public.employee_overtime_rates FOR SELECT TO authenticated USING(public.is_org_admin(organization_id));
CREATE TABLE public.time_entry_overtime (
 time_entry_id uuid PRIMARY KEY REFERENCES public.time_entries(id), organization_id uuid NOT NULL REFERENCES public.organizations(id), minutes integer NOT NULL CHECK(minutes >= 0), hourly_rate numeric NOT NULL CHECK(hourly_rate >= 0), approved_by uuid NOT NULL, approved_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL
);
GRANT SELECT ON public.time_entry_overtime TO authenticated;
GRANT ALL ON public.time_entry_overtime TO service_role;
ALTER TABLE public.time_entry_overtime ENABLE ROW LEVEL SECURITY;
CREATE POLICY overtime_admin_read ON public.time_entry_overtime FOR SELECT TO authenticated USING(public.is_org_admin(organization_id));
SELECT public.attach_audit('public.employee_overtime_rates');
SELECT public.attach_audit('public.time_entry_overtime');
CREATE FUNCTION public.set_employee_overtime_rate(_cleaner_id uuid, _rate numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.cleaners WHERE id=_cleaner_id;
 IF auth.uid() IS NULL OR org IS NULL OR NOT public.is_org_admin(org) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _rate IS NULL OR _rate < 0 THEN RAISE EXCEPTION 'invalid_rate'; END IF;
 INSERT INTO public.employee_overtime_rates(cleaner_id,organization_id,hourly_rate,updated_by) VALUES(_cleaner_id,org,_rate,auth.uid()) ON CONFLICT(cleaner_id) DO UPDATE SET hourly_rate=excluded.hourly_rate,updated_by=auth.uid(),updated_at=now();
END $$;
CREATE FUNCTION public.approve_time_entry_overtime(_entry_id uuid, _minutes integer, _reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.time_entries; target uuid; rate numeric; net integer;
BEGIN
 SELECT * INTO e FROM public.time_entries WHERE id=_entry_id FOR UPDATE;
 target:=public.cleaner_user(e.cleaner_id);
 IF auth.uid() IS NULL OR e.id IS NULL OR target=auth.uid() OR NOT(public.is_org_admin(e.organization_id) OR (public.has_department_power(e.organization_id,target,'time') AND public.can_access_property(e.property_id))) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF e.clock_out_at IS NULL OR e.needs_review OR e.paid_at IS NOT NULL THEN RAISE EXCEPTION 'entry_not_eligible'; END IF;
 net:=greatest(0,round(extract(epoch FROM (e.clock_out_at-e.clock_in_at))/60)::integer-e.break_minutes);
 IF _minutes IS NULL OR _minutes < 0 OR _minutes > net THEN RAISE EXCEPTION 'invalid_minutes'; END IF;
 IF length(trim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
 SELECT hourly_rate INTO rate FROM public.employee_overtime_rates WHERE cleaner_id=e.cleaner_id AND organization_id=e.organization_id;
 IF rate IS NULL AND _minutes > 0 THEN RAISE EXCEPTION 'overtime_rate_required'; END IF;
 INSERT INTO public.time_entry_overtime(time_entry_id,organization_id,minutes,hourly_rate,approved_by,reason) VALUES(e.id,e.organization_id,_minutes,coalesce(rate,0),auth.uid(),trim(_reason)) ON CONFLICT(time_entry_id) DO UPDATE SET minutes=excluded.minutes,hourly_rate=excluded.hourly_rate,approved_by=auth.uid(),approved_at=now(),reason=excluded.reason;
END $$;
CREATE FUNCTION public.overtime_board(_from date, _to date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.default_organization_id();
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR _to < _from OR _to-_from>366 THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN jsonb_build_object('can_set_rates',public.is_org_admin(org),'staff',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.full_name,'rate',r.hourly_rate)) FROM public.cleaners c LEFT JOIN public.employee_overtime_rates r ON r.cleaner_id=c.id WHERE c.organization_id=org AND public.is_org_admin(org)),'[]'::jsonb),'entries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'cleaner_id',e.cleaner_id,'name',c.full_name,'property',p.name,'clock_in_at',e.clock_in_at,'clock_out_at',e.clock_out_at,'net_minutes',greatest(0,round(extract(epoch FROM(e.clock_out_at-e.clock_in_at))/60)::integer-e.break_minutes),'minutes',coalesce(o.minutes,0),'rate',o.hourly_rate,'approved_at',o.approved_at,'approved_by',coalesce(pr.full_name,'—'),'reason',o.reason,'can_approve',c.user_id IS DISTINCT FROM auth.uid() AND e.paid_at IS NULL)) FROM public.time_entries e JOIN public.cleaners c ON c.id=e.cleaner_id JOIN public.properties p ON p.id=e.property_id LEFT JOIN public.time_entry_overtime o ON o.time_entry_id=e.id LEFT JOIN public.profiles pr ON pr.id=o.approved_by WHERE e.organization_id=org AND e.clock_out_at IS NOT NULL AND NOT e.needs_review AND (e.clock_in_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN _from AND _to AND (public.is_org_admin(org) OR (public.has_department_power(org,c.user_id,'time') AND public.can_access_property(e.property_id)))),'[]'::jsonb));
END $$;
CREATE FUNCTION public.my_time_management_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_org_admin(public.default_organization_id()) OR EXISTS(SELECT 1 FROM public.member_departments d JOIN public.organization_members m ON m.id=d.member_id WHERE d.organization_id=public.default_organization_id() AND m.user_id=auth.uid() AND m.active AND (d.department='hr' OR (d.is_lead AND d.lead_can_fix_time)))
$$;
REVOKE ALL ON FUNCTION public.set_employee_overtime_rate(uuid,numeric),public.approve_time_entry_overtime(uuid,integer,text),public.overtime_board(date,date),public.my_time_management_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_employee_overtime_rate(uuid,numeric),public.approve_time_entry_overtime(uuid,integer,text),public.overtime_board(date,date),public.my_time_management_access() TO authenticated;
CREATE FUNCTION public.guard_overtime_entry_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.time_entry_overtime; net integer;
BEGIN
 SELECT * INTO o FROM public.time_entry_overtime WHERE time_entry_id=OLD.id;
 IF o.time_entry_id IS NULL THEN RETURN NEW; END IF;
 net:=greatest(0,round(extract(epoch FROM(NEW.clock_out_at-NEW.clock_in_at))/60)::integer-NEW.break_minutes);
 IF NEW.clock_out_at IS NULL OR NEW.needs_review OR o.minutes>net THEN RAISE EXCEPTION 'approved_overtime_conflict'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_overtime_entry BEFORE UPDATE OF clock_in_at,clock_out_at,break_minutes,needs_review ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.guard_overtime_entry_changes();
CREATE OR REPLACE FUNCTION public.admin_mark_time_entry_paid(_entry_id uuid,_amount numeric,_period_start date,_period_end date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.time_entries; net integer; ot integer; rate numeric; base numeric; amount numeric;
BEGIN
 SELECT * INTO e FROM public.time_entries WHERE id=_entry_id FOR UPDATE;
 IF auth.uid() IS NULL OR e.id IS NULL OR NOT public.is_org_admin(e.organization_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF e.clock_out_at IS NULL OR e.needs_review THEN RAISE EXCEPTION 'entry_not_eligible'; END IF;
 IF e.paid_at IS NOT NULL THEN RETURN; END IF;
 net:=greatest(0,round(extract(epoch FROM(e.clock_out_at-e.clock_in_at))/60)::integer-e.break_minutes);
 SELECT minutes,hourly_rate INTO ot,rate FROM public.time_entry_overtime WHERE time_entry_id=e.id;
 SELECT hourly_rate INTO base FROM public.cleaners WHERE id=e.cleaner_id;
 amount:=round((net-coalesce(ot,0))*coalesce(base,0)/60+coalesce(ot,0)*coalesce(rate,0)/60,2);
 UPDATE public.time_entries SET paid_at=now(),paid_by=auth.uid(),paid_amount=amount,payment_period_start=_period_start,payment_period_end=_period_end WHERE id=e.id;
END $$;