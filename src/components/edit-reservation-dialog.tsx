import { displayLocale } from "@/i18n/legacy-ui";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { History, User as UserIcon, Clock, Lock } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { canBookRoom, type BookableRoom, type RoomStay } from "@/lib/room-bookability";
import { useTranslation } from "react-i18next";
import { ReservationCustomerLinks } from '@/components/reservation-customer-links';

type Channel = "booking" | "airbnb" | "check24" | "woocommerce" | "phone" | "direct" | "walkin" | "website" | "ical";
import { sourceLabel } from "@/lib/guest-color";
import { useEnabledChannels } from "@/lib/channels";
const STATUSES = ["confirmed", "tentative", "cancelled", "no_show", "checked_in", "checked_out"] as const;
type Status = typeof STATUSES[number];

interface Property { id: string; name: string }
interface Room extends BookableRoom { number: string }

interface AuditEntry {
  id: string;
  action: string;
  created_at: string;
  actor_email: string | null;
  diff: { old?: Record<string, unknown>; new?: Record<string, unknown> } | null;
}

interface Reservation {
  id: string;
  property_id: string;
  room_id: string;
  guest_name: string;
  customer_type: string | null;
  company_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guests_count: number;
  check_in: string;
  check_out: string;
  channel: Channel;
  status: Status;
  revenue: number;
  list_price: number | null;
  discount_reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reservationId: string | null;
  onSaved?: () => void;
}

const TRACKED = ["property_id", "room_id", "guest_name", "guest_email", "guest_phone",
  "guests_count", "check_in", "check_out", "channel", "status", "revenue", "notes"] as const;

