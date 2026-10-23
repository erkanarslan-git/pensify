/** Only clock links are accepted; never navigate to scanned external URLs. */
export function clockTokenFromQr(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const match = url.pathname.match(/^\/clock\/([a-zA-Z0-9_-]{8,200})\/?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}