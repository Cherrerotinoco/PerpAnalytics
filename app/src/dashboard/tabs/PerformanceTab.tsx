import { Suspense } from 'react';
import type { Trade } from '../../types/tradeTypes';
import type { TradeStats } from '../panels/statistics';
import { PerformanceSection } from '../panels/statistics';
import Panel, { Row } from '../Panel';
import { PanelPlaceholder } from '../PanelPlaceholder';
import {
  WinRateByHourChart,
  WinRateByWeekdayChart,
  WinRateByDurationChart,
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

    <Row>
      <Panel title="Win Rate by Hour" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <WinRateByHourChart trades={trades} />
        </Suspense>
      </Panel>
      <Panel title="Win Rate by Weekday" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <WinRateByWeekdayChart trades={trades} />
        </Suspense>
      </Panel>
    </Row>

    <Row>
      <Panel title="Win Rate by Duration" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <WinRateByDurationChart trades={trades} />
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
