import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchHyperliquidFills,
  fetchHyperliquidAccount,
  isEvmAddress,
  HyperliquidError,
} from './fetchHyperliquid';
import type { HyperliquidFill } from './normalizeHyperliquid';

const ADDR = '0xdbb8ff157abceff21edb528ac1702f5ade4b285a';

const makeFill = (tid: number, time: number): HyperliquidFill => ({
  coin: 'BTC',
  px: '63000',
  sz: '0.001',
  side: 'B',
  time,
  startPosition: '0.0',
  dir: 'Open Long',
  closedPnl: '0.0',
  hash: '0x',
  oid: tid,
  crossed: true,
  fee: '0.1',
  feeToken: 'USDC',
  tid,
});

/** Queue of responses, one per POST, so paging can be driven precisely. */
const mockFetchSequence = (pages: unknown[]) => {
  const bodies: unknown[] = [];
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const next = pages.shift() ?? [];
    return { ok: true, status: 200, json: async () => next } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return { fn, bodies };
};

afterEach(() => vi.unstubAllGlobals());

describe('isEvmAddress', () => {
  it('accepts a 20-byte hex address in any case', () => {
    expect(isEvmAddress(ADDR)).toBe(true);
    expect(isEvmAddress(ADDR.toUpperCase().replace('0X', '0x'))).toBe(true);
  });

  it('rejects anything else, including a Solana address', () => {
    expect(isEvmAddress('4pjWwPRYHDagjPRzUCkaW96zfkP3eZV7b6xbGiTiX4pB')).toBe(false);
    expect(isEvmAddress('0x123')).toBe(false);
    expect(isEvmAddress('')).toBe(false);
  });
});

describe('fetchHyperliquidFills', () => {
  it('refuses a non-EVM address before making a request', async () => {
    const { fn } = mockFetchSequence([]);
    await expect(fetchHyperliquidFills('not-an-address')).rejects.toBeInstanceOf(HyperliquidError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns a single short page without asking for more', async () => {
    const { fn } = mockFetchSequence([[makeFill(1, 100), makeFill(2, 200)]]);
    const fills = await fetchHyperliquidFills(ADDR);
    expect(fills).toHaveLength(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('pages forward until a short page ends the history', async () => {
    const full = Array.from({ length: 2000 }, (_, i) => makeFill(i + 1, 1000 + i));
    const tail = [makeFill(5000, 9000)];
    const { bodies } = mockFetchSequence([full, tail]);

    const fills = await fetchHyperliquidFills(ADDR);
    expect(fills).toHaveLength(2001);
    expect(bodies).toHaveLength(2);
    expect((bodies[0] as { startTime: number }).startTime).toBe(0);
    // The cursor lands on the newest row seen, not past it.
    expect((bodies[1] as { startTime: number }).startTime).toBe(2999);
  });

  it('drops rows repeated across the page overlap', async () => {
    // Paging from the newest timestamp re-reads fills sharing that millisecond.
    const first = Array.from({ length: 2000 }, (_, i) => makeFill(i + 1, 1000 + i));
    const overlapping = [makeFill(2000, 2999), makeFill(2001, 2999), makeFill(2002, 3100)];
    mockFetchSequence([first, overlapping]);

    const fills = await fetchHyperliquidFills(ADDR);
    expect(fills).toHaveLength(2002);
    expect(new Set(fills.map((f) => f.tid)).size).toBe(2002);
  });

  it('stops instead of looping when a full page never advances', async () => {
    // Pathological: 2000+ fills in one millisecond, all already seen.
    const stuck = Array.from({ length: 2000 }, (_, i) => makeFill(i + 1, 500));
    const { fn } = mockFetchSequence([stuck, [...stuck], [...stuck], [...stuck]]);
    const fills = await fetchHyperliquidFills(ADDR);
    expect(fills).toHaveLength(2000);
    // First page collects, second makes no progress and ends it.
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('returns fills oldest first', async () => {
    mockFetchSequence([[makeFill(3, 300), makeFill(1, 100), makeFill(2, 200)]]);
    const fills = await fetchHyperliquidFills(ADDR);
    expect(fills.map((f) => f.time)).toEqual([100, 200, 300]);
  });

  it('handles an account with no fills', async () => {
    mockFetchSequence([[]]);
    expect(await fetchHyperliquidFills(ADDR)).toEqual([]);
  });

  it('explains a rate limit distinctly from other failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }) as Response)
    );
    await expect(fetchHyperliquidFills(ADDR)).rejects.toThrow(/rate limiting/i);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response)
    );
    await expect(fetchHyperliquidFills(ADDR)).rejects.toThrow(/failed \(500\)/);
  });

  it('passes the abort signal through', async () => {
    const { fn } = mockFetchSequence([[]]);
    const controller = new AbortController();
    await fetchHyperliquidFills(ADDR, { signal: controller.signal });
    expect(fn.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});

describe('fetchHyperliquidAccount', () => {
  it('maps open positions and skips flat ones', async () => {
    mockFetchSequence([
      {
        marginSummary: { accountValue: '143.069498' },
        assetPositions: [
          {
            position: {
              coin: 'BTC',
              szi: '-0.00479',
              entryPx: '63610.0',
              unrealizedPnl: '-0.78556',
              leverage: { value: 20 },
            },
          },
          { position: { coin: 'ZEC', szi: '0.0', entryPx: null, unrealizedPnl: '0' } },
        ],
      },
    ]);

    const account = await fetchHyperliquidAccount(ADDR);
    expect(account.accountValueUsd).toBeCloseTo(143.069498, 6);
    expect(account.positions).toHaveLength(1);
    expect(account.positions[0]).toMatchObject({
      coin: 'BTC',
      size: -0.00479,
      entryPrice: 63610,
      leverage: 20,
    });
  });

  it('copes with an empty account', async () => {
    mockFetchSequence([{}]);
    const account = await fetchHyperliquidAccount(ADDR);
    expect(account).toEqual({ accountValueUsd: 0, positions: [] });
  });
});
