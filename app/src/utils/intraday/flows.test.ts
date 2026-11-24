import { describe, expect, it } from 'vitest';
import { analyzeFlows, analyzeSkew, analyzeVolLab, classifyAlert, materialityTag } from './analyze';
import { parseAlert, parseSkew, parseVolLab, parseWhaleAlert } from './parse';
import type { SkewResult, VolLabResult, WhaleAlert } from './types';

// Real API lines. Format: timestamp,emojis,"amount #SYMBOL","value USD","description",url
const BTC_INFLOW =
  '1782429892,🚨🚨🚨🚨,"1,469 #BTC","88,343,098 USD"," transferred from unknown wallet to #Coinbase",https://whale-alert.io/transaction/bitcoin/ce00ae89';
const BTC_OUTFLOW =
  '1782441006,🚨🚨🚨,"853 #BTC","50,161,866 USD"," transferred from Coinbase Institutional to unknown wallet",https://whale-alert.io/transaction/bitcoin/666e2452';
const USDC_MINT =
  '1782428979,💵💵💵,"250,000,000 #USDC","249,932,372 USD"," minted at USDC Treasury",https://whale-alert.io/transaction/solana/Bu7cETYK';
const USDT_REDEMPTION =
  '1782445474,🚨🚨🚨🚨,"500,000,000 #USDT","499,214,000 USD"," transferred from #Binance to Tether Treasury",https://whale-alert.io/transaction/ethereum/0x33a5f5';

describe('parseAlert', () => {
  it('reads a BTC transfer into an exchange', () => {
    const a = parseAlert(BTC_INFLOW)!;
    expect(a.timestamp).toBe(1782429892);
    expect(a.isoTime).toBe(new Date(1782429892 * 1000).toISOString());
    expect(a.amount).toBe(1469);
    expect(a.symbol).toBe('BTC');
    expect(a.valueUsd).toBe(88343098);
    expect(a.burstCount).toBe(4);
    expect(a.from).toBe('unknown wallet');
    expect(a.to).toBe('#Coinbase');
  });

  // The value and amount fields contain commas inside quotes, which is the whole
  // reason the CSV parser cannot just split on commas.
  it('keeps quoted fields containing commas intact', () => {
    expect(parseAlert(USDT_REDEMPTION)!.amount).toBe(500000000);
    expect(parseAlert(USDT_REDEMPTION)!.valueUsd).toBe(499214000);
  });

  it('gives a mint no origin', () => {
    const a = parseAlert(USDC_MINT)!;
    expect(a.isMint).toBe(true);
    expect(a.from).toBeNull();
    expect(a.to).toBe('USDC Treasury');
  });

  it('reads multi-word entity names on both sides', () => {
    const a = parseAlert(USDT_REDEMPTION)!;
    expect(a.from).toBe('#Binance');
    expect(a.to).toBe('Tether Treasury');
  });

  it('returns null on a malformed line', () => {
    expect(parseAlert('1782429892,🚨')).toBeNull();
    expect(parseAlert('')).toBeNull();
    expect(parseAlert(null)).toBeNull();
  });
});

describe('parseWhaleAlert', () => {
  it('sorts alerts newest first and normalises the market metrics', () => {
    const r = parseWhaleAlert({
      alerts: [BTC_INFLOW, USDT_REDEMPTION, USDC_MINT],
      prices: { s: 'BTC', p: '60,270', c: '-2.18' },
      realized_profit: { s: 'BTC', v: '-7.558152531868125e+08', c: '-22.36' },
      hodl: { s: 'BTC', d: '12,345', c: '1.5' },
    });
    expect(r.alerts.map((a) => a.timestamp)).toEqual([1782445474, 1782429892, 1782428979]);
    expect(r.prices?.price).toBe(60270);
    expect(r.realizedProfit?.value).toBe(-755815253.1868125);
    // HODL reports under `d`, not `v`.
    expect(r.hodl?.value).toBe(12345);
  });
});

