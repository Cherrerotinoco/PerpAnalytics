import { Suspense } from 'react';
import type { Trade } from '../../types/tradeTypes';
import type { TradeStats } from '../panels/statistics';
import { PerformanceSection } from '../panels/statistics';
import Panel, { Row, SectionHeading } from '../Panel';
import { PanelPlaceholder } from '../PanelPlaceholder';
import {
  PnlByHourChart,
  PnlByWeekdayChart,
  PnlByDurationChart,
  WinRateByHourChart,
  WinRateByWeekdayChart,
  WinRateByDurationChart,
  PnlBySessionChart,
  WinRateBySessionChart,
} from '../lazyCharts';

interface TabProps {
  stats: TradeStats;
  trades: Trade[];
}

const PerformanceTab = ({ stats, trades }: TabProps) => (
  <div className="tc-tab-stack">
    <Row>
      <Panel title="Performance Metrics">
        <PerformanceSection stats={stats} />
      </Panel>
    </Row>

    {/* ── By time of day ── */}
    <SectionHeading>By Time of Day</SectionHeading>
    <Row>
      <Panel title="PnL by Hour" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <PnlByHourChart trades={trades} />
        </Suspense>
      </Panel>
      <Panel title="Win Rate by Hour" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <WinRateByHourChart trades={trades} />
        </Suspense>
      </Panel>
    </Row>

    {/* ── By weekday ── */}
    <SectionHeading>By Weekday</SectionHeading>
    <Row>
      <Panel title="PnL by Weekday" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <PnlByWeekdayChart trades={trades} />
        </Suspense>
      </Panel>
      <Panel title="Win Rate by Weekday" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <WinRateByWeekdayChart trades={trades} />
        </Suspense>
      </Panel>
    </Row>

    {/* ── By duration ── */}
    <SectionHeading>By Duration</SectionHeading>
    <Row>
      <Panel title="PnL by Duration" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <PnlByDurationChart trades={trades} />
        </Suspense>
      </Panel>
      <Panel title="Win Rate by Duration" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <WinRateByDurationChart trades={trades} />
        </Suspense>
      </Panel>
    </Row>

    {/* ── By session ── */}
    <SectionHeading>By Market Session</SectionHeading>
    <Row>
      <Panel title="PnL by Session" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <PnlBySessionChart stats={stats} />
        </Suspense>
      </Panel>
      <Panel title="Win Rate by Session" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <WinRateBySessionChart stats={stats} />
        </Suspense>
      </Panel>
    </Row>
  </div>
);

export default PerformanceTab;
