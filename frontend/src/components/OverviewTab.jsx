import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Activity,
  Calendar,
  Layers,
  ChevronRight,
  Info,
  Train,
  Wrench,
  Search,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import {
  CORRIDOR_SECTIONS,
  HORIZON_CONFIGS,
} from '../data/corridorData';
import { useScenario } from '../context/ScenarioContext';
import {
  fetchTimetable,
  fetchConflicts,
  fetchLoopUtilization,
} from '../api';

export default function OverviewTab({
  plan: propPlan,
  tasks: propTasks,
  trains: propTrains,
  onNavigateTab,
  onOpenTaskDetail,
}) {
  const {
    scenario,
    corridor,
    tasks: scenarioTasks,
    trains: scenarioTrains,
    trainAssignments,
    conflicts,
    loopUtilization,
    selectEntity,
    versionNumber,
    planDiff,
  } = useScenario();

  const [selectedHorizon, setSelectedHorizon] = useState('24h');
  const [trainSearchQuery, setTrainSearchQuery] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');

  const [liveStats, setLiveStats] = useState({
    trainCount: 23,
    realCount: 17,
    simCount: 6,
    conflicts: 0,
    loopsTotal: 13,
    loopsUsed: 0,
  });

  useEffect(() => {
    Promise.allSettled([
      fetchTimetable(),
      fetchConflicts(),
      fetchLoopUtilization(),
    ]).then(([tt, conf, loop]) => {
      setLiveStats({
        trainCount: tt.status === 'fulfilled' ? tt.value.total_services : (scenarioTrains?.length || 23),
        realCount: tt.status === 'fulfilled' ? tt.value.real_services : 17,
        simCount: tt.status === 'fulfilled' ? tt.value.simulated_services : 6,
        conflicts: conf.status === 'fulfilled' ? conf.value.total_conflicts : (conflicts?.length || 0),
        loopsTotal: loop.status === 'fulfilled' ? loop.value.total_loops : 13,
        loopsUsed: loop.status === 'fulfilled' ? loop.value.loops_used : (loopUtilization?.length || 0),
      });
    });
  }, [scenarioTrains, conflicts, loopUtilization]);

  const horizon = HORIZON_CONFIGS[selectedHorizon] || HORIZON_CONFIGS['24h'];

  // Convert minutes into percentage based on active horizon
  const minuteToPct = (min) => {
    let normalized = min;
    if (selectedHorizon === '24h') {
      if (normalized > 1440) normalized = normalized % 1440;
    }
    const span = horizon.endMin - horizon.startMin;
    const offset = normalized - horizon.startMin;
    return Math.max(0, Math.min(100, (offset / span) * 100));
  };

  const formatTime = (min) => {
    if (min == null) return '--:--';
    let m = min % 1440;
    if (m < 0) m += 1440;
    const h = Math.floor(m / 60);
    const minute = m % 60;
    return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  // Canonical Tasks
  const activeTasks = useMemo(() => {
    const raw = (scenarioTasks && scenarioTasks.length > 0) ? scenarioTasks : (propTasks || []);
    return raw.map((t) => ({
      taskId: t.task_id || t.taskId,
      shortTitle: t.work_type || t.short_title || t.title,
      title: t.title || t.short_title || t.work_type,
      dept: t.department || t.dept || 'Engineering',
      sectionId: t.section_id || t.sectionId || '',
      startMin: t.start_min != null ? t.start_min : (t.startMin != null ? t.startMin : (t.allocated_start_slot != null ? t.allocated_start_slot * 15 : 360)),
      endMin: t.end_min != null ? t.end_min : (t.endMin != null ? t.endMin : (t.allocated_end_slot != null ? t.allocated_end_slot * 15 : 450)),
      criticality: t.criticality || 'Medium',
      isNight: t.is_night ?? ((t.start_min != null ? t.start_min : (t.allocated_start_slot != null ? t.allocated_start_slot * 15 : 360)) < 360 || (t.start_min != null ? t.start_min : (t.allocated_start_slot != null ? t.allocated_start_slot * 15 : 360)) >= 1320),
      durationMin: t.predicted_p90_min || t.historical_duration_min || 90,
      status: t.status || 'SCHEDULED',
    }));
  }, [scenarioTasks, propTasks]);

  // Canonical Trains
  const activeTrains = useMemo(() => {
    const raw = (scenarioTrains && scenarioTrains.length > 0) ? scenarioTrains : (propTrains || []);
    return raw.map((tr) => {
      const trainId = tr.train_id || tr.id;
      const assignment = trainAssignments?.find((a) => (a.train_id || a.train_number) === (tr.train_number || trainId));
      const departure = tr.scheduled_departure_min ?? tr.departure_time_min ?? (tr.startMin || 360);
      const arrival = tr.scheduled_arrival_min ?? tr.arrival_time_min ?? (tr.endMin || 420);

      return {
        id: trainId,
        number: tr.train_number || trainId,
        name: tr.train_name || tr.name || trainId,
        sectionId: tr.section_id || tr.sectionId || 'S01',
        category: tr.category || tr.train_type || tr.type || 'Express',
        direction: tr.direction || 'DOWN',
        startMin: departure,
        endMin: arrival,
        delayMin: assignment?.delay_minutes ?? assignment?.delay_min ?? tr.delay_minutes ?? 0,
        loopsUsed: assignment?.loop_reservations || assignment?.allocated_loops || [],
        priority: tr.priority || (tr.category === 'VANDE_BHARAT' ? 1 : 2),
      };
    });
  }, [scenarioTrains, propTrains, trainAssignments]);

  const isVisibleInHorizon = (startMin, endMin) => {
    if (selectedHorizon === '24h') return true;
    return !(endMin < horizon.startMin || startMin > horizon.endMin);
  };

  const visibleTasks = useMemo(() => {
    return activeTasks.filter((t) => isVisibleInHorizon(t.startMin, t.endMin));
  }, [activeTasks, selectedHorizon, horizon]);

  // Department Summaries
  const deptBreakdown = useMemo(() => {
    const depts = {
      'Engineering': { name: 'Engineering (P.Way)', count: 0, totalDurationMin: 0, criticalCount: 0, class: 'dept-eng', tasks: [] },
      'Traction Distribution': { name: 'Traction Distribution (TRD/OHE)', count: 0, totalDurationMin: 0, criticalCount: 0, class: 'dept-trd', tasks: [] },
      'Signal & Telecom': { name: 'Signal & Telecom (S&T)', count: 0, totalDurationMin: 0, criticalCount: 0, class: 'dept-snt', tasks: [] },
    };

    activeTasks.forEach((t) => {
      let key = 'Engineering';
      if (t.dept.includes('Traction') || t.dept === 'TRD') key = 'Traction Distribution';
      else if (t.dept.includes('Signal') || t.dept === 'S&T') key = 'Signal & Telecom';

      if (depts[key]) {
        depts[key].count += 1;
        depts[key].totalDurationMin += t.durationMin;
        if (t.criticality === 'High' || t.criticality === 'Critical') {
          depts[key].criticalCount += 1;
        }
        depts[key].tasks.push(t);
      }
    });

    return Object.values(depts);
  }, [activeTasks]);

  // Filtered Trains
  const filteredTrains = useMemo(() => {
    return activeTrains.filter((tr) => {
      const q = trainSearchQuery.toLowerCase();
      const matchQuery = !q || tr.number.toLowerCase().includes(q) || tr.name.toLowerCase().includes(q) || tr.category.toLowerCase().includes(q);
      return matchQuery;
    });
  }, [activeTrains, trainSearchQuery]);

  const effectivePlan = scenario?.operational_plan || propPlan || {};
  const kpis = effectivePlan?.kpis || scenario?.kpis || {};

  return (
    <div className="workspace-body">
      {/* Page Header */}
      <div className="page-title-row">
        <div>
          <h2>Operations Overview • Tamil Nadu Grand South Trunk Corridor [742 km]</h2>
          <p>Southern Railway (SR) • Chennai Egmore (MS) ↔ Kanniyakumari (CAPE) via Trichy & Madurai</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginRight: '0.5rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Horizon:</span>
            <button
              className={`btn btn-sm ${selectedHorizon === '24h' ? 'btn-primary' : ''}`}
              onClick={() => setSelectedHorizon('24h')}
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
            >
              24h Full
            </button>
            <button
              className={`btn btn-sm ${selectedHorizon === '16h' ? 'btn-primary' : ''}`}
              onClick={() => setSelectedHorizon('16h')}
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
            >
              16h Day
            </button>
          </div>

          <button
            className="btn btn-sm btn-primary"
            onClick={() => onNavigateTab('planner')}
          >
            <Calendar size={13} />
            <span>Open Block Planner</span>
          </button>
        </div>
      </div>

      {/* Compact Status Row */}
      <div className="status-strip">
        <div className="status-strip-item">
          <span className="status-strip-label">Planning Horizon</span>
          <span className="status-strip-val" style={{ color: 'var(--op-blue)' }}>
            {horizon.hours[0]}–{horizon.hours[horizon.hours.length - 1]} ({selectedHorizon.toUpperCase()})
          </span>
        </div>
        <div className="status-strip-item">
          <span className="status-strip-label">Corridor Route</span>
          <span className="status-strip-val">MS ↔ CAPE (742 km)</span>
        </div>
        <div className="status-strip-item">
          <span className="status-strip-label">Allocated Blocks</span>
          <span className="status-strip-val" style={{ color: 'var(--op-green)' }}>
            {visibleTasks.length} Blocks ({selectedHorizon === '24h' ? 'Day + Night' : 'Daytime'})
          </span>
        </div>
        <div className="status-strip-item">
          <span className="status-strip-label">Single Line Bottleneck</span>
          <span className="status-strip-val" style={{ color: 'var(--op-amber)' }}>
            VRI–ALU (54 km, S04)
          </span>
        </div>
        <div className="status-strip-item">
          <span className="status-strip-label">Plan Version</span>
          <span className="status-strip-val" style={{ color: 'var(--op-blue)', fontWeight: 800 }}>
            v{versionNumber || 1} ({effectivePlan?.solver_status || 'OPTIMAL'})
          </span>
        </div>
        <div className="status-strip-item">
          <span className="status-strip-label">Last Change</span>
          <span className="status-strip-val" style={{ color: planDiff?.has_changes ? '#b45309' : 'var(--text-primary)' }}>
            {planDiff?.trigger ? planDiff.trigger.slice(0, 22) : 'Baseline Plan'}
          </span>
        </div>
        <div className="status-strip-item">
          <span className="status-strip-label">Replanning Status</span>
          <span className="status-strip-val" style={{ color: 'var(--op-green)', fontWeight: 700 }}>
            {scenario?.approval_status || 'COMMITTED'}
          </span>
        </div>
      </div>

      {/* Replanning Notification Banner */}
      {planDiff && planDiff.has_changes && (
        <div
          style={{
            background: 'linear-gradient(90deg, #eff6ff 0%, #f0fdf4 100%)',
            border: '1.5px solid #3b82f6',
            borderRadius: '6px',
            padding: '0.65rem 1rem',
            marginBottom: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.74rem',
            boxShadow: '0 2px 6px rgba(59, 130, 246, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className="badge badge-blue" style={{ fontWeight: 800 }}>
              PLAN VERSION v{versionNumber}
            </span>
            <span>
              Last Change: <strong>{planDiff.trigger || 'Critical Track Defect'}</strong>
              {planDiff.affected_section && <span> ({planDiff.affected_section})</span>} • Affected: <strong>{planDiff.changed_trains?.length || 0} Trains</strong>, <strong>{planDiff.changed_maintenance?.length || 0} Maintenance Tasks</strong> • Status: <strong style={{ color: 'var(--op-green)' }}>COMMITTED</strong>
            </span>
          </div>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => onNavigateTab('planner')}
            style={{ fontSize: '0.7rem' }}
          >
            Open Updated Block Plan
          </button>
        </div>
      )}

      {/* Operational KPI Strip */}
      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-cell-label">Asset Availability</div>
          <div className="kpi-cell-val" style={{ color: 'var(--op-green)' }}>
            {kpis?.asset_availability_pct != null ? `${kpis.asset_availability_pct}%` : '95.8%'}
          </div>
          <div className="kpi-cell-meta">Target: ≥ 90.0%</div>
        </div>

        <div className="kpi-cell">
          <div className="kpi-cell-label">Maintenance Completion</div>
          <div className="kpi-cell-val">
            {kpis?.maintenance_completion_pct != null ? `${kpis.maintenance_completion_pct}%` : '100%'}
          </div>
          <div className="kpi-cell-meta">{activeTasks.length} of {activeTasks.length} tasks</div>
        </div>

        <div className="kpi-cell">
          <div className="kpi-cell-label">Corridor Train Movements</div>
          <div className="kpi-cell-val" style={{ color: 'var(--op-blue)' }}>
            {liveStats.trainCount} Services
          </div>
          <div className="kpi-cell-meta">{liveStats.realCount} Verified Public, {liveStats.simCount} Sim</div>
        </div>

        <div className="kpi-cell">
          <div className="kpi-cell-label">Crossing Loop Allocation</div>
          <div className="kpi-cell-val" style={{ color: 'var(--op-green)' }}>
            {liveStats.loopsUsed} of {liveStats.loopsTotal} Loops
          </div>
          <div className="kpi-cell-meta">Dynamic CSR separation</div>
        </div>

        <div className="kpi-cell">
          <div className="kpi-cell-label">Night Shadow Possessions</div>
          <div className="kpi-cell-val" style={{ color: 'var(--op-blue)' }}>
            {activeTasks.filter(t => t.isNight).length} Slots
          </div>
          <div className="kpi-cell-meta">00:30–04:30 shadow windows</div>
        </div>

        <div className="kpi-cell">
          <div className="kpi-cell-label">Solver Execution</div>
          <div className="kpi-cell-val">
            {effectivePlan?.solve_time_sec ? `${effectivePlan.solve_time_sec}s` : '0.04s'}
          </div>
          <div className="kpi-cell-meta">OR-Tools CP-SAT</div>
        </div>
      </div>

      {/* Main Visual: Current Block Plan */}
      <div className="panel" style={{ padding: '0.85rem' }}>
        <div className="panel-header" style={{ marginBottom: '0.65rem' }}>
          <div className="panel-title">
            <Activity size={15} color="var(--op-blue)" />
            <span>Southern Railway Corridor Block Plan</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
              {corridor ? `${corridor.name} (${corridor.origin_code} ↔ ${corridor.destination_code}, ${corridor.total_distance_km || 742} km)` : 'Chennai Egmore (MS) to Kanniyakumari (CAPE) [742 km]'} • {horizon.badgeText}
            </span>
          </div>

          {/* Operational Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.7rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '10px', height: '10px', background: 'var(--dept-eng)', borderRadius: '2px' }} />
              <span>Engineering (P.Way)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '10px', height: '10px', background: 'var(--dept-trd)', borderRadius: '2px' }} />
              <span>TRD / OHE</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '10px', height: '10px', background: 'var(--dept-snt)', borderRadius: '2px' }} />
              <span>Signal & Telecom</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '14px', height: '3px', background: '#dc2626' }} />
              <span>Express Movement</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '14px', height: '3px', background: '#0284c7' }} />
              <span>Vande Bharat / Tejas</span>
            </div>
          </div>
        </div>

        {/* Timeline Visualization Table */}
        <div className="timeline-container">
          {/* Header with Dynamic Hours & Sticky Column */}
          <div className="timeline-header">
            <div className="timeline-header-label">
              Operational Flow / Track
            </div>
            <div className="timeline-canvas">
              {horizon.hours.map((hr, idx) => {
                const pct = (idx / (horizon.hours.length - 1)) * 100;
                let transform = 'translateX(-50%)';
                if (idx === 0) transform = 'translateX(0%)';
                else if (idx === horizon.hours.length - 1) transform = 'translateX(-100%)';

                return (
                  <div
                    key={`${hr}-${idx}`}
                    style={{
                      position: 'absolute',
                      left: `${pct}%`,
                      transform,
                      fontSize: '0.68rem',
                      color: 'var(--text-muted)',
                      lineHeight: '32px',
                      fontWeight: 700,
                      padding: '0 4px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {hr}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Row 1: Corridor Train Movements */}
          <div className="timeline-row">
            <div className="timeline-label">
              <span>Train Movements</span>
              <span className="badge badge-slate" style={{ fontSize: '0.58rem', marginTop: '0.15rem' }}>SR Corridor</span>
            </div>
            <div className="timeline-canvas">
              {horizon.hours.map((hr, idx) => (
                <div
                  key={hr}
                  className="timeline-hour-line"
                  style={{ left: `${(idx / (horizon.hours.length - 1)) * 100}%` }}
                />
              ))}

              {/* Corridor Express & Passenger movements */}
              {activeTrains.filter((t) => isVisibleInHorizon(t.startMin, t.endMin)).map((t) => {
                const left = minuteToPct(t.startMin);
                const right = minuteToPct(t.endMin);
                const width = Math.max(2, right - left);

                let color = '#dc2626';
                if (t.category === 'VANDE_BHARAT' || t.category === 'TEJAS') color = '#0284c7';
                else if (t.category === 'PASSENGER') color = '#16a34a';
                else if (t.category === 'FREIGHT') color = '#9333ea';

                return (
                  <div
                    key={t.id}
                    className="timeline-bar timeline-bar-train"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: color,
                      cursor: 'pointer',
                    }}
                    onClick={() => selectEntity('train', t.id, t)}
                    title={`${t.number} - ${t.name} (${formatTime(t.startMin)}–${formatTime(t.endMin)})`}
                  />
                );
              })}
            </div>
          </div>

          {/* Sections Overview Rows */}
          {CORRIDOR_SECTIONS.map((sec) => {
            const secTasks = visibleTasks.filter((t) =>
              t.sectionId === sec.id ||
              t.sectionId === sec.sectionId ||
              t.sectionId === sec.code
            );

            return (
              <div key={sec.id} className="timeline-row">
                <div
                  className="timeline-label"
                  style={{
                    background: sec.bottleneck ? '#fffbeb' : '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', width: '100%', justifyContent: 'space-between' }}>
                    <span style={{ color: sec.bottleneck ? '#b45309' : 'inherit', fontWeight: 700 }}>
                      {sec.name}
                    </span>
                    {sec.bottleneck && (
                      <span className="badge badge-amber" style={{ fontSize: '0.58rem', padding: '0.1rem 0.35rem' }}>
                        BOTTLENECK
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    {sec.sectionId} • {sec.lengthKm} km • {sec.type}
                  </span>
                </div>
                <div className="timeline-canvas">
                  {horizon.hours.map((hr, idx) => (
                    <div
                      key={hr}
                      className="timeline-hour-line"
                      style={{ left: `${(idx / (horizon.hours.length - 1)) * 100}%` }}
                    />
                  ))}

                  {secTasks.map((task) => {
                    const left = minuteToPct(task.startMin);
                    const right = minuteToPct(task.endMin);
                    const width = Math.max(4, right - left);

                    let deptClass = 'timeline-bar-eng';
                    if (task.dept.includes('Traction') || task.dept === 'TRD') deptClass = 'timeline-bar-trd';
                    if (task.dept.includes('Signal') || task.dept === 'S&T') deptClass = 'timeline-bar-snt';

                    return (
                      <div
                        key={task.taskId}
                        className={`timeline-bar ${deptClass}`}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          minWidth: '46px',
                          border: task.isNight ? '1px dashed #fff' : undefined,
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          selectEntity('task', task.taskId, task);
                          if (onOpenTaskDetail) onOpenTaskDetail(task.taskId);
                        }}
                        title={`${task.taskId}: ${task.title} (${formatTime(task.startMin)}–${formatTime(task.endMin)})`}
                      >
                        <span style={{ fontWeight: 700, flexShrink: 0 }}>{task.taskId}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, opacity: 0.95 }}>
                          {task.shortTitle || task.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two-Column Grid: Department Breakdown & Train Schedule */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
        {/* Left: Department Operations Table */}
        <div className="panel" style={{ padding: '0.85rem' }}>
          <div className="panel-header" style={{ marginBottom: '0.65rem' }}>
            <div className="panel-title">
              <Wrench size={15} color="var(--dept-eng)" />
              <span>Department Maintenance Operations</span>
            </div>
            <span className="badge badge-slate" style={{ fontSize: '0.68rem' }}>
              {activeTasks.length} Total Blocks
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.75rem' }}>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Blocks</th>
                  <th>Total Time</th>
                  <th>Critical Tasks</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {deptBreakdown.map((d) => (
                  <tr key={d.name}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td>
                      <span className="badge badge-slate">{d.count} blocks</span>
                    </td>
                    <td>{Math.round(d.totalDurationMin / 60)} hrs ({d.totalDurationMin} min)</td>
                    <td>
                      {d.criticalCount > 0 ? (
                        <span className="badge badge-amber">{d.criticalCount} high priority</span>
                      ) : (
                        <span className="badge badge-green">Standard</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm"
                        onClick={() => onNavigateTab('queue')}
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}
                      >
                        View Queue
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Live Train Operations Table */}
        <div className="panel" style={{ padding: '0.85rem' }}>
          <div className="panel-header" style={{ marginBottom: '0.65rem' }}>
            <div className="panel-title">
              <Train size={15} color="var(--op-blue)" />
              <span>Active Train Services ({filteredTrains.length})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: '6px', top: '7px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter train # or name..."
                  value={trainSearchQuery}
                  onChange={(e) => setTrainSearchQuery(e.target.value)}
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.2rem 0.5rem 0.2rem 1.4rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    width: '150px',
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '280px' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th>Train #</th>
                  <th>Service Name</th>
                  <th>Dir</th>
                  <th>Sched Departure</th>
                  <th>Planned Delay</th>
                  <th>Loop Holding</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrains.map((tr) => (
                  <tr
                    key={tr.id}
                    onClick={() => selectEntity('train', tr.id, tr)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 700, color: 'var(--op-blue)' }}>{tr.number}</td>
                    <td style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tr.name}>
                      {tr.name}
                    </td>
                    <td>
                      <span className={`badge ${tr.direction === 'DOWN' ? 'badge-blue' : 'badge-slate'}`} style={{ fontSize: '0.62rem' }}>
                        {tr.direction}
                      </span>
                    </td>
                    <td>{formatTime(tr.startMin)}</td>
                    <td>
                      {tr.delayMin > 0 ? (
                        <span className="badge badge-amber" style={{ fontSize: '0.62rem' }}>+{tr.delayMin}m</span>
                      ) : (
                        <span className="badge badge-green" style={{ fontSize: '0.62rem' }}>On Time</span>
                      )}
                    </td>
                    <td>
                      {tr.loopsUsed && tr.loopsUsed.length > 0 ? (
                        <span className="badge badge-amber" style={{ fontSize: '0.62rem' }}>
                          Held @ {tr.loopsUsed[0].station_code || tr.loopsUsed[0].loop_id || 'Loop'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Mainline</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
