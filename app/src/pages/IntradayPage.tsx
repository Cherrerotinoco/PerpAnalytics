import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import Panel, { Row, SectionHeading } from '../dashboard/Panel';
import { CACHE_TTL_MS, buildIntradayReport, clearHistory, runIntraday } from '../utils/intraday';
import type {
  CvdAnalysis,
  GammaResult,
  IntradaySnapshot,
  TimeframeKey,
  TimeframeWindow,
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
        {gamma?.degraded ? ' (the API returned zeroed metrics).' : '.'}
      </p>
    );
  }
  return (
    <>
      <div
        className={`tc-intraday-regime ${gamma.netGamma != null && gamma.netGamma < 0 ? 'tc-red' : 'tc-green'}`}
      >
        {regime?.regimeLabel}
      </div>
      <div className="tc-intraday-kv-grid">
        <KeyValue k="Net gamma" v={gamma.netGamma?.toLocaleString('en-US') ?? '—'} />
        <KeyValue
          k="Call / Put gamma"
          v={`${gamma.callGamma?.toLocaleString('en-US') ?? '—'} / ${gamma.putGamma?.toLocaleString('en-US') ?? '—'}`}
        />
        <KeyValue
          k="Put/Call ratio"
          v={`${gamma.putCallRatio ?? '—'} (${regime?.defensive ? 'defensive' : 'offensive'})`}
        />
        <KeyValue k="Bias" v={gamma.bias ?? '—'} />
        <KeyValue
          k={regime?.isPin ? 'Pin' : 'Support / resistance'}
          v={
            regime?.isPin
              ? usd(regime.pinLevel)
              : `${usd(gamma.support)} / ${usd(gamma.resistance)}`
          }
        />
        <KeyValue k="Breakout" v={usd(gamma.breakout)} />
        <KeyValue
          k="Vol realized vs implied"
          v={`${gamma.realizedVol ?? '—'}% vs ${gamma.impliedVol ?? '—'}%`}
          tone={regime?.realizedGtImplied ? 'tc-amber' : ''}
        />
        <KeyValue k="Squeeze risk" v={gamma.squeezeRisk ?? '—'} />
        <KeyValue k="Delta hedging" v={gamma.deltaHedging ?? '—'} />
        <KeyValue k="Pin risk" v={gamma.pinRisk ?? '—'} />
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
  const [snap, setSnap] = useState<IntradaySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
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
    setSnap(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
          Multi-timeframe aggressor delta from Binance (spot and perpetual) plus Deribit gamma
          exposure, computed in your browser.{' '}
          <span className="tc-page-highlight">No whale flow</span>: Whale Alert blocks CORS, so that
          part only exists in the desktop crawler.
        </p>
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
                    ? `net ${snap.gamma.netGamma?.toLocaleString('en-US')}`
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

            <Panel title="Gamma exposure (Deribit)" grow={5} minWidth={300}>
              <GammaBody gamma={snap.gamma} regime={snap.gammaRegime} />
            </Panel>
          </Row>

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
                hindsight. The two whale-based rules (realized profit and net flow) are not
                available in the browser.
              </p>
            </Panel>

            <Panel title="Reading history (this browser)" grow={4} minWidth={280}>
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
                <p className="tc-intraday-note">First reading stored.</p>
              )}
              <div className="tc-intraday-history-foot">
                <p className="tc-intraday-note">
                  The sequence is stored only in this browser and builds up as you refresh.
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
