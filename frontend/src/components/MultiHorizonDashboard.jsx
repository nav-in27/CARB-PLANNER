import React from 'react';
import {
  Calendar,
  Layers,
  Clock,
  Compass,
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { useScenario } from '../context/ScenarioContext';

export default function MultiHorizonDashboard({ onNavigateTab }) {
  const {
    activeHorizon,
    setActiveHorizon,
    selectedWeekNum,
    setSelectedWeekNum,
    horizonOverview,
    planningDate,
    openTraceModal,
    openReportsModal,
    monthlyPlan,
    weeklyPlan,
  } = useScenario();

  const monthlySummary = horizonOverview?.monthly_summary || {
    month: 'September 2026',
    tasks_count: monthlyPlan?.tasks?.length || 13,
    planned_count: 13,
    deferred_count: 0,
    critical_count: 4,
    possession_hours: 41.5,
    status: monthlyPlan?.status || 'APPROVED',
    version: monthlyPlan?.monthly_plan_id || 'M-2026-09-v1',
  };

  const weeklySummary = horizonOverview?.weekly_summary || {
    week_label: `Week ${selectedWeekNum} (Sep 14–20, 2026)`,
    tasks_count: weeklyPlan?.tasks?.length || 5,
    approved_count: 5,
    pending_count: 0,
    conflicts_count: weeklyPlan?.conflicts?.length || 0,
    possession_hours: 15.0,
    status: weeklyPlan?.status || 'APPROVED',
    version: weeklyPlan?.weekly_plan_id || `W-2026-09-W${selectedWeekNum}-v1`,
  };

  const dailySummary = horizonOverview?.daily_summary || {
    planning_date: planningDate || '2026-09-18',
    day_name: 'Wednesday',
    active_possessions: 3,
    train_impact: 3,
    conflicts: 0,
    status: 'ACTIVE',
    version: `D-${planningDate || '2026-09-18'}-v1`,
  };

  const handleSelectHorizon = (horizon) => {
    setActiveHorizon(horizon);
    if (onNavigateTab) {
      onNavigateTab('planner');
    }
  };

  return (
    <div className="horizon-dashboard-banner">
      {/* 1. Monthly Horizon Card */}
      <div
        className={`horizon-summary-card ${activeHorizon === 'monthly' ? 'active' : ''}`}
        onClick={() => handleSelectHorizon('monthly')}
        title="Switch to Long-Term Monthly Maintenance Planning"
      >
        <div className="horizon-summary-header">
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Calendar size={12} color="var(--op-blue)" />
            MONTHLY STRATEGY
          </span>
          <span className="badge badge-slate" style={{ fontSize: '0.62rem' }}>
            {monthlySummary.version}
          </span>
        </div>
        <div className="horizon-summary-metrics">
          <div>
            <span className="horizon-stat-primary">{monthlySummary.tasks_count}</span>
            <span className="horizon-stat-sub"> Tasks</span>
          </div>
          <div>
            <span className="horizon-stat-sub" style={{ color: 'var(--op-green)', fontWeight: 600 }}>
              {monthlySummary.possession_hours}h
            </span>
            <span className="horizon-stat-sub"> track hrs</span>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span className={`badge ${monthlySummary.status === 'APPROVED' ? 'badge-green' : 'badge-amber'}`} style={{ fontSize: '0.62rem' }}>
              {monthlySummary.status}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Weekly Horizon Card */}
      <div
        className={`horizon-summary-card ${activeHorizon === 'weekly' ? 'active' : ''}`}
        onClick={() => handleSelectHorizon('weekly')}
        title="Switch to Medium-Term Weekly Possession Planning"
      >
        <div className="horizon-summary-header">
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Layers size={12} color="var(--dept-eng)" />
            WEEKLY POSSESSIONS
          </span>
          <span className="badge badge-slate" style={{ fontSize: '0.62rem' }}>
            {weeklySummary.version}
          </span>
        </div>
        <div className="horizon-summary-metrics">
          <div>
            <span className="horizon-stat-primary">{weeklySummary.tasks_count}</span>
            <span className="horizon-stat-sub"> Blocks</span>
          </div>
          <div>
            <span className="horizon-stat-sub" style={{ color: weeklySummary.conflicts_count > 0 ? 'var(--op-red)' : 'var(--op-green)', fontWeight: 600 }}>
              {weeklySummary.conflicts_count}
            </span>
            <span className="horizon-stat-sub"> conflicts</span>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span className={`badge ${weeklySummary.status === 'APPROVED' ? 'badge-green' : 'badge-blue'}`} style={{ fontSize: '0.62rem' }}>
              Week {selectedWeekNum}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Daily Horizon Card */}
      <div
        className={`horizon-summary-card ${activeHorizon === 'daily' ? 'active' : ''}`}
        onClick={() => handleSelectHorizon('daily')}
        title="Switch to Short-Term 24-Hour Operational Block Planning"
      >
        <div className="horizon-summary-header">
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Clock size={12} color="var(--op-green)" />
            DAILY OPERATIONAL
          </span>
          <span className="badge badge-slate" style={{ fontSize: '0.62rem' }}>
            {dailySummary.version}
          </span>
        </div>
        <div className="horizon-summary-metrics">
          <div>
            <span className="horizon-stat-primary">{dailySummary.active_possessions}</span>
            <span className="horizon-stat-sub"> Active</span>
          </div>
          <div>
            <span className="horizon-stat-sub" style={{ color: 'var(--op-amber)', fontWeight: 600 }}>
              {dailySummary.train_impact}
            </span>
            <span className="horizon-stat-sub"> train impact</span>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span className="badge badge-green" style={{ fontSize: '0.62rem' }}>
              Live
            </span>
          </div>
        </div>
      </div>

      {/* Right Controls: Switcher Pills & Traceability */}
      <div className="horizon-switcher-controls">
        <div className="horizon-pill-group">
          <button
            className={`horizon-pill ${activeHorizon === 'monthly' ? 'active' : ''}`}
            onClick={() => handleSelectHorizon('monthly')}
            title="Switch resolution to Month (Weeks 1–4, capacity & joint possessions)"
          >
            <Calendar size={11} />
            MONTH
          </button>
          <button
            className={`horizon-pill ${activeHorizon === 'weekly' ? 'active' : ''}`}
            onClick={() => handleSelectHorizon('weekly')}
            title="Switch resolution to Week (Mon–Sun, train traffic impact & conflicts)"
          >
            <Layers size={11} />
            WEEK
          </button>
          <button
            className={`horizon-pill ${activeHorizon === 'daily' ? 'active' : ''}`}
            onClick={() => handleSelectHorizon('daily')}
            title="Switch resolution to Day (00:00–24:00, 15-min slots, exact train paths)"
          >
            <Clock size={11} />
            DAY
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            className="btn btn-sm"
            style={{ fontSize: '0.68rem', padding: '3px 8px' }}
            onClick={() => openTraceModal('ENG-014')}
            title="View 4-Tier End-to-End Traceability (Month -> Week -> Day -> Result)"
          >
            <Search size={11} color="var(--op-blue)" />
            <span>Trace Task</span>
          </button>

          <button
            className="btn btn-sm"
            style={{ fontSize: '0.68rem', padding: '3px 8px' }}
            onClick={() => openReportsModal(activeHorizon)}
            title="Generate Formal Multi-Horizon Decision Report"
          >
            <FileText size={11} />
            <span>Reports</span>
          </button>
        </div>
      </div>
    </div>
  );
}
