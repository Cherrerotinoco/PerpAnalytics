import { Suspense } from 'react';
import type { Trade } from '../../types/tradeTypes';
import type { TradeStats } from '../panels/statistics';
import Panel, { Row } from '../Panel';
import { PanelPlaceholder } from '../PanelPlaceholder';
import { PnlCalendar } from '../lazyCharts';

interface TabProps {
  stats: TradeStats;
  trades: Trade[];
}

const CalendarTab = ({ trades }: TabProps) => (
  <div className="tc-tab-stack">
    <Row>
      <Panel title="PnL Calendar">
        <Suspense fallback={<PanelPlaceholder />}>
          <PnlCalendar trades={trades} />
        </Suspense>
      </Panel>
    </Row>
  </div>
);

export default CalendarTab;
