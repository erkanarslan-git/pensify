export function overtimePay(netMinutes: number, approvedMinutes: number, baseRate: number, overtimeRate: number) {
  if (![netMinutes, approvedMinutes, baseRate, overtimeRate].every(Number.isFinite) || netMinutes < 0 || approvedMinutes < 0 || approvedMinutes > netMinutes || baseRate < 0 || overtimeRate < 0) throw new Error("invalid_overtime");
  const regularMinutes = netMinutes - approvedMinutes;
  const regularAmount = regularMinutes * baseRate / 60;
  const overtimeAmount = approvedMinutes * overtimeRate / 60;
  return { regularMinutes, overtimeMinutes: approvedMinutes, regularAmount, overtimeAmount, amount: Math.round((regularAmount + overtimeAmount) * 100) / 100 };
}