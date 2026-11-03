import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTIVE_CHANNELS } from "@/lib/guest-color";

const LABEL: Record<string, string> = {
  booking: "Booking.com", airbnb: "Airbnb", expedia: "Expedia", check24: "Check24", website: "Web", direct: "Direkt",
};

export function ChannelPriceRules() {
  const { t } = useTranslation();
  const [props, setProps] = useState<{ id: string; name: string }[]>([]);
  const [pid, setPid] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from("properties").select("id,name").order("name").then(({ data }) => {
      setProps(data ?? []);
      if (data?.[0]) setPid(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!pid) return;
    supabase.from("property_channel_prices").select("channel,adjust_percent").eq("property_id", pid).then(({ data }) => {
      const m: Record<string, string> = {};
      (data ?? []).forEach((r) => (m[r.channel] = String(r.adjust_percent)));
      setVals(m);
    });
  }, [pid]);

  const save = async (ch: string) => {
    const pct = Number(vals[ch] || 0);
    const { error } = await supabase.rpc("save_channel_price", { _property_id: pid, _channel: ch as never, _percent: pct });
    if (error) toast.error(error.message);
    else toast.success(t("channelPrices.saved"));
  };

  return (
    <Card className="p-4 space-y-3 mb-6">
      <div>
        <h2 className="text-base font-semibold">{t("channelPrices.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("channelPrices.desc")}</p>
      </div>
      <Select value={pid} onValueChange={setPid}>
        <SelectTrigger className="sm:w-72"><SelectValue /></SelectTrigger>
        <SelectContent>{props.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
      </Select>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {ACTIVE_CHANNELS.map((ch) => (
          <label key={ch} className="space-y-1">
            <span className="text-xs text-muted-foreground">{LABEL[ch] ?? ch}</span>
            <div className="flex items-center gap-1">
              <Input type="number" step="1" min={-90} max={200} value={vals[ch] ?? "0"}
                onChange={(e) => setVals((v) => ({ ...v, [ch]: e.target.value }))}
                onBlur={() => save(ch)} />
              <span className="text-sm">%</span>
            </div>
          </label>
        ))}
      </div>
    </Card>
  );
}
