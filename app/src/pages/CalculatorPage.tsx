import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  CartesianGrid,
} from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_ITER = 200_000;
const MAX_CHART_POINTS = 300;
const LS_KEY = 'tc:calc-scenarios-v1';
const MAX_SCENARIOS = 10;

// ─── Saved scenarios ──────────────────────────────────────────────────────────
interface SavedScenario {
  id: string;
  name: string;
  savedAt: number;
  winRatePct: number;
  rr: number;
  tpd: number;
  lev: number;
  slPct: number;
  capitalStr: string;
  targetStr: string;
}

const loadScenarios = (): SavedScenario[] => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistScenarios = (list: SavedScenario[]) => {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Params {
  winRate: number; // 0–1
  rr: number;
  tpd: number;
  lev: number;
  sl: number; // fraction (0–1)
}

interface ChartPoint {
  trade: number;
  capital: number;
}

interface MilestoneHit {
  target: number;
  trades: number | null;
}

interface ComputeResult {
  riesgoReal: number;
  liqPct: number;
  expectancy: number;
  isLiquidated: boolean;
  isRentable: boolean;
  trajectory: ChartPoint[];
  milestoneHits: MilestoneHit[];
  totalTrades: number | null;
}

// ─── Math core ────────────────────────────────────────────────────────────────
const compute = (p: Params, initialCapital: number, target: number | null): ComputeResult => {
  const riesgoReal = p.sl * p.lev;
  const liqPct = (1 / p.lev) * 100;
  const expectancy = p.winRate * p.rr - (1 - p.winRate);
  const isLiquidated = riesgoReal >= 1;
  const isRentable = expectancy > 0 && !isLiquidated;

  // Milestones: derive sensible ones from initialCapital and target
  const milestones = deriveMilestones(initialCapital, target);
  const milestoneHits: MilestoneHit[] = milestones.map((m) => ({ target: m, trades: null }));
  let totalTrades: number | null = null;
  let trajectory: ChartPoint[] = [{ trade: 0, capital: initialCapital }];

  if (isRentable) {
    const growth = 1 + expectancy * riesgoReal;
    let capital = initialCapital;
    let trade = 0;

    const stopAt = target ?? Infinity;
    while (capital < stopAt && trade < MAX_ITER) {
      capital *= growth;
      trade++;
      milestoneHits.forEach((mh) => {
        if (mh.trades === null && capital >= mh.target) mh.trades = trade;
      });
    }
    if (target !== null && capital >= target) totalTrades = trade;

    // Sparse trajectory for chart (stop at target if set, else MAX_ITER trades shown)
    const totalSteps = totalTrades ?? Math.min(trade, MAX_ITER);
    const step = Math.max(1, Math.floor(totalSteps / MAX_CHART_POINTS));
    capital = initialCapital;
    const sparse: ChartPoint[] = [{ trade: 0, capital }];
    for (let t = 1; t <= totalSteps; t++) {
      capital *= growth;
      if (t % step === 0 || t === totalSteps) sparse.push({ trade: t, capital });
    }
    trajectory = sparse;
  }

  return {
    riesgoReal,
    liqPct,
    expectancy,
    isLiquidated,
    isRentable,
    trajectory,
    milestoneHits,
    totalTrades,
  };
};

const deriveMilestones = (initial: number, target: number | null): number[] => {
  if (target === null) {
    // No target: show 5 round multiples of the initial capital
    const steps = [2, 5, 10, 20, 50].map((x) => parseFloat((initial * x).toPrecision(2)));
    return steps;
  }
  // Split target into 5 evenly spaced checkpoints
  const ratio = target / initial;
  if (ratio <= 1) return [target];
  const checkpoints = [0.2, 0.4, 0.6, 0.8, 1.0].map((f) => {
    const v = initial * Math.pow(ratio, f);
    return parseFloat(v.toPrecision(3));
  });
  return checkpoints;
};

// ─── Sub-components ───────────────────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  id: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (v: number) => void;
}

const SliderRow = ({ label, min, max, step, value, display, onChange }: SliderRowProps) => {
  return (
    <div className="calc-slider-row">
      <div className="calc-slider-header">
        <span className="calc-slider-label">{label}</span>
        <span className="calc-slider-value">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="calc-range"
      />
    </div>
  );
};

interface MetricBoxProps {
  label: string;
  value: string;
  sub?: string;
  color?: 'green' | 'red' | 'amber' | 'muted';
}

