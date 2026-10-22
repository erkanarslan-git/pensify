// Monthly payment plans for long stays. Dates are YYYY-MM-DD business dates.

export interface Installment { due_date: string; amount: number }

function pad(n: number) { return String(n).padStart(2, "0"); }
function lastDay(y: number, m: number) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); } // m is 1-based

/** First installment is due on check-in; later ones on `dueDay` (clamped to month end) of each following month, before check-out. */
export function scheduleDueDates(checkIn: string, checkOut: string, dueDay: number): string[] {
  const day = Math.min(Math.max(Math.trunc(dueDay) || 1, 1), 31);
  const dates = [checkIn];
  let y = Number(checkIn.slice(0, 4));
  let m = Number(checkIn.slice(5, 7));
  for (let i = 0; i < 240; i++) {
    m += 1; if (m > 12) { m = 1; y += 1; }
    const d = `${y}-${pad(m)}-${pad(Math.min(day, lastDay(y, m)))}`;
    if (d >= checkOut) break;
    dates.push(d);
  }
  return dates;
}

/** Fixed monthly amount if given, otherwise the total split evenly (remainder cents on the last installment). */
export function buildSchedule(opts: { checkIn: string; checkOut: string; dueDay: number; total?: number; monthly?: number }): Installment[] {
  const dates = scheduleDueDates(opts.checkIn, opts.checkOut, opts.dueDay);
  if (opts.monthly && opts.monthly > 0) return dates.map((d) => ({ due_date: d, amount: Math.round(opts.monthly! * 100) / 100 }));
  const cents = Math.round((opts.total ?? 0) * 100);
  if (cents <= 0) return [];
  const each = Math.floor(cents / dates.length);
  return dates.map((d, i) => ({ due_date: d, amount: (i === dates.length - 1 ? cents - each * (dates.length - 1) : each) / 100 }));
}

export type InstallmentState = "paid" | "partial" | "overdue" | "open";

export function installmentState(amount: number, paid: number, dueDate: string, today: string): InstallmentState {
  if (paid >= amount - 0.005) return "paid";
  if (dueDate < today) return "overdue";
  return paid > 0 ? "partial" : "open";
}
