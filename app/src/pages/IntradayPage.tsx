import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Panel, { Row, SectionHeading } from '../dashboard/Panel';
import { TabNav, panelId, tabId } from '../dashboard/TabNav';
import type { TabDef } from '../dashboard/TabNav';
import { buildIntradayReport, clearHistory } from '../utils/intraday';
import { useSsrSnapshot } from '../utils/intraday/ssrData';
import type {
  Capitulation,
  CvdAnalysis,
  Divergence,
  FlowAnalysis,
  FlowBias,
  GammaRegime,
  GammaByExpiry,
  GammaGrid,
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

// Matches the server's own render TTL (server/intraday/page.ts). The tick is
// scheduled off the server's render time rather than run as a fixed interval, so
// it lands when there is actually something new to collect.
const AUTO_REFRESH_MS = 15 * 60 * 1000;

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

/**
 * Fixed-decimal reading of a raw figure. The Vol Lab endpoint serves full float
 * precision (ρ arrives as -0.4590246638338294), which breaks the grid alignment
 * and wraps on mobile; nothing downstream reads past the third decimal.
 */
const dec = (n: number | null | undefined, digits = 2): string =>
  n == null || !Number.isFinite(n) ? '—' : n.toFixed(digits);

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
    {/* Labelled with the figure it is actually derived from. It used to read
        "N% call weighted", which is a different metric entirely: the bias comes
        from how much |gamma| sits above spot, not from how much of it is calls.
        The two can point opposite ways — BULLISH over "41% call weighted" — and
        the number a reader needs to judge the verdict was nowhere near it. */}
    <Hero
      value={gamma.bias ?? '—'}
      label={`${gamma.gammaAbovePct?.toFixed(0) ?? '—'}% of gamma above spot`}
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

// ─── Gamma grid ───────────────────────────────────────────────────────────────
/** Cell tint: hue carries the sign, alpha the magnitude against the strongest. */
const cellTint = (gamma: number, max: number): string | undefined => {
  if (gamma === 0 || max <= 0) return undefined;
  // Floor at 0.08 so a small-but-real value still reads as filled rather than
  // blank, and cap below 1 so the printed number keeps its contrast.
  const a = Math.min(0.75, Math.max(0.08, (Math.abs(gamma) / max) * 0.75));
  const rgb = gamma < 0 ? '239, 68, 68' : '34, 197, 94';
  return `rgba(${rgb}, ${a})`;
};

/** Grid cells are tight, so figures lose a decimal as they grow. */
const gridNum = (g: number): string => {
  if (g === 0) return '';
  const abs = Math.abs(g);
  if (abs < 0.05) return '·';
  return g.toFixed(abs >= 10 ? 0 : 1);
};

/**
 * Signed gamma over price × expiry, with both margins.
 *
 * The two one-dimensional charts this replaces each answered half a question:
 * where the walls sit, and when they expire. Neither said which wall belongs to
 * which expiry, and that is the intraday question — a wall at spot matters far
 * more if it burns off tomorrow than if it is a quarterly. The totals column and
 * row are exactly the two charts that used to be separate panels.
 *
 * A real table, not a div grid: the price and day headers are what make 200-odd
 * numbers navigable with a screen reader. Every cell prints its value, so the
 * tint is reinforcement rather than the only channel carrying the sign.
 */
const GammaGridTable = ({
  grid,
  byExpiry,
  levels,
}: {
  grid: GammaGrid;
  byExpiry: GammaByExpiry[];
  levels: Pick<GammaSnapshot, 'support' | 'resistance' | 'breakout'>;
}) => {
  if (!grid.strikes.length || !grid.expiries.length) {
    return <p className="tc-intraday-note">No strike/expiry breakdown in this run.</p>;
  }
  // One tag per level, on the row whose bucket contains it, so the walls the
  // cards above name are findable as rows instead of as a separate list.
  const holds = (level: number | null): ((s: number) => boolean) =>
    level == null ? () => false : (s) => level >= s && level < s + grid.bucket;
  const isSupport = holds(levels.support);
  const isResistance = holds(levels.resistance);
  const isFlip = holds(levels.breakout);
  const tagFor = (strike: number): string | null =>
    isFlip(strike)
      ? 'flip'
      : isResistance(strike)
        ? 'resistance'
        : isSupport(strike)
          ? 'support'
          : null;
  const max = Math.max(...grid.cells.flat().map(Math.abs), 0.01);
  const rowTotals = grid.cells.map((r) => r.reduce((s, v) => s + v, 0));
  const colTotals = grid.expiries.map((_, c) => grid.cells.reduce((s, r) => s + r[c], 0));
  const total = rowTotals.reduce((s, v) => s + v, 0);
  // The all-strikes term structure, kept as its own row: the windowed margin is
  // what the cells add up to, but an expiry's full book is the figure the gamma
  // regime is actually computed from, and dropping it would have been a silent
  // regression against the chart this grid replaces.
  const fullByExpiry = new Map(byExpiry.map((b) => [b.expiry, b.gamma]));
  const fullTotal = byExpiry.reduce((s, b) => s + b.gamma, 0);

  return (
    <div className="tc-gex-grid-scroll">
      <table className="tc-gex-grid">
        <thead>
          <tr>
            <th className="tc-gex-grid-corner" scope="col">
              Price
            </th>
            {grid.expiries.map((e) => (
              <th key={e.expiry} className="tc-gex-grid-col" scope="col" title={e.label}>
                {e.daysOut}d
              </th>
            ))}
            <th className="tc-gex-grid-col tc-gex-grid-total" scope="col">
              All
            </th>
          </tr>
        </thead>
        <tbody>
          {grid.strikes.map((strike, r) => (
            <tr key={strike} className={r === grid.spotRow ? 'tc-gex-grid-row--spot' : undefined}>
              {/* At most one tag: the spot row is already marked by its band,
                  so when a level lands on it the level is the tag worth the
                  space. */}
              <th className="tc-gex-grid-rowhead" scope="row">
                {usd(strike)}
                {tagFor(strike) ? (
                  <span className={`tc-gex-strike-tag tc-gex-strike-tag--${tagFor(strike)}`}>
                    {tagFor(strike)}
                  </span>
                ) : (
                  r === grid.spotRow && <span className="tc-gex-strike-tag">spot</span>
                )}
              </th>
              {grid.cells[r].map((g, c) => (
                <td
                  key={grid.expiries[c].expiry}
                  className="tc-gex-grid-cell"
                  style={{ backgroundColor: cellTint(g, max) }}
                  title={`${usd(strike)} · ${grid.expiries[c].label} (${grid.expiries[c].daysOut}d): ${signed(g)} M$`}
                >
                  {gridNum(g)}
                </td>
              ))}
              <td className={`tc-gex-grid-cell tc-gex-grid-total ${signClass(rowTotals[r])}`}>
                {gridNum(rowTotals[r])}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className="tc-gex-grid-rowhead tc-gex-grid-total" scope="row">
              In window
            </th>
            {colTotals.map((t, c) => (
              <td
                key={grid.expiries[c].expiry}
                className={`tc-gex-grid-cell tc-gex-grid-total ${signClass(t)}`}
              >
                {gridNum(t)}
              </td>
            ))}
            <td className={`tc-gex-grid-cell tc-gex-grid-total ${signClass(total)}`}>
              {gridNum(total)}
            </td>
          </tr>
          <tr>
            <th className="tc-gex-grid-rowhead tc-gex-grid-total" scope="row">
              All strikes
            </th>
            {grid.expiries.map((e) => {
              const g = fullByExpiry.get(e.expiry);
              return (
                <td
                  key={e.expiry}
                  className={`tc-gex-grid-cell tc-gex-grid-total ${signClass(g ?? 0)}`}
                  title={`${e.label}: ${signed(g ?? 0)} M$ across every strike, not just the window`}
                >
                  {g == null ? '' : gridNum(g)}
                </td>
              );
            })}
            <td className={`tc-gex-grid-cell tc-gex-grid-total ${signClass(fullTotal)}`}>
              {gridNum(fullTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
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
      <KeyValue k="Skew RP z-score" v={`${dec(volLab.skewRpZ)} (${read.stretch})`} />
      <KeyValue k="Risk reversal / butterfly" v={`${dec(volLab.avgRr)} / ${dec(volLab.avgFly)}`} />
      <KeyValue
        k="Vol-of-vol ν (impl / real)"
        v={`${dec(volLab.nuImp)} / ${dec(volLab.nuR)}`}
        tone={read.vvolUnderpriced ? 'tc-amber' : ''}
      />
      <KeyValue
        k="Spot-vol ρ (impl / real)"
        v={`${dec(volLab.rhoImp, 3)} / ${dec(volLab.rhoR, 3)}`}
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

/**
 * Non-colour mark for a transfer's bias.
 *
 * The row already carried the direction twice — a coloured dot (🔴/🟢) and red
 * or green category text — and both are hue. Red-green deficiency affects
 * roughly 8% of men, which is most of this page's audience, so the direction
 * was effectively unreadable for them. A shape carries it on a second channel.
 */
const BIAS_MARK: Record<FlowBias, string> = {
  bullish: '▲',
  bearish: '▼',
  // Stablecoin arriving as dry powder: bullish only once it is deployed.
  bullish_latent: '◆',
  neutral: '–',
};

/** Transfers shown before the list asks to be expanded. */
const WHALE_PREVIEW_ROWS = 8;

/** Whale transfers, newest first, with the net balance underneath. */
const WhaleFlowBody = ({ flows }: { flows: FlowAnalysis }) => {
  const [expanded, setExpanded] = useState(false);
  if (!flows.classified.length)
    return <p className="tc-intraday-note">No whale alerts in this run.</p>;
  const tone = (bias: string) =>
    bias === 'bullish' ? 'tc-green' : bias === 'bearish' ? 'tc-red' : '';
  const shown = expanded ? flows.classified : flows.classified.slice(0, WHALE_PREVIEW_ROWS);
  const hidden = flows.classified.length - shown.length;
  return (
    <>
      <div className="tc-gex-hero">
        <Hero
          value={`${flows.netBtc > 0 ? '+' : ''}${Math.round(flows.netBtc).toLocaleString('en-US')}`}
          label="Net BTC balance"
          tone={tone(flows.netBtc > 0 ? 'bullish' : flows.netBtc < 0 ? 'bearish' : '')}
        />
        {/* Abbreviated, not the full figure: at 24px in a hero column the exact
            dollar count wraps mid-number on a phone, and the digits past the
            second decimal of a million carry nothing a reader acts on. */}
        <Hero
          value={millions(flows.netUsd)}
          label="Net USD"
          tone={tone(flows.netUsd > 0 ? 'bullish' : flows.netUsd < 0 ? 'bearish' : '')}
        />
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
      {/* A preview that grows, not a scroll box. The list used to be 420px of
          overflow holding ~1,500px of rows: it clipped its last row mid-line,
          gave no sign more existed, and trapped the scroll on a phone inside a
          page that is already long. */}
      <div className="tc-whale-list">
        {shown.map((a, i) => (
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
                <span className={tone(a.flow.bias)}>
                  {/* Hidden from assistive tech: the category text right after
                      it already says the direction in words. */}
                  <span className="tc-whale-mark" aria-hidden="true">
                    {BIAS_MARK[a.flow.bias]}
                  </span>
                  {a.flow.category}
                </span>{' '}
                · {a.flow.note}
              </span>
            </span>
          </div>
        ))}
      </div>
      {hidden > 0 && (
        <button type="button" className="tc-page-btn" onClick={() => setExpanded(true)}>
          Show {hidden} more {hidden === 1 ? 'transfer' : 'transfers'}
        </button>
      )}
      {expanded && flows.classified.length > WHALE_PREVIEW_ROWS && (
        <button type="button" className="tc-page-btn" onClick={() => setExpanded(false)}>
          Show fewer
        </button>
      )}
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
        {/* callWeighted lands here, not on the bias tile where it used to be
            labelled: it is the composition of the two figures on this very row
            (|call| over |call| + |put|), and has nothing to do with the bias. */}
        <KeyValue
          k="Call / Put gamma"
          v={`${gamma.callGamma?.toLocaleString('en-US') ?? '—'} / ${gamma.putGamma?.toLocaleString('en-US') ?? '—'}${
            gamma.callWeighted == null ? '' : ` (${gamma.callWeighted.toFixed(0)}% calls)`
          }`}
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

// ─── Signal strip ─────────────────────────────────────────────────────────────
const DIVERGENCE_LABEL: Record<Divergence, string> = {
  BULLISH: 'Bullish divergence',
  BEARISH: 'Bearish divergence',
  CONFIRMS: 'Price confirms',
  'N/A': 'No read',
};

/** BEARISH → Bearish, so one strip does not mix shouted and sentence case. */
const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();

const toneOf = (v: string): string =>
  /BULLISH|Buying/i.test(v) ? 'tc-green' : /BEARISH|Selling/i.test(v) ? 'tc-red' : '';

const Chip = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="tc-intraday-chip">
    <span className="tc-intraday-chip-label">{label}</span>
    <span className={`tc-intraday-chip-value ${tone ?? ''}`}>{value}</span>
  </div>
);

/** The timeframes reading absorption, as the short form a chip can hold. */
const absorbedChip = (cvd: CvdAnalysis | null): string | null => {
  const hits = TF_KEYS.map((k) => cvd?.timeframes[k]).filter(
    (w): w is TimeframeWindow =>
      w?.flow?.kind === 'ABSORBED_BUYING' || w?.flow?.kind === 'ABSORBED_SELLING'
  );
  if (!hits.length) return null;
  const side = hits[0].flow!.kind === 'ABSORBED_BUYING' ? 'buying' : 'selling';
  return `${hits.map((w) => w.label).join(', ')} ${side}`;
};

/**
 * The readings buried further down, gathered in one line under the headline stats.
 *
 * Deliberately NOT a new signal: every chip mirrors a field a panel below renders,
 * so the strip can never disagree with the page. It also deliberately skips what
 * the stat cards directly above already show (spot and perp aggression, the gamma
 * regime) — repeating those would make the strip decoration rather than an answer.
 * Someone opening this page wants "what is happening" before forty metrics, and
 * until now that answer only existed by pasting the raw report into an assistant.
 */
const SignalStrip = ({
  cvd,
  flows,
  capitulation,
  divergent,
}: {
  cvd: CvdAnalysis | null;
  flows: FlowAnalysis | null;
  capitulation: Capitulation | null;
  divergent: boolean;
}) => {
  const chips: { label: string; value: string; tone?: string }[] = [];
  if (cvd) {
    chips.push({
      label: 'Price vs CVD',
      value: DIVERGENCE_LABEL[cvd.divergence],
      tone: toneOf(cvd.divergence),
    });
  }
  const absorbed = absorbedChip(cvd);
  if (absorbed) chips.push({ label: 'Absorption', value: absorbed, tone: 'tc-amber' });
  if (flows) {
    chips.push({
      label: 'Whale flow',
      value: titleCase(flows.netSignal),
      tone: toneOf(flows.netSignal),
    });
  }
  if (capitulation) {
    chips.push({
      label: 'Capitulation',
      value: `${capitulation.met}/${capitulation.total} — ${capitulation.verdict}`,
    });
  }
  if (!chips.length) return null;

  return (
    <div className="tc-intraday-strip">
      <div className="tc-intraday-chips">
        {chips.map((c) => (
          <Chip key={c.label} {...c} />
        ))}
      </div>
      {divergent && (
        <p className="tc-intraday-note tc-intraday-note--warn">
          Spot and perp are aggressing in opposite directions — cash and leverage disagree, so treat
          either read as weaker than it looks on its own.
        </p>
      )}
    </div>
  );
};

/**
 * How old the served data is, in words.
 *
 * Says "just now" under a minute instead of rounding up to "1 min ago", which
 * is what the old label did to a pull that had just come off the network.
 */
const ageLabel = (renderedAt: number, now: number): string => {
  const sec = Math.max(0, Math.round((now - renderedAt) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  return `${min} min ago`;
};

// ─── Auto-refresh preference ──────────────────────────────────────────────────
// Read after mount, never in the state initialiser: this route is server-rendered
// and a stored `true` would make the first client render disagree with the HTML.
const AUTO_PREF_KEY = 'tc:intraday-auto';

// ─── Tabs ─────────────────────────────────────────────────────────────────────
type IntradayTab = 'whales' | 'flow' | 'options';

// Options first because it is the landing view, and a default sitting third in
// its own tablist reads as a bug. The other two keep their relative order, which
// is the weight the model gives them (whales and CVD above gamma and skew) and
// the order the page read in before it had tabs.
const INTRADAY_TABS: TabDef<IntradayTab>[] = [
  { id: 'options', label: 'Options & gamma' },
  { id: 'whales', label: 'Whale flows' },
  { id: 'flow', label: 'Order flow (CVD)' },
];

const DEFAULT_TAB: IntradayTab = 'options';

/**
 * One tab's content.
 *
 * Every panel stays mounted and inactive ones are hidden, rather than rendering
 * the active tab alone. This route is server-rendered per request, so a
 * conditional render would ship a page whose HTML holds a third of what it
 * describes — and the data behind all three is already computed, so keeping
 * them mounted costs a little DOM and no work.
 */
const TabPanel = ({
  tab,
  active,
  children,
}: {
  tab: IntradayTab;
  active: IntradayTab;
  children: ReactNode;
}) => (
  <div
    id={panelId('intraday', tab)}
    role="tabpanel"
    aria-labelledby={tabId('intraday', tab)}
    hidden={tab !== active}
  >
    {children}
  </div>
);

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
  const [tab, setTab] = useState<IntradayTab>(DEFAULT_TAB);
  // When the served data was pulled, per the server. Replaces "now", which is
  // only when the page asked, not when the numbers were true.
  // Seeded from the snapshot the server embedded, so the page knows how old its
  // own data is without asking — and the auto tick can be scheduled off it
  // instead of spending a request just to learn the time.
  const [renderedAt, setRenderedAt] = useState<number | null>(
    ssrSnapshot ? Date.parse(ssrSnapshot.generatedAt) : null
  );
  // Set when a refresh could not reach the server, so the page can say the
  // figures below are the previous ones rather than silently keeping them.
  const [refreshError, setRefreshError] = useState(false);
  // Ticks so the age label ages.
  const [nowMs, setNowMs] = useState(() => Date.now());
  // The age is the one part of the timestamp that cannot be server-rendered: it
  // is computed against the clock, so the server's HTML and the first client
  // render would disagree by however long the page spent in transit.
  const [mounted, setMounted] = useState(false);
  // Guards against a slow in-flight request overwriting a newer one.
  const runIdRef = useRef(0);

  /**
   * Pull the server's snapshot.
   *
   * Every source lives on the server — three of them are unreachable from a
   * browser at all — so refreshing means asking the server what it has, not
   * re-fetching the two things a client can see. `wait` is what the manual
   * button sends: it blocks on a refresh already due rather than returning the
   * stale entry, which is the difference between a button that refreshes and
   * one that just re-reads.
   */
  const refresh = useCallback(async (wait = false) => {
    const id = ++runIdRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/intraday${wait ? '?wait=1' : ''}`, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { snapshot: IntradaySnapshot; renderedAt: number };
      if (runIdRef.current !== id) return;
      setSnap(body.snapshot);
      setRenderedAt(body.renderedAt);
      setRefreshError(false);
    } catch {
      // Keep whatever is on screen. A failed refresh should cost the reader the
      // update, not the page they were already reading.
      if (runIdRef.current === id) setRefreshError(true);
    } finally {
      // In `finally` so a throw cannot strand the button disabled on
      // "Refreshing…" with no way back short of a reload.
      if (runIdRef.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Nothing to do when the server already supplied the pull: re-fetching on
    // mount would throw away a snapshot that is at most 15 min old and undo the
    // point of rendering it server-side.
    if (ssrSnapshot) return;
    void refresh();
  }, [refresh, ssrSnapshot]);

  // Aligned to the server's clock, not to when the box was ticked. A fixed 15 min
  // interval starting at an arbitrary offset lands mid-window, reads whatever is
  // cached and then waits another full 15 — up to ~29 min of real staleness under
  // a label promising 15. Waking just after the entry is due keeps the two in step.
  useEffect(() => {
    if (!autoRefresh) return;
    let cancelled = false;
    let timer: number;
    const tick = (): void => {
      const due = renderedAt == null ? 0 : renderedAt + AUTO_REFRESH_MS - Date.now();
      timer = window.setTimeout(
        () => {
          if (cancelled) return;
          void refresh();
        },
        Math.max(1_000, due)
      );
    };
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [autoRefresh, refresh, renderedAt]);

  // Restore the stored preference, then start persisting it. The guard matters:
  // without it the write below fires on mount with the initial `false` and
  // erases the very preference the read is about to restore.
  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const autoPrefLoaded = useRef(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(AUTO_PREF_KEY) === '1') setAutoRefresh(true);
    } catch {
      // Private mode. The toggle still works, it just will not be remembered.
    }
    autoPrefLoaded.current = true;
  }, []);

  useEffect(() => {
    if (!autoPrefLoaded.current) return;
    try {
      localStorage.setItem(AUTO_PREF_KEY, autoRefresh ? '1' : '0');
    } catch {
      // Private mode or a full quota.
    }
  }, [autoRefresh]);

  // Read the tab AFTER mount rather than in the state initialiser: this route is
  // server-rendered, and seeding from the URL on the client only would make the
  // first client render disagree with the server's HTML.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (INTRADAY_TABS.some((d) => d.id === t)) setTab(t as IntradayTab);
  }, []);

  const onChangeTab = useCallback((t: IntradayTab) => {
    setTab(t);
    // Switching from the foot of a long tab would otherwise drop the reader into
    // the middle of the next one. Only pull back when the tablist has scrolled
    // off the top, so a switch made while it is visible does not jump.
    const list = document.getElementById(tabId('intraday', t))?.closest('[role=tablist]');
    if (list && list.getBoundingClientRect().top < 0) {
      list.scrollIntoView({ block: 'start' });
    }
    const params = new URLSearchParams(window.location.search);
    if (t === DEFAULT_TAB) params.delete('tab');
    else params.set('tab', t);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, []);

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

      {/* Collapsed by default: this is read once, while the data below is read
          daily. Open, it pushed the first number ~500px down on desktop and
          most of a phone screen on mobile. */}
      <details className="tc-intraday-about-wrap">
        <summary className="tc-intraday-about-summary">
          How this page works — sources, and using the report with your AI
        </summary>
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
              All three are public endpoints and need no API key. Responses are cached for 15
              minutes so refreshing does not hammer them; the pull history below is one shared
              series, the same for every visitor, not a record of your own visits.
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
                <strong>fresh chat</strong>. Send it on its own — you do not need to write a
                question around it.
              </li>
              <li>
                The text already carries the numbers, a full interpretation guide, the weighting
                rules and the required output format, so the assistant needs no other context.
              </li>
              <li>
                You get back a <strong>scenario table</strong> — bullish, bearish and sideways with
                probabilities summing to 100% — plus the drivers behind each one and LONG/SHORT
                setups derived from the gamma levels.
              </li>
            </ol>
            <p className="tc-intraday-about-note">
              The report is a snapshot of the moment you copied it. For a fresh read, hit Refresh
              and paste it again. It is automated analysis over public data, not financial advice.
            </p>
          </section>
        </div>
      </details>

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
            {/* The server's render time, not the moment the page asked. The old
                label read "cached data from 1 min ago" straight after going to
                the network, because it floored the age at one minute and called
                every pull cached. */}
            Data from{' '}
            {(renderedAt != null ? new Date(renderedAt).toISOString() : snap.generatedAt).slice(
              11,
              19
            )}{' '}
            UTC{mounted && renderedAt != null && ` · ${ageLabel(renderedAt, nowMs)}`}
            {refreshError && <span className="tc-amber"> · could not reach the server</span>}
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

          <SignalStrip
            cvd={cvd}
            flows={snap.flows}
            capitulation={snap.capitulation}
            divergent={divergent}
          />

          {/* ─── Order flow ─────────────────────────────────────────────────── */}
          {/* Whale flows lead the page: they carry the highest weight in the model
              (whales and CVD > realised/potential > gamma > skew). Server-rendered
              only — Whale Alert blocks cross-origin reads. */}
          <TabNav
            prominent
            tabs={INTRADAY_TABS}
            active={tab}
            onChange={onChangeTab}
            idPrefix="intraday"
            label="Intraday analyses"
          />

          <TabPanel tab="whales" active={tab}>
            {snap.flows ? (
              <>
                <SectionHeading>Whale flows</SectionHeading>
                <Row>
                  <Panel title="Transfers and net balance" grow={1} minWidth={320}>
                    <WhaleFlowBody flows={snap.flows} />
                  </Panel>
                </Row>
              </>
            ) : (
              <p className="tc-intraday-note">
                No whale data in this pull — Whale Alert blocks cross-origin reads, so it only
                arrives with the server-rendered page.
              </p>
            )}
          </TabPanel>

          <TabPanel tab="flow" active={tab}>
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
                  Delta in BTC inside the in-progress candle of each timeframe (Binance clock cut,
                  not a rolling window). Positive = aggressive buying. Session = accumulated since
                  00:00 UTC.
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
                {/* The one thing NOT kept mounted while its tab is hidden.
                    Recharts' ResponsiveContainer measures on mount, and a
                    display:none parent measures 0x0 — it then never redraws when
                    the tab is shown, leaving an empty container. Gating on the
                    active tab mounts it at its real size. Nothing is lost: a
                    chart is not text a crawler reads. */}
                {!cvd ? (
                  <p className="tc-intraday-note">No CVD data in this run.</p>
                ) : tab === 'flow' ? (
                  <Suspense fallback={<div className="tc-intraday-chart-fallback" />}>
                    <CvdSessionChart cvd={cvd} />
                  </Suspense>
                ) : (
                  <div className="tc-intraday-chart-fallback" />
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
              <Panel title="Daily CVD — previous complete sessions" grow={1} minWidth={280}>
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
            </Row>
          </TabPanel>

          <TabPanel tab="options" active={tab}>
            <SectionHeading>Gamma regime</SectionHeading>

            <Row>
              {/* The venue list comes from the data, not hardcoded: a pull with a venue down
                must not claim coverage it does not have. */}
              <Panel
                title={`Gamma exposure (${snap.gamma?.ok && snap.gamma.venues.length ? snap.gamma.venues.join(' + ') : 'options chain'})`}
                grow={1}
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
                  <Panel title="Gamma exposure by price level and expiry" grow={1} minWidth={320}>
                    <GammaGridTable
                      grid={snap.gamma.gammaGrid}
                      byExpiry={snap.gamma.gammaByExpiry}
                      levels={snap.gamma}
                    />
                    <p className="tc-intraday-note">
                      Signed gamma in M$ of delta per 1% move, per $
                      {snap.gamma.gammaGrid.bucket.toLocaleString('en-US')} price bucket (rows, spot
                      ±15%) and days to expiry (columns). Red = dealers short gamma there (price
                      accelerates through it), green = long (price sticks).{' '}
                      <strong>In window</strong> adds up the cells above it;{' '}
                      <strong>All strikes</strong> is that expiry&apos;s whole book, including the
                      strikes too far from spot to be shown.
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
          </TabPanel>

          {/* Outside the tabs on purpose: the capitulation check reads whales AND
              CVD AND gamma, and the pull history is one series for the whole page.
              Filing either under a single tab would hide it from the other two. */}
          <SectionHeading>Across the page</SectionHeading>

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
