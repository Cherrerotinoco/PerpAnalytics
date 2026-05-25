import { useMemo } from 'react';
import { Trade } from '../types/tradeTypes';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TradeStats {
  totalPnl: number;
  equityCurve: number[];
  equityCurveLabels: string[];
  maxLoss: number;
  maxWin: number;
  profitFactor: number;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  lossRate: number;
  riskReward: number;
  expectancy: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortino: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  calmarRatio: number;
  recoveryFactor: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function stdDev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function downsideStdDev(values: number[]): number {
  const negatives = values.filter((v) => v < 0);
  if (negatives.length < 2) {
    return 0;
  }
  return stdDev(negatives);
}

// ─── Stats computation ────────────────────────────────────────────────────────
export function computeTradeStats(trades: Trade[]): TradeStats {
  // Ordenar por fecha de cierre ascendente (timestamp de la API) para curva cronológica
  const sortedTrades = [...trades].sort((a, b) => {
    const tA = a.closed?.getTime() ?? a.opened?.getTime() ?? 0;
    const tB = b.closed?.getTime() ?? b.opened?.getTime() ?? 0;
    return tA - tB;
  });

  let totalPnl = 0;
  const equityCurve: number[] = [];
  const equityCurveLabels: string[] = [];
  let maxLoss = 0;
  let maxWin = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winTrades = 0;
  let lossTrades = 0;
  let sumWin = 0;
  let sumLoss = 0;
  const pnlList: number[] = [];

  let peak = 0;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let consecWins = 0;
  let consecLosses = 0;
  let maxConsecWins = 0;
  let maxConsecLosses = 0;

  sortedTrades.forEach((t) => {
    totalPnl += t.pnl;
    equityCurve.push(Number(totalPnl.toFixed(2)));
    pnlList.push(t.pnl);

    // Label: timestamp en ms para eje X continuo. Solo fechas válidas (> 0)
    const dateRef = t.closed ?? t.opened;
    const ts = dateRef instanceof Date && !isNaN(dateRef.getTime()) ? dateRef.getTime() : null;
    equityCurveLabels.push(ts !== null ? String(ts) : '');

    if (totalPnl > peak) {
      peak = totalPnl;
    }
    const dd = peak - totalPnl;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPct = peak > 0 ? (dd / peak) * 100 : 0;
    }

    if (t.pnl > 0) {
      grossProfit += t.pnl;
      sumWin += t.pnl;
      winTrades++;
      if (t.pnl > maxWin) {
        maxWin = t.pnl;
      }
      consecWins++;
      consecLosses = 0;
      if (consecWins > maxConsecWins) {
        maxConsecWins = consecWins;
      }
    } else if (t.pnl < 0) {
      grossLoss += Math.abs(t.pnl);
      sumLoss += Math.abs(t.pnl);
      lossTrades++;
      if (Math.abs(t.pnl) > maxLoss) {
        maxLoss = Math.abs(t.pnl);
      }
      consecLosses++;
      consecWins = 0;
      if (consecLosses > maxConsecLosses) {
        maxConsecLosses = consecLosses;
      }
    } else {
      consecWins = 0;
      consecLosses = 0;
    }
  });

  const totalTrades = trades.length;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const lossRate = totalTrades > 0 ? (lossTrades / totalTrades) * 100 : 0;
  const avgWin = winTrades > 0 ? sumWin / winTrades : 0;
  const avgLoss = lossTrades > 0 ? sumLoss / lossTrades : 0;
  const riskReward = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
  const expectancy = totalTrades > 0 ? totalPnl / totalTrades : 0;
  const meanPnl = totalTrades > 0 ? totalPnl / totalTrades : 0;
  const std = stdDev(pnlList);
  const sharpeRatio = std > 0 ? meanPnl / std : 0;
  const dStd = downsideStdDev(pnlList);
  const sortino = dStd > 0 ? meanPnl / dStd : meanPnl > 0 ? Infinity : 0;
  const calmarRatio = maxDrawdown > 0 ? totalPnl / maxDrawdown : totalPnl > 0 ? Infinity : 0;
  const recoveryFactor = maxDrawdown > 0 ? totalPnl / maxDrawdown : totalPnl > 0 ? Infinity : 0;

  return {
    totalPnl,
    equityCurve,
    equityCurveLabels,
    maxLoss,
    maxWin,
    profitFactor,
    totalTrades,
    winTrades,
    lossTrades,
    winRate,
    lossRate,
    riskReward,
    expectancy,
    maxDrawdown,
    maxDrawdownPct,
    sharpeRatio,
    sortino,
    maxConsecWins,
    maxConsecLosses,
    calmarRatio,
    recoveryFactor,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtNum(n: number, decimals = 2): string {
  if (!isFinite(n)) {
    return '∞';
  }
  return n.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
function fmtPct(n: number): string {
  return `${n.toFixed(0)}%`;
}
function sign(n: number): string {
  return n >= 0 ? '+' : '';
}
function sharpeLabel(v: number): string {
  if (v >= 2) {
    return 'Excellent';
  }
  if (v >= 1) {
    return 'Good';
  }
  if (v >= 0) {
    return 'Acceptable';
  }
  return 'Negative';
}

// ─── Metric color helpers → Bootstrap text classes ───────────────────────────
function posNegClass(v: number): string {
  return v >= 0 ? 'text-success' : 'text-danger';
}
function ratioClass(v: number): string {
  if (v >= 1) {
    return 'text-success';
  }
  if (v >= 0) {
    return 'text-warning';
  }
  return 'text-danger';
}

// ─── Metric card sub-component ────────────────────────────────────────────────
function Metric({
  label,
  value,
  sub,
  colorClass,
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
}) {
  return (
    <div className="card h-100 border-0 bg-light">
      <div className="card-body p-3">
        <p
          className="text-uppercase text-secondary fw-semibold mb-1"
          style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}
        >
          {label}
        </p>
        <p className={`fs-5 fw-bold mb-0 ${colorClass ?? ''}`}>{value}</p>
        {sub && (
          <p className="text-secondary mb-0" style={{ fontSize: '0.7rem' }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function TradeStatsTable({ trades }: { trades: Trade[] }) {
  const st = useMemo(() => computeTradeStats(trades), [trades]);
  const breakeven = st.totalTrades - st.winTrades - st.lossTrades;

  return (
    <div className="p-4">
      {/* ── Performance ── */}
      <p
        className="text-uppercase text-secondary fw-semibold mb-2"
        style={{ fontSize: '0.7rem', letterSpacing: '0.08em' }}
      >
        Performance
      </p>
      <div className="row row-cols-2 row-cols-sm-3 row-cols-md-3 g-2 mb-3">
        <div className="col">
          <Metric
            label="Total PnL"
            value={`${sign(st.totalPnl)}${fmtNum(st.totalPnl)} $`}
            colorClass={posNegClass(st.totalPnl)}
          />
        </div>
        <div className="col">
          <Metric label="Max Profit" value={`+${fmtNum(st.maxWin)} $`} colorClass="text-success" />
        </div>
        <div className="col">
          <Metric label="Max Loss" value={`-${fmtNum(st.maxLoss)} $`} colorClass="text-danger" />
        </div>
        <div className="col">
          <Metric
            label="Profit Factor"
            value={isFinite(st.profitFactor) ? fmtNum(st.profitFactor) : '∞'}
            sub={st.profitFactor >= 1 ? 'Profitable' : 'Unprofitable'}
            colorClass={st.profitFactor >= 1 ? 'text-success' : 'text-danger'}
          />
        </div>
        <div className="col">
          <Metric
            label="Expectancy"
            value={`${sign(st.expectancy)}${fmtNum(st.expectancy)} $`}
            sub="per trade"
            colorClass={posNegClass(st.expectancy)}
          />
        </div>
        <div className="col">
          <Metric
            label="Risk / Reward"
            value={isFinite(st.riskReward) ? fmtNum(st.riskReward) : '∞'}
            sub="avg win / avg loss"
            colorClass={st.riskReward >= 1 ? 'text-success' : ''}
          />
        </div>
      </div>

      <hr className="text-secondary opacity-25" />

      {/* ── Risk & Drawdown ── */}
      <p
        className="text-uppercase text-secondary fw-semibold mb-2"
        style={{ fontSize: '0.7rem', letterSpacing: '0.08em' }}
      >
        Risk & Drawdown
      </p>
      <div className="row row-cols-2 row-cols-sm-3 row-cols-md-5 g-2 mb-3">
        <div className="col">
          <Metric
            label="Max Drawdown"
            value={`-${fmtNum(st.maxDrawdown)} $`}
            sub={`${fmtNum(st.maxDrawdownPct, 1)}% from peak`}
            colorClass="text-danger"
          />
        </div>
        <div className="col">
          <Metric
            label="Calmar Ratio"
            value={isFinite(st.calmarRatio) ? fmtNum(st.calmarRatio) : '∞'}
            sub="PnL / max drawdown"
            colorClass={ratioClass(st.calmarRatio)}
          />
        </div>
        <div className="col">
          <Metric
            label="Recovery Factor"
            value={isFinite(st.recoveryFactor) ? fmtNum(st.recoveryFactor) : '∞'}
            sub="profit vs risk"
            colorClass={st.recoveryFactor >= 1 ? 'text-success' : 'text-danger'}
          />
        </div>
        <div className="col">
          <Metric
            label="Sharpe Ratio"
            value={fmtNum(st.sharpeRatio)}
            sub={sharpeLabel(st.sharpeRatio)}
            colorClass={ratioClass(st.sharpeRatio)}
          />
        </div>
        <div className="col">
          <Metric
            label="Sortino Ratio"
            value={isFinite(st.sortino) ? fmtNum(st.sortino) : '∞'}
            sub="downside vol. only"
            colorClass={ratioClass(st.sortino)}
          />
        </div>
      </div>

      <hr className="text-secondary opacity-25" />

      {/* ── Trades ── */}
      <p
        className="text-uppercase text-secondary fw-semibold mb-2"
        style={{ fontSize: '0.7rem', letterSpacing: '0.08em' }}
      >
        Trades
      </p>
      <div className="row row-cols-2 row-cols-sm-4 g-2 mb-3">
        <div className="col">
          <Metric
            label="Total"
            value={String(st.totalTrades)}
            sub={breakeven > 0 ? `${breakeven} breakeven` : undefined}
          />
        </div>
        <div className="col">
          <Metric
            label="Win Rate"
            value={fmtPct(st.winRate)}
            sub={`${st.winTrades} wins`}
            colorClass={st.winRate >= 50 ? 'text-success' : 'text-danger'}
          />
        </div>
        <div className="col">
          <Metric
            label="Loss Rate"
            value={fmtPct(st.lossRate)}
            sub={`${st.lossTrades} losses`}
            colorClass="text-danger"
          />
        </div>
        {/* Racha card */}
        <div className="col">
          <div className="card h-100 border-0 bg-light">
            <div className="card-body p-3">
              <p
                className="text-uppercase text-secondary fw-semibold mb-2"
                style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}
              >
                Max Streaks
              </p>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <small className="text-secondary">Consec. Wins</small>
                <span className="fs-5 fw-bold text-success">{st.maxConsecWins}</span>
              </div>
              <div className="d-flex justify-content-between align-items-center">
                <small className="text-secondary">Consec. Losses</small>
                <span className="fs-5 fw-bold text-danger">{st.maxConsecLosses}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Win / loss progress bar ── */}
      <div className="mt-2">
        <div className="d-flex justify-content-between mb-1">
          <small className="fw-semibold text-success">Won {fmtPct(st.winRate)}</small>
          <small className="fw-semibold text-danger">Lost {fmtPct(st.lossRate)}</small>
        </div>
        <div className="progress" style={{ height: '8px' }}>
          <div
            className="progress-bar bg-success"
            role="progressbar"
            style={{ width: `${st.winRate}%` }}
            aria-valuenow={st.winRate}
            aria-valuemin={0}
            aria-valuemax={100}
          />
          <div
            className="progress-bar bg-danger"
            role="progressbar"
            style={{ width: `${st.lossRate}%` }}
            aria-valuenow={st.lossRate}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>
    </div>
  );
}