const alert = (over: Partial<WhaleAlert>): WhaleAlert => ({
  timestamp: 1,
  isoTime: null,
  emojis: '',
  burstCount: 0,
  isMint: false,
  isBurn: false,
  amount: null,
  symbol: 'BTC',
  valueUsd: null,
  description: '',
  from: null,
  to: null,
  ...over,
});

describe('classifyAlert', () => {
  it('reads direction from which side is an exchange', () => {
    expect(classifyAlert(alert({ from: 'unknown wallet', to: '#Coinbase' })).category).toBe(
      'INFLOW'
    );
    expect(classifyAlert(alert({ from: '#Coinbase', to: 'unknown wallet' })).category).toBe(
      'OUTFLOW'
    );
    expect(classifyAlert(alert({ from: '#Binance', to: '#Kraken' })).category).toBe(
      'INTER_EXCHANGE'
    );
    expect(classifyAlert(alert({ from: 'unknown wallet', to: 'unknown wallet' })).category).toBe(
      'OTC'
    );
  });

  // "Market Maker" is an OTC-desk label on Whale Alert, not the Maker protocol.
  // The word matches exactly, so only the explicit exclusion keeps it out of DeFi.
  it('does not read "Market Maker" as the Maker protocol', () => {
    expect(classifyAlert(alert({ from: 'unknown wallet', to: 'Market Maker' })).category).toBe(
      'OTC'
    );
    expect(classifyAlert(alert({ from: 'unknown wallet', to: 'Maker' })).category).toBe(
      'DEFI_DEPOSIT'
    );
  });

  // DeFi keywords are ordinary English words, so they match on word boundaries:
  // a substring match would classify anything merely containing them.
  it('does not match a DeFi keyword as a substring', () => {
    expect(classifyAlert(alert({ from: 'unknown wallet', to: 'Skyscraper Fund' })).category).toBe(
      'OTC'
    );
    expect(classifyAlert(alert({ from: 'unknown wallet', to: 'Sky' })).category).toBe(
      'DEFI_DEPOSIT'
    );
  });

  it('sorts stablecoin movements by what they do to liquidity', () => {
    const stable = { symbol: 'USDT', valueUsd: 1e6 };
    expect(classifyAlert(alert({ ...stable, isMint: true })).category).toBe('STABLE_MINT');
    expect(classifyAlert(alert({ ...stable, isBurn: true })).category).toBe('STABLE_BURN');
    expect(classifyAlert(alert({ ...stable, to: 'Tether Treasury' })).category).toBe(
      'STABLE_REDEMPTION'
    );
    expect(classifyAlert(alert({ ...stable, to: '#Binance' })).category).toBe('STABLE_TO_EXCHANGE');
    expect(classifyAlert(alert({ ...stable, to: 'unknown wallet' })).category).toBe('STABLE_OTHER');
  });

  it('treats an unknown counterparty as unknown, not as a wallet name match', () => {
    // 'unknown wallet' must never satisfy isExchange/isDefi.
    expect(
      classifyAlert(alert({ from: 'unknown wallet', to: 'unknown new wallet' })).category
    ).toBe('OTC');
  });
});

describe('materialityTag', () => {
  it('labels BTC by size and stables by USD value', () => {
    expect(materialityTag(alert({ amount: 12000 }))).toContain('VERY RELEVANT');
    expect(materialityTag(alert({ amount: 6000 }))).toContain('INSTITUTIONAL');
    expect(materialityTag(alert({ amount: 1200 }))).toContain('NOTABLE');
    expect(materialityTag(alert({ amount: 900 }))).toBeNull();
    expect(materialityTag(alert({ symbol: 'USDT', valueUsd: 600e6 }))).toContain('EXTRAORDINARY');
    expect(materialityTag(alert({ symbol: 'USDT', valueUsd: 10e6 }))).toBeNull();
  });
});

