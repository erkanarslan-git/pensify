export const PAYMENT_METHODS = ["cash", "card", "transfer", "invoice", "online"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
const LABELS: Record<string, Record<PaymentMethod | "none", string>> = {
  tr: { none: "Belirtilmedi", cash: "Nakit", card: "EC Kart", transfer: "Havale", invoice: "Fatura", online: "Online" },
  de: { none: "Nicht angegeben", cash: "Bar", card: "EC-Karte", transfer: "Überweisung", invoice: "Rechnung", online: "Online" },
  en: { none: "Not set", cash: "Cash", card: "Card", transfer: "Transfer", invoice: "Invoice", online: "Online" },
};
export const PAYMENT_METHOD_TITLE: Record<string, string> = { tr: "Ödeme yöntemi", de: "Zahlungsart", en: "Payment method" };
export const PAYMENT_METHOD_ALL: Record<string, string> = { tr: "Tüm ödeme yöntemleri", de: "Alle Zahlungsarten", en: "All payment methods" };
export function paymentMethodLabel(m: string | null | undefined, lang: string): string {
  const l = LABELS[lang.slice(0, 2)] ?? LABELS.de;
  return l[(m ?? "none") as PaymentMethod] ?? l.none;
}
