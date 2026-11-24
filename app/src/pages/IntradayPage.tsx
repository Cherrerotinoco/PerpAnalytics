import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import Panel, { Row, SectionHeading } from '../dashboard/Panel';
import { CACHE_TTL_MS, buildIntradayReport, clearHistory, runIntraday } from '../utils/intraday';
import { useSsrSnapshot } from '../utils/intraday/ssrData';
import type {
  CvdAnalysis,
  FlowAnalysis,
  GammaByExpiry,
  GammaResult,
  GammaSnapshot,
  IntradaySnapshot,
  SkewRead,
  SkewSnapshot,
  TimeframeKey,
  TimeframeWindow,
  VolLabRead,
  VolLabSnapshot,
} from '../utils/intraday/types';

const CvdSessionChart = lazy(() => import('../dashboard/panels/cvdSessionChart'));

// Auto-refresh cadence, matched to the response cache TTL: ticking faster would
// just re-read the same cached payload. The manual button forces a network hit.
const AUTO_REFRESH_MS = CACHE_TTL_MS;

// ─── Formatting ───────────────────────────────────────────────────────────────
const sign = (n: number | null | undefined, d = 0): string =>
  n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}`;

const usd = (n: number | null | undefined, d = 0): string =>
  n == null ? '—' : `$${n.toLocaleString('en-US', { maximumFractionDigits: d })}`;

const millions = (n: number | null | undefined): string => {
  if (n == null) return '—';
  const s = n < 0 ? '-' : '+';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${s}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${s}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${s}$${(abs / 1e3).toFixed(1)}K`;
  return `${s}$${abs.toFixed(0)}`;
};

const signClass = (n: number | null | undefined): string =>
  n == null ? '' : n > 0 ? 'tc-green' : n < 0 ? 'tc-red' : '';

const SIGNAL_LABEL: Record<string, string> = {
  BULLISH: 'Buying',
  BEARISH: 'Selling',
  NEUTRAL: 'Balanced',
};

const FLOW_LABEL: Record<string, string> = {
  BULLISH_AGGRESSION: 'Bullish aggression',
  BEARISH_AGGRESSION: 'Bearish aggression',
  ABSORBED_BUYING: 'Absorbed buying',
  ABSORBED_SELLING: 'Absorbed selling',
  NEUTRAL: 'Neutral',
};

