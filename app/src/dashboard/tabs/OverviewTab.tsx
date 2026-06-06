import { Suspense } from 'react';
import type { Trade } from '../../types/tradeTypes';
import type { TradeStats } from '../panels/statistics';
import { TradesSection } from '../panels/statistics';
import HeroKpis from '../HeroKpis';
import Panel, { Row } from '../Panel';
import { PanelPlaceholder } from '../PanelPlaceholder';
import { EquityCurveChart, PnlBySymbolChart } from '../lazyCharts';

interface TabProps {
  stats: TradeStats;
  trades: Trade[];
}

const OverviewTab = ({ stats, trades }: TabProps) => (
  <div className="tc-tab-stack">
    <HeroKpis stats={stats} />

    <Row>
      <Panel title="Equity Curve" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <EquityCurveChart stats={stats} height={300} />
        </Suspense>
      </Panel>
    </Row>

    <Row>
      <Panel title="PnL by Symbol" grow={5} centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <PnlBySymbolChart trades={trades} />
        </Suspense>
      </Panel>
      <Panel title="Trade Summary" grow={7}>
        <TradesSection stats={stats} />
      </Panel>
    </Row>
  </div>
);

export default OverviewTab;
