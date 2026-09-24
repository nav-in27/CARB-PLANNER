import React, { useState } from 'react';
import {
  X,
  Search,
  Calendar,
  Layers,
  Clock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Info,
  Shield,
  HelpCircle,
} from 'lucide-react';
import { useScenario } from '../context/ScenarioContext';

export default function TraceabilityModal() {
  const {
    traceModalOpen,
    closeTraceModal,
    traceTaskData,
    openTraceModal,
    monthlyPlan,
    tasks,
  } = useScenario();

  const [searchTaskId, setSearchTaskId] = useState(traceTaskData?.task_id || 'ENG-014');

  if (!traceModalOpen) return null;

  const data = traceTaskData;

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchTaskId.trim()) {
      openTraceModal(searchTaskId.trim());
    }
  };

  const candidateTasks = (monthlyPlan?.tasks || tasks || []).map((t) => ({
    id: t.task_id,
    label: `${t.task_id} (${t.department?.value || t.department} - ${t.section_id})`,
  }));

  return (
    <div className="horizon-modal-overlay" onClick={closeTraceModal}>
      <div className="horizon-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="horizon-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} color="var(--op-blue)" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                4-Tier End-to-End Task Traceability
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                MONTHLY STRATEGY ➔ WEEKLY POSSESSION ➔ DAILY OPERATIONAL ➔ REAL-TIME DISRUPTION
              </div>
            </div>
          </div>
          <button className="btn btn-sm" onClick={closeTraceModal}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="horizon-modal-body">
          {/* Search bar & quick select */}
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="input"
                style={{ width: '100%', paddingLeft: '28px', fontSize: '0.8rem', height: '32px' }}
                placeholder="Enter Task ID (e.g. ENG-014, TRD-009, SNT-021)..."
                value={searchTaskId}
                onChange={(e) => setSearchTaskId(e.target.value)}
              />
              <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: 'var(--text-muted)' }} />
            </div>
            <select
              className="select"
              style={{ fontSize: '0.78rem', height: '32px' }}
              value={searchTaskId}
              onChange={(e) => {
                setSearchTaskId(e.target.value);
                openTraceModal(e.target.value);
              }}
            >
              {candidateTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-sm btn-primary">
              Trace
            </button>
          </form>

          {data ? (
            <div>
              {/* Task Identity Card */}
              <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {data.task_id}
                    </span>
                    {data.alias && (
                      <span className="badge badge-slate" style={{ fontSize: '0.68rem' }}>
                        Alias: {data.alias}
                      </span>
                    )}
                    <span className={`badge ${data.department === 'ENG' ? 'badge-dept-eng' : data.department === 'TRD' ? 'badge-dept-trd' : 'badge-dept-snt'}`}>
                      {data.department}
                    </span>
                    <span className="badge badge-slate">
                      Section: {data.section_id}
                    </span>
                    <span className="badge badge-amber">
                      {data.criticality || data.priority}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Work Type: <strong>{data.work_type}</strong> • Target Track: <strong>{data.weekly?.track || 'Track 1'}</strong>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Status</div>
                  <div className="badge badge-green" style={{ fontSize: '0.75rem' }}>
                    {data.monthly?.status || 'APPROVED'}
                  </div>
                </div>
              </div>

              {/* 4-Tier Workflow Chain */}
              <div className="trace-step-container">
                {/* 1. Monthly Tier */}
                <div className="trace-step-card active">
                  <div className="trace-step-number">TIER 1 • MONTHLY</div>
                  <div className="trace-step-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={13} color="var(--op-blue)" />
                    Week {data.monthly?.week}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Plan: <strong>{data.monthly?.plan_id}</strong>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Hours: <strong>{data.monthly?.possession_hours}h</strong>
                  </div>
                  <div style={{ marginTop: '6px', borderTop: '1px dashed var(--border-subtle)', paddingTop: '6px' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--op-blue)', marginBottom: '3px' }}>
                      WHY THIS WEEK?
                    </div>
                    {(data.monthly?.why_this_week || []).map((r, i) => (
                      <div key={i} style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', marginBottom: '2px', display: 'flex', gap: '3px' }}>
                        <span>•</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Weekly Tier */}
                <div className="trace-step-card active">
                  <div className="trace-step-number">TIER 2 • WEEKLY</div>
                  <div className="trace-step-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Layers size={13} color="var(--dept-eng)" />
                    {data.weekly?.day}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Plan: <strong>{data.weekly?.plan_id}</strong>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Window: <strong>{data.weekly?.window}</strong>
                  </div>
                  <div style={{ marginTop: '6px', borderTop: '1px dashed var(--border-subtle)', paddingTop: '6px' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--dept-eng)', marginBottom: '3px' }}>
                      WHY THIS DAY?
                    </div>
                    {(data.weekly?.why_this_day || []).map((r, i) => (
                      <div key={i} style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', marginBottom: '2px', display: 'flex', gap: '3px' }}>
                        <span>•</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Daily Operational Tier */}
                <div className="trace-step-card active">
                  <div className="trace-step-number">TIER 3 • DAILY</div>
                  <div className="trace-step-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={13} color="var(--op-green)" />
                    {data.daily?.time_slot || '08:45–10:30'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Plan: <strong>{data.daily?.plan_id}</strong>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Track: <strong>{data.daily?.track || 'Track 1'}</strong>
                  </div>
                  <div style={{ marginTop: '6px', borderTop: '1px dashed var(--border-subtle)', paddingTop: '6px' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--op-green)', marginBottom: '3px' }}>
                      WHY THIS WINDOW?
                    </div>
                    {(data.daily?.why_this_window || []).map((r, i) => (
                      <div key={i} style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', marginBottom: '2px', display: 'flex', gap: '3px' }}>
                        <span>•</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Operational Result & Disruption */}
                <div className="trace-step-card active">
                  <div className="trace-step-number">TIER 4 • RESULT / REPLAN</div>
                  <div className="trace-step-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Shield size={13} color="var(--op-slate)" />
                    {data.disruption ? 'DISRUPTED' : 'COMMITTED'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Loop: <strong>{data.operational?.loop_usage || 'L-VRI-01'}</strong>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Train Impact: <strong>{data.operational?.train_impact}</strong>
                  </div>
                  <div style={{ marginTop: '6px', borderTop: '1px dashed var(--border-subtle)', paddingTop: '6px' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' }}>
                      DISRUPTION STATE
                    </div>
                    {data.disruption ? (
                      <div>
                        <span className={`badge ${data.disruption.impact_status === 'WEEKLY PLAN UNAFFECTED' ? 'badge-green' : 'badge-amber'}`} style={{ fontSize: '0.65rem' }}>
                          {data.disruption.impact_status}
                        </span>
                        <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {data.disruption.message || 'Rescheduled locally within weekly commitment.'}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.67rem', color: 'var(--op-green)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <CheckCircle2 size={11} />
                        <span>No active disruptions. Weekly commitment intact.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Joint Bundling Information */}
              {data.operational?.is_joint_possession && (
                <div className="joint-possession-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="joint-possession-badge">
                      JOINT POSSESSION ACTIVE
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--op-green)', fontWeight: 600 }}>
                      Cross-Departmental Block
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-primary)', marginTop: '6px' }}>
                    This work on <strong>{data.section_id}</strong> is bundled with partner task <strong>{data.operational?.bundled_with}</strong> to maximize track possession utilization and eliminate redundant line closures.
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading task traceability...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="horizon-modal-footer">
          <button className="btn btn-sm btn-primary" onClick={closeTraceModal}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
