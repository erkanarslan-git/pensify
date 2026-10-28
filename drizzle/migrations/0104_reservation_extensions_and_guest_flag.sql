ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS guests_confirmed boolean NOT NULL DEFAULT true;

CREATE TABLE public.reservation_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  old_check_out date NOT NULL,
  new_check_out date NOT NULL,
  days integer NOT NULL,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reservation_extensions_res_idx ON public.reservation_extensions(reservation_id, created_at DESC);
ALTER TABLE public.reservation_extensions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.reservation_extensions TO authenticated;

CREATE POLICY "extensions readable with reservation" ON public.reservation_extensions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id AND r.organization_id = reservation_extensions.organization_id));

-- Runs as the caller: the reservation update is subject to the caller's own RLS.
CREATE OR REPLACE FUNCTION public.extend_reservation(_reservation_id uuid, _new_check_out date, _note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _old date; _org uuid; _id uuid;
BEGIN
  SELECT check_out, organization_id INTO _old, _org
    FROM public.reservations WHERE id = _reservation_id AND deleted_at IS NULL FOR UPDATE;
  IF _old IS NULL THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
  IF _new_check_out <= _old THEN RAISE EXCEPTION 'extension_must_be_later'; END IF;
  UPDATE public.reservations SET check_out = _new_check_out WHERE id = _reservation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_allowed'; END IF;
  INSERT INTO public.reservation_extensions(organization_id, reservation_id, old_check_out, new_check_out, days, note)
    VALUES (_org, _reservation_id, _old, _new_check_out, _new_check_out - _old, nullif(trim(_note), ''))
    RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Insert only via the function (invoker needs insert right; restrict by policy to rows of reservations they can update).
GRANT INSERT ON public.reservation_extensions TO authenticated;
CREATE POLICY "extensions insert with reservation" ON public.reservation_extensions
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id AND r.organization_id = reservation_extensions.organization_id AND r.check_out = reservation_extensions.new_check_out));
REVOKE ALL ON FUNCTION public.extend_reservation(uuid, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.extend_reservation(uuid, date, text) TO authenticated;