import { Suspense } from 'react';
import type { Trade } from '../../types/tradeTypes';
import type { TradeStats } from '../panels/statistics';
import { TradesSection } from '../panels/statistics';
import Panel, { Row } from '../Panel';
import { PanelPlaceholder } from '../PanelPlaceholder';
import { PnlBySymbolChart, TradeList } from '../lazyCharts';

interface TabProps {
  stats: TradeStats;
  trades: Trade[];
}

const TradesTab = ({ stats, trades }: TabProps) => (
  <div className="tc-tab-stack">
    <Row>
      <Panel title="Trade Stats">
        <TradesSection stats={stats} />
      </Panel>
    </Row>

    <Row>
      <Panel title="PnL by Symbol" centered>
        <Suspense fallback={<PanelPlaceholder />}>
          <PnlBySymbolChart trades={trades} />
        </Suspense>
      </Panel>
    </Row>

    <Row>
      <Panel title="Trade History">
        <TradeList trades={trades} />
      </Panel>
    </Row>
  </div>
);

export default TradesTab;
