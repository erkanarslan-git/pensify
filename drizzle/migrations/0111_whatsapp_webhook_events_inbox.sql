CREATE TABLE public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id text,
  event text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);
CREATE UNIQUE INDEX whatsapp_webhook_events_delivery_id_uq
  ON public.whatsapp_webhook_events (delivery_id)
  WHERE delivery_id IS NOT NULL;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.whatsapp_webhook_events IS 'Durable inbox for WhatsApp webhook deliveries; writes only via server-side privileged client.';