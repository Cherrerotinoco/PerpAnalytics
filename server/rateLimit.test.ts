import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SlidingWindow, clientAddress, hashClient, secondsUntilUtcMidnight } from './rateLimit.js';

const headers = (h: Record<string, string>) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
});

describe('clientAddress', () => {
  const original = process.env.TRUST_PROXY;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = original;
    }
  });

  it('ignores x-forwarded-for when not behind a trusted proxy', () => {
    delete process.env.TRUST_PROXY;
    // Otherwise anyone could reset their own quota by forging the header.
    expect(clientAddress(headers({ 'x-forwarded-for': '1.2.3.4' }), '10.0.0.1')).toBe('10.0.0.1');
  });

  it('takes the first forwarded hop when the proxy is trusted', () => {
    process.env.TRUST_PROXY = '1';
    expect(
      clientAddress(headers({ 'x-forwarded-for': '1.2.3.4, 70.0.0.1, 10.0.0.1' }), '10.0.0.1')
    ).toBe('1.2.3.4');
  });

  it('falls back to the socket when the header is absent or empty', () => {
    process.env.TRUST_PROXY = '1';
    expect(clientAddress(headers({}), '10.0.0.1')).toBe('10.0.0.1');
    expect(clientAddress(headers({ 'x-forwarded-for': '  ' }), '10.0.0.1')).toBe('10.0.0.1');
  });

  it('degrades to a constant when nothing identifies the caller', () => {
    delete process.env.TRUST_PROXY;
    expect(clientAddress(headers({}), null)).toBe('unknown');
  });
});

describe('hashClient', () => {
  it('is stable and does not contain the address', () => {
    const h = hashClient('203.0.113.9');
    expect(h).toBe(hashClient('203.0.113.9'));
    expect(h).not.toContain('203.0.113.9');
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });

  it('separates different callers', () => {
    expect(hashClient('203.0.113.9')).not.toBe(hashClient('203.0.113.10'));
  });
});

describe('SlidingWindow', () => {
  it('allows up to the limit then refuses', () => {
    const w = new SlidingWindow(3, 60_000);
    expect(w.take('a', 1000)).toBe(true);
    expect(w.take('a', 1001)).toBe(true);
    expect(w.take('a', 1002)).toBe(true);
    expect(w.take('a', 1003)).toBe(false);
  });

  it('counts each caller separately', () => {
    const w = new SlidingWindow(1, 60_000);
    expect(w.take('a', 1000)).toBe(true);
    expect(w.take('b', 1000)).toBe(true);
    expect(w.take('a', 1000)).toBe(false);
  });

  it('lets hits age out of the window', () => {
    const w = new SlidingWindow(2, 1000);
    expect(w.take('a', 0)).toBe(true);
    expect(w.take('a', 500)).toBe(true);
    expect(w.take('a', 900)).toBe(false);
    // The 0ms hit has now aged out, freeing one slot.
    expect(w.take('a', 1100)).toBe(true);
  });

  it('a refused attempt does not extend the window', () => {
    const w = new SlidingWindow(1, 1000);
    w.take('a', 0);
    expect(w.take('a', 500)).toBe(false);
    expect(w.take('a', 1001)).toBe(true);
  });

  it('reports when the caller may retry', () => {
    const w = new SlidingWindow(1, 60_000);
    w.take('a', 1_000);
    expect(w.retryAfter('a', 1_000)).toBe(60);
    expect(w.retryAfter('a', 31_000)).toBe(30);
    expect(w.retryAfter('never-seen')).toBe(0);
  });

  it('sweeps keys whose hits have all expired', () => {
    const w = new SlidingWindow(5, 1000);
    w.take('a', 0);
    w.take('b', 0);
    expect(w.size).toBe(2);
    w.sweep(5000);
    expect(w.size).toBe(0);
  });

  it('keeps keys that still have live hits during a sweep', () => {
    const w = new SlidingWindow(5, 1000);
    w.take('a', 0);
    w.take('b', 900);
    w.sweep(1200);
    expect(w.size).toBe(1);
    expect(w.take('b', 1200)).toBe(true);
  });
});

describe('secondsUntilUtcMidnight', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts the remainder of the UTC day', () => {
    expect(secondsUntilUtcMidnight(new Date('2026-11-19T23:59:00.000Z'))).toBe(60);
    expect(secondsUntilUtcMidnight(new Date('2026-11-19T00:00:00.000Z'))).toBe(86_400);
  });

  it('never returns zero, so a Retry-After is always actionable', () => {
    expect(secondsUntilUtcMidnight(new Date('2026-11-19T23:59:59.999Z'))).toBeGreaterThan(0);
  });
});
