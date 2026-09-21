import React, { useState, useRef } from 'react';
import {
  AlertTriangle,
  RotateCw,
  XCircle,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Info,
  Sliders,
  AlertOctagon,
  FileCheck,
  Check,
  Zap,
  ArrowDown,
  Download,
  CheckCircle,
  Undo2,
  Layers,
  History,
  Activity,
  FileText,
  HelpCircle,
} from 'lucide-react';
import { useScenario } from '../context/ScenarioContext';
import { CORRIDOR_SECTIONS } from '../data/corridorData';

const DISRUPTION_TYPES = [
  { value: 'UNSCHEDULED_DEFECT', label: 'Critical Track Defect (Emergency)', defaultSec: 'S03', defaultDuration: 90, desc: 'Emergency rail fracture / ultrasonic flaw detected requiring immediate isolation' },
  { value: 'BLOCK_CANCELLATION', label: 'Planned Block Cancellation', defaultSec: 'S01', defaultDuration: 0, defaultTask: 'T04', desc: 'Depot crew or machinery unavailable; releases window to traffic' },
  { value: 'OVERRUN', label: 'Possession Duration Overrun', defaultSec: 'S02', defaultDuration: 45, defaultTask: 'T02', desc: 'Work overrun exceeding authorized block duration window' },
  { value: 'DEPARTMENT_CONFLICT', label: 'Inter-Departmental Contention', defaultSec: 'S05', defaultDuration: 120, desc: 'Simultaneous overlapping possession demands by P.Way, TRD, or S&T' },
  { value: 'TRACK_CLOSURE', label: 'Full Section / Track Closure', defaultSec: 'S04', defaultDuration: 180, desc: 'Bridge work or derailment requiring complete bidirectional track shutdown' },
  { value: 'SPEED_RESTRICTION', label: 'Temporary Speed Restriction (TSR)', defaultSec: 'S03', defaultDuration: 240, desc: 'Caution order (e.g. 30 km/h) imposing transit delays on all movements' },
  { value: 'TRAIN_DELAY', label: 'Train Delay (Upstream Regulation)', defaultSec: 'S01', defaultDuration: 60, desc: 'Late arrival of passenger/freight service from northern interchange' },
  { value: 'WEATHER', label: 'Adverse Weather / Monsoon Flooding', defaultSec: 'S17', defaultDuration: 180, desc: 'Severe waterlogging / cyclone alert slowing operations in coastal section' },
  { value: 'POWER_FAILURE', label: 'OHE Traction Power Outage', defaultSec: 'S14', defaultDuration: 90, desc: 'Substation trip / catenary wire break halting all electric traction' },
];

