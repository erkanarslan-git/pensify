import { describe, expect, it } from 'vitest';
import { clockTokenFromQr } from './clock-qr';
describe('clock QR routing', () => {
  it('accepts the printed property clock link', () => expect(clockTokenFromQr('https://pensify.lovable.app/clock/abcdefgh-1234')).toBe('abcdefgh-1234'));
  it('keeps a printed link valid after moving the site', () => expect(clockTokenFromQr('https://old-domain.example/clock/abcdefgh-1234')).toBe('abcdefgh-1234'));
  it('rejects non-clock links', () => expect(clockTokenFromQr('https://example.com/team')).toBeNull());
  it('rejects script URLs', () => expect(clockTokenFromQr('javascript:alert(1)')).toBeNull());
  it('rejects credentials and extra path segments', () => {
    expect(clockTokenFromQr('https://user:password@example.com/clock/abcdefgh')).toBeNull();
    expect(clockTokenFromQr('https://example.com/clock/abcdefgh/team')).toBeNull();
  });
});