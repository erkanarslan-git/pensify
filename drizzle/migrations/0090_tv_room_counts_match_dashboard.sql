ALTER FUNCTION public.tv_snapshot_v3(text) RENAME TO tv_snapshot_v3_base;
REVOKE ALL ON FUNCTION public.tv_snapshot_v3_base(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.tv_snapshot_v3(_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE result jsonb; org uuid; props jsonb; totals jsonb;
BEGIN
 result:=public.tv_snapshot_v3_base(_token);
 IF result IS NULL THEN RETURN NULL; END IF;
 SELECT organization_id INTO org FROM public.tv_displays WHERE token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex') AND revoked_at IS NULL;
 IF org IS NULL THEN RETURN NULL; END IF;
 WITH c AS (
  SELECT p.name, count(r.id)::int total,
   count(r.id) FILTER(WHERE s.status IN ('occupied','checkout_today'))::int occupied,
   count(r.id) FILTER(WHERE s.status IN ('available','cleaned'))::int ready,
   count(r.id) FILTER(WHERE s.status IN ('cleaning_required','cleaning_in_progress'))::int cleaning,
   count(r.id) FILTER(WHERE s.status='maintenance')::int maintenance
  FROM public.properties p LEFT JOIN public.rooms r ON r.property_id=p.id AND r.organization_id=org AND r.active
  LEFT JOIN public.room_operational_status s ON s.room_id=r.id AND s.organization_id=org
  WHERE p.organization_id=org AND p.active GROUP BY p.id,p.name)
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.name,'total',c.total,'occupied',c.occupied,'ready',c.ready,'cleaning',c.cleaning,'maintenance',c.maintenance,
   'arrivals',coalesce((SELECT (e->>'arrivals')::int FROM jsonb_array_elements(result->'properties') e WHERE e->>'name'=c.name LIMIT 1),0),
   'departures',coalesce((SELECT (e->>'departures')::int FROM jsonb_array_elements(result->'properties') e WHERE e->>'name'=c.name LIMIT 1),0)) ORDER BY c.name),'[]'::jsonb),
  jsonb_build_object('total',coalesce(sum(total),0),'occupied',coalesce(sum(occupied),0),'ready',coalesce(sum(ready),0),'cleaning',coalesce(sum(cleaning),0),'maintenance',coalesce(sum(maintenance),0))
 INTO props,totals FROM c;
 result:=jsonb_set(result,'{properties}',props);
 result:=jsonb_set(result,'{totals}',(result->'totals')||totals);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.tv_snapshot_v3(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tv_snapshot_v3(text) TO anon, authenticated, service_role;