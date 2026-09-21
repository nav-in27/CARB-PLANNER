import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { BarChart3, Sliders, ShieldCheck, Clock, TrendingUp } from 'lucide-react';

const ASSET_AVAIL_DATA = [
  { time: '06:00', CARB: 98.2, Deterministic: 97.5, Greedy: 95.0 },
  { time: '09:00', CARB: 92.4, Deterministic: 88.0, Greedy: 84.2 },
  { time: '12:00', CARB: 94.6, Deterministic: 91.2, Greedy: 86.8 },
  { time: '15:00', CARB: 93.8, Deterministic: 89.5, Greedy: 85.0 },
  { time: '18:00', CARB: 96.1, Deterministic: 93.0, Greedy: 89.4 },
  { time: '21:00', CARB: 97.5, Deterministic: 95.2, Greedy: 91.0 },
];

const TRAIN_DELAY_DATA = [
  { category: '12635 Vaigai SF', CARB: 0, Deterministic: 12, Greedy: 35 },
  { category: '12605 Pallavan SF', CARB: 1, Deterministic: 18, Greedy: 42 },
  { category: '20605 Vande Bharat', CARB: 0, Deterministic: 8, Greedy: 25 },
  { category: '12653 Rockfort SF', CARB: 0, Deterministic: 15, Greedy: 28 },
  { category: 'BOXN Ariyalur Freight', CARB: 12, Deterministic: 30, Greedy: 60 },
];

const UNCERTAINTY_RANGES = [
  { task: 'Track Maintenance (ENG)', p50: 82, p75: 95, p90: 105, p95: 120 },
  { task: 'Rail Grinding (ENG)', p50: 85, p75: 98, p90: 105, p95: 115 },
  { task: 'OHE Inspection (TRD)', p50: 50, p75: 55, p90: 60, p95: 70 },
  { task: 'Cantilever Overhaul (TRD)', p50: 65, p75: 78, p90: 90, p95: 100 },
  { task: 'Signal Interlocking (S&T)', p50: 38, p75: 42, p90: 45, p95: 55 },
  { task: 'Point Machine (S&T)', p50: 72, p75: 82, p90: 90, p95: 105 },
];

