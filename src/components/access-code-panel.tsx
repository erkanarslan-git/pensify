import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { berlinLocalToIso } from "@/lib/business-time";
type Kind = "building" | "door" | "keybox";
export function AccessCodePanel({ propertyId, roomId }: { propertyId: string; roomId?: string }) {
  const { t } = useTranslation(); const permissions = usePermissions();
  const [kind, setKind] = useState<Kind>(roomId ? "door" : "building");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [value, setValue] = useState(""); const [from, setFrom] = useState(""); const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRevealed(null); setValue(""); }, [kind, propertyId, roomId]);
  useEffect(() => { if (revealed === null) return; const timer = setTimeout(() => setRevealed(null), 30000); return () => clearTimeout(timer); }, [revealed]);
  if (!permissions.can("view_access_codes") && !permissions.can("edit_access_codes")) return null;
  const reveal = async () => {
    if (revealed !== null) { setRevealed(null); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("reveal_access_secret", { _property: propertyId, ... (roomId ? { _room: roomId } : {}), _kind: kind });
    setBusy(false); if (error) { toast.error(t("accessCodes.failed")); return; } setRevealed(data ?? "—");
  };
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("save_access_secret", { _property: propertyId, ... (roomId ? { _room: roomId } : {}), _kind: kind, _value: value, ... (from ? { _from: berlinLocalToIso(from) } : {}), ... (until ? { _until: berlinLocalToIso(until) } : {}) });
    setBusy(false); if (error) { toast.error(t("accessCodes.failed")); return; } setValue(""); setRevealed(null); toast.success(t("accessCodes.saved"));
  };
  return <section className="space-y-3 border-t border-border pt-3"><h3 className="text-sm font-semibold">{t("accessCodes.title")}</h3><select aria-label={t("accessCodes.title")} value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="w-full rounded-md border border-input bg-card p-2 text-sm">{(["building", "door", "keybox"] as const).map((k) => <option key={k} value={k}>{t(`accessCodes.${k}`)}</option>)}</select>
    {permissions.can("view_access_codes") && <div className="flex items-center justify-between gap-3"><span className="font-mono break-all">{revealed ?? "••••"}</span><Button type="button" variant="outline" disabled={busy} onClick={reveal}>{revealed === null ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{t(revealed === null ? "accessCodes.reveal" : "accessCodes.hide")}</Button></div>}
    {permissions.can("edit_access_codes") && <><Input aria-label={t("accessCodes.value")} type="password" autoComplete="off" maxLength={500} value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("accessCodes.value")} /><div className="grid gap-2 sm:grid-cols-2"><label className="text-xs">{t("accessCodes.from")}<Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="text-xs">{t("accessCodes.until")}<Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} /></label></div><Button type="button" disabled={busy || !value.trim()} onClick={save}>{t("accessCodes.edit")}</Button></>}
  </section>;
}
export function RoomAccessButton({ propertyId, roomId }: { propertyId: string; roomId: string }) {
  const { t } = useTranslation(); const p = usePermissions(); const [open, setOpen] = useState(false);
  if (!p.can("view_access_codes") && !p.can("edit_access_codes")) return <span>••••</span>;
  return <><Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t("accessCodes.title")}><KeyRound className="h-4 w-4" /></Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{t("accessCodes.title")}</DialogTitle></DialogHeader>{open && <AccessCodePanel propertyId={propertyId} roomId={roomId} />}</DialogContent></Dialog></>;
}