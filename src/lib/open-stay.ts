export const OPEN_ENDED_CHECK_OUT = "9999-12-31";

export const OPEN_ENDED_LABELS: Record<string, string> = {
  de: "offen",
  en: "open-ended",
  tr: "açık uçlu",
};

export function isOpenEndedCheckOut(checkOut: string | null | undefined): boolean {
  return checkOut === OPEN_ENDED_CHECK_OUT;
}

export function effectiveCheckOut(longStay: boolean, checkOut: string): string {
  return longStay ? OPEN_ENDED_CHECK_OUT : checkOut;
}

export function openEndedLabel(language: string): string {
  return OPEN_ENDED_LABELS[language.slice(0, 2)] ?? OPEN_ENDED_LABELS.de!;
}
