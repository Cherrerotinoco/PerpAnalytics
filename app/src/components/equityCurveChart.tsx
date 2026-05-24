import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { Trade } from '../../types/tradeTypes';
import { computeTradeStats } from './statistics';

function fmtMoney(v: number): string {
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val: number = payload[0].value;
  return (
    <div className="card border shadow-sm px-3 py-2" style={{ fontSize: '0.8rem', minWidth: '150px' }}>
      <p className="text-secondary mb-1">{fmtDate(label)}</p>
      <p className={`fw-semibold mb-0 ${val >= 0 ? 'text-success' : 'text-danger'}`}>
        {val >= 0 ? '+' : ''}{fmtMoney(val)} $
      </p>
    </div>
  );
};

export default function EquityCurveChart({ trades }: { trades: Trade[] }) {
  const stats = computeTradeStats(trades);

  // x es timestamp numérico, y es PnL acumulado — filtramos puntos sin fecha válida
  const data = stats.equityCurve
    .map((y, i) => ({ x: Number(stats.equityCurveLabels[i]), y }))
    .filter(d => d.x > 0);

  if (!data.length) return null;

  const isPositive = stats.totalPnl >= 0;
  const lineColor = isPositive ? '#198754' : '#dc3545';

  const xMin = data[0].x;
  const xMax = data[data.length - 1].x;

  // Generar ~6 ticks distribuidos uniformemente entre el primer y último trade
  const tickCount = Math.min(data.length, 6);
  const ticks = Array.from({ length: tickCount }, (_, i) =>
    Math.round(xMin + (i / (tickCount - 1)) * (xMax - xMin))
  );

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body p-4">

        <div className="d-flex align-items-center justify-content-between mb-3">
          <div>
            <h5 className="card-title fw-bold mb-0">Curva de Equity</h5>
            <small className="text-secondary">{fmtDate(xMin)} — {fmtDate(xMax)}</small>
          </div>
          <span className={`badge fw-semibold ${isPositive ? 'text-success bg-success-subtle' : 'text-danger bg-danger-subtle'}`}>
            {isPositive ? '+' : ''}{fmtMoney(stats.totalPnl)} $
          </span>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dee2e6" />
            <XAxis
              dataKey="x"
              type="number"
              scale="time"
              domain={[xMin, xMax]}
              ticks={ticks}
              tickFormatter={fmtDate}
              tick={{ fill: '#6c757d', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#dee2e6' }}
              angle={-30}
              textAnchor="end"
              height={48}
            />
            <YAxis
              tick={{ fill: '#6c757d', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) =>
                `${v >= 0 ? '' : '-'}${Math.abs(v).toLocaleString('es-ES', { maximumFractionDigits: 0 })} $`
              }
              width={72}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#adb5bd" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="y"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>

      </div>
    </div>
  );
}