describe('analyzeFlows', () => {
  it('nets BTC exchange flows and totals the stablecoin movements', () => {
    const r = analyzeFlows([
      parseAlert(BTC_INFLOW)!,
      parseAlert(BTC_OUTFLOW)!,
      parseAlert(USDC_MINT)!,
      parseAlert(USDT_REDEMPTION)!,
    ]);
    expect(r.inflowBtc).toBe(1469);
    expect(r.outflowBtc).toBe(853);
    // Inflow outweighs outflow → net negative → bearish.
    expect(r.netBtc).toBe(853 - 1469);
    expect(r.netSignal).toBe('BEARISH');
    expect(r.stable.mint).toBe(249932372);
    expect(r.stable.redemption).toBe(499214000);
    expect(r.window).toEqual({ from: 1782428979, to: 1782445474 });
  });

  // The BTC-count signal and the USD signal can disagree — several small outflows
  // against one huge inflow. The conflict is reported, not averaged away.
  it('flags a conflict between the BTC-count and USD signals', () => {
    const r = analyzeFlows([
      alert({ amount: 10, valueUsd: 1_000_000, from: '#Binance', to: 'unknown wallet' }),
      alert({ amount: 9, valueUsd: 9_000_000, from: 'unknown wallet', to: '#Binance' }),
    ]);
    expect(r.netSignal).toBe('BULLISH');
    expect(r.netSignalUsd).toBe('BEARISH');
    expect(r.signalConflict).toBe(true);
  });

  it('reports no conflict when both signals agree', () => {
    const r = analyzeFlows([parseAlert(BTC_OUTFLOW)!]);
    expect(r.netSignal).toBe('BULLISH');
    expect(r.netSignalUsd).toBe('BULLISH');
    expect(r.signalConflict).toBe(false);
  });

  it('handles an empty alert list', () => {
    const r = analyzeFlows([]);
    expect(r.netBtc).toBe(0);
    expect(r.netSignal).toBe('NEUTRAL');
    expect(r.window).toEqual({ from: null, to: null });
  });
});

