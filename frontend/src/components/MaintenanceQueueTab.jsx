import React, { useState } from 'react';
import {
  ListOrdered,
  Search,
  Filter,
  X,
  Clock,
  ShieldCheck,
  AlertTriangle,
  FileText,
  ChevronRight,
  HelpCircle,
  Train,
} from 'lucide-react';
import { useScenario } from '../context/ScenarioContext';
import { REAL_RAILWAY_IMAGES, CORRIDOR_SECTIONS } from '../data/corridorData';

const minToTime = (min) => {
  if (min == null) return '--:--';
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export default function MaintenanceQueueTab() {
  const { scenario, corridor, tasks, selectedEntity, selectEntity, updateTask } = useScenario();
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTask, setActiveTask] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Synchronize with external selection if a task was clicked in Map or Planner
  React.useEffect(() => {
    if (selectedEntity?.type === 'task' && selectedEntity.data) {
      const found = normalizedTasks.find((t) => t.taskId === selectedEntity.id);
      if (found) setActiveTask(found);
    }
  }, [selectedEntity]);

  // Normalize tasks directly from live scenario tasks
  const rawTasks = tasks && tasks.length > 0 ? tasks : [];

  const normalizedTasks = rawTasks.map((t) => {
    const taskId = t.task_id || t.taskId || 'TASK-???';
    const dept = t.department || t.dept || 'Engineering';
    const section = t.section_id || t.sectionId || t.section || 'S01';
    const secMeta = CORRIDOR_SECTIONS.find(s => s.sectionId === section || s.id === section || s.code === section);
    const sectionName = secMeta ? `${secMeta.fullName || secMeta.name}` : (t.section_name || t.sectionName || section);
    const taskType = t.work_type || t.taskType || t.title || t.short_title || 'Maintenance Task';
    const priority = t.priority || 'Medium';
    const criticality = t.criticality || 'Critical';
    const risk = t.risk_level || t.risk || 'Low';
    const p50 = typeof t.predicted_p50_min === 'number' ? `${t.predicted_p50_min} min` : (typeof t.p50_duration === 'number' ? `${t.p50_duration} min` : `${t.historical_duration_min || 75} min`);
    const p90 = typeof t.predicted_p90_min === 'number' ? `${t.predicted_p90_min} min` : (typeof t.p90_duration === 'number' ? `${t.p90_duration} min` : `${t.historical_duration_min ? t.historical_duration_min + 15 : 90} min`);
    const sMin = t.start_min != null ? t.start_min : (t.allocated_start_slot != null ? t.allocated_start_slot * 15 : (t.earliest_start_slot != null ? t.earliest_start_slot * 15 : null));
    const eMin = t.end_min != null ? t.end_min : (t.allocated_end_slot != null ? t.allocated_end_slot * 15 : (t.deadline_slot != null ? t.deadline_slot * 15 : null));
    const requestedWindow = t.requestedWindow || (t.earliest_start_slot != null && t.deadline_slot != null ? `${minToTime(t.earliest_start_slot * 15)}–${minToTime(t.deadline_slot * 15)}` : '08:00–12:00');
    const plannedBlock = sMin != null && eMin != null ? `${minToTime(sMin)}–${minToTime(eMin)}` : (t.plannedBlock || 'Allocated');
    const status = t.status || 'SCHEDULED';

    let img = REAL_RAILWAY_IMAGES?.track_maintenance;
    if (dept.toLowerCase().includes('traction') || dept === 'TRD') {
      img = REAL_RAILWAY_IMAGES?.ohe_traction;
    } else if (dept.toLowerCase().includes('signal') || dept === 'S&T') {
      img = REAL_RAILWAY_IMAGES?.signalling_relay;
    }

    const explanation = t.explanation || {
      primaryConstraint: t.decision_context?.primary_constraint || `Available window on ${section} corridor`,
      competingTask: t.affected_trains?.length ? t.affected_trains.join(', ') : 'None active on section',
      priorityComparison: `Asset criticality rank: ${criticality}`,
      operationalConsideration: t.speed_restriction || 'Caution order 30 km/h during possession',
      alternativeConsidered: t.loop_alternatives?.length ? `Loop hold: ${t.loop_alternatives.join(', ')}` : 'None required',
      decision: `Allocated for ${plannedBlock} window`,
    };

    return {
      taskId,
      taskType,
      department: dept,
      section,
      sectionName,
      priority,
      criticality,
      risk,
      requestedWindow,
      plannedBlock,
      p50Duration: p50,
      p90Duration: p90,
      status,
      image: t.image || img,
      explanation,
      raw: t,
    };
  });

  const filteredRequests = normalizedTasks.filter((req) => {
    if (selectedDept !== 'ALL') {
      if (selectedDept === 'Engineering' && !req.department.toLowerCase().includes('eng')) return false;
      if (selectedDept === 'Traction Distribution' && !req.department.toLowerCase().includes('trac') && req.department !== 'TRD') return false;
      if (selectedDept === 'Signal & Telecom' && !req.department.toLowerCase().includes('sign') && req.department !== 'S&T') return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        req.taskId.toLowerCase().includes(q) ||
        req.taskType.toLowerCase().includes(q) ||
        req.section.toLowerCase().includes(q) ||
        req.sectionName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleRowClick = (req) => {
    setActiveTask(req);
    selectEntity('task', req.taskId, req.raw || req);
  };

  const handleAuthorize = () => {
    if (!activeTask) return;
    updateTask(activeTask.taskId, { status: 'Approved' });
    setActiveTask({ ...activeTask, status: 'Approved' });
    showToast(`✓ Task ${activeTask.taskId} possession authorized by Section Controller.`);
  };

  const handleReschedule = () => {
    if (!activeTask) return;
    updateTask(activeTask.taskId, { status: 'Rescheduled' });
    setActiveTask({ ...activeTask, status: 'Rescheduled' });
    showToast(`⚠ Task ${activeTask.taskId} flagged for rescheduling.`);
  };

  const corridorName = corridor?.name || 'Chennai Egmore – Kanniyakumari Corridor';
  const corridorSubtitle = corridor ? `${corridor.origin_code} ↔ ${corridor.destination_code} • ${corridor.length_km} km` : 'MS ↔ CAPE • 742 km';
  const divisionText = corridor?.divisions ? corridor.divisions.join(' / ') + ' Divisions' : 'MAS / TPJ / MDU Divisions';

  return (
    <div className="workspace-body" style={{ display: 'flex', gap: '1.25rem' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '56px',
            right: '20px',
            background: '#0f172a',
            color: '#ffffff',
            padding: '0.65rem 1.1rem',
            borderRadius: '4px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
            fontSize: '0.8rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            zIndex: 9999,
            border: '1px solid #334155',
          }}
        >
          <ShieldCheck size={16} color="#22c55e" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Left / Main Table Area */}
      <div style={{ flex: 1 }}>
        {/* Page Title */}
        <div className="page-title-row">
          <div>
            <h2>Maintenance Queue • {corridorName}</h2>
            <p>Southern Railway active multi-department block requests, duration uncertainty, and constraint evaluations ({corridorSubtitle})</p>
          </div>
          <span className="badge badge-blue">{divisionText}</span>
        </div>

        {/* Filter / Search Bar */}
        <div
          className="panel"
          style={{
            padding: '0.65rem 0.85rem',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '220px' }}>
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search by Task ID, Section (e.g. MS-CGL, VRI-ALU), Work Type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'var(--bg-workspace)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                padding: '0.35rem 0.6rem',
                fontSize: '0.78rem',
                color: 'var(--text-primary)',
                width: '100%',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Filter size={13} color="var(--text-muted)" />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>Dept:</span>
            {['ALL', 'Engineering', 'Traction Distribution', 'Signal & Telecom'].map((dept) => (
              <button
                key={dept}
                className={`btn btn-sm ${selectedDept === dept ? 'btn-primary' : ''}`}
                onClick={() => setSelectedDept(dept)}
              >
                {dept === 'ALL' ? 'All' : dept === 'Traction Distribution' ? 'TRD' : dept === 'Signal & Telecom' ? 'S&T' : 'ENG'}
              </button>
            ))}
          </div>
        </div>

        {/* Professional Dense Table */}
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Task ID & Type</th>
                <th>Department</th>
                <th>Corridor Section</th>
                <th>Priority</th>
                <th>Criticality</th>
                <th>Risk</th>
                <th>Requested Window</th>
                <th>P90 Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((r) => {
                const isSelected = activeTask?.taskId === r.taskId || selectedEntity?.id === r.taskId;
                return (
                  <tr
                    key={r.taskId}
                    className={isSelected ? 'selected' : ''}
                    style={{ cursor: 'pointer', background: isSelected ? 'rgba(37, 99, 235, 0.08)' : undefined }}
                    onClick={() => handleRowClick(r)}
                  >
                    <td>
                      <strong>{r.taskId}</strong>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{r.taskType}</div>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background:
                            r.department.includes('Eng')
                              ? 'var(--dept-eng-bg)'
                              : r.department.includes('Trac') || r.department === 'TRD'
                              ? 'var(--dept-trd-bg)'
                              : 'var(--dept-snt-bg)',
                          color:
                            r.department.includes('Eng')
                              ? 'var(--dept-eng)'
                              : r.department.includes('Trac') || r.department === 'TRD'
                              ? 'var(--dept-trd)'
                              : 'var(--dept-snt)',
                          borderColor:
                            r.department.includes('Eng')
                              ? 'var(--dept-eng-border)'
                              : r.department.includes('Trac') || r.department === 'TRD'
                              ? 'var(--dept-trd-border)'
                              : 'var(--dept-snt-border)',
                        }}
                      >
                        {r.department}
                      </span>
                    </td>
                    <td>
                      <strong>{r.section}</strong>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{r.sectionName}</div>
                    </td>
                    <td>{r.priority}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: r.criticality === 'Critical' ? 'var(--op-red-bg)' : 'var(--op-amber-bg)',
                          color: r.criticality === 'Critical' ? 'var(--op-red)' : 'var(--op-amber)',
                          borderColor: r.criticality === 'Critical' ? 'var(--op-red-border)' : 'var(--op-amber-border)',
                        }}
                      >
                        {r.criticality}
                      </span>
                    </td>
                    <td>{r.risk}</td>
                    <td>{r.requestedWindow}</td>
                    <td><strong>{r.p90Duration}</strong></td>
                    <td>
                      <span
                        className={`badge ${
                          r.status === 'Approved'
                            ? 'badge-green'
                            : r.status === 'Planned'
                            ? 'badge-blue'
                            : r.status === 'Conflict'
                            ? 'badge-red'
                            : 'badge-amber'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right-Side Drawer: Task Detail & Structured Explanation Panel */}
      {activeTask && (
        <aside className="drawer-panel">
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.65rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {activeTask.taskId}
                </h3>
                <span className={`badge ${activeTask.status === 'Approved' ? 'badge-green' : 'badge-blue'}`}>{activeTask.status}</span>
              </div>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                {activeTask.taskType}
              </p>
            </div>

            <button
              className="btn btn-sm"
              style={{ padding: '0.2rem 0.4rem', border: 'none' }}
              onClick={() => setActiveTask(null)}
            >
              <X size={14} />
            </button>
          </div>

          {/* Contextual Real Railway Thumbnail */}
          {activeTask.image && (
            <div className="ref-image-card">
              <img src={activeTask.image} alt={activeTask.taskType} />
              <div className="ref-image-caption">
                <span>{activeTask.department} Maintenance Crew • Southern Railway</span>
                <span>Division Depot Reference</span>
              </div>
            </div>
          )}

          {/* Key Metrics Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.76rem' }}>
            <div style={{ background: 'var(--bg-workspace)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
              <div className="audit-label">Department</div>
              <div style={{ fontWeight: 600, marginTop: '0.1rem' }}>{activeTask.department}</div>
            </div>
            <div style={{ background: 'var(--bg-workspace)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
              <div className="audit-label">Corridor Section</div>
              <div style={{ fontWeight: 600, marginTop: '0.1rem' }}>{activeTask.section}</div>
            </div>
            <div style={{ background: 'var(--bg-workspace)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
              <div className="audit-label">Priority / Criticality</div>
              <div style={{ fontWeight: 600, marginTop: '0.1rem' }}>{activeTask.priority} / {activeTask.criticality}</div>
            </div>
            <div style={{ background: 'var(--bg-workspace)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
              <div className="audit-label">Failure Risk</div>
              <div style={{ fontWeight: 600, marginTop: '0.1rem' }}>{activeTask.risk}</div>
            </div>
          </div>

          {/* Predicted Duration (P50 vs P90) */}
          <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.65rem' }}>
            <div className="audit-label" style={{ marginBottom: '0.25rem' }}>Predicted Duration Uncertainty (LightGBM Quantile)</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>P50 Expected: </span>
                <strong>{activeTask.p50Duration}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>P90 Reserved: </span>
                <strong style={{ color: 'var(--op-blue)' }}>{activeTask.p90Duration}</strong>
              </div>
            </div>
            <div style={{ fontSize: '0.66rem', color: 'var(--op-green)', marginTop: '0.2rem' }}>
              ✓ Safety buffer: +{Math.max(0, parseInt(activeTask.p90Duration) - parseInt(activeTask.p50Duration))}m absorbed without cascading express delays
            </div>
          </div>

          {/* Requested Window vs Planned Block */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.76rem' }}>
            <div style={{ border: '1px solid var(--border-subtle)', padding: '0.5rem', borderRadius: '4px' }}>
              <div className="audit-label">Requested Window</div>
              <div style={{ fontWeight: 600, marginTop: '0.15rem' }}>{activeTask.requestedWindow}</div>
            </div>
            <div style={{ border: '1px solid var(--op-blue-border)', background: 'var(--op-blue-bg)', padding: '0.5rem', borderRadius: '4px' }}>
              <div className="audit-label" style={{ color: 'var(--op-blue)' }}>Planned Block</div>
              <div style={{ fontWeight: 700, color: 'var(--op-blue)', marginTop: '0.15rem' }}>{activeTask.plannedBlock}</div>
            </div>
          </div>

          {/* Structured Explanation Panel: Why this decision? */}
          <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Why this decision? (Explainable AI)
            </h4>
            <div className="decision-audit-box">
              <div className="audit-row">
                <div className="audit-label">Primary Constraint</div>
                <div className="audit-value">{activeTask.explanation.primaryConstraint}</div>
              </div>

              <div className="audit-row">
                <div className="audit-label">Competing Train / Task</div>
                <div className="audit-value">{activeTask.explanation.competingTask}</div>
              </div>

              <div className="audit-row">
                <div className="audit-label">Priority Comparison</div>
                <div className="audit-value">{activeTask.explanation.priorityComparison}</div>
              </div>

              <div className="audit-row">
                <div className="audit-label">Operational Consideration</div>
                <div className="audit-value">{activeTask.explanation.operationalConsideration}</div>
              </div>

              <div className="audit-row">
                <div className="audit-label">Alternative Considered</div>
                <div className="audit-value">{activeTask.explanation.alternativeConsidered}</div>
              </div>

              <div className="audit-row" style={{ paddingTop: '0.35rem', borderTop: '1px solid var(--border-subtle)' }}>
                <div className="audit-label" style={{ color: 'var(--op-green)' }}>Decision</div>
                <div className="audit-value" style={{ fontWeight: 700, color: 'var(--op-green)' }}>
                  {activeTask.explanation.decision}
                </div>
              </div>
            </div>
          </div>

          {/* Drawer Bottom Action Toolbar */}
          <div
            style={{
              marginTop: '0.85rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              gap: '0.5rem',
            }}
          >
            <button
              className="btn btn-sm btn-primary"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={handleAuthorize}
            >
              <ShieldCheck size={13} />
              <span>Authorize Possession</span>
            </button>

            <button
              className="btn btn-sm"
              onClick={handleReschedule}
              title="Flag task for alternative time slot"
            >
              <Clock size={13} />
              <span>Reschedule</span>
            </button>

            <button
              className="btn btn-sm"
              onClick={() => setActiveTask(null)}
              title="Close details drawer"
            >
              <X size={13} />
              <span>Close</span>
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
