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
      <Panel title="Equity Curve" grow={8} centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <EquityCurveChart stats={stats} height={200} />
        </Suspense>
      </Panel>
      <Panel title="PnL by Symbol" grow={4} centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <PnlBySymbolChart trades={trades} />
        </Suspense>
      </Panel>
    </Row>

    <Row>
      <Panel title="Trade Summary">
        <TradesSection stats={stats} />
      </Panel>
    </Row>
  </div>
);

export default OverviewTab;