describe('parseSkew / analyzeSkew', () => {
  const dataset = (over: Record<string, unknown> = {}) => ({
    '@type': 'Dataset',
    skew: { putSkew: -3, callSkew: 3, historicalAverage: -6 },
    sentiment: { marketSentiment: 'Neutral' },
    percentiles: { thirtyDay: 48, ninetyDay: 80, oneYear: 41 },
    anomaly: { detected: false },
    skew25ByExpiry: [
      { expiry: '7D', skew25: -5.52 },
      { expiry: '133D', skew25: -3.73 },
    ],
    ...over,
  });

  it('parses a healthy snapshot and drops curve points missing a value', () => {
    const r = parseSkew(
      dataset({
        skew25ByExpiry: [
          { expiry: '7D', skew25: -5.5 },
          { expiry: null, skew25: -1 },
          { expiry: '30D' },
        ],
      })
    );
    expect(r.ok).toBe(true);
    expect(r.ok && r.byExpiry).toHaveLength(1);
  });

  it('marks a Dataset with no skew and no curve as degraded', () => {
    const r = parseSkew({ '@type': 'Dataset', skew: {}, skew25ByExpiry: [] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.degraded).toBe(true);
    expect(parseSkew(null).ok).toBe(false);
  });

  // Hedging cheaper than its own mean is complacency, not a bullish vote.
  it('derives the bias from the distance to the historical mean', () => {
    const cheap = analyzeSkew(parseSkew(dataset()))!;
    expect(cheap.vsHistorical).toBe(3);
    expect(cheap.bias).toBe('COMPLACENCY');

    const dear = analyzeSkew(parseSkew(dataset({ skew: { putSkew: -9, historicalAverage: -6 } })))!;
    expect(dear.bias).toBe('EXPENSIVE_HEDGING');

    const flat = analyzeSkew(
      parseSkew(dataset({ skew: { putSkew: -6.5, historicalAverage: -6 } }))
    )!;
    expect(flat.bias).toBe('NEUTRAL');
  });

  // The percentile is corroboration only. When it points the other way, the scale
  // is not the convention assumed, and that has to be surfaced.
  it('flags a percentile that contradicts the historical mean', () => {
    const r = analyzeSkew(parseSkew(dataset({ percentiles: { thirtyDay: 95 } })))!;
    expect(r.bias).toBe('COMPLACENCY');
    expect(r.percentileRegime).toBe('HIGH');
    expect(r.percentileDisagrees).toBe(true);
  });

  it('reads the term structure from front vs back expiries', () => {
    const frontFear = analyzeSkew(
      parseSkew(
        dataset({
          skew25ByExpiry: [
            { expiry: '7D', skew25: -10 },
            { expiry: '133D', skew25: -2 },
          ],
        })
      )
    )!;
    expect(frontFear.termStructure).toBe('FRONT_FEAR');

    const backFear = analyzeSkew(
      parseSkew(
        dataset({
          skew25ByExpiry: [
            { expiry: '7D', skew25: -2 },
            { expiry: '133D', skew25: -10 },
          ],
        })
      )
    )!;
    expect(backFear.termStructure).toBe('BACK_FEAR');

    // Only a long-dated point: nothing to compare, so the curve is not called.
    const noFront = analyzeSkew(
      parseSkew(dataset({ skew25ByExpiry: [{ expiry: '304D', skew25: 3.65 }] }))
    )!;
    expect(noFront.termStructure).toBe('FLAT');
  });

  it('returns null for an unusable snapshot', () => {
    expect(analyzeSkew(null)).toBeNull();
    expect(analyzeSkew({ ok: false } as SkewResult)).toBeNull();
  });
});

describe('parseVolLab / analyzeVolLab', () => {
  const dataset = (over: Record<string, unknown> = {}) => ({
    '@type': 'Dataset',
    expiry: '2026-12-11',
    tauDays: 17,
    realized: { nu_R: 8.453, rho_R: 0.003 },
    summary: {
      signal: 'BUY_SKEW',
      skew_rp_z: 2.02,
      avg_nu_imp: 0.855,
      avg_rho_imp: -0.459,
    },
    surfaces: [{ date: '2026-08-13' }, { date: '2026-08-14' }],
    ...over,
  });

  it('parses the summary and counts the surface window', () => {
    const r = parseVolLab(dataset());
    expect(r.ok).toBe(true);
    expect(r.ok && r.signal).toBe('BUY_SKEW');
    expect(r.ok && r.days).toBe(2);
  });

  it('marks a Dataset with no signal and no z-score as degraded', () => {
    const r = parseVolLab({ '@type': 'Dataset', summary: {}, realized: {} });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.degraded).toBe(true);
    expect(parseVolLab(null).ok).toBe(false);
  });

  it('grades the stretch from |z| and spots both divergences', () => {
    const r = analyzeVolLab(parseVolLab(dataset()))!;
    expect(r.stretch).toBe('EXTREME');
    // Implied ρ negative, realised positive → the market pays for a correlation
    // reality is not confirming.
    expect(r.rhoDivergence).toBe(true);
    // Realised vol-of-vol far above implied → the move in vol itself is underpriced.
    expect(r.vvolUnderpriced).toBe(true);
    expect(r.vvolGap).toBeCloseTo(7.598, 3);
  });

  it('grades a moderate and a quiet z-score', () => {
    expect(
      analyzeVolLab(parseVolLab(dataset({ summary: { signal: 'WAIT', skew_rp_z: 1.2 } })))!.stretch
    ).toBe('ELEVATED');
    expect(
      analyzeVolLab(parseVolLab(dataset({ summary: { signal: 'WAIT', skew_rp_z: 0.3 } })))!.stretch
    ).toBe('NORMAL');
  });

  it('does not call a divergence when a side is missing or zero', () => {
    const r = analyzeVolLab(
      parseVolLab(
        dataset({ realized: { nu_R: null, rho_R: 0 }, summary: { signal: 'WAIT', skew_rp_z: 0.1 } })
      )
    )!;
    expect(r.rhoDivergence).toBe(false);
    expect(r.vvolGap).toBeNull();
    expect(r.vvolUnderpriced).toBe(false);
  });

  it('returns null for an unusable snapshot', () => {
    expect(analyzeVolLab(null)).toBeNull();
    expect(analyzeVolLab({ ok: false } as VolLabResult)).toBeNull();
  });
});
