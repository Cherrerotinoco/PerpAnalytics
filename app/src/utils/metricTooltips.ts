export const TOOLTIPS = {
  totalPnl:
    'Σ trade PnL across all closed trades in the selected period. For Jupiter trades, PnL is stored net of fees.',
  profitFactor:
    'Σ winning PnLs ÷ Σ losing PnLs (absolute). Above 1.0 = total gains exceed total losses. ∞ when there are no losing trades.',
  maxProfit: 'PnL of the single highest-profit closed trade.',
  maxLoss: 'Absolute PnL of the single worst-loss closed trade.',
  expectancy:
    'P(win) × avgWin − P(loss) × avgLoss. Expected dollars earned per trade. Equivalent to total PnL ÷ total trades.',
  riskReward:
    'avgWin ÷ avgLoss. Compares the average size of winning trades to losing trades. Above 1 = wins are larger than losses on average.',
  maxDrawdown:
    'Largest cumulative drop from a peak in the running equity curve. Measured in dollars; the % shown is dd ÷ peak equity at that moment.',
  calmarRatio:
    'Annualised PnL ÷ max drawdown. Annualisation is based on the time span between first and last trade. Falls back to raw PnL when the window is under 1 day.',
  sharpeRatio:
    'Expectancy ÷ σ(all trade PnLs). Risk-free rate = 0, per-trade, non-annualised. Measures return per unit of total volatility (wins and losses).',
  sortino:
    'Expectancy ÷ σ_d, where σ_d = √(Σ min(PnL, 0)² ÷ n). Only losing returns contribute to the denominator, so it penalises downside risk exclusively.',
  recoveryFactor:
    'Total net PnL ÷ max drawdown (non-annualised). Shows how many times over total profit covers the worst drawdown experienced.',
  var95:
    '5th-percentile trade PnL (trades sorted ascending by PnL). 95% of trades had a result equal to or better than this value.',
  totalTrades: 'Total number of closed trades in the selected period and platforms.',
  winRate: '(Winning trades ÷ total trades) × 100. A trade is a win when PnL > 0.',
  lossRate:
    '(Losing trades ÷ total trades) × 100. A trade is a loss when PnL < 0. Breakeven trades (PnL = 0) count neither as wins nor losses.',
  avgWin: 'Σ winning PnLs ÷ number of winning trades. Arithmetic mean of all positive-PnL trades.',
  avgLoss:
    'Σ |losing PnLs| ÷ number of losing trades. Arithmetic mean of all negative-PnL trades, expressed as a positive number.',
  medianWin:
    'The middle value of all winning trades, sorted by PnL. Less skewed by outliers than the average.',
  medianLoss:
    'The middle value of all losing trades by size. Less skewed by outliers than the average.',
  p90Win:
    '90% of winning trades are below this value. A very high P90 vs average suggests a few outlier wins are inflating your results.',
  p90Loss:
    '90% of losing trades are below this size. A very high P90 vs average suggests a few large losses are damaging your overall results.',
} as const;
