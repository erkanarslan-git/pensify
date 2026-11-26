import { PAYMENT_METHODS, PAYMENT_METHOD_TITLE, paymentMethodLabel } from "@/lib/payment-method";
import { displayLocale } from "@/i18n/legacy-ui";
import { businessDate as businessDateNow } from "@/lib/business-time";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { History, User as UserIcon, Clock, Lock, CalendarPlus, Ban, Trash2 } from "lucide-react";
import { promptAction } from "@/components/confirm-dialog";
import { reservationActionReason } from "@/lib/reservation-actions";
import { formatDateDE } from "@/lib/date-de";
import { extensionDays } from "@/lib/overnight-stats";
import { usePermissions } from "@/hooks/use-permissions";
import { canBookRoom, roomChoiceState, roomTypeCode, ROOM_CHOICE_LABELS, type BookableRoom, type RoomStay } from "@/lib/room-bookability";
import { useTranslation } from "react-i18next";
import { GuestMessagePanel } from '@/components/guest-message-panel';
import { ReservationCustomerLinks } from '@/components/reservation-customer-links';
import { InvoiceDialog } from '@/components/invoice-dialog';

type Channel = "booking" | "airbnb" | "check24" | "woocommerce" | "phone" | "direct" | "walkin" | "website" | "ical";
import { sourceLabel } from "@/lib/guest-color";
import { useEnabledChannels } from "@/lib/channels";
const STATUSES = ["confirmed", "tentative", "cancelled", "no_show", "checked_in", "checked_out"] as const;
type Status = typeof STATUSES[number];

interface Property { id: string; name: string }
interface Room extends BookableRoom { number: string; capacity: number | null }

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
  guests_confirmed: boolean;
  check_in: string;
  check_out: string;
  channel: Channel;
  status: Status;
  revenue: number;
  list_price: number | null;
  discount_reason: string | null;
  notes: string | null;
  payment_method: string | null;
  long_stay: boolean;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
}

interface Extension { id: string; old_check_out: string; new_check_out: string; days: number; note: string | null; created_at: string }

const addDaysIso = (iso: string, d: number) => {
  const x = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d));
  return x.toISOString().slice(0, 10);
};

const LS: Record<string,string> = { de: "Dauergast", tr: "Uzun dönem misafir", en: "Long-stay guest" };
const LSH: Record<string,string> = { de: "Zimmer bleibt belegt; die Abreise wird automatisch verlängert, bis Sie dies abwählen.", tr: "Oda dolu kalır; işareti kaldırana kadar çıkış tarihi otomatik uzatılır.", en: "The room stays occupied; check-out is extended automatically until you untick this." };

const EXT_COPY = {
  de: { title: "Aufenthalt verlängern", current: "Abreise", button: "Verlängern", newDate: "Neue Abreise", note: "Notiz (optional)", later: "Die neue Abreise muss nach der aktuellen liegen.", done: (n: number) => `Um ${n} Nächte verlängert`, confirmExt: (n: number) => `+${n} Nächte bestätigen`, guestsMissing: "Personenzahl nicht erfasst", confirm: "Stimmt so" },
  tr: { title: "Konaklamayı uzat", current: "Çıkış", button: "Uzat", newDate: "Yeni çıkış", note: "Not (isteğe bağlı)", later: "Yeni çıkış mevcut çıkıştan sonra olmalı.", done: (n: number) => `${n} gece uzatıldı`, confirmExt: (n: number) => `+${n} gece onayla`, guestsMissing: "Kişi sayısı girilmemiş", confirm: "Doğru" },
  en: { title: "Extend stay", current: "Check-out", button: "Extend", newDate: "New check-out", note: "Note (optional)", later: "The new check-out must be after the current one.", done: (n: number) => `Extended by ${n} nights`, confirmExt: (n: number) => `Confirm +${n} nights`, guestsMissing: "Guest count not recorded", confirm: "Correct" },
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reservationId: string | null;
  onSaved?: () => void;
}

const TRACKED = ["property_id", "room_id", "guest_name", "guest_email", "guest_phone",
  "guests_count", "check_in", "check_out", "channel", "status", "revenue", "notes", "payment_method", "long_stay", "cancellation_reason"] as const;

