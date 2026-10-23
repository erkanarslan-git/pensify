import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Monitor, Plus, Copy, ExternalLink, Ban } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { loadChannelColors } from "@/lib/channel-colors";
import { loadActiveTvDisplays } from "@/lib/tv-displays";

export const Route = createFileRoute("/_authenticated/displays")({
  head: () => ({ meta: [{ title: "TV Ekranları — Pensify" }, { name: "description", content: "Pensify anonim operasyon ekranlarının bağlantılarını yönetin." }, { property: "og:title", content: "TV Ekranları — Pensify" }, { property: "og:description", content: "Firma kapsamlı, iptal edilebilir operasyon ekranları." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DisplaysPage,
});

function DisplaysPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ["tv-displays"], queryFn: ({ signal }) => loadActiveTvDisplays(signal), refetchInterval: 30_000 });
  async function create() {
    setBusy(true);
    try {
      const { error: colorsError } = await supabase.rpc("save_tv_source_colors", { _colors: loadChannelColors() });
      if (colorsError) throw colorsError;
      const { data, error } = await supabase.rpc("create_tv_display", { _name: name.trim() || t("tv.defaultName") });
      if (error) throw error;
      const result = data as { id?: string; token?: string } | null;
      if (!result?.token || !result.id) throw new Error("invalid_response");
      setLink({ id: result.id, url: `${window.location.origin}/tv#${result.token}` });
      setName("");
      await client.invalidateQueries({ queryKey: ["tv-displays"] });
    } catch { toast.error(t("tv.failed")); } finally { setBusy(false); }
  }
  async function setRotation(id: string, seconds: number) {
    setBusy(true);
    try { const { error } = await supabase.rpc("set_tv_rotation", { _id: id, _seconds: seconds }); if (error) throw error; await client.invalidateQueries({queryKey:["tv-displays"]}); } catch { toast.error(t("tv.failed")); } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("revoke_tv_display", { _id: id });
      if (error) throw error;
      if (link?.id === id) setLink(null);
      await client.invalidateQueries({ queryKey: ["tv-displays"] });
    } catch { toast.error(t("tv.failed")); } finally { setBusy(false); }
  }
  return <AppShell title={t("tv.displays")}>
    <div className="flex max-w-2xl flex-wrap items-end gap-3 border-b border-border pb-6">
      <div className="min-w-0 flex-1"><Label htmlFor="display-name">{t("tv.name")}</Label><Input id="display-name" className="mt-2" maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder={t("tv.defaultName")} /></div>
      <Button disabled={busy} onClick={create}><Plus className="mr-2 h-4 w-4" />{t("tv.create")}</Button>
    </div>
    {link && <div className="my-6 flex max-w-2xl flex-wrap gap-3 border-l-4 border-primary bg-primary/5 p-4">
      <Input readOnly value={link.url} aria-label={t("tv.copy")} className="w-full" />
      <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(link.url); toast.success(t("tv.copied")); } catch { toast.error(t("tv.failed")); } }}><Copy className="mr-2 h-4 w-4" />{t("tv.copy")}</Button>
      <Button asChild><a href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />{t("tv.open")}</a></Button>
    </div>}
    <p className="my-5 max-w-2xl text-sm text-muted-foreground">{t("tv.savedLink")}</p>
    {query.isError ? <p role="alert">{t("tv.failed")}</p> : query.isLoading ? <p>{t("common.loading")}</p> : !query.data?.length ? <p className="text-muted-foreground">{t("tv.empty")}</p> : <div className="max-w-3xl divide-y divide-border">{query.data.map(display => <div key={display.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="flex min-w-0 items-center gap-3"><Monitor className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0"><p className="break-words font-medium">{display.name}</p><p className="text-xs text-muted-foreground">{t(display.revoked_at ? "tv.revoked" : "tv.active")}</p></div></div>
      {!display.revoked_at && <div className="flex shrink-0 items-center gap-2"><Select value={String(display.rotation_seconds)} disabled={busy} onValueChange={value=>setRotation(display.id,Number(value))}><SelectTrigger aria-label={t("tv.rotation")} className="w-32"><SelectValue/></SelectTrigger><SelectContent>{[5,10,15,20].map(seconds=><SelectItem key={seconds} value={String(seconds)}>{t("tv.rotationSeconds",{count:seconds})}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={busy} onClick={() => revoke(display.id)}><Ban className="mr-2 h-4 w-4" />{t("tv.revoke")}</Button></div>}
    </div>)}</div>}
  </AppShell>;
}