export default function DisruptionsTab({ onOpenOverrideModal, onApprovePlan }) {
  const {
    scenario,
    tasks: scenarioTasks,
    trains: scenarioTrains,
    versions,
    auditLog,
    simulateDisruption,
    applyDisruption,
    refreshScenario,
    refreshVersions,
    refreshAuditLog,
  } = useScenario();

  // Form State
  const [disruptionType, setDisruptionType] = useState('UNSCHEDULED_DEFECT');
  const [sectionId, setSectionId] = useState('S03');
  const [description, setDescription] = useState('Emergency rail weld defect detected near KM 182');
  const [startMin, setStartMin] = useState(540); // 09:00
  const [durationMin, setDurationMin] = useState(90);
  const [severity, setSeverity] = useState('CRITICAL');
  const [relatedTaskId, setRelatedTaskId] = useState('');
  const [relatedTrainId, setRelatedTrainId] = useState('');

  // Execution states
  const [isSimulating, setIsSimulating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [appliedResult, setAppliedResult] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('simulate'); // 'simulate' | 'history'

  const resultsRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const scrollToResults = () => {
    if (resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleTypeChange = (typeVal) => {
    setDisruptionType(typeVal);
    const meta = DISRUPTION_TYPES.find((d) => d.value === typeVal);
    if (meta) {
      if (meta.defaultSec) setSectionId(meta.defaultSec);
      if (meta.defaultDuration) setDurationMin(meta.defaultDuration);
      if (meta.defaultTask) setRelatedTaskId(meta.defaultTask);
      setDescription(meta.desc);
    }
    setSimulationResult(null);
    setAppliedResult(null);
  };

  const buildDisruptionPayload = () => {
    return {
      event_id: `DIS_${Date.now().toString().slice(-6)}`,
      disruption_type: disruptionType,
      section_id: sectionId,
      time_slot: Math.floor(startMin / 15),
      start_min: parseInt(startMin, 10),
      duration_minutes: parseInt(durationMin, 10),
      severity: severity,
      description: description,
      task_id: relatedTaskId || null,
      train_id: relatedTrainId || null,
      created_at: new Date().toISOString(),
    };
  };

  // 1. Simulate Impact (Non-mutating preview)
  const handleSimulate = async () => {
    setIsSimulating(true);
    setSimulationResult(null);
    try {
      const payload = buildDisruptionPayload();
      const res = await simulateDisruption(payload, 10.0);
      setSimulationResult(res);
      showToast(`✓ Impact simulated: ${res.affected_trains?.length || 0} trains affected, +${res.estimated_delay_min || 0}m delay`);
      setTimeout(scrollToResults, 100);
    } catch (err) {
      console.error(err);
      showToast('Simulation failed: ' + err.message);
    } finally {
      setIsSimulating(false);
    }
  };

  // 2. Apply Disruption & Replan (Mutating transaction)
  const handleApply = async () => {
    setIsApplying(true);
    setAppliedResult(null);
    try {
      const payload = buildDisruptionPayload();
      const res = await applyDisruption(payload, true, 15.0);
      setAppliedResult(res);
      showToast(`✓ Disruption applied: Created Plan Version v${res.version_number || 2} (Status: ${res.plan?.solver_status || 'OPTIMAL'})`);
      await refreshScenario();
      await refreshVersions();
      await refreshAuditLog();
      setTimeout(scrollToResults, 100);
    } catch (err) {
      console.error(err);
      showToast('Apply failed: ' + err.message);
    } finally {
      setIsApplying(false);
    }
  };

  const formatMinToTime = (min) => {
    let m = min % 1440;
    if (m < 0) m += 1440;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const handleExportAuditLog = () => {
    const logData = {
      corridor: scenario?.corridor?.short_name || 'MS ↔ CAPE',
      timestamp: new Date().toISOString(),
      activeVersion: scenario?.version_number || 1,
      versions: versions,
      auditLog: auditLog,
    };
    const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carb_planner_audit_log_v${scenario?.version_number || 1}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ Decision audit log exported as JSON.');
  };

  return (
    <div className="workspace-body">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'var(--text-primary)',
            color: '#fff',
            padding: '0.65rem 1.1rem',
            borderRadius: '6px',
            fontSize: '0.78rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircle2 size={16} color="#4ade80" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="page-title-row">
        <div>
          <h2>Disruption Management & Contingency Replanning Engine</h2>
          <p>
            Dynamic Real-Time Interventions • 9 Incident Classes • Non-Mutating Impact Simulation & Atomic LNS Commit
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.3rem', background: '#e2e8f0', padding: '0.2rem', borderRadius: '4px' }}>
            <button
              className={`btn btn-sm ${activeTab === 'simulate' ? 'btn-primary' : ''}`}
              onClick={() => setActiveTab('simulate')}
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}
            >
              <Zap size={12} />
              <span>Incident Studio</span>
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : ''}`}
              onClick={() => setActiveTab('history')}
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}
            >
              <History size={12} />
              <span>Version Audit Trail ({auditLog?.length || 0})</span>
            </button>
          </div>

          <button className="btn btn-sm" onClick={handleExportAuditLog}>
            <Download size={13} />
            <span>Export Audit Log</span>
          </button>
        </div>
      </div>

      {activeTab === 'simulate' && (
        <>
          {/* Main Workspace: Left = Form, Right = Scenario Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '1rem', marginBottom: '1rem' }}>
            {/* Form Panel */}
            <div className="panel" style={{ padding: '1rem' }}>
              <div className="panel-header" style={{ marginBottom: '0.75rem' }}>
                <div className="panel-title">
                  <AlertOctagon size={15} color="var(--op-red)" />
                  <span>Configure Incident Event</span>
                </div>
                <span className="badge badge-amber" style={{ fontSize: '0.65rem' }}>
                  v{scenario?.version_number || 1} Baseline
                </span>
              </div>

              {/* 1. Incident Type */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                  Incident Type (9 Classes)
                </label>
                <select
                  value={disruptionType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  style={{ width: '100%', fontSize: '0.75rem', padding: '0.35rem 0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: '#fff' }}
                >
                  {DISRUPTION_TYPES.map((dt) => (
                    <option key={dt.value} value={dt.value}>
                      {dt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Corridor Section */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                  Affected Corridor Section
                </label>
                <select
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                  style={{ width: '100%', fontSize: '0.75rem', padding: '0.35rem 0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: '#fff' }}
                >
                  {CORRIDOR_SECTIONS.map((sec) => (
                    <option key={sec.sectionId || sec.id} value={sec.sectionId || sec.id}>
                      {sec.sectionId || sec.code}: {sec.name} ({sec.fullName}) {sec.bottleneck ? '• BOTTLENECK' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Time Window & Duration */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    Start Time ({formatMinToTime(startMin)})
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1440}
                    step={15}
                    value={startMin}
                    onChange={(e) => setStartMin(parseInt(e.target.value, 10))}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    Duration: {durationMin} min
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={480}
                    step={15}
                    value={durationMin}
                    onChange={(e) => setDurationMin(parseInt(e.target.value, 10))}
                    style={{ width: '100%', fontSize: '0.75rem', padding: '0.25rem 0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                  />
                </div>
              </div>

              {/* 4. Severity & Target Entity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    Severity Level
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    style={{ width: '100%', fontSize: '0.75rem', padding: '0.35rem 0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: '#fff' }}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    Target Task ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. T04"
                    value={relatedTaskId}
                    onChange={(e) => setRelatedTaskId(e.target.value)}
                    style={{ width: '100%', fontSize: '0.75rem', padding: '0.25rem 0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                  />
                </div>
              </div>

              {/* 5. Incident Description */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                  Incident Description & Controller Rationale
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ width: '100%', fontSize: '0.75rem', padding: '0.35rem 0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                />
              </div>

              {/* Action Buttons: Simulate vs Apply */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  className="btn"
                  onClick={handleSimulate}
                  disabled={isSimulating || isApplying}
                  style={{ justifyContent: 'center', padding: '0.45rem' }}
                >
                  <Clock size={13} className={isSimulating ? 'spin' : ''} />
                  <span>{isSimulating ? 'Simulating...' : 'Simulate Impact'}</span>
                </button>

                <button
                  className="btn btn-primary"
                  onClick={handleApply}
                  disabled={isSimulating || isApplying}
                  style={{ justifyContent: 'center', padding: '0.45rem' }}
                >
                  <Zap size={13} className={isApplying ? 'spin' : ''} />
                  <span>{isApplying ? 'Replanning...' : 'Apply & Replan'}</span>
                </button>
              </div>
            </div>

            {/* Right: Quick Context & Subsystem State */}
            <div className="panel" style={{ padding: '1rem' }}>
              <div className="panel-header" style={{ marginBottom: '0.75rem' }}>
                <div className="panel-title">
                  <Activity size={15} color="var(--op-blue)" />
                  <span>Corridor Real-Time Operational Context</span>
                </div>
                <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>
                  {scenario?.corridor?.short_name || 'MS ↔ CAPE'} Active
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div className="kpi-cell" style={{ padding: '0.5rem' }}>
                  <div className="kpi-cell-label" style={{ fontSize: '0.68rem' }}>Current Version</div>
                  <div className="kpi-cell-val" style={{ fontSize: '1.1rem', color: 'var(--op-blue)' }}>
                    v{scenario?.version_number || 1}
                  </div>
                  <div className="kpi-cell-meta" style={{ fontSize: '0.62rem' }}>Audit entries: {auditLog?.length || 0}</div>
                </div>

                <div className="kpi-cell" style={{ padding: '0.5rem' }}>
                  <div className="kpi-cell-label" style={{ fontSize: '0.68rem' }}>Active Tasks</div>
                  <div className="kpi-cell-val" style={{ fontSize: '1.1rem' }}>
                    {scenarioTasks?.length || 13}
                  </div>
                  <div className="kpi-cell-meta" style={{ fontSize: '0.62rem' }}>P.Way, TRD, S&T</div>
                </div>

                <div className="kpi-cell" style={{ padding: '0.5rem' }}>
                  <div className="kpi-cell-label" style={{ fontSize: '0.68rem' }}>Active Services</div>
                  <div className="kpi-cell-val" style={{ fontSize: '1.1rem', color: 'var(--op-green)' }}>
                    {scenarioTrains?.length || 23}
                  </div>
                  <div className="kpi-cell-meta" style={{ fontSize: '0.62rem' }}>Corridor Timetable</div>
                </div>

                <div className="kpi-cell" style={{ padding: '0.5rem' }}>
                  <div className="kpi-cell-label" style={{ fontSize: '0.68rem' }}>Asset Availability</div>
                  <div className="kpi-cell-val" style={{ fontSize: '1.1rem', color: 'var(--op-green)' }}>
                    {scenario?.kpis?.asset_availability_pct != null ? `${scenario.kpis.asset_availability_pct}%` : '95.8%'}
                  </div>
                  <div className="kpi-cell-meta" style={{ fontSize: '0.62rem' }}>OR-Tools CP-SAT</div>
                </div>
              </div>

              {/* Instructions Callout */}
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-subtle)', fontSize: '0.72rem' }}>
                <strong style={{ color: 'var(--text-secondary)' }}>How Incident Decision Support Works:</strong>
                <ol style={{ paddingLeft: '1.2rem', marginTop: '0.3rem', lineHeight: '1.5' }}>
                  <li><strong>Simulate Impact</strong> runs non-mutating conflict analysis and predicts train delays without altering the active schedule.</li>
                  <li><strong>Apply & Replan</strong> injects the disruption, executes localized LNS/CP-SAT repair, increments scenario version (e.g. v1 &rarr; v2), and creates an immutable audit trail entry.</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Results Section */}
          <div ref={resultsRef}>
            {/* Simulation Preview Card */}
            {simulationResult && (
              <div className="panel" style={{ padding: '1rem', borderColor: 'var(--op-blue-border)', background: 'var(--bg-active)', marginBottom: '1rem' }}>
                <div className="panel-header" style={{ marginBottom: '0.5rem' }}>
                  <div className="panel-title">
                    <Clock size={15} color="var(--op-blue)" />
                    <span>Non-Mutating Disruption Impact Preview</span>
                  </div>
                  <span className={`badge ${simulationResult.is_feasible ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.7rem' }}>
                    {simulationResult.is_feasible ? 'Feasible Alternative Exists' : 'Infeasible Without Delay'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem', marginBottom: '0.75rem' }}>
                  <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Estimated Additional Delay</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--op-amber)' }}>
                      +{simulationResult.estimated_delay_min || 0} min
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Affected Train Services</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--op-blue)' }}>
                      {simulationResult.affected_trains?.length || 0} Trains
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Affected Maintenance Tasks</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                      {simulationResult.affected_tasks?.length || 0} Tasks
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Loops Required for Holding</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--op-green)' }}>
                      {simulationResult.loop_conflicts?.length || 0} Stations
                    </div>
                  </div>
                </div>

                {simulationResult.explanation && (
                  <div style={{ fontSize: '0.74rem', background: '#fff', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <strong>Solver Diagnosis:</strong> {simulationResult.explanation}
                  </div>
                )}
              </div>
            )}

            {/* Applied Result Card */}
            {appliedResult && (
              <div className="panel" style={{ padding: '1rem', borderColor: 'var(--op-green-border)', background: 'var(--op-green-bg)', marginBottom: '1rem' }}>
                <div className="panel-header" style={{ marginBottom: '0.5rem' }}>
                  <div className="panel-title">
                    <CheckCircle2 size={15} color="var(--op-green)" />
                    <span>Disruption Committed • Operational Plan Version v{appliedResult.version_number}</span>
                  </div>
                  <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                    {appliedResult.plan?.solver_status || 'OPTIMAL'}
                  </span>
                </div>

                <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  {appliedResult.message || 'LNS replanning executed. Incremented scenario version and updated all active block allocations.'}
                </p>

                {appliedResult.diff_summary && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', fontSize: '0.72rem' }}>
                    <div style={{ background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                      <strong>Allocations:</strong> {appliedResult.diff_summary.allocations_count}
                    </div>
                    <div style={{ background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                      <strong>Active Trains:</strong> {appliedResult.diff_summary.trains_count}
                    </div>
                    <div style={{ background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                      <strong>Conflicts:</strong> {appliedResult.diff_summary.conflicts_count}
                    </div>
                    <div style={{ background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                      <strong>Status:</strong> {appliedResult.diff_summary.is_feasible ? 'Feasible' : 'Constrained'}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Tab 2: Version Audit Trail */}
      {activeTab === 'history' && (
        <div className="panel" style={{ padding: '1rem' }}>
          <div className="panel-header" style={{ marginBottom: '0.75rem' }}>
            <div className="panel-title">
              <History size={15} color="var(--op-blue)" />
              <span>Immutable Scenario Version History & Controller Audit Trail</span>
            </div>
            <span className="badge badge-slate" style={{ fontSize: '0.68rem' }}>
              {auditLog?.length || 0} Total Entries
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.74rem' }}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Version</th>
                  <th>Trigger</th>
                  <th>Actor</th>
                  <th>Reason / Details</th>
                  <th>Allocations</th>
                  <th>Feasible</th>
                </tr>
              </thead>
              <tbody>
                {auditLog && auditLog.length > 0 ? (
                  auditLog.map((log, idx) => (
                    <tr key={log.entry_id || idx}>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'Recent'}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--op-blue)' }}>
                        v{log.version_number || 1}
                      </td>
                      <td>
                        <span className="badge badge-slate" style={{ fontSize: '0.62rem' }}>
                          {log.trigger || 'PLAN_GENERATE'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{log.actor || 'system'}</td>
                      <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.reason}>
                        {log.reason}
                      </td>
                      <td>{log.diff_summary?.allocations_count ?? 13} blocks</td>
                      <td>
                        <span className="badge badge-green" style={{ fontSize: '0.62rem' }}>
                          {log.diff_summary?.is_feasible !== false ? 'Feasible' : 'Alert'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                      No prior modifications recorded. Current version is v1 Baseline.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
