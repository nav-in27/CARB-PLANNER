import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Layers,
  Clock,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Filter,
  RefreshCw,
  Search,
  Zap,
  Tag,
  Link,
  Info,
  ChevronRight,
} from 'lucide-react';
import { useScenario } from '../context/ScenarioContext';

export default function MonthlyPlannerView() {
  const {
    monthlyPlan,
    optimizeMonthlyAction,
    runMonthlyLnsAction,
    approveMonthlyAction,
    isHorizonLoading,
    setActiveHorizon,
    setSelectedWeekNum,
    openTraceModal,
    checkDownstreamImpact,
  } = useScenario();

  const [selectedTaskId, setSelectedTaskId] = useState('ENG-014');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'timeline'
  const [reassignWeekTarget, setReassignWeekTarget] = useState(4);

  const plan = monthlyPlan || {
    monthly_plan_id: 'M-2026-09-v1',
    month_str: 'September 2026',
    status: 'APPROVED',
    tasks: [],
    weekly_capacities: [],
    joint_possessions: [],
    department_workloads: {},
  };

  const tasks = plan.tasks || [];
  const weeklyCapacities = plan.weekly_capacities || [
    { week_num: 1, date_range: 'Sep 01 – Sep 06', total_tasks: 3, total_possession_hours: 9.5, max_capacity_hours: 56.0, utilization_pct: 17.0 },
    { week_num: 2, date_range: 'Sep 07 – Sep 13', total_tasks: 3, total_possession_hours: 9.0, max_capacity_hours: 56.0, utilization_pct: 16.1 },
    { week_num: 3, date_range: 'Sep 14 – Sep 20', total_tasks: 5, total_possession_hours: 15.0, max_capacity_hours: 56.0, utilization_pct: 26.8 },
    { week_num: 4, date_range: 'Sep 21 – Sep 27', total_tasks: 2, total_possession_hours: 8.0, max_capacity_hours: 56.0, utilization_pct: 14.3 },
  ];

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const dept = t.department?.value || t.department;
      if (deptFilter !== 'ALL' && dept !== deptFilter) return false;
      return true;
    });
  }, [tasks, deptFilter]);

  const selectedTask = useMemo(() => {
    return (
      tasks.find((t) => t.task_id === selectedTaskId || t.alias === selectedTaskId) ||
      tasks[0] ||
      null
    );
  }, [tasks, selectedTaskId]);

  const handleDrillToWeek = (weekNum) => {
    setSelectedWeekNum(weekNum);
    setActiveHorizon('weekly');
  };

  const handleTestReassignment = (task) => {
    if (!task) return;
    const currentWeek = task.preferred_week || 3;
    const targetWeek = currentWeek === 3 ? 4 : 3;
    checkDownstreamImpact(task.task_id, targetWeek);
  };

  return (
    <div className="horizon-view-layout">
      {/* ── LEFT: Filters & Department Workloads ── */}
      <div className="horizon-panel">
        <div className="horizon-panel-header">
          <div className="horizon-panel-title">
            <Filter size={13} color="var(--op-blue)" />
            Department Workloads
          </div>
          <span className="badge badge-slate" style={{ fontSize: '0.65rem' }}>
            {tasks.length} Total
          </span>
        </div>
        <div className="horizon-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Department Filter Pills */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Filter Department
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {['ALL', 'ENG', 'TRD', 'SNT'].map((d) => (
                <button
                  key={d}
                  className={`btn btn-sm ${deptFilter === d ? 'btn-primary' : ''}`}
                  style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                  onClick={() => setDeptFilter(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Department Capacity Gauges */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Resource Utilization
            </div>

            {/* Engineering */}
            <div style={{ background: 'var(--dept-eng-bg)', border: '1px solid var(--dept-eng-border)', borderRadius: '6px', padding: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.76rem', color: 'var(--dept-eng)' }}>Engineering (P.Way)</span>
                <span className="badge badge-dept-eng" style={{ fontSize: '0.62rem' }}>7 Tasks</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Allocated: <strong>23.5 hrs</strong> / 80 hrs crew capacity
              </div>
              <div style={{ height: '4px', background: '#fed7aa', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '29.3%', background: 'var(--dept-eng)' }} />
              </div>
            </div>

            {/* TRD */}
            <div style={{ background: 'var(--dept-trd-bg)', border: '1px solid var(--dept-trd-border)', borderRadius: '6px', padding: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.76rem', color: 'var(--dept-trd)' }}>Traction Distribution</span>
                <span className="badge badge-dept-trd" style={{ fontSize: '0.62rem' }}>4 Tasks</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Allocated: <strong>12.0 hrs</strong> / 60 hrs tower car
              </div>
              <div style={{ height: '4px', background: '#bae6fd', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '20%', background: 'var(--dept-trd)' }} />
              </div>
            </div>

            {/* S&T */}
            <div style={{ background: 'var(--dept-snt-bg)', border: '1px solid var(--dept-snt-border)', borderRadius: '6px', padding: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.76rem', color: 'var(--dept-snt)' }}>Signal & Telecom</span>
                <span className="badge badge-dept-snt" style={{ fontSize: '0.62rem' }}>2 Tasks</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Allocated: <strong>6.0 hrs</strong> / 40 hrs testing team
              </div>
              <div style={{ height: '4px', background: '#c7d2fe', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '15%', background: 'var(--dept-snt)' }} />
              </div>
            </div>
          </div>

          {/* Joint Bundling Highlights */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Joint Possession Bundles
            </div>
            <div className="joint-possession-card" style={{ padding: '8px', margin: 0 }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--op-green)' }}>
                S01 MS-CGL (Week 3)
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                ENG-014 + TRD-009 co-located on Track 1. Saves 180 min track closure.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── CENTER: 4-Week Calendar & Capacity Matrix ── */}
      <div className="horizon-panel" style={{ flex: 1 }}>
        <div className="horizon-panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={15} color="var(--op-blue)" />
            <span style={{ fontWeight: 800, fontSize: '0.86rem' }}>
              {plan.month_str || 'September 2026'} — Monthly Strategy Matrix
            </span>
            <span className="badge badge-slate" style={{ fontSize: '0.68rem' }}>
              {plan.monthly_plan_id}
            </span>
          </div>

          {/* Top Solver Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              className="btn btn-sm btn-primary"
              style={{ fontSize: '0.72rem', padding: '4px 10px' }}
              onClick={optimizeMonthlyAction}
              disabled={isHorizonLoading}
            >
              <RefreshCw size={11} className={isHorizonLoading ? 'spin' : ''} />
              <span>Optimize Strategy</span>
            </button>

            <button
              className="btn btn-sm"
              style={{ fontSize: '0.72rem', padding: '4px 8px' }}
              onClick={() => runMonthlyLnsAction(10)}
              disabled={isHorizonLoading}
              title="Run 7-operator Large Neighborhood Search metaheuristic"
            >
              <Sparkles size={11} color="var(--op-amber)" />
              <span>LNS Metaheuristic</span>
            </button>

            <button
              className={`btn btn-sm ${plan.status === 'APPROVED' ? 'btn-success' : 'btn-primary'}`}
              style={{ fontSize: '0.72rem', padding: '4px 8px' }}
              onClick={() => approveMonthlyAction('APPROVED', 'Chief Engineer Approval')}
            >
              <ShieldCheck size={11} />
              <span>{plan.status === 'APPROVED' ? 'Approved ✓' : 'Approve'}</span>
            </button>
          </div>
        </div>

        {/* 4-Week Grid Content */}
        <div className="horizon-panel-body" style={{ background: '#f8fafc', padding: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', height: '100%' }}>
            {weeklyCapacities.map((w) => {
              const weekTasks = filteredTasks.filter((t) => (t.preferred_week || 3) === w.week_num);
              const isSelectedWeek = w.week_num === 3;

              return (
                <div
                  key={w.week_num}
                  style={{
                    background: '#ffffff',
                    border: `1px solid ${isSelectedWeek ? 'var(--op-blue)' : 'var(--border-subtle)'}`,
                    borderRadius: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: isSelectedWeek ? '0 0 0 1px var(--op-blue)' : 'none',
                  }}
                >
                  {/* Week Column Header */}
                  <div
                    style={{
                      padding: '8px 10px',
                      background: isSelectedWeek ? 'var(--op-blue-bg)' : '#fafafa',
                      borderBottom: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.8rem', color: isSelectedWeek ? 'var(--op-blue)' : 'var(--text-primary)' }}>
                        Week {w.week_num}
                      </span>
                      <span className="badge badge-slate" style={{ fontSize: '0.62rem' }}>
                        {weekTasks.length} Tasks
                      </span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {w.date_range}
                    </div>

                    {/* Capacity Indicator */}
                    <div style={{ marginTop: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                        <span>Capacity ({w.total_possession_hours}h)</span>
                        <span style={{ fontWeight: 700 }}>{w.utilization_pct}%</span>
                      </div>
                      <div style={{ height: '3px', background: 'var(--border-subtle)', borderRadius: '2px', marginTop: '2px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(w.utilization_pct, 100)}%`,
                            background: w.utilization_pct > 80 ? 'var(--op-red)' : w.utilization_pct > 50 ? 'var(--op-amber)' : 'var(--op-green)',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Task Cards in this Week */}
                  <div style={{ padding: '8px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {weekTasks.map((t) => {
                      const isSelected = selectedTask && (selectedTask.task_id === t.task_id || selectedTask.alias === t.task_id);
                      const dept = t.department?.value || t.department;
                      const hasBundle = t.is_joint_possession;

                      return (
                        <div
                          key={t.task_id}
                          onClick={() => setSelectedTaskId(t.task_id)}
                          style={{
                            border: `1px solid ${isSelected ? 'var(--op-blue)' : hasBundle ? 'var(--op-green-border)' : 'var(--border-subtle)'}`,
                            borderRadius: '5px',
                            padding: '8px',
                            background: isSelected ? 'var(--op-blue-bg)' : hasBundle ? 'var(--op-green-bg)' : '#ffffff',
                            cursor: 'pointer',
                            transition: 'all 0.1s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.76rem', color: 'var(--text-primary)' }}>
                              {t.task_id}
                            </span>
                            <span className={`badge ${dept === 'ENG' ? 'badge-dept-eng' : dept === 'TRD' ? 'badge-dept-trd' : 'badge-dept-snt'}`} style={{ fontSize: '0.62rem' }}>
                              {dept}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                            Sec: <strong>{t.section_id}</strong> • <strong>{t.predicted_p90_min || t.historical_duration_min}m</strong>
                          </div>

                          {hasBundle && (
                            <div style={{ marginTop: '4px' }}>
                              <span className="joint-possession-badge" style={{ fontSize: '0.62rem', padding: '1px 4px' }}>
                                <Link size={9} /> Bundled
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {weekTasks.length === 0 && (
                      <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        No tasks in this week
                      </div>
                    )}
                  </div>

                  {/* Drill-down button to Weekly View */}
                  <div style={{ padding: '6px 8px', borderTop: '1px solid var(--border-subtle)', background: '#fafafa' }}>
                    <button
                      className="btn btn-sm"
                      style={{ width: '100%', fontSize: '0.68rem', justifyContent: 'center' }}
                      onClick={() => handleDrillToWeek(w.week_num)}
                      title={`Open Week ${w.week_num} Possession Planning`}
                    >
                      <span>Drill to Week {w.week_num}</span>
                      <ArrowRight size={10} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Task Inspector & Explainability ("WHY THIS WEEK?") ── */}
      <div className="horizon-panel">
        <div className="horizon-panel-header">
          <div className="horizon-panel-title">
            <Info size={13} color="var(--op-blue)" />
            Task Decision Inspector
          </div>
          {selectedTask && (
            <span className="badge badge-slate" style={{ fontSize: '0.65rem' }}>
              {selectedTask.task_id}
            </span>
          )}
        </div>

        <div className="horizon-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {selectedTask ? (
            <>
              {/* Task Header */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {selectedTask.task_id}
                  </span>
                  {selectedTask.alias && (
                    <span className="badge badge-slate" style={{ fontSize: '0.65rem' }}>
                      {selectedTask.alias}
                    </span>
                  )}
                  <span className={`badge ${selectedTask.department === 'ENG' ? 'badge-dept-eng' : selectedTask.department === 'TRD' ? 'badge-dept-trd' : 'badge-dept-snt'}`}>
                    {selectedTask.department?.value || selectedTask.department}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
                  {selectedTask.task_type?.value || selectedTask.task_type || 'Track Renewal'}
                </div>
              </div>

              {/* Attributes Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#f8fafc', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Assigned Week</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--op-blue)' }}>
                    Week {selectedTask.preferred_week || 3}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Section</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                    {selectedTask.section_id}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Track Target</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                    {selectedTask.affected_track_id || 'Track 1'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>P90 Duration</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                    {selectedTask.predicted_p90_min || selectedTask.historical_duration_min} min
                  </div>
                </div>
              </div>

              {/* Explainability Section: WHY THIS WEEK? */}
              <div style={{ border: '1px solid var(--op-blue-border)', background: 'var(--op-blue-bg)', borderRadius: '6px', padding: '10px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--op-blue)', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Zap size={12} />
                  WHY THIS WEEK? (Optimization Decision)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {(selectedTask.why_this_week && selectedTask.why_this_week.length > 0
                    ? selectedTask.why_this_week
                    : [
                        `High asset priority on section ${selectedTask.section_id}`,
                        `Department crew & machinery allocated in Week ${selectedTask.preferred_week || 3}`,
                        `Week capacity utilization within safe operating limits`,
                      ]
                  ).map((reason, idx) => (
                    <div key={idx} style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: '4px' }}>
                      <span style={{ color: 'var(--op-blue)', fontWeight: 800 }}>✓</span>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cascading Impact Simulator */}
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px', background: '#ffffff' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Simulate Week Reassignment
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Test cascading downstream impact before committing changes across lower tiers.
                </div>
                <button
                  className="btn btn-sm"
                  style={{ width: '100%', justifyContent: 'center', fontSize: '0.72rem' }}
                  onClick={() => handleTestReassignment(selectedTask)}
                >
                  <AlertTriangle size={12} color="var(--op-amber)" />
                  <span>Check Downstream Impact</span>
                </button>
              </div>

              {/* Trace Across Horizons */}
              <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                <button
                  className="btn btn-sm btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => openTraceModal(selectedTask.task_id)}
                >
                  <Search size={12} />
                  <span>Trace Task Across Horizons ➔</span>
                </button>
              </div>
            </>
          ) : (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select a task from any week to inspect optimization reasons.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
