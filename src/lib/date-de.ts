import { displayLocale } from "@/i18n/legacy-ui";
import { isOpenEndedCheckOut, openEndedLabel } from "@/lib/open-stay";

/** Business date format DD.MM.YYYY; open-ended stays never expose their technical infinity date. */
export function formatDateDE(d: string | null | undefined): string {
  if (!d) return "—";
  if (isOpenEndedCheckOut(d)) return openEndedLabel(displayLocale());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d;
}
