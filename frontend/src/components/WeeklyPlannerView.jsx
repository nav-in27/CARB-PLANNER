import React, { useState, useMemo } from 'react';
import {
  Layers,
  Calendar,
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
  Train,
  Check,
} from 'lucide-react';
import { useScenario } from '../context/ScenarioContext';

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export default function WeeklyPlannerView() {
  const {
    weeklyPlan,
    selectedWeekNum,
    setSelectedWeekNum,
    optimizeWeeklyAction,
    runWeeklyLnsAction,
    approveWeeklyAction,
    isHorizonLoading,
    setActiveHorizon,
    openTraceModal,
    checkDownstreamImpact,
  } = useScenario();

  const [selectedTaskId, setSelectedTaskId] = useState('ENG-014');
  const [selectedDayFilter, setSelectedDayFilter] = useState('ALL');

  const plan = weeklyPlan || {
    weekly_plan_id: `W-2026-09-W${selectedWeekNum}-v1`,
    week_number: selectedWeekNum,
    date_range: 'Sep 14 – Sep 20, 2026',
    status: 'APPROVED',
    tasks: [],
    conflicts: [],
    joint_possessions: [],
    train_impacts: {},
  };

  const tasks = plan.tasks || [];
  const conflicts = plan.conflicts || [];

  const selectedTask = useMemo(() => {
    return (
      tasks.find((t) => t.task_id === selectedTaskId || t.alias === selectedTaskId) ||
      tasks[0] ||
      null
    );
  }, [tasks, selectedTaskId]);

  const handleDrillToDay = (dayName) => {
    setActiveHorizon('daily');
  };

  const handleTestDayReassign = (task) => {
    if (!task) return;
    const currDay = task.planned_day || 'Wednesday';
    const targetDay = currDay === 'Wednesday' ? 'Thursday' : 'Wednesday';
    checkDownstreamImpact(task.task_id, null, targetDay);
  };

  return (
    <div className="horizon-view-layout">
      {/* ── LEFT: Week Selection & Section Infrastructure ── */}
      <div className="horizon-panel">
        <div className="horizon-panel-header">
          <div className="horizon-panel-title">
            <Layers size={13} color="var(--dept-eng)" />
            Week & Sections
          </div>
          <span className="badge badge-slate" style={{ fontSize: '0.65rem' }}>
            Week {selectedWeekNum}
          </span>
        </div>
        <div className="horizon-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Week Selector Tabs */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Select Planning Week
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
              {[1, 2, 3, 4].map((w) => (
                <button
                  key={w}
                  className={`btn btn-sm ${selectedWeekNum === w ? 'btn-primary' : ''}`}
                  style={{ fontSize: '0.72rem', padding: '4px 0', justifyContent: 'center' }}
                  onClick={() => setSelectedWeekNum(w)}
                >
                  W{w}
                </button>
              ))}
            </div>
          </div>

          {/* Section Summary */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Corridor Sections in Week {selectedWeekNum}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { sec: 'S01', name: 'MS - CGL', tracks: '2 Tracks (Double)', blocks: 2, status: 'Active' },
                { sec: 'S02', name: 'CGL - TMV', tracks: '2 Tracks (Double)', blocks: 1, status: 'Active' },
                { sec: 'S03', name: 'TMV - MLMR', tracks: '2 Tracks (Double)', blocks: 1, status: 'Active' },
                { sec: 'S04', name: 'MLMR - VM', tracks: '1 Track (Bottleneck)', blocks: 1, status: 'Active' },
              ].map((s) => (
                <div
                  key={s.sec}
                  style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '5px',
                    padding: '6px 8px',
                    background: '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.76rem' }}>
                      {s.sec} ({s.name})
                    </span>
                    <span className="badge badge-slate" style={{ fontSize: '0.62rem' }}>
                      {s.blocks} Possessions
                    </span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {s.tracks}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Conflict Summary Box */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Weekly Conflict Status
            </div>
            {conflicts.length > 0 ? (
              <div style={{ background: 'var(--op-red-bg)', border: '1px solid var(--op-red-border)', borderRadius: '6px', padding: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.74rem', color: 'var(--op-red)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={12} />
                  <span>{conflicts.length} Conflict(s) Detected</span>
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                  {conflicts[0]?.reason}
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--op-green-bg)', border: '1px solid var(--op-green-border)', borderRadius: '6px', padding: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={14} color="var(--op-green)" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.74rem', color: 'var(--op-green)' }}>
                    0 Weekly Conflicts
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                    All possessions timetable-compatible
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CENTER: Mon–Sun Time-Space Possession Grid ── */}
      <div className="horizon-panel" style={{ flex: 1 }}>
        <div className="horizon-panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={15} color="var(--dept-eng)" />
            <span style={{ fontWeight: 800, fontSize: '0.86rem' }}>
              Week {selectedWeekNum} Possession Schedule ({plan.date_range || 'Sep 14 – Sep 20, 2026'})
            </span>
            <span className="badge badge-slate" style={{ fontSize: '0.68rem' }}>
              {plan.weekly_plan_id}
            </span>
          </div>

          {/* Top Solver Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              className="btn btn-sm btn-primary"
              style={{ fontSize: '0.72rem', padding: '4px 10px' }}
              onClick={() => optimizeWeeklyAction(selectedWeekNum)}
              disabled={isHorizonLoading}
            >
              <RefreshCw size={11} className={isHorizonLoading ? 'spin' : ''} />
              <span>Optimize Week</span>
            </button>

            <button
              className="btn btn-sm"
              style={{ fontSize: '0.72rem', padding: '4px 8px' }}
              onClick={() => runWeeklyLnsAction(selectedWeekNum, 10)}
              disabled={isHorizonLoading}
              title="Run 6-operator Large Neighborhood Search metaheuristic"
            >
              <Sparkles size={11} color="var(--op-amber)" />
              <span>LNS Metaheuristic</span>
            </button>

            <button
              className={`btn btn-sm ${plan.status === 'APPROVED' ? 'btn-success' : 'btn-primary'}`}
              style={{ fontSize: '0.72rem', padding: '4px 8px' }}
              onClick={() => approveWeeklyAction(selectedWeekNum, 'APPROVED', 'DRM Approval')}
            >
              <ShieldCheck size={11} />
              <span>{plan.status === 'APPROVED' ? 'Approved ✓' : 'Approve'}</span>
            </button>
          </div>
        </div>

        {/* Mon–Sun Grid */}
        <div className="horizon-panel-body" style={{ background: '#f8fafc', padding: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', height: '100%' }}>
            {DAYS_OF_WEEK.map((dayName) => {
              const dayTasks = tasks.filter((t) => (t.planned_day || 'Wednesday') === dayName);
              const isTargetDay = dayName === 'Wednesday';

              return (
                <div
                  key={dayName}
                  style={{
                    background: '#ffffff',
                    border: `1px solid ${isTargetDay ? 'var(--op-blue)' : 'var(--border-subtle)'}`,
                    borderRadius: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: isTargetDay ? '0 0 0 1px var(--op-blue)' : 'none',
                  }}
                >
                  {/* Day Column Header */}
                  <div
                    style={{
                      padding: '8px',
                      background: isTargetDay ? 'var(--op-blue-bg)' : '#fafafa',
                      borderBottom: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.76rem', color: isTargetDay ? 'var(--op-blue)' : 'var(--text-primary)' }}>
                        {dayName.slice(0, 3)}
                      </span>
                      <span className="badge badge-slate" style={{ fontSize: '0.6rem' }}>
                        {dayTasks.length}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                      {isTargetDay ? 'Sep 16 (Wed)' : ''}
                    </div>
                  </div>

                  {/* Day Tasks Container */}
                  <div style={{ padding: '6px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {dayTasks.map((t) => {
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
                            padding: '6px',
                            background: isSelected ? 'var(--op-blue-bg)' : hasBundle ? 'var(--op-green-bg)' : '#ffffff',
                            cursor: 'pointer',
                            transition: 'all 0.1s ease',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.74rem' }}>
                              {t.task_id}
                            </span>
                            <span className={`badge ${dept === 'ENG' ? 'badge-dept-eng' : dept === 'TRD' ? 'badge-dept-trd' : 'badge-dept-snt'}`} style={{ fontSize: '0.6rem' }}>
                              {dept}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {t.planned_window || '08:00–12:00'}
                          </div>

                          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                            Sec: {t.section_id} ({t.affected_track_id || 'Track 1'})
                          </div>

                          {hasBundle && (
                            <div style={{ marginTop: '3px' }}>
                              <span className="joint-possession-badge" style={{ fontSize: '0.6rem', padding: '1px 3px' }}>
                                <Link size={8} /> Joint Block
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {dayTasks.length === 0 && (
                      <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        No blocks
                      </div>
                    )}
                  </div>

                  {/* Drill-down button on days with tasks */}
                  {dayTasks.length > 0 && (
                    <div style={{ padding: '4px 6px', borderTop: '1px solid var(--border-subtle)', background: '#fafafa' }}>
                      <button
                        className="btn btn-sm"
                        style={{ width: '100%', fontSize: '0.64rem', justifyContent: 'center', padding: '3px 4px' }}
                        onClick={() => handleDrillToDay(dayName)}
                        title={`Drill to ${dayName} 24h Operational Schedule`}
                      >
                        <span>24h View</span>
                        <ArrowRight size={9} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Task Inspector & Explainability ("WHY THIS DAY?") ── */}
      <div className="horizon-panel">
        <div className="horizon-panel-header">
          <div className="horizon-panel-title">
            <Info size={13} color="var(--dept-eng)" />
            Possession Inspector
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
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Assigned Day</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--dept-eng)' }}>
                    {selectedTask.planned_day || 'Wednesday'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Window</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                    {selectedTask.planned_window || '08:00–12:00'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Target Section</div>
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
              </div>

              {/* Explainability Section: WHY THIS DAY? */}
              <div style={{ border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: '6px', padding: '10px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--dept-eng)', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Zap size={12} />
                  WHY THIS DAY? (Timetable Reason)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {(selectedTask.why_this_day && selectedTask.why_this_day.length > 0
                    ? selectedTask.why_this_day
                    : [
                        `Lower passenger train density on ${selectedTask.planned_day || 'Wednesday'} morning`,
                        `Dedicated crew & machine available without conflict`,
                        `Loop line available for passenger train regulation`,
                      ]
                  ).map((reason, idx) => (
                    <div key={idx} style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: '4px' }}>
                      <span style={{ color: 'var(--dept-eng)', fontWeight: 800 }}>✓</span>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Downstream Day Reassignment Test */}
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px', background: '#ffffff' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Test Day Reassignment
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Simulates moving this possession to another day to evaluate 24h operational conflicts.
                </div>
                <button
                  className="btn btn-sm"
                  style={{ width: '100%', justifyContent: 'center', fontSize: '0.72rem' }}
                  onClick={() => handleTestDayReassign(selectedTask)}
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
              Select a possession from any day to inspect timetable reasons.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