export function EditReservationDialog({ open, onOpenChange, reservationId, onSaved }: Props) {
  const { t } = useTranslation();
  const [stays, setStays] = useState<RoomStay[]>([]);
  const perms = usePermissions();
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const enabledChannels = useEnabledChannels();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [r, setR] = useState<Reservation | null>(null);
  const [original, setOriginal] = useState<Reservation | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [creatorEmail, setCreatorEmail] = useState<string | null>(null);
  const [cancellerName, setCancellerName] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const { i18n } = useTranslation();
  const ex = EXT_COPY[i18n.language.startsWith("tr") ? "tr" : i18n.language.startsWith("en") ? "en" : "de"];
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [extOpen, setExtOpen] = useState(false);
  const [extDate, setExtDate] = useState("");
  const [extNote, setExtNote] = useState("");
  const [extSaving, setExtSaving] = useState(false);
  const loadExtensions = async (id: string) => {
    const { data } = await supabase.from("reservation_extensions").select("id,old_check_out,new_check_out,days,note,created_at").eq("reservation_id", id).order("created_at", { ascending: false });
    setExtensions((data ?? []) as Extension[]);
  };
  const extend = async () => {
    if (!r || !extDate) return;
    if (extDate <= r.check_out) { toast.error(ex.later); return; }
    const others = stays.filter((s) => s.id !== r.id && s.room_id === r.room_id && s.check_in < extDate && s.check_out > r.check_out);
    if (others.length) { toast.error(t("bookingAvailability.unavailable")); return; }
    setExtSaving(true);
    const { error } = await supabase.rpc("extend_reservation", { _reservation_id: r.id, _new_check_out: extDate, _note: extNote || undefined });
    setExtSaving(false);
    if (error) { toast.error(error.message.includes("room_not_bookable") || error.message.includes("overlap") ? t("bookingAvailability.unavailable") : t("legacyUi.updateFailed"), { description: error.message }); return; }
    toast.success(ex.done(extensionDays(r.check_out, extDate)));
    setR({ ...r, check_out: extDate }); setOriginal((o) => (o ? { ...o, check_out: extDate } : o));
    setExtOpen(false); setExtNote("");
    loadExtensions(r.id); onSaved?.();
  };

  const todayIso = businessDateNow();
  const isPast = !!r && r.check_out <= todayIso;
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
        supabase.from("rooms").select("id,number,property_id,status,active,capacity").order("number"),
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
      if (res) { setR(res as Reservation); setOriginal(res as Reservation); setExtDate(""); setExtOpen(false); loadExtensions(res.id); }
      setProperties((props ?? []) as Property[]);
      setRooms((rms ?? []) as Room[]);
      setHistory((hist ?? []) as AuditEntry[]);

      const peopleIds = Array.from(new Set([res?.created_by, res?.cancelled_by].filter((id): id is string => typeof id === "string")));
      if (peopleIds.length) {
        const { data: people } = await supabase.from("profiles").select("id,full_name").in("id", peopleIds);
        setCreatorEmail(people?.find((person) => person.id === res?.created_by)?.full_name ?? null);
        setCancellerName(people?.find((person) => person.id === res?.cancelled_by)?.full_name ?? null);
      } else {
        setCreatorEmail(null);
        setCancellerName(null);
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
      guests_confirmed: r.guests_confirmed,
      check_in: r.check_in,
      check_out: r.check_out,
      channel: r.channel,
      status: r.status,
      revenue: r.revenue,
      discount_reason: r.discount_reason?.trim() || null,
      notes: r.notes?.trim() || null,
      payment_method: r.payment_method || null,
      long_stay: r.long_stay,
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

  const cancelStay = async () => {
    if (!r) return;
    const reason = reservationActionReason(await promptAction({
      title: t("resv.cancelTitle"),
      description: t("resv.cancelPrompt", { name: r.guest_name }),
      confirmLabel: t("resv.cancelTitle"),
      input: { label: t("resv.cancelReason") },
      destructive: true,
      required: true,
    }));
    if (!reason) return;
    setSaving(true);
    const { error } = await supabase.rpc("cancel_reservation", { _id: r.id, _reason: reason });
    setSaving(false);
    if (error) {
      toast.error(error.code === "42501" ? t("legacyUi.noPermission") : t("resv.cancelFailed"), { description: error.message });
      return;
    }
    toast.success(t("resv.cancelledToast"));
    onOpenChange(false);
    onSaved?.();
  };

  const deleteStay = async () => {
    if (!r) return;
    const reason = reservationActionReason(await promptAction({
      title: t("resv.deleteTitle"),
      description: t("resv.deletePrompt", { name: r.guest_name }),
      confirmLabel: t("common.delete"),
      input: { label: t("legacyUi.reason") },
      destructive: true,
      required: true,
    }));
    if (!reason) return;
    setSaving(true);
    const { error } = await supabase.rpc("soft_delete_reservation", { _id: r.id, _reason: reason });
    setSaving(false);
    if (error) {
      const invoiceBlocked = error.message.includes("invoice_history");
      const message = invoiceBlocked ? t("resv.invoiceDeleteBlocked") : error.code === "42501" ? t("resv.noPermission") : t("resv.deleteFailed");
      if (invoiceBlocked) toast.error(message);
      else toast.error(message, { description: error.message });
      return;
    }
    toast.success(t("resv.deletedToast"));
    onOpenChange(false);
    onSaved?.();
  };

  const propRooms = r ? rooms.filter((x) => x.property_id === r.property_id && canBookRoom(x, r.check_in, r.check_out, stays, r.id)) : [];
  const allPropRooms = r ? rooms.filter((x) => x.property_id === r.property_id).map((x) => ({ room: x, state: roomChoiceState(x, r.check_in, r.check_out, stays, [], r.id) })) : [];
  const RL = ROOM_CHOICE_LABELS[i18n.language.slice(0, 2)] ?? ROOM_CHOICE_LABELS.de!;
  const canCancel = !!r && !readOnly && perms.can("create_reservation") && !r.deleted_at && !["cancelled", "no_show", "checked_out"].includes(r.status);
  const canDelete = !!r && !readOnly && perms.can("delete_reservation") && !r.deleted_at;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("legacyUi.editReservation")}{r && (r as { booking_number?: number }).booking_number ? <span className="ml-2 font-mono text-sm text-muted-foreground">B-{(r as { booking_number?: number }).booking_number}</span> : null}</DialogTitle>
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
            {r.status === "cancelled" && r.cancellation_reason && (
              <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
                <div className="font-semibold text-destructive">{t("resStatus.cancelled")}: {r.cancellation_reason}</div>
                {r.cancelled_at && <div className="mt-1 text-muted-foreground">{t("resv.cancelledBy", { name: cancellerName ?? t("pages.logs.system"), date: new Date(r.cancelled_at).toLocaleString(displayLocale(), { timeZone: BUSINESS_TIME_ZONE }) })}</div>}
              </div>
            )}
            {readOnly && (
              <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground dark:text-warning flex items-center gap-2">
                <Lock className="w-3.5 h-3.5" />
                {t("legacyUi.pastRestricted")}
              </div>
            )}
            <GuestMessagePanel reservation={r} />
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
                <span className="text-xs text-muted-foreground">{t("newRes.room")} · {RL.free_n.replace("{n}", String(propRooms.length))}</span>
                <select value={r.room_id} onChange={(e) => update("room_id", e.target.value)}
                  className="px-3 py-2 rounded-md border border-input bg-card">
                  {!propRooms.some((x) => x.id === r.room_id) && <option value={r.room_id} disabled>{t("bookingAvailability.unavailable")}</option>}
                  {propRooms.length === 0 && <option value="" disabled>{t("bookingAvailability.empty")}</option>}
                  {allPropRooms.map(({ room: rm, state }) => <option key={rm.id} value={rm.id} disabled={state !== "free"}>#{rm.number} · {roomTypeCode(rm.capacity)} ({RL.beds.replace("{n}", String(rm.capacity ?? "?"))}){state !== "free" ? ` — ${RL[state]}` : ""}</option>)}
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
                  {STATUSES.filter((s) => s !== "cancelled" || r.status === "cancelled").map((s) => <option key={s} value={s}>{t(`resStatus.${s}`)}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">{t("common.guests")}</span>
                <input type="number" min={1} value={r.guests_count}
                  onChange={(e) => { update("guests_count", Math.max(1, +e.target.value || 1)); update("guests_confirmed", true); }}
                  className={`px-3 py-2 rounded-md border bg-card ${r.guests_confirmed ? "border-input" : "border-warning"}`} />
                {!r.guests_confirmed && (
                  <span className="text-[11px] text-warning flex items-center gap-2">{ex.guestsMissing}
                    <button type="button" className="underline" onClick={() => update("guests_confirmed", true)}>{ex.confirm}</button></span>
                )}
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
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">{PAYMENT_METHOD_TITLE[i18n.language.slice(0, 2)] ?? PAYMENT_METHOD_TITLE.de}</span>
                <select value={r.payment_method ?? ""} onChange={(e) => update("payment_method", e.target.value || null)}
                  className="px-3 py-2 rounded-md border border-input bg-card">
                  {(["", ...PAYMENT_METHODS] as string[]).map((m) => <option key={m} value={m}>{paymentMethodLabel(m || null, i18n.language)}</option>)}
                </select>
              </label>
              <label className="col-span-full flex items-start gap-2 rounded-md border border-border p-3">
                <input type="checkbox" className="mt-1" checked={r.long_stay} onChange={(e) => update("long_stay", e.target.checked)} />
                <span><span className="font-medium">{LS[i18n.language.slice(0, 2)] ?? LS.de}</span><span className="block text-xs text-muted-foreground">{LSH[i18n.language.slice(0, 2)] ?? LSH.de}</span></span>
              </label>
              <label className="col-span-full grid gap-1">
                <span className="text-xs text-muted-foreground">{t("newRes.note")}</span>
                <textarea value={r.notes ?? ""} onChange={(e) => update("notes", e.target.value)} rows={2}
                  className="px-3 py-2 rounded-md border border-input bg-card resize-none" />
              </label>
            </div>

            {!["cancelled", "no_show", "checked_out"].includes(r.status) && (
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CalendarPlus className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{ex.title}</span>
                  <span className="text-xs text-muted-foreground">{ex.current}: {formatDateDE(r.check_out)}</span>
                  {!extOpen && <button type="button" onClick={() => { setExtOpen(true); setExtDate(addDaysIso(r.check_out, 1)); }}
                    className="ml-auto px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">{ex.button}</button>}
                </div>
                {extOpen && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto] items-end">
                    <div className="flex gap-1 sm:col-span-full">
                      {[1, 3, 7, 14, 30].map((d) => (
                        <button key={d} type="button" onClick={() => setExtDate(addDaysIso(r.check_out, d))}
                          className={`px-2.5 py-1 rounded-md border text-xs ${extDate === addDaysIso(r.check_out, d) ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:bg-accent"}`}>+{d}</button>
                      ))}
                    </div>
                    <label className="grid gap-1"><span className="text-xs text-muted-foreground">{ex.newDate}</span>
                      <input type="date" min={addDaysIso(r.check_out, 1)} value={extDate} onChange={(e) => setExtDate(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card" /></label>
                    <label className="grid gap-1"><span className="text-xs text-muted-foreground">{ex.note}</span>
                      <input value={extNote} onChange={(e) => setExtNote(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card" /></label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setExtOpen(false)} className="px-3 py-2 rounded-md border border-border text-sm">{t("common.cancel")}</button>
                      <button type="button" onClick={extend} disabled={extSaving || !extDate}
                        className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                        {ex.confirmExt(extDate > r.check_out ? extensionDays(r.check_out, extDate) : 0)}</button>
                    </div>
                  </div>
                )}
                {extensions.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {extensions.map((e) => (
                      <li key={e.id}>{new Date(e.created_at).toLocaleString(displayLocale(), { timeZone: BUSINESS_TIME_ZONE, dateStyle: "short", timeStyle: "short" })} · {formatDateDE(e.old_check_out)} → <span className="text-foreground font-medium">{formatDateDE(e.new_check_out)}</span> (+{e.days}){e.note ? ` · ${e.note}` : ""}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

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
                                <span className="font-medium">{t(({ property_id: "newRes.property", room_id: "newRes.room", guest_name: "resv.thGuest", guest_email: "common.email", guest_phone: "newRes.phone", guests_count: "common.guests", check_in: "newRes.checkIn", check_out: "newRes.checkOut", channel: "newRes.channel", status: "resv.thStatus", revenue: "newRes.amount", notes: "newRes.note", cancellation_reason: "resv.cancelReason" } as Record<string, string>)[k] ?? k)}:</span>{" "}
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

            <DialogFooter className="flex-wrap gap-2">
              {perms.can("collect_payments") && <button type="button" onClick={() => setInvoiceOpen(true)} disabled={saving}
                className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent sm:mr-auto">{t("invoice.button")}</button>}
              {canCancel && <button type="button" onClick={cancelStay} disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-destructive/40 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"><Ban className="w-4 h-4" />{t("resv.cancelTitle")}</button>}
              {canDelete && <button type="button" onClick={deleteStay} disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-destructive/40 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="w-4 h-4" />{t("common.delete")}</button>}
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
      {r && <InvoiceDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} reservation={{ id: r.id, booking_number: (r as { booking_number?: number }).booking_number ?? null, guest_name: r.guest_name, guest_email: r.guest_email, company_name: r.company_name ?? null, check_in: r.check_in, check_out: r.check_out, revenue: Number(r.revenue), room: rooms.find((x) => x.id === r.room_id)?.number ?? "", payment_method: (r as { payment_method?: string | null }).payment_method ?? null }} />}
    </Dialog>
  );
}