export default function AnalyticsTab() {
  return (
    <div className="workspace-body">
      {/* Page Title */}
      <div className="page-title-row">
        <div>
          <h2>Planning Analytics</h2>
          <p>Quantitative evaluation of block scheduling performance and duration uncertainty</p>
        </div>
      </div>

      {/* Two-Column Chart Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {/* Chart 1: Asset Availability Over Horizon */}
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-header">
            <div className="panel-title">
              <TrendingUp size={14} color="var(--op-blue)" />
              <span>Asset Availability Profile (%)</span>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>06:00–22:00 Horizon</span>
          </div>

          <div style={{ height: '220px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ASSET_AVAIL_DATA} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#e2e8f0" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis domain={[80, 100]} stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #cbd5e1', fontSize: '11px', borderRadius: '4px' }} />
                <Line type="monotone" dataKey="CARB" stroke="#15803d" strokeWidth={2} dot={{ r: 3 }} name="CARB-Planner" />
                <Line type="monotone" dataKey="Deterministic" stroke="#0284c7" strokeWidth={1.5} dot={{ r: 2 }} name="Deterministic" />
                <Line type="monotone" dataKey="Greedy" stroke="#b45309" strokeWidth={1.5} strokeDasharray="3 3" name="Greedy Baseline" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Train Delay Impact */}
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-header">
            <div className="panel-title">
              <Clock size={14} color="var(--op-blue)" />
              <span>Train Delay Impact by Service (Minutes)</span>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Minutes Delayed</span>
          </div>

          <div style={{ height: '220px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={TRAIN_DELAY_DATA} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#e2e8f0" />
                <XAxis dataKey="category" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #cbd5e1', fontSize: '11px', borderRadius: '4px' }} />
                <Bar dataKey="CARB" fill="#15803d" name="CARB-Planner" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Deterministic" fill="#0284c7" name="Deterministic" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Greedy" fill="#b45309" name="Greedy" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Planning Strategy Comparison Table */}
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <div className="panel-header">
          <div className="panel-title">
            <Sliders size={14} color="var(--op-blue)" />
            <span>Planning Strategy Comparison</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Benchmark on Identical 16-Hour Corridor Horizon
          </span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Scheduling Strategy</th>
              <th>Asset Availability</th>
              <th>Maintenance Completion</th>
              <th>Train Delay Impact</th>
              <th>Critical Tasks Deferred</th>
              <th>Headway Conflicts</th>
              <th>Replanning Time</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>CARB-Planner (CP-SAT + P90 + LNS)</strong>
              </td>
              <td><strong style={{ color: 'var(--op-green)' }}>94.6%</strong></td>
              <td><strong style={{ color: 'var(--op-green)' }}>87.3%</strong> (12/13)</td>
              <td><strong style={{ color: 'var(--op-green)' }}>+6.8 min</strong></td>
              <td><strong>0</strong> (Strict Invariant)</td>
              <td><span className="badge badge-green">0 Conflicts</span></td>
              <td><strong>8.4 sec</strong></td>
            </tr>
            <tr>
              <td>Deterministic Mathematical Planner</td>
              <td>91.4%</td>
              <td>84.6% (11/13)</td>
              <td>+22.4 min</td>
              <td>0</td>
              <td><span className="badge badge-amber">1 Conflict</span></td>
              <td>42.5 sec</td>
            </tr>
            <tr>
              <td>Classical Greedy Priority Scheduler</td>
              <td>86.2%</td>
              <td>69.2% (9/13)</td>
              <td>+58.1 min</td>
              <td>1 (Deferred)</td>
              <td><span className="badge badge-red">3 Conflicts</span></td>
              <td>1.2 sec</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Maintenance Duration Uncertainty Visual */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <ShieldCheck size={14} color="var(--op-blue)" />
            <span>Maintenance Duration Uncertainty (Quantile Range P50–P95)</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Operational Buffer Range in Minutes
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {UNCERTAINTY_RANGES.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '220px 1fr 100px',
                alignItems: 'center',
                gap: '1rem',
                fontSize: '0.76rem',
              }}
            >
              <div>
                <strong>{item.task}</strong>
              </div>

              {/* Range Visualizer Bar */}
              <div style={{ position: 'relative', height: '18px', background: 'var(--bg-workspace)', borderRadius: '3px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                {/* P50 to P75 */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${(item.p50 / 140) * 100}%`,
                    width: `${((item.p75 - item.p50) / 140) * 100}%`,
                    top: 0,
                    bottom: 0,
                    background: '#bfdbfe',
                  }}
                  title={`P50-P75: ${item.p50}m–${item.p75}m`}
                />
                {/* P75 to P90 (CARB Buffer) */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${(item.p75 / 140) * 100}%`,
                    width: `${((item.p90 - item.p75) / 140) * 100}%`,
                    top: 0,
                    bottom: 0,
                    background: '#86efac',
                  }}
                  title={`P75-P90 (CARB Reserved): ${item.p75}m–${item.p90}m`}
                />
                {/* P90 to P95 */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${(item.p90 / 140) * 100}%`,
                    width: `${((item.p95 - item.p90) / 140) * 100}%`,
                    top: 0,
                    bottom: 0,
                    background: '#fde68a',
                  }}
                  title={`P90-P95: ${item.p90}m–${item.p95}m`}
                />
                {/* P90 Mark */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${(item.p90 / 140) * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: 'var(--op-green)',
                  }}
                />
              </div>

              <div style={{ fontSize: '0.72rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                P50: <strong>{item.p50}m</strong> | P90: <strong style={{ color: 'var(--op-green)' }}>{item.p90}m</strong>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.85rem', fontSize: '0.7rem', color: 'var(--text-muted)', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '10px', height: '10px', background: '#bfdbfe', borderRadius: '2px' }} />
            <span>P50 Expected Median</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '10px', height: '10px', background: '#86efac', borderRadius: '2px' }} />
            <span>P90 Confidence Buffer (CARB-Planner Allocation)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '10px', height: '10px', background: '#fde68a', borderRadius: '2px' }} />
            <span>P95 Extreme Contingency</span>
          </div>
        </div>
      </div>
    </div>
  );
}
