ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS floor integer;
COMMENT ON COLUMN public.rooms.floor IS 'Floor number (0 = ground floor / zemin)';