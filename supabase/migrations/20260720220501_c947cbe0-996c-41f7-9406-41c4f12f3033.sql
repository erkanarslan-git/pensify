
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_channel_external_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS reservations_channel_room_external_uidx
  ON public.reservations (channel, room_id, external_id)
  WHERE external_id IS NOT NULL;