const MetricBox = ({ label, value, sub, color }: MetricBoxProps) => {
  const colorClass = color ? `calc-metric-value--${color}` : '';
  return (
    <div className="calc-metric-box">
      <div className="calc-metric-label">{label}</div>
      <div className={`calc-metric-value ${colorClass}`}>{value}</div>
      {sub && <div className="calc-metric-sub">{sub}</div>}
    </div>
  );
};

// ─── Tooltip customizado ──────────────────────────────────────────────────────
const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: number;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="calc-tooltip">
      <div className="calc-tooltip-title">Trade #{label}</div>
      <div className="calc-tooltip-value">${payload[0].value.toFixed(2)}</div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CalculatorPage() {
  const [winRatePct, setWinRatePct] = useState(38);
  const [rr, setRr] = useState(1.18);
  const [tpd, setTpd] = useState(2);
  const [lev, setLev] = useState(1);
  const [slPct, setSlPct] = useState(0.5);
  const [capitalStr, setCapitalStr] = useState('100');
  const [targetStr, setTargetStr] = useState('10000');
  const [scenarios, setScenarios] = useState<SavedScenario[]>(loadScenarios);
  const [saveMode, setSaveMode] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  const initialCapital = Math.max(0.01, parseFloat(capitalStr) || 0.01);
  const target =
    targetStr.trim() === ''
      ? null
      : Math.max(initialCapital + 0.01, parseFloat(targetStr) || initialCapital + 1);

  const params: Params = {
    winRate: winRatePct / 100,
    rr,
    tpd,
    lev,
    sl: slPct / 100,
  };

  const r = useMemo(
    () => compute(params, initialCapital, target),
    [winRatePct, rr, lev, slPct, initialCapital, target]
  );

  useEffect(() => {
    const prev = document.title;
    document.title = 'Account Growth Calculator — PerpsAnalytics';
    return () => {
      document.title = prev;
    };
  }, []);

  const handleOpenSave = useCallback(() => {
    setSaveName(`Scenario ${scenarios.length + 1}`);
    setSaveMode(true);
  }, [scenarios.length]);

  const handleConfirmSave = useCallback(() => {
    const name = saveName.trim() || `Scenario ${scenarios.length + 1}`;
    const next: SavedScenario = {
      id: `${Date.now()}`,
      name,
      savedAt: Date.now(),
      winRatePct,
      rr,
      tpd,
      lev,
      slPct,
      capitalStr,
      targetStr,
    };
    const updated = [next, ...scenarios].slice(0, MAX_SCENARIOS);
    setScenarios(updated);
    persistScenarios(updated);
    setSaveMode(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }, [saveName, scenarios, winRatePct, rr, tpd, lev, slPct, capitalStr, targetStr]);

  const handleLoad = useCallback((s: SavedScenario) => {
    setWinRatePct(s.winRatePct);
    setRr(s.rr);
    setTpd(s.tpd);
    setLev(s.lev);
    setSlPct(s.slPct);
    setCapitalStr(s.capitalStr);
    setTargetStr(s.targetStr);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      const updated = scenarios.filter((s) => s.id !== id);
      setScenarios(updated);
      persistScenarios(updated);
    },
    [scenarios]
  );

  const riesgoRealPct = r.riesgoReal * 100;
  const expPct = r.expectancy * 100;

  const statusLabel = r.isLiquidated
    ? 'Liquidación antes del SL'
    : r.expectancy <= 0
      ? 'No rentable'
      : expPct < 5
        ? 'Marginal'
        : 'Rentable';

  const statusClass =
    r.isLiquidated || r.expectancy <= 0
      ? 'calc-status--red'
      : expPct < 5
        ? 'calc-status--amber'
        : 'calc-status--green';

  const riesgoColor: MetricBoxProps['color'] =
    riesgoRealPct > 2 ? 'red' : riesgoRealPct > 1 ? 'amber' : 'green';
  const expColor: MetricBoxProps['color'] = expPct > 5 ? 'green' : expPct > 0 ? 'amber' : 'red';

  const streakLoss = (1 - Math.pow(1 - r.riesgoReal, 3)) * 100;

  return (
    <>
      <style>{STYLES}</style>
      <div className="calc-page">
        <div className="calc-page-intro">
          <h1 className="calc-page-title">Projection Calculator</h1>
          <p className="calc-page-subtitle">
            BTC futures account growth model · Compound trade-by-trade · Heatmap / Orderflow /
            Volume Profile
          </p>
        </div>

        <div className="calc-fixed-row">
          <label className="calc-input-group">
            <span className="calc-input-label">Initial capital ($)</span>
            <input
              type="number"
              className="calc-number-input"
              min="0.01"
              step="0.01"
              value={capitalStr}
              onChange={(e) => setCapitalStr(e.target.value)}
              placeholder="3.44"
            />
          </label>
          <label className="calc-input-group">
            <span className="calc-input-label">
              Target ($) <span className="calc-input-optional">optional</span>
            </span>
            <input
              type="number"
              className="calc-number-input"
              min="0"
              step="1"
              value={targetStr}
              onChange={(e) => setTargetStr(e.target.value)}
              placeholder="leave blank for open-ended"
            />
          </label>
          <span className="calc-fixed-pill">
            Max recommended risk: <strong>2% / trade</strong>
          </span>
        </div>

        <div className="calc-layout">
          {/* LEFT — sliders + saved scenarios */}
          <div className="calc-left">
            <div className="tc-card calc-controls">
              <div className="calc-section-label">Parameters</div>
              <div className="calc-sliders">
                <SliderRow
                  label="Win Rate"
                  id="winrate"
                  min={30}
                  max={65}
                  step={1}
                  value={winRatePct}
                  display={`${winRatePct}%`}
                  onChange={setWinRatePct}
                />
                <SliderRow
                  label="Risk / Reward"
                  id="rr"
                  min={0.8}
                  max={4.0}
                  step={0.01}
                  value={rr}
                  display={rr.toFixed(2)}
                  onChange={setRr}
                />
                <SliderRow
                  label="Trades per day"
                  id="tpd"
                  min={1}
                  max={5}
                  step={1}
                  value={tpd}
                  display={String(tpd)}
                  onChange={setTpd}
                />
                <SliderRow
                  label="Leverage"
                  id="lev"
                  min={1}
                  max={50}
                  step={1}
                  value={lev}
                  display={`${lev}×`}
                  onChange={setLev}
                />
                <SliderRow
                  label="Stop Loss (% of price)"
                  id="sl"
                  min={0.1}
                  max={5.0}
                  step={0.1}
                  value={slPct}
                  display={`${slPct.toFixed(1)}%`}
                  onChange={setSlPct}
                />
                {/* Save section */}
                <div className="calc-save-divider" />
                {!saveMode ? (
                  <button
                    type="button"
                    className={`calc-save-btn${savedFlash ? ' calc-save-btn--flash' : ''}`}
                    onClick={handleOpenSave}
                    disabled={scenarios.length >= MAX_SCENARIOS}
                    title={
                      scenarios.length >= MAX_SCENARIOS
                        ? `Max ${MAX_SCENARIOS} scenarios`
                        : undefined
                    }
                  >
                    {savedFlash ? '✓ Saved' : '+ Save scenario'}
                  </button>
                ) : (
                  <div className="calc-save-form">
                    <input
                      autoFocus
                      type="text"
                      className="calc-save-input"
                      value={saveName}
                      maxLength={40}
                      onChange={(e) => setSaveName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmSave();
                        if (e.key === 'Escape') setSaveMode(false);
                      }}
                      placeholder="Scenario name"
                    />
                    <button type="button" className="calc-save-confirm" onClick={handleConfirmSave}>
                      ✓
                    </button>
                    <button
                      type="button"
                      className="calc-save-cancel"
                      onClick={() => setSaveMode(false)}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
            {/* /tc-card calc-controls */}

            {/* Saved scenarios list */}
            {scenarios.length > 0 && (
              <div className="tc-card calc-scenarios-card">
                <div className="calc-section-label" style={{ marginBottom: 12 }}>
                  Saved scenarios
                </div>
                <div className="calc-scenarios-list">
                  {scenarios.map((s) => (
                    <div key={s.id} className="calc-scenario-row">
                      <div className="calc-scenario-info">
                        <span className="calc-scenario-name">{s.name}</span>
                        <span className="calc-scenario-meta">
                          WR {s.winRatePct}% · RR {s.rr.toFixed(2)} · {s.lev}× · SL{' '}
                          {s.slPct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="calc-scenario-actions">
                        <button
                          type="button"
                          className="calc-scenario-load"
                          onClick={() => handleLoad(s)}
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          className="calc-scenario-delete"
                          onClick={() => handleDelete(s.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* /calc-left */}

          {/* RIGHT — results */}
          <div className="calc-right">
            {/* Alerts */}
            {r.isLiquidated && (
              <div className="calc-alert calc-alert--error">
                <strong>⚠ Liquidated before stop</strong>
                <br />
                With {lev}× leverage and a {slPct.toFixed(1)}% SL, the price liquidates you{' '}
                <strong>before the stop is hit</strong>. Only a {r.liqPct.toFixed(2)}% adverse move
                is needed.
              </div>
            )}

            {!r.isLiquidated && r.expectancy <= 0 && (
              <div className="calc-alert calc-alert--error">
                <strong>✗ System not profitable</strong>
                <br />
                With this win rate and RR, expectancy is negative ({expPct.toFixed(2)}%). The system
                loses money long-term.
              </div>
            )}

            {lev > 10 && !r.isLiquidated && r.expectancy > 0 && (
              <div className="calc-alert calc-alert--warning">
                <strong>⚠ High leverage</strong>
                <br />
                You're risking {riesgoRealPct.toFixed(2)}% of your account per trade. A 3-loss
                streak = {streakLoss.toFixed(1)}% drawdown. Proceed carefully.
              </div>
            )}

            {/* Metrics card */}
            <div className="tc-card">
              <div className={`calc-status ${statusClass}`}>
                <span className="calc-status-dot" />
                {statusLabel}
              </div>

              <div className="calc-metrics-grid">
                <MetricBox
                  label="Real risk / trade"
                  value={`${riesgoRealPct.toFixed(2)}%`}
                  sub={`$${(initialCapital * r.riesgoReal).toFixed(2)} per trade`}
                  color={riesgoColor}
                />
                <MetricBox
                  label="Expectancy / trade"
                  value={`${expPct >= 0 ? '+' : ''}${expPct.toFixed(2)}%`}
                  sub="of risked amount"
                  color={expColor}
                />
                <MetricBox
                  label="Trades needed"
                  value={
                    r.totalTrades !== null
                      ? r.totalTrades.toLocaleString()
                      : target === null
                        ? '—'
                        : '∞'
                  }
                  sub={target !== null ? `to reach $${target.toFixed(2)}` : 'no target set'}
                />
                <MetricBox
                  label="Estimated days"
                  value={
                    r.totalTrades !== null
                      ? Math.ceil(r.totalTrades / tpd).toLocaleString()
                      : target === null
                        ? '—'
                        : '∞'
                  }
                  sub={`at ${tpd} trade${tpd > 1 ? 's' : ''}/day`}
                />
                <MetricBox
                  label="Price drop to liq."
                  value={`${r.liqPct.toFixed(2)}%`}
                  color="amber"
                />
                <MetricBox
                  label="$ loss if SL hit"
                  value={`$${(initialCapital * r.riesgoReal).toFixed(2)}`}
                  color="red"
                />
              </div>

              {/* Chart */}
              <div className="calc-section-label" style={{ marginBottom: 12 }}>
                Growth curve
              </div>
              <div className="calc-chart-wrap">
                {r.isRentable && r.trajectory.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={r.trajectory}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="calcGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--tc-green)" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="var(--tc-green)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--tc-border)" />
                      <XAxis
                        dataKey="trade"
                        tick={{ fill: 'var(--tc-muted)', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v.toLocaleString()}
                      />
                      <YAxis
                        tick={{ fill: 'var(--tc-muted)', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `$${v.toFixed(0)}`}
                        width={52}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="capital"
                        stroke="var(--tc-green)"
                        strokeWidth={2}
                        fill="url(#calcGrad)"
                        dot={false}
                        activeDot={{ r: 4, fill: 'var(--tc-green)' }}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="calc-chart-empty">
                    {r.isLiquidated
                      ? 'Liquidated before SL — no growth curve'
                      : 'System not profitable — no growth curve'}
                  </div>
                )}
              </div>

              {/* Milestones */}
              <div className="calc-section-label" style={{ marginBottom: 10 }}>
                Milestones
              </div>
              <div className="calc-milestones">
                {r.milestoneHits.map((mh) => {
                  if (mh.trades === null) {
                    return (
                      <div key={mh.target} className="calc-milestone calc-milestone--unreachable">
                        <span className="calc-milestone-target">${mh.target}</span>
                        <span className="calc-milestone-sub">unreachable</span>
                      </div>
                    );
                  }
                  const days = Math.ceil(mh.trades / tpd);
                  return (
                    <div key={mh.target} className="calc-milestone">
                      <span className="calc-milestone-target">${mh.target}</span>
                      <span className="calc-milestone-sub">
                        {mh.trades.toLocaleString()} trades
                      </span>
                      <span className="calc-milestone-days">
                        ~{days} day{days !== 1 ? 's' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Scoped styles ────────────────────────────────────────────────────────────
const STYLES = `
.calc-page {
  padding: 32px 24px 64px;
  max-width: 960px;
  margin: 0 auto;
}

.calc-page-intro {
  margin-bottom: 20px;
}

.calc-page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--tc-text);
  letter-spacing: -0.3px;
}

.calc-page-subtitle {
  color: var(--tc-muted);
  font-size: 13px;
  margin-top: 4px;
}

.calc-fixed-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 24px;
  align-items: flex-end;
}

.calc-fixed-pill {
  background: var(--tc-surface-2);
  border: 1px solid var(--tc-border);
  border-radius: 20px;
  padding: 5px 14px;
  font-size: 12px;
  color: var(--tc-muted);
  align-self: flex-end;
  margin-bottom: 2px;
}

.calc-fixed-pill strong {
  color: var(--tc-text);
  font-weight: 600;
}

.calc-input-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.calc-input-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--tc-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.calc-input-optional {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: 10px;
  color: var(--tc-muted);
  opacity: 0.7;
}

.calc-number-input {
  background: var(--tc-surface-2);
  border: 1px solid var(--tc-border);
  border-radius: var(--tc-radius);
  color: var(--tc-text);
  font-size: 14px;
  font-weight: 600;
  padding: 6px 10px;
  width: 160px;
  outline: none;
  transition: border-color 0.15s;
  -moz-appearance: textfield;
}

.calc-number-input::-webkit-outer-spin-button,
.calc-number-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}

.calc-number-input::placeholder {
  font-weight: 400;
  color: var(--tc-muted);
  font-size: 12px;
}

.calc-number-input:focus {
  border-color: var(--tc-accent);
}

.calc-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 720px) {
  .calc-layout { grid-template-columns: 1fr; }
}

.calc-controls {
  padding: 20px;
}

.calc-section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  color: var(--tc-muted);
  margin-bottom: 16px;
}

.calc-sliders {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.calc-slider-row {}

.calc-slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 7px;
}

.calc-slider-label {
  font-size: 13px;
  color: var(--tc-text);
}

.calc-slider-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--tc-accent);
  min-width: 52px;
  text-align: right;
}

.calc-range {
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  background: var(--tc-border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.calc-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--tc-accent);
  cursor: pointer;
  border: 2px solid var(--tc-bg);
  box-shadow: 0 0 0 1px var(--tc-accent);
}

.calc-range::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--tc-accent);
  cursor: pointer;
  border: 2px solid var(--tc-bg);
}

.calc-right {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.calc-alert {
  border-radius: var(--tc-radius);
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.5;
}

.calc-alert--error {
  background: color-mix(in srgb, var(--tc-red) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--tc-red) 35%, transparent);
  color: color-mix(in srgb, var(--tc-red) 80%, var(--tc-text));
}

.calc-alert--warning {
  background: color-mix(in srgb, var(--tc-amber) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--tc-amber) 35%, transparent);
  color: color-mix(in srgb, var(--tc-amber) 80%, var(--tc-text));
}

.calc-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 16px;
}

.calc-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.calc-status--green {
  background: color-mix(in srgb, var(--tc-green) 12%, transparent);
  color: var(--tc-green);
  border: 1px solid color-mix(in srgb, var(--tc-green) 30%, transparent);
}

.calc-status--amber {
  background: color-mix(in srgb, var(--tc-amber) 12%, transparent);
  color: var(--tc-amber);
  border: 1px solid color-mix(in srgb, var(--tc-amber) 30%, transparent);
}

.calc-status--red {
  background: color-mix(in srgb, var(--tc-red) 12%, transparent);
  color: var(--tc-red);
  border: 1px solid color-mix(in srgb, var(--tc-red) 30%, transparent);
}

.calc-metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 24px;
}

.calc-metric-box {
  background: var(--tc-surface-2);
  border: 1px solid var(--tc-border);
  border-radius: var(--tc-radius);
  padding: 12px 14px;
}

.calc-metric-label {
  font-size: 11px;
  color: var(--tc-muted);
  margin-bottom: 4px;
}

.calc-metric-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--tc-text);
  line-height: 1.2;
}

.calc-metric-value--green { color: var(--tc-green); }
.calc-metric-value--red   { color: var(--tc-red); }
.calc-metric-value--amber { color: var(--tc-amber); }
.calc-metric-value--muted { color: var(--tc-muted); }

.calc-metric-sub {
  font-size: 11px;
  color: var(--tc-muted);
  margin-top: 2px;
}

.calc-chart-wrap {
  height: 210px;
  margin-bottom: 24px;
}

.calc-chart-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tc-muted);
  font-size: 13px;
  background: var(--tc-surface-2);
  border-radius: var(--tc-radius);
  border: 1px solid var(--tc-border);
}

.calc-tooltip {
  background: var(--tc-surface);
  border: 1px solid var(--tc-border);
  border-radius: var(--tc-radius);
  padding: 8px 12px;
  font-size: 12px;
}

.calc-tooltip-title {
  color: var(--tc-muted);
  margin-bottom: 2px;
}

.calc-tooltip-value {
  font-weight: 700;
  color: var(--tc-green);
}

.calc-milestones {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.calc-milestone {
  background: var(--tc-surface-2);
  border: 1px solid var(--tc-border);
  border-radius: 20px;
  padding: 6px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.calc-milestone--unreachable {
  opacity: 0.4;
}

.calc-milestone-target {
  font-weight: 700;
  color: var(--tc-accent);
  font-size: 13px;
}

.calc-milestone-sub {
  color: var(--tc-muted);
  font-size: 11px;
}

.calc-milestone-days {
  color: var(--tc-muted);
  font-size: 10px;
}

.calc-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-self: start;
}

.calc-save-divider {
  height: 1px;
  background: var(--tc-border);
  margin: 4px 0 2px;
}

.calc-save-btn {
  width: 100%;
  padding: 8px;
  border-radius: var(--tc-radius);
  border: 1px dashed var(--tc-accent);
  background: transparent;
  color: var(--tc-accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.calc-save-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tc-accent) 10%, transparent);
}

.calc-save-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.calc-save-btn--flash {
  border-style: solid;
  color: var(--tc-green);
  border-color: var(--tc-green);
  background: color-mix(in srgb, var(--tc-green) 8%, transparent);
}

.calc-save-form {
  display: flex;
  gap: 6px;
  align-items: center;
}

.calc-save-input {
  flex: 1;
  background: var(--tc-surface-2);
  border: 1px solid var(--tc-accent);
  border-radius: var(--tc-radius);
  color: var(--tc-text);
  font-size: 13px;
  padding: 6px 9px;
  outline: none;
  min-width: 0;
}

.calc-save-confirm,
.calc-save-cancel {
  background: transparent;
  border: 1px solid var(--tc-border);
  border-radius: var(--tc-radius);
  color: var(--tc-muted);
  font-size: 13px;
  width: 30px;
  height: 30px;
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.15s, border-color 0.15s;
}

.calc-save-confirm:hover { color: var(--tc-green); border-color: var(--tc-green); }
.calc-save-cancel:hover  { color: var(--tc-red);   border-color: var(--tc-red); }

.calc-scenarios-card {
  padding: 16px 20px;
}

.calc-scenarios-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.calc-scenario-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: var(--tc-surface-2);
  border: 1px solid var(--tc-border);
  border-radius: var(--tc-radius);
}

.calc-scenario-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.calc-scenario-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--tc-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.calc-scenario-meta {
  font-size: 11px;
  color: var(--tc-muted);
}

.calc-scenario-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.calc-scenario-load {
  background: transparent;
  border: 1px solid var(--tc-border);
  border-radius: var(--tc-radius);
  color: var(--tc-text);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.calc-scenario-load:hover {
  border-color: var(--tc-accent);
  color: var(--tc-accent);
}

.calc-scenario-delete {
  background: transparent;
  border: 1px solid var(--tc-border);
  border-radius: var(--tc-radius);
  color: var(--tc-muted);
  font-size: 12px;
  width: 26px;
  height: 26px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.calc-scenario-delete:hover {
  border-color: var(--tc-red);
  color: var(--tc-red);
}
`;
