import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadGuestDirectory } from "@/lib/guest-directory.functions";
import type { GuestEntry } from "@/lib/guest-directory";
import { formatDateDE } from "@/lib/date-de";
import { GuestContactEditor } from "@/components/guest-contact-editor";
export const Route = createFileRoute("/_authenticated/guests")({
  head: () => ({ meta: [{ title: "Misafirler ve Firmalar — Pensify" }, { name: "description", content: "Yetkili lokasyonlardaki mevcut misafir, firma ve konaklama kayıtları." }, { property: "og:title", content: "Misafirler ve Firmalar — Pensify" }, { property: "og:description", content: "Misafir ve firmaların konaklama geçmişi." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Guests,
});
function Guests() {
  const { t } = useTranslation(); const [search,setSearch] = useState(""); const [debounced,setDebounced] = useState(""); const [kind,setKind] = useState<"all"|"individual"|"company">("all"); const [page,setPage] = useState(0); const [size,setSize] = useState<10|20|30|40|50>(20); const [selected,setSelected] = useState<GuestEntry|null>(null);
  useEffect(() => { const timer=setTimeout(() => { setDebounced(search); setPage(0); },300); return () => clearTimeout(timer); },[search]);
  const q=useQuery({ queryKey:["guest-directory",debounced,kind,page,size],queryFn:() => loadGuestDirectory({data:{ search:debounced,kind,page,size }}) });
  return <AppShell title={t("guests.title")}><div className="flex flex-wrap gap-2 mb-4"><Input className="sm:max-w-md" value={search} maxLength={120} aria-label={t("guests.search")} placeholder={t("guests.search")} onChange={e=>setSearch(e.target.value)} />{(["all","individual","company"] as const).map(k=><Button key={k} variant={kind===k?"default":"outline"} onClick={()=>{setKind(k);setPage(0);}}>{t(`guests.${k}`)}</Button>)}</div>
    {q.isError?<p role="alert">{t("guests.failed")}</p>:q.isPending?<p>{t("common.loading")}</p>:<><div className="divide-y divide-border">{q.data.rows.length===0?<p className="py-6 text-muted-foreground">{t("guests.empty")}</p>:q.data.rows.map(g=><div key={g.identity_key+g.customer_type} className="py-4 flex flex-wrap gap-3 justify-between"><div className="min-w-0"><Button variant="link" className="p-0 h-auto whitespace-normal text-left" onClick={()=>setSelected(g)}>{g.customer_type==="company"?g.company||g.name:g.name}</Button><p className="text-xs text-muted-foreground break-all">{[g.email,g.phone].filter(Boolean).join(" · ")}</p></div><div className="text-sm">{t("guests.stays")}: {g.stays}<p className="text-xs text-muted-foreground">{t("guests.last")}: {formatDateDE(g.last_stay)}</p></div></div>)}</div><div className="flex flex-wrap gap-3 items-center mt-4"><span className="text-sm">{q.data.total} · {t("guests.page")} {page+1}/{Math.max(1,Math.ceil(q.data.total/size))}</span><select aria-label={t("guests.page")} value={size} className="border border-input bg-card rounded-md p-2" onChange={e=>{const value=Number(e.target.value); if(value===10||value===20||value===30||value===40||value===50){setSize(value);setPage(0);}}}>{[10,20,30,40,50].map(n=><option key={n}>{n}</option>)}</select><Button variant="outline" size="icon" aria-label={t("guests.previous")} disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft /></Button><Button variant="outline" size="icon" aria-label={t("guests.next")} disabled={(page+1)*size>=q.data.total} onClick={()=>setPage(p=>p+1)}><ChevronRight /></Button></div></>}
    <Dialog open={!!selected} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className="max-h-[85dvh] overflow-auto"><DialogHeader><DialogTitle>{selected?.company||selected?.name}</DialogTitle></DialogHeader><p className="text-sm">{selected?.address}</p>{selected&&<GuestContactEditor key={selected.identity_key} guest={selected}/>}<div className="divide-y divide-border">{selected?.reservations.map(r=><div key={r.id} className="py-3 text-sm"><p>{formatDateDE(r.check_in)}–{formatDateDE(r.check_out)} · {t(`reservations.status.${r.status}`,{defaultValue:r.status})}</p>{r.revenue!==undefined&&<p>{t("guests.revenue")}: {Number(r.revenue).toFixed(2)} € · {t("guests.paid")}: {Number(r.paid||0).toFixed(2)} €</p>}</div>)}</div></DialogContent></Dialog>
  </AppShell>;
}