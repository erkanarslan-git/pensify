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
  const monthly = opts.monthly;
  if (monthly && monthly > 0) return dates.map((d) => ({ due_date: d, amount: Math.round(monthly * 100) / 100 }));
  const cents = Math.round((opts.total ?? 0) * 100);
  if (cents <= 0) return [];
  const each = Math.floor(cents / dates.length);
  return dates.map((d, i) => ({ due_date: d, amount: (i === dates.length - 1 ? cents - each * (dates.length - 1) : each) / 100 }));
}

/** Rebuild only unprotected months; the full retained obligation (not just money received) stays in the plan. */
export function buildReplacementSchedule(opts: Parameters<typeof buildSchedule>[0], retained: Installment[]): Installment[] {
  const protectedMonths = new Set(retained.map((r) => r.due_date.slice(0, 7)));
  const dates = scheduleDueDates(opts.checkIn, opts.checkOut, opts.dueDay)
    .filter((date) => !protectedMonths.has(date.slice(0, 7)));
  if (dates.length === 0) return [];
  const monthly = opts.monthly;
  if (monthly && monthly > 0) return dates.map((due_date) => ({ due_date, amount: Math.round(monthly * 100) / 100 }));
  const cents = Math.round((opts.total ?? 0) * 100) - retained.reduce((sum, r) => sum + Math.round(r.amount * 100), 0);
  if (cents <= 0) return [];
  const each = Math.floor(cents / dates.length);
  return dates.map((due_date, i) => ({ due_date, amount: (i === dates.length - 1 ? cents - each * (dates.length - 1) : each) / 100 }));
}

/** Prevent edited/added rows from recreating a protected month or duplicating one another. */
export function validReplacementSchedule(rows: Installment[], retained: Installment[]): boolean {
  if (rows.length === 0 && retained.length === 0) return false;
  const months = new Set(retained.map((r) => r.due_date.slice(0, 7)));
  return rows.every((r) => {
    const month = r.due_date.slice(0, 7);
    if (!(r.amount > 0) || !Number.isFinite(r.amount) || !/^\d{4}-\d{2}-\d{2}$/.test(r.due_date) || months.has(month)) return false;
    months.add(month);
    return true;
  });
}

export type InstallmentState = "paid" | "partial" | "overdue" | "open";

export function installmentState(amount: number, paid: number, dueDate: string, today: string): InstallmentState {
  if (paid >= amount - 0.005) return "paid";
  if (dueDate < today) return "overdue";
  return paid > 0 ? "partial" : "open";
}