export function EditReservationDialog({ open, onOpenChange, reservationId, onSaved }: Props) {
  const { t } = useTranslation();
  const [stays, setStays] = useState<RoomStay[]>([]);
  const perms = usePermissions();
  const enabledChannels = useEnabledChannels();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [r, setR] = useState<Reservation | null>(null);
  const [original, setOriginal] = useState<Reservation | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [creatorEmail, setCreatorEmail] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const todayIso = new Date().toISOString().slice(0, 10);
  const isPast = !!r && r.check_in < todayIso;
  const canEditPast = perms.can("create_past_reservation");
  const readOnly = isPast && !canEditPast;

  useEffect(() => {
    if (!open || !reservationId) return;
    setLoading(true);
    setShowHistory(false);
    (async () => {
      const [resResult, propsResult, roomsResult, histResult, staysResult] = await Promise.all([
        supabase.from("reservations").select("*").eq("id", reservationId).single(),
        supabase.from("properties").select("id,name").order("name"),
        supabase.from("rooms").select("id,number,property_id,status,active").order("number"),
        supabase.from("audit_logs").select("id,action,created_at,actor_email,diff")
          .eq("entity", "reservations").eq("entity_id", reservationId)
          .order("created_at", { ascending: false }).limit(50),
        supabase.from("reservations").select("id,room_id,check_in,check_out,status,deleted_at").is("deleted_at", null).not("status", "in", "(cancelled,no_show)"),
      ]);
      if (resResult.error || propsResult.error || roomsResult.error || staysResult.error) {
        setR(null); setRooms([]); setLoading(false); toast.error(t("bookingAvailability.failed")); return;
      }
      const res = resResult.data, props = propsResult.data, rms = roomsResult.data, hist = histResult.data;
      setStays(staysResult.data ?? []);
      if (res) { setR(res as Reservation); setOriginal(res as Reservation); }
      setProperties((props ?? []) as Property[]);
      setRooms((rms ?? []) as Room[]);
      setHistory((hist ?? []) as AuditEntry[]);

      if (res?.created_by) {
        const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", res.created_by).maybeSingle();
        setCreatorEmail(prof?.full_name ?? null);
      } else {
        setCreatorEmail(null);
      }
      setLoading(false);
    })();
  }, [open, reservationId]);

  if (!r && open && !loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("legacyUi.recordMissing")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("legacyUi.recordFailed")}</p>
        </DialogContent>
      </Dialog>
    );
  }

  const update = <K extends keyof Reservation>(k: K, v: Reservation[K]) => setR((p) => (p ? { ...p, [k]: v } : p));

  const submit = async () => {
    if (!r) return;
    if (readOnly) { toast.error(t("legacyUi.noPermission"), { description: t("legacyUi.pastRestricted") }); return; }
    const isCompany = r.customer_type === "company";
    if (isCompany && !r.company_name?.trim()) return toast.error(t("newRes.errCompanyName"));
    if (!r.guest_name.trim()) return toast.error(t("newRes.errGuestName"));
    if (r.check_out <= r.check_in) return toast.error(t("newRes.errDates"));
    const room = rooms.find((x) => x.id === r.room_id);
    const orig = original;
    const stayUnchanged = !!orig && orig.room_id === r.room_id && orig.check_in === r.check_in && orig.check_out === r.check_out
      && !["cancelled", "no_show"].includes(orig.status);
    if (!stayUnchanged && !["cancelled", "no_show"].includes(r.status) && (!room || !canBookRoom(room, r.check_in, r.check_out, stays, r.id)))
      return toast.error(t("bookingAvailability.unavailable"));

    setSaving(true);
    const { error } = await supabase.from("reservations").update({
      property_id: r.property_id,
      room_id: r.room_id,
      customer_type: isCompany ? "company" : "person",
      company_name: isCompany ? r.company_name?.trim() ?? null : null,
      guest_name: r.guest_name.trim(),
      guest_email: r.guest_email?.trim() || null,
      guest_phone: r.guest_phone?.trim() || null,
      guests_count: r.guests_count,
      check_in: r.check_in,
      check_out: r.check_out,
      channel: r.channel,
      status: r.status,
      revenue: r.revenue,
      discount_reason: r.discount_reason?.trim() || null,
      notes: r.notes?.trim() || null,
    }).eq("id", r.id);
    setSaving(false);
    if (error) {
      if (error.message.includes("room_not_bookable")) { toast.error(t("bookingAvailability.unavailable")); return; }
      toast.error(t("legacyUi.updateFailed"), { description: error.message });
      return;
    }
    toast.success(t("legacyUi.updated"));
    onOpenChange(false);
    onSaved?.();
  };

  const propRooms = r ? rooms.filter((x) => x.property_id === r.property_id && canBookRoom(x, r.check_in, r.check_out, stays, r.id)) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("legacyUi.editReservation")}</DialogTitle>
          <DialogDescription>
            {r && (
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <UserIcon className="w-3 h-3" />
                {t("legacyUi.createdBy")}: {creatorEmail ?? "—"} · {new Date(r.created_at).toLocaleString(displayLocale(), { timeZone: BUSINESS_TIME_ZONE })}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading || !r ? (
          <div className="py-12 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : (
          <>
            {readOnly && (
              <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground dark:text-warning flex items-center gap-2">
                <Lock className="w-3.5 h-3.5" />
                {t("legacyUi.pastRestricted")}
              </div>
            )}
            <fieldset disabled={readOnly} className={readOnly ? "opacity-90" : ""}>
            <details className="mb-4 border-b border-border pb-3"><summary className="cursor-pointer text-sm font-medium">{t('records.linked')}</summary><div className="mt-3"><ReservationCustomerLinks key={r.id} reservationIds={[r.id]} defaultKind={r.customer_type==='company'?'company':'person'} initialName={r.customer_type==='company'?r.company_name??r.guest_name:r.guest_name}/></div></details>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="col-span-full grid gap-1">
                <span className="text-xs text-muted-foreground">{t("newRes.personOrCompany")}</span>
                <div className="inline-flex rounded-md border border-input overflow-hidden w-fit">
                  {(["person", "company"] as const).map((ct) => (
                    <button key={ct} type="button" onClick={() => update("customer_type", ct)}
                      className={`px-4 py-1.5 text-sm ${((r.customer_type ?? "person") === ct) ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                      {ct === "person" ? t("newRes.person") : t("newRes.company")}
                    </button>
                  ))}
                </div>
              </div>
              {r.customer_type === "company" && (
                <label className="col-span-full grid gap-1">
                  <span className="text-xs text-muted-foreground">{t("newRes.companyName")}</span>
                  <input value={r.company_name ?? ""} onChange={(e) => update("company_name", e.target.value)}
                    className="px-3 py-2 rounded-md border border-input bg-card" />
                </label>
              )}
              <label className="col-span-full grid gap-1">
                <span className="text-xs text-muted-foreground">{r.customer_type === "company" ? t("newRes.contactPerson") + " *" : t("newRes.guestName")}</span>
                <input value={r.guest_name} onChange={(e) => update("guest_name", e.target.value)}
                  className="px-3 py-2 rounded-md border border-input bg-card" />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">{t("newRes.property")}</span>
                <select value={r.property_id} onChange={(e) => {
                  update("property_id", e.target.value);
                  const first = rooms.find((x) => x.property_id === e.target.value && canBookRoom(x, r.check_in, r.check_out, stays, r.id));
                  update("room_id", first?.id ?? "");
                }} className="px-3 py-2 rounded-md border border-input bg-card">
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">{t("newRes.room")}</span>
                <select value={r.room_id} onChange={(e) => update("room_id", e.target.value)}
                  className="px-3 py-2 rounded-md border border-input bg-card">
                  {!propRooms.some((x) => x.id === r.room_id) && <option value={r.room_id} disabled>{t("bookingAvailability.unavailable")}</option>}
                  {propRooms.length === 0 && <option value="" disabled>{t("bookingAvailability.empty")}</option>}
                  {propRooms.map((rm) => <option key={rm.id} value={rm.id}>#{rm.number}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">{t("newRes.checkIn")}</span>
                <input type="date" value={r.check_in} onChange={(e) => update("check_in", e.target.value)}
                  className="px-3 py-2 rounded-md border border-input bg-card" />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">{t("newRes.checkOut")}</span>
                <input type="date" value={r.check_out} onChange={(e) => update("check_out", e.target.value)}
                  className="px-3 py-2 rounded-md border border-input bg-card" />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">{t("newRes.channel")}</span>
                <select value={r.channel} onChange={(e) => update("channel", e.target.value as Channel)}
                  className="px-3 py-2 rounded-md border border-input bg-card">
                  {Array.from(new Set<string>([r.channel, ...enabledChannels])).map((c) => <option key={c} value={c}>{sourceLabel(c, (k) => t(k))}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">{t("resv.thStatus")}</span>
                <select value={r.status} onChange={(e) => update("status", e.target.value as Status)}
                  className="px-3 py-2 rounded-md border border-input bg-card">
                  {STATUSES.map((s) => <option key={s} value={s}>{t(`resStatus.${s}`)}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">{t("common.guests")}</span>
                <input type="number" min={1} value={r.guests_count}
                  onChange={(e) => update("guests_count", Math.max(1, +e.target.value || 1))}
                  className="px-3 py-2 rounded-md border border-input bg-card" />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">{t("newRes.amount")}</span>
                <input type="number" min={0} step="0.01" value={r.revenue}
                  onChange={(e) => update("revenue", Math.max(0, +e.target.value || 0))}
                  className="px-3 py-2 rounded-md border border-input bg-card" />
                {r.list_price != null && (
                  <span className="text-[11px] text-muted-foreground">{t("editRes.calculated", { price: Number(r.list_price).toFixed(2) })}</span>
                )}
              </label>
              {r.list_price != null && Number(r.revenue) !== Number(r.list_price) && (
                <label className="col-span-full grid gap-1">
                  <span className="text-xs text-muted-foreground">{t("editRes.discountReason")}</span>
                  <input value={r.discount_reason ?? ""} onChange={(e) => update("discount_reason", e.target.value)}
                    className="px-3 py-2 rounded-md border border-input bg-card" />
                </label>
              )}
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">{t("common.email")}</span>
                <input value={r.guest_email ?? ""} onChange={(e) => update("guest_email", e.target.value)}
                  className="px-3 py-2 rounded-md border border-input bg-card" />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">{t("newRes.phone")}</span>
                <input value={r.guest_phone ?? ""} onChange={(e) => update("guest_phone", e.target.value)}
                  className="px-3 py-2 rounded-md border border-input bg-card" />
              </label>
              <label className="col-span-full grid gap-1">
                <span className="text-xs text-muted-foreground">{t("newRes.note")}</span>
                <textarea value={r.notes ?? ""} onChange={(e) => update("notes", e.target.value)} rows={2}
                  className="px-3 py-2 rounded-md border border-input bg-card resize-none" />
              </label>
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <button
                onClick={() => setShowHistory((s) => !s)}
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <History className="w-4 h-4" />
                {t("pages.logs.title")} {history.length > 0 && `(${history.length})`}
              </button>
              {showHistory && (
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                  {history.length === 0 ? (
                    <div className="text-xs text-muted-foreground">{t("legacyUi.historyEmpty")}</div>
                  ) : history.map((h) => {
                    const old = h.diff?.old ?? {};
                    const nw = h.diff?.new ?? {};
                    const changes = TRACKED.filter((k) => h.action === "UPDATE" && JSON.stringify(old[k]) !== JSON.stringify(nw[k]));
                    return (
                      <div key={h.id} className="rounded-md border border-border p-2 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {new Date(h.created_at).toLocaleString(displayLocale(), { timeZone: BUSINESS_TIME_ZONE })}
                          <span className="px-1.5 py-0.5 rounded bg-accent">{t(`pages.logs.${({ INSERT: "create", UPDATE: "update", DELETE: "delete" } as Record<string, string>)[h.action] ?? "action"}`)}</span>
                          <span className="ml-auto">{h.actor_email ?? t("pages.logs.system")}</span>
                        </div>
                        {h.action === "UPDATE" && changes.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {changes.map((k) => (
                              <li key={k}>
                                <span className="font-medium">{t(({ property_id: "newRes.property", room_id: "newRes.room", guest_name: "resv.thGuest", guest_email: "common.email", guest_phone: "newRes.phone", guests_count: "common.guests", check_in: "newRes.checkIn", check_out: "newRes.checkOut", channel: "newRes.channel", status: "resv.thStatus", revenue: "newRes.amount", notes: "newRes.note" })[k])}:</span>{" "}
                                <span className="text-muted-foreground line-through">{String(old[k] ?? "—")}</span>{" → "}
                                <span>{String(nw[k] ?? "—")}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {h.action === "INSERT" && <div className="mt-1 text-muted-foreground">{t("pages.logs.create")}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            </fieldset>

            <DialogFooter>
              <button onClick={() => onOpenChange(false)} disabled={saving}
                className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">{readOnly ? t("editRes.close") : t("common.cancel")}</button>
              {!readOnly && (
                <button onClick={submit} disabled={saving}
                  className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {saving ? t("newRes.saving") : t("common.save")}
                </button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
