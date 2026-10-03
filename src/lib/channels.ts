import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_CHANNELS, type ActiveChannel } from "./guest-color";

// Single source of truth for which channels are switched on (Kanäle page).
// Switched-off channels cannot be picked when entering a booking by hand.
export const CHANNEL_SETTINGS_KEY = "channels.enabled";

export function useEnabledChannels() {
  const { data } = useQuery({
    queryKey: ["channels-enabled"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", CHANNEL_SETTINGS_KEY).maybeSingle();
      return (data?.value ?? {}) as Partial<Record<ActiveChannel, boolean>>;
    },
    staleTime: 60_000,
  });
  const map = data ?? {};
  return ACTIVE_CHANNELS.filter((c) => map[c] !== false);
}
