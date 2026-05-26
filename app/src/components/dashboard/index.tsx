import { FC, Suspense } from 'react';
import { Trade } from '../../types/tradeTypes';
import { PerformanceSection, RiskSection, TradesSection, TradeStats } from './panels/statistics';
import { PanelPlaceholder } from './PanelPlaceholder';
import PnlBySymbolChart from './panels/pnlBySymbolChart';
import PnlCalendar from './panels/pnlCalendar';
import EquityCurveChart from './panels/equityCurveChart';
import TradeList from './panels/tradeList';

export const DashboardContainer: FC<{
  trades: Trade[];
  stats: TradeStats;
  hasData: boolean;
  hasQueried: boolean;
}> = ({ trades: filteredTrades, stats, hasData, hasQueried }) => {
  return (
    <div className="mb-3 d-flex align-items-stretch gap-3 flex-wrap">
      {/* Equity Curve */}
      <div className="tc-panel tc-panel-equity">
        <div className="tc-panel-header">
          <span className="tc-panel-title">Equity Curve</span>
        </div>
        <div className="tc-panel-body">
          {hasData ? (
            <Suspense fallback={<PanelPlaceholder />}>
              <EquityCurveChart trades={filteredTrades} />
            </Suspense>
          ) : (
            <PanelPlaceholder searched={hasQueried} />
          )}
        </div>
      </div>

      {/* Performance */}
      <div className="tc-panel tc-panel-stat">
        <div className="tc-panel-header">
          <span className="tc-panel-title">Performance</span>
        </div>
        {hasData ? (
          <PerformanceSection stats={stats} />
        ) : (
          <PanelPlaceholder searched={hasQueried} />
        )}
      </div>

      {/* Risk & Drawdown */}
      <div className="tc-panel tc-panel-stat">
        <div className="tc-panel-header">
          <span className="tc-panel-title">Risk &amp; Drawdown</span>
        </div>
        {hasData ? <RiskSection stats={stats} /> : <PanelPlaceholder searched={hasQueried} />}
      </div>

      {/* Trades */}
      <div className="tc-panel tc-panel-stat">
        <div className="tc-panel-header">
          <span className="tc-panel-title">Trades</span>
        </div>
        {hasData ? <TradesSection stats={stats} /> : <PanelPlaceholder searched={hasQueried} />}
      </div>

      {/* PnL Calendar */}
      <div className="tc-panel tc-panel-calendar">
        <div className="tc-panel-header">
          <span className="tc-panel-title">PnL Calendar</span>
        </div>
        <div className="tc-panel-body">
          {hasData ? (
            <Suspense fallback={<PanelPlaceholder />}>
              <PnlCalendar trades={filteredTrades} />
            </Suspense>
          ) : (
            <PanelPlaceholder searched={hasQueried} />
          )}
        </div>
      </div>

      {/* PnL by Symbol */}
      <div className="tc-panel tc-panel-symbol">
        <div className="tc-panel-header">
          <span className="tc-panel-title">PnL by Symbol</span>
        </div>
        <div className="tc-panel-body">
          {hasData ? (
            <Suspense fallback={<PanelPlaceholder />}>
              <PnlBySymbolChart trades={filteredTrades} />
            </Suspense>
          ) : (
            <PanelPlaceholder searched={hasQueried} />
          )}
        </div>
      </div>

      {/* Trade History */}
      <div className="tc-panel tc-panel-overflow">
        <div className="tc-panel-header">
          <span className="tc-panel-title">Trade History</span>
          {hasData && <span className="tc-small-muted">{filteredTrades.length} trades</span>}
        </div>
        {hasData ? (
          <Suspense fallback={<PanelPlaceholder />}>
            <TradeList trades={filteredTrades} />
          </Suspense>
        ) : (
          <PanelPlaceholder searched={hasQueried} />
        )}
      </div>
    </div>
  );
};
