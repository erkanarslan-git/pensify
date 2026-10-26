ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS channel_sync_mode text NOT NULL DEFAULT 'manual';
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS sales_channels text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.rooms ADD CONSTRAINT rooms_channel_sync_mode_check CHECK (channel_sync_mode IN ('manual','api'));
ALTER TABLE public.rooms ADD CONSTRAINT rooms_sales_channels_check CHECK (sales_channels <@ ARRAY['booking','airbnb','expedia','website']::text[]);
COMMENT ON COLUMN public.rooms.channel_sync_mode IS 'manual = tracked by hand; api = availability is managed through the channel manager. Informational until outbound sync is enabled.';
COMMENT ON COLUMN public.rooms.sales_channels IS 'Where this physical room is listed for sale (booking, airbnb, expedia, website).';

CREATE OR REPLACE FUNCTION public.set_rooms_distribution(_room_ids uuid[], _mode text, _channels text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org uuid := public.default_organization_id(); v_req int; v_ok int; v_upd int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'organization_required'; END IF;
  IF NOT public.has_organization_permission(v_org, 'manage_rooms') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _mode IS NOT NULL AND _mode NOT IN ('manual','api') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  IF _channels IS NOT NULL AND NOT (_channels <@ ARRAY['booking','airbnb','expedia','website']::text[]) THEN RAISE EXCEPTION 'invalid_channel'; END IF;
  SELECT count(DISTINCT id) INTO v_req FROM unnest(coalesce(_room_ids, ARRAY[]::uuid[])) AS q(id);
  IF v_req = 0 OR v_req > 300 THEN RAISE EXCEPTION 'invalid_room_selection'; END IF;
  SELECT count(*) INTO v_ok FROM public.rooms r WHERE r.id = ANY(_room_ids) AND r.organization_id = v_org AND public.can_access_property(r.property_id);
  IF v_ok <> v_req THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.rooms SET
    channel_sync_mode = coalesce(_mode, channel_sync_mode),
    sales_channels = coalesce((SELECT array_agg(DISTINCT c ORDER BY c) FROM unnest(_channels) c), CASE WHEN _channels IS NULL THEN sales_channels ELSE '{}'::text[] END),
    updated_at = now()
  WHERE id = ANY(_room_ids) AND organization_id = v_org;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  RETURN v_upd;
END $$;
REVOKE ALL ON FUNCTION public.set_rooms_distribution(uuid[], text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_rooms_distribution(uuid[], text, text[]) TO authenticated;