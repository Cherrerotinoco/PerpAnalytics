import { useEffect, useRef, Suspense, lazy, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CgSearchFound, CgUserRemove, CgUnavailable,
  CgTrending, CgPerformance, CgShield, CgPlug,
} from 'react-icons/cg';
import type { ComponentType } from 'react';
import { MOCK_TRADES } from '../utils/mockTrades';
import { computeTradeStats, MetricLabelContext } from '../dashboard/panels/statistics';
import type { TradeStats } from '../dashboard/panels/statistics';
import { MetricPanel } from '../dashboard/panels/metricPanel';

const EquityCurveChart = lazy(() => import('../dashboard/panels/equityCurveChart'));
const PnlCalendar      = lazy(() => import('../dashboard/panels/pnlCalendar'));

// ─── Fallback skeleton ────────────────────────────────────────────────────────
const ChartSkeleton = () => <div className="tc-landing-chart-skeleton" />;

// ─── Metric card with label — homepage only ───────────────────────────────────
// MetricLabelContext tells Metric to render its label inside the card.
// No panel header exists on the landing page, so the label lives in the card itself.
const ShowcaseMetricCard = ({ panelId, stats }: { panelId: string; stats: TradeStats }) => (
  <MetricLabelContext value={true}>
    <MetricPanel panelId={panelId} stats={stats} />
  </MetricLabelContext>
);

// ─── Feature list ─────────────────────────────────────────────────────────────
type FeatureDef = { Icon: ComponentType<{ className?: string }>; title: string; body: string };

const FEATURES: FeatureDef[] = [
  {
    Icon: CgTrending,
    title: 'Equity curve & drawdown',
    body: 'Watch your running PnL over time and spot your worst peak-to-trough decline at a glance.',
  },
  {
    Icon: CgPerformance,
    title: 'Win rate & trade breakdown',
    body: 'Win/loss ratio, average winner vs loser, expectancy, and consecutive streak tracking.',
  },
  {
    Icon: CgShield,
    title: 'Risk-adjusted metrics',
    body: 'Sharpe, Sortino, Calmar ratio, Value-at-Risk — the same metrics quant funds use.',
  },
  {
    Icon: CgPlug,
    title: 'Jupiter & Pacifica',
    body: 'Pull your full trade history from both platforms with one wallet address. No CSV exports needed.',
  },
];

// ─── Showcase metric panel IDs ────────────────────────────────────────────────
const SHOWCASE_METRICS = [
  'metric-win-rate',
  'metric-profit-factor',
  'metric-max-drawdown',
  'metric-recovery-factor',
];

// ─── Component ────────────────────────────────────────────────────────────────
const HomePage = () => {
  const navigate = useNavigate();
  const demoRef  = useRef<HTMLElement>(null);

  // Redirect legacy shared links: /?wallet=xxx → /dashboard?wallet=xxx
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('wallet')) {
      navigate(`/dashboard?${params.toString()}`, { replace: true });
    }
  }, [navigate]);

  const stats = useMemo(() => computeTradeStats(MOCK_TRADES), []);

  const scrollToDemo = () => {
    demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="tc-home">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="tc-hero">
        <div className="tc-hero-inner">
          <p className="tc-hero-eyebrow">Solana perpetuals analytics</p>
          <h1 className="tc-hero-headline">
            Understand your trading,<br />
            <span className="tc-hero-headline-accent">not just your PnL.</span>
          </h1>
          <p className="tc-hero-subtitle">
            Paste your wallet address. Instantly see your complete trade history from{' '}
            <strong>Jupiter Perpetuals</strong> and <strong>Pacifica Finance</strong> with
            institutional-grade performance and risk metrics.
          </p>
          <div className="tc-hero-actions">
            <Link to="/dashboard" className="tc-btn-primary tc-hero-cta-primary">
              Analyze my trades
            </Link>
            <button
              type="button"
              className="tc-btn-ghost tc-hero-cta-secondary"
              onClick={scrollToDemo}
            >
              See demo ↓
            </button>
          </div>

        </div>
      </section>

      {/* ── Trust row ────────────────────────────────────────────────────── */}
      <section className="tc-landing-section tc-landing-section--alt">
        <div className="tc-landing-inner">
          <div className="tc-trust-grid">
            <div className="tc-trust-card">
              <CgSearchFound className="tc-trust-icon" aria-hidden="true" />
              <div>
                <p className="tc-trust-title">Public address only</p>
                <p className="tc-trust-sub">No wallet connection or signing — ever.</p>
              </div>
            </div>
            <div className="tc-trust-card">
              <CgUserRemove className="tc-trust-icon" aria-hidden="true" />
              <div>
                <p className="tc-trust-title">No signup</p>
                <p className="tc-trust-sub">No account, no email, no tracking.</p>
              </div>
            </div>
            <div className="tc-trust-card">
              <CgUnavailable className="tc-trust-icon" aria-hidden="true" />
              <div>
                <p className="tc-trust-title">Nothing stored</p>
                <p className="tc-trust-sub">Data is fetched live and never saved.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats showcase ────────────────────────────────────────────────── */}
      <section className="tc-landing-section" ref={demoRef}>
        <div className="tc-landing-inner">
          <p className="tc-landing-eyebrow">Live demo — mock data</p>
          <h2 className="tc-landing-title">Your performance, at a glance.</h2>
          <p className="tc-landing-body">
            Every panel you see below is rendered with sample trade data using the exact same
            components as your personal dashboard.
          </p>

          {/* Key metric cards — each shows its title label */}
          <div className="tc-landing-metrics">
            {SHOWCASE_METRICS.map((id) => (
              <ShowcaseMetricCard key={id} panelId={id} stats={stats} />
            ))}
          </div>

          {/* Charts */}
          <div className="tc-landing-charts">
            <div className="tc-landing-chart-card tc-landing-chart-card--wide">
              <p className="tc-landing-chart-label">Equity curve</p>
              <Suspense fallback={<ChartSkeleton />}>
                <EquityCurveChart trades={MOCK_TRADES} />
              </Suspense>
            </div>
            <div className="tc-landing-chart-card">
              <p className="tc-landing-chart-label">PnL calendar</p>
              <Suspense fallback={<ChartSkeleton />}>
                <PnlCalendar trades={MOCK_TRADES} />
              </Suspense>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="tc-landing-section tc-landing-section--alt">
        <div className="tc-landing-inner">
          <p className="tc-landing-eyebrow">What you get</p>
          <h2 className="tc-landing-title">Everything you need to evaluate your edge.</h2>
          <div className="tc-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="tc-feature-card">
                <f.Icon className="tc-feature-icon" aria-hidden="true" />
                <h3 className="tc-feature-title">{f.title}</h3>
                <p className="tc-feature-body">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <section className="tc-landing-cta-section">
        <div className="tc-landing-inner tc-landing-cta-inner">
          <h2 className="tc-landing-cta-title">Ready to analyze your trades?</h2>
          <p className="tc-landing-cta-body">
            Free. No account required. Just your wallet address.
          </p>
          <Link to="/dashboard" className="tc-btn-primary tc-landing-cta-btn">
            Start now →
          </Link>
        </div>
      </section>

    </div>
  );
};

export default HomePage;
