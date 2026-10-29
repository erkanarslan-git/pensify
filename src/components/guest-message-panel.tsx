import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, KeyRound, MessageCircle, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { accessMessage, bookingMessage, whatsappDigits, type GuestInfoSettings, type MessageLang } from "@/lib/guest-messages";

interface Props { reservation: { property_id: string; room_id: string; guest_name: string; guest_phone: string | null; check_in: string; check_out: string; revenue: number } }
const DEFAULTS: GuestInfoSettings = { check_in_time: "15:00", check_out_time: "11:00" };

export function GuestMessagePanel({ reservation: r }: Props) {
  const { t } = useTranslation(); const perms = usePermissions();
  const [mode, setMode] = useState<"booking" | "access" | null>(null);
  const [lang, setLang] = useState<MessageLang>("de");
  const [withBank, setWithBank] = useState(false);
  const [ctx, setCtx] = useState<{ g: GuestInfoSettings; prop: string; address: string | null; room: string; codes: Record<string, string | null> } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const canCodes = perms.can("view_access_codes");

  const build = (m: "booking" | "access", c = ctx, l = lang, b = withBank) => {
    if (!c) return;
    const stay = { guestName: r.guest_name, propertyName: c.prop, address: c.address, room: c.room, checkIn: r.check_in, checkOut: r.check_out, amount: r.revenue, reference: `${r.guest_name} ${c.room}` };
    setText(m === "booking" ? bookingMessage(stay, c.g, l, b) : accessMessage(stay, c.g, l, c.codes));
  };

  const open = async (m: "booking" | "access") => {
    setBusy(true);
    const [{ data: org }, { data: prop }, { data: room }] = await Promise.all([
      supabase.rpc("active_organization_id"),
      supabase.from("properties").select("name,address").eq("id", r.property_id).maybeSingle(),
      supabase.from("rooms").select("number").eq("id", r.room_id).maybeSingle(),
    ]);
    let g = DEFAULTS;
    if (org) { const { data } = await supabase.from("guest_message_settings").select("*").eq("organization_id", org).maybeSingle(); if (data) g = data; }
    const codes: Record<string, string | null> = {};
    if (m === "access") {
      const get = async (room: string | null, kind: string) => { const { data, error } = await supabase.rpc("reveal_access_secret", { _property: r.property_id, _room: room as unknown as string, _kind: kind }); return error ? null : (data ?? null); };
      [codes.building, codes.door, codes.keybox] = await Promise.all([get(null, "building"), get(r.room_id, "door"), get(r.room_id, "keybox")]);
    }
    const c = { g, prop: prop?.name ?? "", address: prop?.address ?? null, room: room?.number ?? "", codes };
    setCtx(c); setMode(m); build(m, c); setBusy(false);
    if (m === "access" && !codes.building && !codes.door && !codes.keybox) toast.warning(t("guestMsg.noCodes"));
  };

  const phone = whatsappDigits(r.guest_phone);
  const copy = async () => { await navigator.clipboard.writeText(text); toast.success(t("guestMsg.copied")); };
  const wa = () => { if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener"); };

  return <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => open("booking")}><Send className="h-4 w-4" />{t("guestMsg.booking")}</Button>
    {canCodes && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => open("access")}><KeyRound className="h-4 w-4" />{t("guestMsg.access")}</Button>}
    <Dialog open={mode !== null} onOpenChange={(o) => { if (!o) { setMode(null); setText(""); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t(mode === "access" ? "guestMsg.access" : "guestMsg.booking")}</DialogTitle><DialogDescription>{t("guestMsg.hint")}</DialogDescription></DialogHeader>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(["de", "en", "tr"] as const).map((l) => <Button key={l} type="button" size="sm" variant={lang === l ? "default" : "outline"} onClick={() => { setLang(l); if (mode) build(mode, ctx, l); }}>{l.toUpperCase()}</Button>)}
          {mode === "booking" && <label className="ml-auto flex items-center gap-2"><input type="checkbox" checked={withBank} disabled={!ctx?.g.iban} onChange={(e) => { setWithBank(e.target.checked); build("booking", ctx, lang, e.target.checked); }} />{t("guestMsg.withBank")}</label>}
        </div>
        {mode === "booking" && !ctx?.g.iban && <p className="text-xs text-muted-foreground">{t("guestMsg.noIban")}</p>}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} className="w-full rounded-md border border-input bg-card p-3 text-sm" />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={copy}><Copy className="h-4 w-4" />{t("guestMsg.copy")}</Button>
          <Button type="button" disabled={!phone} onClick={wa} title={phone ? undefined : t("guestMsg.noPhone")}><MessageCircle className="h-4 w-4" />WhatsApp</Button>
        </div>
        {!phone && <p className="text-xs text-muted-foreground">{t("guestMsg.noPhone")}</p>}
      </DialogContent>
    </Dialog>
  </div>;
}