// ─── Small building blocks ────────────────────────────────────────────────────
const Stat = ({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) => (
  <div className="tc-intraday-stat">
    <div className="tc-intraday-stat-label">{label}</div>
    <div className={`tc-intraday-stat-value ${tone ?? ''}`}>{value}</div>
    {sub && <div className="tc-intraday-stat-sub">{sub}</div>}
  </div>
);

const KeyValue = ({ k, v, tone }: { k: string; v: string; tone?: string }) => (
  <div className="tc-intraday-kv">
    <span className="tc-intraday-kv-key">{k}</span>
    <span className={`tc-intraday-kv-val ${tone ?? ''}`}>{v}</span>
  </div>
);

// ─── Multi-timeframe aggressor table ──────────────────────────────────────────
const TF_KEYS: TimeframeKey[] = ['m15', 'h1', 'h4'];

const TfCell = ({ w }: { w: TimeframeWindow | undefined }) => {
  if (!w) return <td className="tc-intraday-td">—</td>;
  const absorbed = w.flow?.kind === 'ABSORBED_BUYING' || w.flow?.kind === 'ABSORBED_SELLING';
  return (
    <td className="tc-intraday-td">
      <span className={signClass(w.delta)}>{sign(w.delta)}</span>
      {absorbed && (
        <span className="tc-intraday-abs-dot" title={FLOW_LABEL[w.flow!.kind]}>
          ⚠
        </span>
      )}
    </td>
  );
};

const TfRow = ({ label, cvd }: { label: string; cvd: CvdAnalysis | null }) => (
  <tr>
    <th className="tc-intraday-th-row">{label}</th>
    {cvd ? (
      TF_KEYS.map((k) => <TfCell key={k} w={cvd.timeframes[k]} />)
    ) : (
      <td className="tc-intraday-td" colSpan={3}>
        no data
      </td>
    )}
    <td className="tc-intraday-td tc-intraday-td--session">
      {cvd ? <span className={signClass(cvd.totalCvd)}>{sign(cvd.totalCvd)}</span> : '—'}
    </td>
  </tr>
);

const AbsorptionNotes = ({ label, cvd }: { label: string; cvd: CvdAnalysis | null }) => {
  const notes = TF_KEYS.map((k) => cvd?.timeframes[k]).filter(
    (w): w is TimeframeWindow =>
      w?.flow?.kind === 'ABSORBED_BUYING' || w?.flow?.kind === 'ABSORBED_SELLING'
  );
  if (!notes.length) return null;
  return (
    <p className="tc-intraday-note tc-intraday-note--warn">
      {label} absorption:{' '}
      {notes
        .map((w) =>
          w.flow!.kind === 'ABSORBED_BUYING'
            ? `${w.label} absorbed buying (CVD ${sign(w.delta)} but price does not rise → distribution)`
            : `${w.label} absorbed selling (CVD ${sign(w.delta)} but price does not fall → accumulation)`
        )
        .join(' · ')}
    </p>
  );
};

// ─── Divergence copy ──────────────────────────────────────────────────────────
const DIVERGENCE_COPY: Record<string, { tone: string; text: string }> = {
  BULLISH: {
    tone: 'tc-green',
    text: 'Bullish — price falls over the session but CVD rises: buy-side absorption.',
  },
  BEARISH: {
    tone: 'tc-red',
    text: 'Bearish — price rises but CVD falls: rally without aggressor volume.',
  },
  CONFIRMS: { tone: '', text: 'Confirms — session CVD and price are aligned.' },
  'N/A': { tone: '', text: 'Not enough data to read the divergence.' },
};

const swingNuance = (cvd: CvdAnalysis): string | null => {
  const s = cvd.priceSwings;
  if (cvd.divergence === 'BEARISH' && s.lowsAscending != null) {
    return s.lowsAscending
      ? 'Nuance: price lows (5m) are still rising → passive absorption, a less bearish read than CVD alone suggests.'
      : 'Nuance: price lows (5m) are no longer rising (the previous one broke) → the bearish read has no counterweight.';
  }
  if (cvd.divergence === 'BULLISH' && s.highsDescending != null) {
    return s.highsDescending
      ? 'Nuance: price highs (5m) are still falling → absorption weaker than CVD alone suggests.'
      : 'Nuance: price highs (5m) are no longer falling (it cleared the previous one) → the bullish read has no counterweight.';
  }
  return null;
};

// ─── Headline blocks ──────────────────────────────────────────────────────────

const Hero = ({ value, label, tone }: { value: string; label: string; tone?: string }) => (
  <div className="tc-gex-hero-item">
    <div className={`tc-gex-hero-value ${tone ?? ''}`}>{value}</div>
    <div className="tc-gex-hero-label">{label}</div>
  </div>
);

const signed = (n: number | null | undefined, digits = 2): string =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;

/**
 * The four figures a reader checks first. Net gamma carries the sign colour
 * because its sign IS the regime; call and put gamma are shown unsigned-coloured
 * since their signs are fixed by the convention and carry no information.
 */
const TotalGammaExposure = ({ gamma }: { gamma: GammaSnapshot }) => (
  <div className="tc-gex-hero">
    <Hero
      value={gamma.netGamma?.toFixed(2) ?? '—'}
      label="Net gamma (M$ / 1%)"
      tone={gamma.netGamma == null ? '' : gamma.netGamma < 0 ? 'tc-red' : 'tc-green'}
    />
    <Hero value={signed(gamma.callGamma)} label="Call gamma" />
    <Hero value={gamma.putGamma?.toFixed(2) ?? '—'} label="Put gamma" />
    <Hero
      value={gamma.bias ?? '—'}
      label={`${gamma.callWeighted?.toFixed(0) ?? '—'}% call weighted`}
      tone={gamma.bias === 'BULLISH' ? 'tc-green' : gamma.bias === 'BEARISH' ? 'tc-red' : ''}
    />
  </div>
);

/**
 * Support, resistance and the gamma flip against the current price.
 *
 * The flip is a SPOT level, not a strike: crossing it flips the regime itself, so
 * it is listed alongside the two walls rather than buried in the detail grid.
 */
const SqueezeLevels = ({ gamma }: { gamma: GammaSnapshot }) => (
  <>
    <div className="tc-gex-levels">
      <span className="tc-gex-level">
        <span className="tc-gex-dot tc-gex-dot--support" />
        {usd(gamma.support)} <span className="tc-gex-level-tag">(support)</span>
      </span>
      <span className="tc-gex-level">
        <span className="tc-gex-dot tc-gex-dot--resistance" />
        {usd(gamma.resistance)} <span className="tc-gex-level-tag">(resistance)</span>
      </span>
      <span className="tc-gex-level">
        <span className="tc-gex-dot tc-gex-dot--flip" />
        {usd(gamma.breakout)} <span className="tc-gex-level-tag">(gamma flip)</span>
      </span>
      <span className="tc-gex-level tc-gex-level-tag">Current BTC: {usd(gamma.currentPrice)}</span>
    </div>
    {gamma.breakout == null && (
      <p className="tc-intraday-note">
        No gamma flip inside ±25% of spot: aggregate gamma keeps its sign across the whole range, so
        there is no regime pivot to trade against.
      </p>
    )}
  </>
);

/** Signed gamma per expiry, scaled against the largest bucket in the set. */
const GammaByExpiryChart = ({ buckets }: { buckets: GammaByExpiry[] }) => {
  if (!buckets.length) {
    return <p className="tc-intraday-note">No expiry breakdown in this run.</p>;
  }
  // Only the nearest expiries matter intraday, and the tail is a long list of
  // tiny quarterlies that would squash every bar that counts.
  const shown = buckets.slice(0, 12);
  const max = Math.max(...shown.map((b) => Math.abs(b.gamma)), 0.01);
  return (
    <div className="tc-gex-expiry">
      {shown.map((b) => {
        const pctWidth = `${(Math.abs(b.gamma) / max) * 100}%`;
        const neg = b.gamma < 0;
        return (
          <div className="tc-gex-expiry-row" key={b.expiry}>
            <span className="tc-gex-expiry-label">
              {b.label} · {b.daysOut}d
            </span>
            <span className="tc-gex-expiry-track">
              <span className="tc-gex-expiry-half tc-gex-expiry-half--neg">
                {neg && (
                  <span
                    className="tc-gex-expiry-bar tc-gex-expiry-bar--neg"
                    style={{ width: pctWidth }}
                  />
                )}
              </span>
              <span className="tc-gex-expiry-half">
                {!neg && (
                  <span
                    className="tc-gex-expiry-bar tc-gex-expiry-bar--pos"
                    style={{ width: pctWidth }}
                  />
                )}
              </span>
            </span>
            <span className={`tc-gex-expiry-value ${neg ? 'tc-red' : 'tc-green'}`}>
              {signed(b.gamma)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/** Put/call skew with the reading derived from its own historical mean. */
const MarketSentiment = ({ skew, read }: { skew: SkewSnapshot; read: SkewRead }) => (
  <>
    <div className="tc-gex-hero">
      <Hero
        value={skew.putSkew != null ? `${skew.putSkew.toFixed(2)}%` : '—'}
        label="Put skew"
        tone="tc-red"
      />
      <Hero
        value={skew.callSkew != null ? `${signed(skew.callSkew)}%` : '—'}
        label="Call skew"
        tone="tc-green"
      />
    </div>
    <div className={`tc-skew-callout ${read.bias === 'NEUTRAL' ? '' : 'tc-skew-callout--warn'}`}>
      <span className="tc-skew-callout-title">
        {skew.marketSentiment ?? (read.bias === 'COMPLACENCY' ? 'Complacency' : 'Fear')}
      </span>
      <span className="tc-skew-callout-body">{read.biasLabel}</span>
      <span className="tc-skew-callout-body">
        vs historical mean: {signed(read.vsHistorical)} · 30d percentile {skew.p30 ?? '—'} ·{' '}
        {read.termStructureLabel}
      </span>
      {read.percentileDisagrees && (
        // The percentile scale is undocumented as signed or absolute; when it
        // contradicts the mean, the reading may be inverted.
        <span className="tc-skew-callout-body tc-amber">
          ⚠️ The percentile contradicts the historical mean — treat this reading as unreliable.
        </span>
      )}
    </div>
    <p className="tc-intraday-note">
      Skew prices hedging, not direction. Its extremes are contrarian: it modulates conviction, it
      never replaces order flow.
    </p>
  </>
);

/** Vol Lab: how stretched the skew risk premium is, and implied vs realised. */
const VolLabBody = ({ volLab, read }: { volLab: VolLabSnapshot; read: VolLabRead }) => (
  <>
    <div className="tc-intraday-regime">{read.signalLabel}</div>
    <div className="tc-intraday-kv-grid">
      <KeyValue k="Expiry" v={`${volLab.expiry ?? '—'} (τ ${volLab.tauDays ?? '—'}d)`} />
      <KeyValue k="Skew RP z-score" v={`${volLab.skewRpZ ?? '—'} (${read.stretch})`} />
      <KeyValue
        k="Risk reversal / butterfly"
        v={`${volLab.avgRr ?? '—'} / ${volLab.avgFly ?? '—'}`}
      />
      <KeyValue
        k="Vol-of-vol ν (impl / real)"
        v={`${volLab.nuImp ?? '—'} / ${volLab.nuR ?? '—'}`}
        tone={read.vvolUnderpriced ? 'tc-amber' : ''}
      />
      <KeyValue
        k="Spot-vol ρ (impl / real)"
        v={`${volLab.rhoImp ?? '—'} / ${volLab.rhoR ?? '—'}`}
        tone={read.rhoDivergence ? 'tc-amber' : ''}
      />
    </div>
    {read.rhoDivergence && (
      <p className="tc-intraday-note tc-intraday-note--warn">
        Implied and realised spot-vol correlation carry opposite signs: the market is paying for a
        correlation recent reality is not confirming.
      </p>
    )}
    <p className="tc-intraday-note">
      A days-to-weeks volatility-positioning signal, not an intraday direction call. BUY_SKEW and
      SELL_SKEW are not directional votes.
    </p>
  </>
);

/** Whale transfers, newest first, with the net balance underneath. */
const WhaleFlowBody = ({ flows }: { flows: FlowAnalysis }) => {
  if (!flows.classified.length)
    return <p className="tc-intraday-note">No whale alerts in this run.</p>;
  const tone = (bias: string) =>
    bias === 'bullish' ? 'tc-green' : bias === 'bearish' ? 'tc-red' : '';
  return (
    <>
      <div className="tc-gex-hero">
        <Hero
          value={`${flows.netBtc > 0 ? '+' : ''}${Math.round(flows.netBtc).toLocaleString('en-US')}`}
          label="Net BTC balance"
          tone={tone(flows.netBtc > 0 ? 'bullish' : flows.netBtc < 0 ? 'bearish' : '')}
        />
        <Hero value={usd(flows.netUsd)} label="Net USD" />
        <Hero
          value={flows.netSignal}
          label="Flow signal (BTC count)"
          tone={
            flows.netSignal === 'BULLISH'
              ? 'tc-green'
              : flows.netSignal === 'BEARISH'
                ? 'tc-red'
                : ''
          }
        />
        <Hero
          value={flows.netSignalUsd}
          label="Flow signal (USD)"
          tone={
            flows.netSignalUsd === 'BULLISH'
              ? 'tc-green'
              : flows.netSignalUsd === 'BEARISH'
                ? 'tc-red'
                : ''
          }
        />
      </div>
      {flows.signalConflict && (
        // Several small transfers one way against one huge transfer the other way.
        <p className="tc-intraday-note tc-intraday-note--warn">
          The BTC-count and USD signals disagree. The USD one is the one that matters: it weighs
          magnitude, not the number of transfers.
        </p>
      )}
      <div className="tc-intraday-kv-grid">
        <KeyValue
          k="Inflow / outflow (BTC)"
          v={`${flows.inflowBtc.toLocaleString('en-US')} / ${flows.outflowBtc.toLocaleString('en-US')}`}
        />
        <KeyValue
          k="Stable mint / burn"
          v={`${usd(flows.stable.mint)} / ${usd(flows.stable.burn)}`}
        />
        <KeyValue k="Stable redemption" v={usd(flows.stable.redemption)} />
        <KeyValue k="Stable to exchange" v={usd(flows.stable.toExchange)} />
      </div>
      <div className="tc-whale-list">
        {flows.classified.map((a, i) => (
          <div className="tc-whale-row" key={`${a.timestamp ?? i}-${i}`}>
            <span className="tc-whale-time">
              {a.timestamp != null
                ? new Date(a.timestamp * 1000).toISOString().slice(11, 16)
                : '--:--'}
            </span>
            <span>
              {a.flow.emoji}{' '}
              {a.materiality && <span className="tc-whale-tag tc-amber">{a.materiality} </span>}
              <strong>
                {a.amount?.toLocaleString('en-US') ?? '?'} {a.symbol ?? '?'}
              </strong>{' '}
              ({usd(a.valueUsd)})
              <br />
              <span className="tc-whale-note">
                <span className={tone(a.flow.bias)}>{a.flow.category}</span> · {a.flow.note}
              </span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
};

// ─── Gamma panel ──────────────────────────────────────────────────────────────
const GammaBody = ({
  gamma,
  regime,
}: {
  gamma: GammaResult | null;
  regime: IntradaySnapshot['gammaRegime'];
}) => {
  if (!gamma || !gamma.ok) {
    return (
      <p className="tc-intraday-note">
        No gamma snapshot in this run
        {gamma?.degraded ? ' (the chain carried no usable open interest).' : '.'}
      </p>
    );
  }
  // Tri-state flags: null means the input was missing, and must read as N/A rather
  // than as the negative interpretation.
  const pcRead = regime?.defensive == null ? 'N/A' : regime.defensive ? 'defensive' : 'offensive';
  return (
    <>
      {/* A venue down understates the aggregate and can invert the regime sign, so the
          warning goes ahead of every number in the panel. */}
      {gamma.partial && (
        <p className="tc-intraday-note tc-intraday-note--warn">
          Incomplete chain: no data from {gamma.venuesDown.join(', ')}. The aggregate is understated
          and the regime may be inverted.
        </p>
      )}
      <div
        className={`tc-intraday-regime ${gamma.netGamma != null && gamma.netGamma < 0 ? 'tc-red' : 'tc-green'}`}
      >
        {regime?.regimeLabel}
      </div>
      <div className="tc-intraday-kv-grid">
        {/* Millions of USD of delta per 1% move — see GammaSnapshot in types.ts. */}
        <KeyValue k="Net gamma (M$ / 1%)" v={gamma.netGamma?.toLocaleString('en-US') ?? '—'} />
        <KeyValue
          k="Call / Put gamma"
          v={`${gamma.callGamma?.toLocaleString('en-US') ?? '—'} / ${gamma.putGamma?.toLocaleString('en-US') ?? '—'}`}
        />
        <KeyValue k="Put/Call ratio" v={`${gamma.putCallRatio ?? '—'} (${pcRead})`} />
        <KeyValue
          k="Asymmetry bias"
          v={gamma.bias == null ? '—' : `${gamma.bias} (${gamma.gammaAbovePct ?? '—'}% above spot)`}
        />
        <KeyValue
          k={regime?.isPin ? 'Pin' : 'Support / resistance'}
          v={
            regime?.isPin
              ? usd(regime.pinLevel)
              : `${usd(gamma.support)} / ${usd(gamma.resistance)}`
          }
        />
        <KeyValue k="Gamma flip" v={usd(gamma.breakout)} />
        <KeyValue
          k="Vol realized vs implied"
          v={`${gamma.realizedVol ?? '—'}% vs ${gamma.impliedVol ?? '—'}%`}
          tone={regime?.realizedGtImplied ? 'tc-amber' : ''}
        />
        <KeyValue k="Pin risk" v={gamma.pinRisk ?? '—'} />
        <KeyValue
          k="Options flow 24h (BTC)"
          v={`call ${gamma.callFlow?.toLocaleString('en-US') ?? '—'} / put ${gamma.putFlow?.toLocaleString('en-US') ?? '—'}`}
        />
        <KeyValue
          k="Contracts"
          v={`${gamma.contractsUsed} used · ${gamma.contractsSkipped} skipped`}
        />
        {/* Proprietary labels of the previous provider, not derivable from the chain.
            Kept visible so their absence is explicit rather than silent. */}
        <KeyValue k="Squeeze risk" v="N/A (not derivable)" />
        <KeyValue k="Delta hedging" v="N/A (not derivable)" />
      </div>
      {regime?.realizedGtImplied && (
        <p className="tc-intraday-note tc-intraday-note--warn">
          Realized volatility exceeds implied: options are underpricing the real move.
        </p>
      )}
    </>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
const IntradayPage = () => {
  // The server renders this route with a live snapshot and caches it for 15 min,
  // so the page normally arrives complete rather than empty behind a spinner.
  // `null` means there was no SSR data — the dev server and the SPA fallback both
  // land there — and the page then fetches on mount exactly as it used to.
  const ssrSnapshot = useSsrSnapshot();
  const [snap, setSnap] = useState<IntradaySnapshot | null>(ssrSnapshot);
  const [loading, setLoading] = useState(ssrSnapshot === null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [copied, setCopied] = useState(false);
  // Guards against a slow in-flight pull overwriting a newer one.
  const runIdRef = useRef(0);

  // `force` bypasses the 15 min response cache — the manual button always goes to
  // the network, mount and auto-refresh reuse whatever is still fresh.
  const refresh = useCallback(async (force = false) => {
    const id = ++runIdRef.current;
    setLoading(true);
    const result = await runIntraday(new Date(), { force });
    if (runIdRef.current !== id) return;
    // Whale Alert, skew and Vol Lab are CORS-blocked, so a browser pull returns
    // them as null. Carry the server-rendered values forward instead of blanking
    // three panels every time someone presses refresh — they are labelled with
    // their own timestamps, so a reader can see they are older than the CVD.
    setSnap((prev) =>
      prev
        ? {
            ...result,
            whale: result.whale ?? prev.whale,
            flows: result.flows ?? prev.flows,
            skew: result.skew ?? prev.skew,
            skewRead: result.skewRead ?? prev.skewRead,
            volLab: result.volLab ?? prev.volLab,
            volLabRead: result.volLabRead ?? prev.volLabRead,
          }
        : result
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    // Nothing to do when the server already supplied the pull: re-fetching on
    // mount would throw away a snapshot that is at most 15 min old and undo the
    // point of rendering it server-side.
    if (ssrSnapshot) return;
    void refresh();
  }, [refresh, ssrSnapshot]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void refresh(), AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [autoRefresh, refresh]);

  const handleCopy = useCallback(async () => {
    if (!snap) return;
    try {
      await navigator.clipboard.writeText(buildIntradayReport(snap));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions) — the <pre> is still
      // selectable, so there's nothing to recover from.
    }
  }, [snap]);

  const handleClearHistory = useCallback(() => {
    clearHistory();
    void refresh();
  }, [refresh]);

  const cvd = snap?.cvdFlows ?? null;
  const perp = snap?.cvdPerpFlows ?? null;
  const spotDays = snap?.cvdDaily?.spot ?? [];
  const perpByDay = new Map((snap?.cvdDaily?.perp ?? []).map((d) => [d.dayMs, d]));
  const divergent =
    cvd && perp && Math.sign(cvd.totalCvd) !== 0 && Math.sign(perp.totalCvd) !== 0
      ? Math.sign(cvd.totalCvd) !== Math.sign(perp.totalCvd)
      : false;

  return (
    <div className="tc-intraday-page">
      <div className="tc-page-intro">
        <h1 className="tc-page-title">Intraday — BTC order flow</h1>
        <p className="tc-page-subtitle">
          Multi-timeframe aggressor delta (CVD) for Binance spot and perpetuals, plus BTC options
          gamma exposure. The page is{' '}
          <span className="tc-page-highlight">rendered on our server</span> from public market
          endpoints and refreshed every 15 minutes — no account, no sign-up.
        </p>
      </div>

      <div className="tc-intraday-about">
        <section className="tc-intraday-about-card">
          <h2 className="tc-intraday-about-title">Where the data comes from</h2>
          <ul className="tc-intraday-about-list">
            <li>
              <strong>Binance spot</strong> — 5m and 1d candles for BTCUSDT. Each candle already
              reports its taker-buy volume, so the aggressor delta is derived from it directly
              rather than from individual trades.
            </li>
            <li>
              <strong>Binance USDT-M perpetual</strong> — the same candles for the BTCUSDT perp.
              Reading it next to spot is what exposes leverage pulling against cash.
            </li>
            <li>
              <strong>BTC options gamma exposure</strong> — the raw options chain of Deribit, OKX,
              Bybit and Binance via basischarts.com. No aggregated metrics are served: net gamma,
              support, resistance, the gamma flip and the pin are all computed in the page with
              Black-76 gamma on each expiry&apos;s forward.
            </li>
          </ul>
          <p className="tc-intraday-about-note">
            All three are public endpoints and need no API key. Responses are cached for 15 minutes
            so refreshing does not hammer them; the pull history below is one shared series, the
            same for every visitor, not a record of your own visits.
          </p>
        </section>

        <section className="tc-intraday-about-card">
          <h2 className="tc-intraday-about-title">Using the report with your AI</h2>
          <ol className="tc-intraday-about-list">
            <li>
              Open <strong>Raw report</strong> at the bottom of this page and press{' '}
              <strong>Copy to clipboard</strong>.
            </li>
            <li>
              Paste it into ChatGPT, Claude or any assistant, ideally in a{' '}
              <strong>fresh chat</strong>. Send it on its own — you do not need to write a question
              around it.
            </li>
            <li>
              The text already carries the numbers, a full interpretation guide, the weighting rules
              and the required output format, so the assistant needs no other context.
            </li>
            <li>
              You get back a <strong>scenario table</strong> — bullish, bearish and sideways with
              probabilities summing to 100% — plus the drivers behind each one and LONG/SHORT setups
              derived from the gamma levels.
            </li>
          </ol>
          <p className="tc-intraday-about-note">
            The report is a snapshot of the moment you copied it. For a fresh read, hit Refresh and
            paste it again. It is automated analysis over public data, not financial advice.
          </p>
        </section>
      </div>

      <div className="tc-intraday-toolbar">
        <button
          type="button"
          className="tc-page-btn"
          onClick={() => void refresh(true)}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <label className="tc-intraday-auto">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto every {Math.round(AUTO_REFRESH_MS / 60_000)} min
        </label>
        {snap && (
          <span className="tc-intraday-timestamp">
            Last reading: {snap.generatedAt.slice(11, 19)} UTC
            {snap.cacheAgeMs != null &&
              ` · cached data from ${Math.max(1, Math.round(snap.cacheAgeMs / 60_000))} min ago`}
          </span>
        )}
      </div>

      {snap?.errors.length ? (
        <div className="tc-intraday-errors">
          {snap.errors.map((e) => (
            <div key={e}>⚠️ {e}</div>
          ))}
        </div>
      ) : null}

      {!snap && loading && <p className="tc-intraday-note">Loading market data…</p>}

      {snap && (
        <>
          {/* ─── Headline stats ─────────────────────────────────────────────── */}
          <Row>
            <Panel grow={1} minWidth={180} centered>
              <Stat
                label="BTC (5m close)"
                value={usd(cvd?.priceTo)}
                sub={cvd ? `session from ${usd(cvd.priceFrom)}` : undefined}
                tone={
                  cvd?.priceTo != null && cvd?.priceFrom != null
                    ? signClass(cvd.priceTo - cvd.priceFrom)
                    : ''
                }
              />
            </Panel>
            <Panel grow={1} minWidth={180} centered>
              <Stat
                label="Spot session CVD"
                value={`${sign(cvd?.totalCvd)} BTC`}
                sub={cvd ? `${SIGNAL_LABEL[cvd.signal]} · ${millions(cvd.deltaUsd)}` : undefined}
                tone={signClass(cvd?.totalCvd)}
              />
            </Panel>
            <Panel grow={1} minWidth={180} centered>
              <Stat
                label="Perp session CVD"
                value={`${sign(perp?.totalCvd)} BTC`}
                sub={perp ? SIGNAL_LABEL[perp.signal] : undefined}
                tone={signClass(perp?.totalCvd)}
              />
            </Panel>
            <Panel grow={1} minWidth={180} centered>
              <Stat
                label="Gamma regime"
                value={snap.gammaRegime?.regime.replace('_', ' ') ?? '—'}
                sub={
                  snap.gamma?.ok
                    ? `net ${snap.gamma.netGamma?.toLocaleString('en-US')} M$ / 1%`
                    : 'no snapshot'
                }
                tone={
                  snap.gamma?.ok && snap.gamma.netGamma != null
                    ? snap.gamma.netGamma < 0
                      ? 'tc-red'
                      : 'tc-green'
                    : ''
                }
              />
            </Panel>
          </Row>

          {/* ─── Order flow ─────────────────────────────────────────────────── */}
          {/* Whale flows lead the page: they carry the highest weight in the model
              (whales and CVD > realised/potential > gamma > skew). Server-rendered
              only — Whale Alert blocks cross-origin reads. */}
          {snap.flows && (
            <>
              <SectionHeading>Whale flows</SectionHeading>
              <Row>
                <Panel title="Transfers and net balance" grow={1} minWidth={320}>
                  <WhaleFlowBody flows={snap.flows} />
                </Panel>
              </Row>
            </>
          )}

          <SectionHeading>Aggressor order flow</SectionHeading>

          <Row>
            <Panel title="Delta of the in-progress aligned candle" grow={5} minWidth={320}>
              <table className="tc-intraday-table">
                <thead>
                  <tr>
                    <th className="tc-intraday-th-row" />
                    <th className="tc-intraday-th">15m</th>
                    <th className="tc-intraday-th">1H</th>
                    <th className="tc-intraday-th">4H</th>
                    <th className="tc-intraday-th">Session</th>
                  </tr>
                </thead>
                <tbody>
                  <TfRow label="Spot" cvd={cvd} />
                  <TfRow label="Perp" cvd={perp} />
                </tbody>
              </table>
              <p className="tc-intraday-note">
                Delta in BTC inside the in-progress candle of each timeframe (Binance clock cut, not
                a rolling window). Positive = aggressive buying. Session = accumulated since 00:00
                UTC.
              </p>
              <AbsorptionNotes label="Spot" cvd={cvd} />
              <AbsorptionNotes label="Perp" cvd={perp} />
              {divergent && (
                <p className="tc-intraday-note tc-intraday-note--warn">
                  Spot↔perp divergence: cash and leverage are aggressing in opposite directions
                  (possible positioning or hedging).
                </p>
              )}
            </Panel>

            <Panel title="Price ↔ CVD divergence (spot session)" grow={4} minWidth={280}>
              {cvd ? (
                <>
                  <div className={`tc-intraday-regime ${DIVERGENCE_COPY[cvd.divergence].tone}`}>
                    {DIVERGENCE_COPY[cvd.divergence].text}
                  </div>
                  <div className="tc-intraday-kv-grid">
                    <KeyValue
                      k="Net session aggression"
                      v={cvd.ratio != null ? `${(cvd.ratio * 100).toFixed(2)}%` : '—'}
                      tone={signClass(cvd.ratio)}
                    />
                    <KeyValue
                      k="Buy / Sell"
                      v={`${cvd.buyBtc.toFixed(0)} / ${cvd.sellBtc.toFixed(0)} BTC`}
                    />
                    <KeyValue
                      k="Last candle"
                      v={`${sign(cvd.lastDelta, 1)} BTC`}
                      tone={signClass(cvd.lastDelta)}
                    />
                    <KeyValue
                      k={`Last ${cvd.recentBars * 5} min`}
                      v={`${sign(cvd.recentDelta, 1)} BTC`}
                      tone={signClass(cvd.recentDelta)}
                    />
                    <KeyValue
                      k="Session excursion"
                      v={`${sign(cvd.minCvd)} / ${sign(cvd.maxCvd)} BTC`}
                    />
                    <KeyValue k="5m candles" v={String(cvd.bars)} />
                  </div>
                  {swingNuance(cvd) && (
                    <p className="tc-intraday-note tc-intraday-note--warn">{swingNuance(cvd)}</p>
                  )}
                </>
              ) : (
                <p className="tc-intraday-note">No CVD data in this run.</p>
              )}
            </Panel>
          </Row>

          <Row>
            <Panel title="Session CVD curve vs price" grow={1} minWidth={320}>
              {cvd ? (
                <Suspense fallback={<div className="tc-intraday-chart-fallback" />}>
                  <CvdSessionChart cvd={cvd} />
                </Suspense>
              ) : (
                <p className="tc-intraday-note">No CVD data in this run.</p>
              )}
              <p className="tc-intraday-note">
                Solid line: cumulative CVD (left axis, BTC). Dashed line: price (right axis). When
                they separate, someone passive is absorbing the aggression.
              </p>
            </Panel>
          </Row>

          {/* ─── Context ────────────────────────────────────────────────────── */}
          <SectionHeading>Context</SectionHeading>

          <Row>
            <Panel title="Daily CVD — previous complete sessions" grow={4} minWidth={280}>
              {spotDays.length ? (
                <table className="tc-intraday-table">
                  <thead>
                    <tr>
                      <th className="tc-intraday-th-row">Date</th>
                      <th className="tc-intraday-th">Spot</th>
                      <th className="tc-intraday-th">Perp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spotDays.map((d) => {
                      const p = perpByDay.get(d.dayMs);
                      return (
                        <tr key={d.dayMs ?? 'na'}>
                          <th className="tc-intraday-th-row">
                            {d.dayMs != null ? new Date(d.dayMs).toISOString().slice(0, 10) : '—'}
                          </th>
                          <td className="tc-intraday-td">
                            <span className={signClass(d.delta)}>{sign(d.delta)}</span>
                          </td>
                          <td className="tc-intraday-td">
                            <span className={signClass(p?.delta)}>{sign(p?.delta)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="tc-intraday-note">No daily CVD in this run.</p>
              )}
              <p className="tc-intraday-note">
                Aggressor delta of each complete session (BTC). Several days of the same sign =
                sustained pressure; a recent turn against that trend gains relevance.
              </p>
            </Panel>

            {/* The venue list comes from the data, not hardcoded: a pull with a venue down
                must not claim coverage it does not have. */}
            <Panel
              title={`Gamma exposure (${snap.gamma?.ok && snap.gamma.venues.length ? snap.gamma.venues.join(' + ') : 'options chain'})`}
              grow={5}
              minWidth={300}
            >
              <GammaBody gamma={snap.gamma} regime={snap.gammaRegime} />
            </Panel>
          </Row>

          {/* Options detail. Rendered only when the server supplied it: all three
              sources are CORS-blocked, so a browser-only pull has nothing here. */}
          {snap.gamma?.ok && (
            <>
              <SectionHeading>Options positioning</SectionHeading>
              <Row>
                <Panel title="Total gamma exposure" grow={5} minWidth={320}>
                  <TotalGammaExposure gamma={snap.gamma} />
                </Panel>
                <Panel title="Squeeze levels" grow={4} minWidth={300} centered>
                  <SqueezeLevels gamma={snap.gamma} />
                </Panel>
              </Row>
              <Row>
                <Panel title="Gamma exposure by expiry" grow={1} minWidth={320}>
                  <GammaByExpiryChart buckets={snap.gamma.gammaByExpiry} />
                  <p className="tc-intraday-note">
                    Signed gamma per expiry, nearest first, in M$ of delta per 1% move. Red =
                    dealers short gamma on that expiry (amplifies moves), green = long (dampens).
                  </p>
                </Panel>
              </Row>
            </>
          )}

          {(snap.skew?.ok || snap.volLab?.ok) && (
            <Row>
              {snap.skew?.ok && snap.skewRead && (
                <Panel title="Market sentiment — 25-delta skew" grow={4} minWidth={300}>
                  <MarketSentiment skew={snap.skew} read={snap.skewRead} />
                </Panel>
              )}
              {snap.volLab?.ok && snap.volLabRead && (
                <Panel title="Vol Lab — skew risk premium" grow={5} minWidth={320}>
                  <VolLabBody volLab={snap.volLab} read={snap.volLabRead} />
                </Panel>
              )}
            </Row>
          )}

          <Row>
            <Panel title="End-of-capitulation check" grow={5} minWidth={300}>
              <div className="tc-intraday-regime">
                {snap.capitulation.met}/{snap.capitulation.total} → {snap.capitulation.verdict}
              </div>
              <ul className="tc-intraday-checks">
                {snap.capitulation.checks.map((c) => (
                  <li key={c.label} className="tc-intraday-check">
                    <span className="tc-intraday-check-mark">
                      {c.met == null ? '·' : c.met ? '✅' : '❌'}
                    </span>
                    <span>
                      {c.label} <span className="tc-intraday-check-detail">({c.detail})</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="tc-intraday-note">
                A convergence of exhaustion signals, not a verdict: a bottom is only confirmed in
                hindsight. Read it as support for a thesis, never as the thesis itself.
              </p>
            </Panel>

            <Panel title="Pull history (shared series)" grow={4} minWidth={280}>
              {snap.history.length ? (
                <table className="tc-intraday-table">
                  <thead>
                    <tr>
                      <th className="tc-intraday-th-row">UTC</th>
                      <th className="tc-intraday-th">Price</th>
                      <th className="tc-intraday-th">Spot CVD</th>
                      <th className="tc-intraday-th">Perp CVD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.history.map((r, i) => (
                      <tr
                        key={r.t}
                        className={i === snap.history.length - 1 ? 'tc-intraday-tr--now' : ''}
                      >
                        <th className="tc-intraday-th-row">{r.t.slice(11, 16)}</th>
                        <td className="tc-intraday-td">{usd(r.price)}</td>
                        <td className="tc-intraday-td">
                          <span className={signClass(r.cvdSpot)}>{sign(r.cvdSpot)}</span>
                        </td>
                        <td className="tc-intraday-td">
                          <span className={signClass(r.cvdPerp)}>{sign(r.cvdPerp)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="tc-intraday-note">No pulls recorded yet.</p>
              )}
              <div className="tc-intraday-history-foot">
                <p className="tc-intraday-note">
                  One shared series, refreshed on the server every 15 minutes.{' '}
                  <strong>Clear history</strong> only drops the copy this browser kept from its own
                  manual refreshes; the shared series is untouched.
                </p>
                <button type="button" className="tc-page-btn" onClick={handleClearHistory}>
                  Clear history
                </button>
              </div>
            </Panel>
          </Row>

          {/* ─── Raw report ─────────────────────────────────────────────────── */}
          <SectionHeading>Raw report</SectionHeading>

          <details className="tc-intraday-raw">
            <summary className="tc-intraday-raw-summary">
              View the full text report (paste it into an AI assistant)
            </summary>
            <div className="tc-intraday-raw-body">
              <button type="button" className="tc-page-btn" onClick={() => void handleCopy()}>
                {copied ? 'Copied ✓' : 'Copy to clipboard'}
              </button>
              <pre className="tc-intraday-pre">{buildIntradayReport(snap)}</pre>
            </div>
          </details>
        </>
      )}
    </div>
  );
};

export default IntradayPage;
