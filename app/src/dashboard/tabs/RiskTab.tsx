import { Suspense } from 'react';
import type { Trade } from '../../types/tradeTypes';
import type { TradeStats } from '../panels/statistics';
import { RiskSection } from '../panels/statistics';
import Panel, { Row } from '../Panel';
import { PanelPlaceholder } from '../PanelPlaceholder';
import { EquityCurveChart } from '../lazyCharts';

interface TabProps {
  stats: TradeStats;
  trades: Trade[];
}

const RiskTab = ({ stats }: TabProps) => (
  <div className="tc-tab-stack">
    <Row>
      <Panel title="Risk & Drawdown">
        <RiskSection stats={stats} />
      </Panel>
    </Row>

    <Row>
      <Panel title="Equity Curve" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <EquityCurveChart stats={stats} height={240} />
        </Suspense>
      </Panel>
    </Row>
  </div>
);

export default RiskTab;
