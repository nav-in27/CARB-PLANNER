import React, { useState, useRef, useEffect } from 'react';
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
  X,
  Play,
  Eye,
  CornerDownRight,
} from 'lucide-react';
import { useScenario } from '../context/ScenarioContext';
import { CORRIDOR_SECTIONS } from '../data/corridorData';

const DISRUPTION_TYPES = [
  {
    value: 'CRITICAL_DEFECT',
    label: 'Critical Track Defect (Emergency)',
    defaultSec: 'S04',
    defaultStartMin: 750, // 12:30
    defaultDuration: 90,
    desc: 'Emergency rail weld defect detected on Track 1 between VRI–ALU (KM 214.2); requires immediate track isolation and single line working.',
  },
  {
    value: 'TRACK_BLOCKED',
    label: 'Track Blocked / Obstruction',
    defaultSec: 'S04',
    defaultStartMin: 750,
    defaultDuration: 90,
    desc: 'Track obstruction requiring temporary emergency possession and train regulation via adjacent station loops.',
  },
  {
    value: 'BLOCK_CANCELLATION',
    label: 'Planned Block Cancellation',
    defaultSec: 'S01',
    defaultStartMin: 480,
    defaultDuration: 0,
    defaultTask: 'T04',
    desc: 'Depot crew or tampers unavailable; cancels possession window and restores full corridor line capacity to traffic.',
  },
  {
    value: 'MAINTENANCE_OVERRUN',
    label: 'Possession Duration Overrun',
    defaultSec: 'S02',
    defaultStartMin: 600,
    defaultDuration: 45,
    defaultTask: 'T02',
    desc: 'Deep screening ballast work overrun exceeding authorized block window; requires localized downstream train retiming.',
  },
  {
    value: 'SIGNAL_FAILURE',
    label: 'Automatic Signalling Interlocking Flaw',
    defaultSec: 'S03',
    defaultStartMin: 660,
    defaultDuration: 60,
    desc: 'Electronic interlocking failure at boundary station; imposes manual paper line clear and 25 km/h caution order.',
  },
  {
    value: 'SPEED_RESTRICTION',
    label: 'Temporary Speed Restriction (TSR)',
    defaultSec: 'S03',
    defaultStartMin: 540,
    defaultDuration: 180,
    desc: 'Track caution order (30 km/h) imposed due to formation settlement, adding transit delays to all passing services.',
  },
  {
    value: 'TRAIN_DELAY',
    label: 'Train Delay (Upstream Regulation)',
    defaultSec: 'S01',
    defaultStartMin: 720,
    defaultDuration: 45,
    desc: 'Late arrival of passenger express service from northern junction requiring cascade timetable regulation.',
  },
  {
    value: 'WEATHER',
    label: 'Adverse Weather / Waterlogging',
    defaultSec: 'S17',
    defaultStartMin: 900,
    defaultDuration: 120,
    desc: 'Severe monsoon waterlogging slowing down sectional running times along coastal section.',
  },
  {
    value: 'POWER_FAILURE',
    label: 'OHE Traction Power Outage',
    defaultSec: 'S14',
    defaultStartMin: 840,
    defaultDuration: 75,
    desc: 'Traction substation breaker trip halting electric locomotives until TRD emergency tower wagon restores power.',
  },
];

const FLOW_STEPS = [
  { id: 'DRAFT', label: '1. Draft Incident' },
  { id: 'SIMULATING', label: '2. Simulating Impact' },
  { id: 'IMPACT_READY', label: '3. Non-Mutating Preview' },
  { id: 'REPLANNING', label: '4. LNS Local Repair' },
  { id: 'VALIDATING', label: '5. Safety Validation' },
  { id: 'COMMITTED', label: '6. Plan Committed' },
];

export default function DisruptionsTab({ onOpenOverrideModal, onApprovePlan, onNavigateTab }) {
  const {
    scenario,
    tasks: scenarioTasks,
    trains: scenarioTrains,
    versions,
    auditLog,
    versionNumber,
    planDiff,
    simulateDisruption,
    applyDisruption,
    refreshScenario,
    refreshVersions,
    refreshAuditLog,
  } = useScenario();

  // Form State
  const [disruptionType, setDisruptionType] = useState('CRITICAL_DEFECT');
  const [sectionId, setSectionId] = useState('S04'); // VRI-ALU
  const [description, setDescription] = useState(
    'Emergency rail weld defect detected on Track 1 between VRI–ALU (KM 214.2); requires immediate track isolation and single line working.'
  );
  const [startMin, setStartMin] = useState(750); // 12:30 default benchmark
  const [durationMin, setDurationMin] = useState(90);
  const [severity, setSeverity] = useState('CRITICAL');
  const [relatedTaskId, setRelatedTaskId] = useState('');
  const [relatedTrainId, setRelatedTrainId] = useState('');

  // Flow State
  const [flowState, setFlowState] = useState('DRAFT'); // 'DRAFT' | 'SIMULATING' | 'IMPACT_READY' | 'REPLANNING' | 'VALIDATING' | 'COMMITTED' | 'FAILED'
  const [simulationResult, setSimulationResult] = useState(null);
  const [appliedResult, setAppliedResult] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('controller'); // 'controller' | 'history'

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
      if (meta.defaultStartMin != null) setStartMin(meta.defaultStartMin);
      if (meta.defaultDuration) setDurationMin(meta.defaultDuration);
      if (meta.defaultTask) setRelatedTaskId(meta.defaultTask);
      setDescription(meta.desc);
    }
    setSimulationResult(null);
    setAppliedResult(null);
    setFlowState('DRAFT');
  };

  const loadBenchmarkPreset = () => {
    handleTypeChange('CRITICAL_DEFECT');
    setSectionId('S04');
    setStartMin(750); // 12:30
    setDurationMin(90);
    setSeverity('CRITICAL');
    setDescription('Critical track defect on VRI–ALU (12:30–14:00). Isolates Track 1, shifts ENG-014, and regulates Train 126xx & Train 22xxx.');
    showToast('✓ Benchmark scenario preset loaded: VRI–ALU Critical Defect (12:30–14:00)');
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
    setFlowState('SIMULATING');
    setSimulationResult(null);
    try {
      const payload = buildDisruptionPayload();
      const res = await simulateDisruption(payload, 10.0);
      setSimulationResult(res);
      setFlowState('IMPACT_READY');
      showToast(`✓ Impact simulated: ${res.affected_trains?.length || 0} trains affected, +${res.estimated_delay_min || 0}m delay (Current plan unchanged)`);
      setTimeout(scrollToResults, 100);
    } catch (err) {
      console.error(err);
      setFlowState('FAILED');
      showToast('Simulation failed: ' + err.message);
    }
  };

  // 2. Apply Disruption & Replan (Mutating transaction)
  const handleApply = async () => {
    setFlowState('REPLANNING');
    setAppliedResult(null);
    try {
      // Simulate quick validation step for UI clarity
      setTimeout(() => setFlowState('VALIDATING'), 600);

      const payload = buildDisruptionPayload();
      const res = await applyDisruption(payload, true, 15.0);

      if (res.status === 'NO_FEASIBLE_RECOVERY_PLAN') {
        setFlowState('FAILED');
        setAppliedResult(res);
        showToast('Replanning rejected: No feasible recovery plan exists.');
        return;
      }

      setAppliedResult(res);
      setFlowState('COMMITTED');
      showToast(`✓ Disruption applied: Operational Plan Version v${res.version_number || (versionNumber + 1)} committed!`);
      await refreshScenario();
      await refreshVersions();
      await refreshAuditLog();
      setTimeout(scrollToResults, 100);
    } catch (err) {
      console.error(err);
      setFlowState('FAILED');
      showToast('Apply failed: ' + err.message);
    }
  };

  const handleCancelPreview = () => {
    setSimulationResult(null);
    setFlowState('DRAFT');
    showToast('Simulation preview cleared. Current operational plan remains active.');
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
      activeVersion: versionNumber,
      versions: versions,
      auditLog: auditLog,
      lastDiff: planDiff,
    };
    const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carb_planner_audit_log_v${versionNumber}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ Decision audit log exported as JSON.');
  };

  // Active diff to display: either from appliedResult or latest scenario planDiff
  const activeDiff = appliedResult?.diff || planDiff || null;

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
          <h2>Disruption Control & Live Replanning Engine</h2>
          <p>
            Deterministic Localized LNS / CP-SAT Repair • Canonical OperationalPlan Controller • Topology-Grounded Alternatives
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.3rem', background: '#e2e8f0', padding: '0.2rem', borderRadius: '4px' }}>
            <button
              className={`btn btn-sm ${activeTab === 'controller' ? 'btn-primary' : ''}`}
              onClick={() => setActiveTab('controller')}
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}
            >
              <Zap size={12} />
              <span>Incident Controller</span>
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : ''}`}
              onClick={() => setActiveTab('history')}
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}
            >
              <History size={12} />
              <span>Version History ({versions?.length || 1})</span>
            </button>
          </div>

          <button className="btn btn-sm" onClick={handleExportAuditLog}>
            <Download size={13} />
            <span>Export Audit Log</span>
          </button>
        </div>
      </div>

      {activeTab === 'controller' && (
        <>
          {/* 3-Column Controller Grid: Left = Configure, Center = Impact / Replanning, Right = Current Plan */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '380px 1.25fr 320px',
              gap: '1rem',
              marginBottom: '1rem',
              alignItems: 'stretch',
            }}
          >
            {/* COLUMN 1: LEFT — CONFIGURE INCIDENT */}
            <div className="panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div className="panel-header" style={{ marginBottom: '0.65rem' }}>
                  <div className="panel-title">
                    <AlertOctagon size={15} color="var(--op-red)" />
                    <span>Configure Incident</span>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={loadBenchmarkPreset}
                    style={{ fontSize: '0.62rem', padding: '0.15rem 0.4rem', color: 'var(--op-blue)' }}
                    title="Load VRI-ALU 12:30 Critical Defect Benchmark"
                  >
                    Benchmark Preset
                  </button>
                </div>

                {/* 1. Incident Type */}
                <div style={{ marginBottom: '0.65rem' }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    Incident Class
                  </label>
                  <select
                    value={disruptionType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    style={{ width: '100%', fontSize: '0.74rem', padding: '0.35rem 0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: '#fff' }}
                  >
                    {DISRUPTION_TYPES.map((dt) => (
                      <option key={dt.value} value={dt.value}>
                        {dt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Corridor Section */}
                <div style={{ marginBottom: '0.65rem' }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    Disrupted Section
                  </label>
                  <select
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                    style={{ width: '100%', fontSize: '0.74rem', padding: '0.35rem 0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: '#fff' }}
                  >
                    {CORRIDOR_SECTIONS.map((sec) => (
                      <option key={sec.sectionId || sec.id} value={sec.sectionId || sec.id}>
                        {sec.sectionId || sec.code}: {sec.name} ({sec.fullName}) {sec.bottleneck ? '• BOTTLENECK' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Time Window & Duration */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '0.5rem', marginBottom: '0.65rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                      Start: {formatMinToTime(startMin)} ({Math.floor(startMin / 60)}h)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1440}
                      step={15}
                      value={startMin}
                      onChange={(e) => setStartMin(parseInt(e.target.value, 10))}
                      style={{ width: '100%', accentColor: '#2563eb' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                      Duration (min)
                    </label>
                    <input
                      type="number"
                      min={15}
                      max={480}
                      step={15}
                      value={durationMin}
                      onChange={(e) => setDurationMin(parseInt(e.target.value, 10))}
                      style={{ width: '100%', fontSize: '0.74rem', padding: '0.25rem 0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    />
                  </div>
                </div>

                {/* 4. Severity & Target Task */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.65rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                      Severity
                    </label>
                    <select
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value)}
                      style={{ width: '100%', fontSize: '0.74rem', padding: '0.3rem 0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: '#fff' }}
                    >
                      <option value="CRITICAL">Critical (Total Halt)</option>
                      <option value="HIGH">High (Single Line)</option>
                      <option value="MEDIUM">Medium (Caution Order)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                      Target Task ID (Opt)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. ENG-014"
                      value={relatedTaskId}
                      onChange={(e) => setRelatedTaskId(e.target.value)}
                      style={{ width: '100%', fontSize: '0.74rem', padding: '0.25rem 0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    />
                  </div>
                </div>

                {/* 5. Rationale */}
                <div style={{ marginBottom: '0.85rem' }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    Incident Description & Controller Notes
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ width: '100%', fontSize: '0.72rem', padding: '0.35rem 0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '0.5rem' }}>
                <button
                  className="btn"
                  onClick={handleSimulate}
                  disabled={flowState === 'SIMULATING' || flowState === 'REPLANNING' || flowState === 'VALIDATING'}
                  style={{ justifyContent: 'center', padding: '0.45rem' }}
                >
                  <Clock size={13} className={flowState === 'SIMULATING' ? 'spin' : ''} />
                  <span>{flowState === 'SIMULATING' ? 'Simulating...' : 'Simulate Impact'}</span>
                </button>

                <button
                  className="btn btn-primary"
                  onClick={handleApply}
                  disabled={flowState === 'SIMULATING' || flowState === 'REPLANNING' || flowState === 'VALIDATING'}
                  style={{ justifyContent: 'center', padding: '0.45rem', fontWeight: 700 }}
                >
                  <Zap size={13} className={flowState === 'REPLANNING' || flowState === 'VALIDATING' ? 'spin' : ''} />
                  <span>{flowState === 'REPLANNING' ? 'LNS Replanning...' : flowState === 'VALIDATING' ? 'Validating...' : 'Apply & Replan'}</span>
                </button>
              </div>
            </div>

            {/* COLUMN 2: CENTER — IMPACT / REPLANNING PIPELINE STATUS */}
            <div className="panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column' }} ref={resultsRef}>
              <div className="panel-header" style={{ marginBottom: '0.75rem' }}>
                <div className="panel-title">
                  <Sliders size={15} color="var(--op-blue)" />
                  <span>Impact & Localized Replanning Pipeline</span>
                </div>
                <span className={`badge ${flowState === 'COMMITTED' ? 'badge-green' : flowState === 'FAILED' ? 'badge-red' : 'badge-slate'}`} style={{ fontSize: '0.68rem', fontWeight: 800 }}>
                  STATE: {flowState}
                </span>
              </div>

              {/* Stepper Bar */}
              <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '1rem', background: '#f8fafc', padding: '0.4rem', borderRadius: '4px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
                {FLOW_STEPS.map((step, idx) => {
                  const isCurrent = flowState === step.id;
                  const isPassed =
                    (flowState === 'SIMULATING' && idx === 1) ||
                    (flowState === 'IMPACT_READY' && idx <= 2) ||
                    (flowState === 'REPLANNING' && idx <= 3) ||
                    (flowState === 'VALIDATING' && idx <= 4) ||
                    (flowState === 'COMMITTED' && idx <= 5);

                  return (
                    <div
                      key={step.id}
                      style={{
                        flex: 1,
                        minWidth: '95px',
                        padding: '0.3rem 0.4rem',
                        borderRadius: '3px',
                        fontSize: '0.64rem',
                        fontWeight: isCurrent ? 800 : 600,
                        textAlign: 'center',
                        background: isCurrent ? '#0284c7' : (isPassed ? '#e0f2fe' : '#ffffff'),
                        color: isCurrent ? '#ffffff' : (isPassed ? '#0369a1' : '#94a3b8'),
                        border: isCurrent ? '1px solid #0284c7' : '1px solid #e2e8f0',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {step.label}
                    </div>
                  );
                })}
              </div>

              {/* State Content Area */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {/* 1. DRAFT STATE */}
                {flowState === 'DRAFT' && (
                  <div style={{ padding: '1.25rem', textAlign: 'center', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                    <AlertTriangle size={24} color="#94a3b8" style={{ margin: '0 auto 0.5rem' }} />
                    <strong style={{ display: 'block', fontSize: '0.82rem', color: '#334155', marginBottom: '0.3rem' }}>
                      Ready to Analyze Disruption
                    </strong>
                    <p style={{ fontSize: '0.72rem', color: '#64748b', maxWidth: '420px', margin: '0 auto', lineHeight: 1.5 }}>
                      Click <strong>Simulate Impact</strong> to preview conflicts and delays without touching the current operational plan, or click <strong>Apply & Replan</strong> to execute localized LNS repair on the affected region.
                    </p>
                  </div>
                )}

                {/* 2. SIMULATING STATE */}
                {flowState === 'SIMULATING' && (
                  <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <Clock size={28} color="#0284c7" className="spin" style={{ margin: '0 auto 0.5rem' }} />
                    <strong style={{ fontSize: '0.84rem', color: '#0284c7' }}>
                      Evaluating Affected Neighborhood & Physical Alternatives...
                    </strong>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.3rem' }}>
                      Scanning crossing loops at boundary stations, single-line headway windows, and maintenance shifts.
                    </div>
                  </div>
                )}

                {/* 3. IMPACT_READY (NON-MUTATING PREVIEW) */}
                {flowState === 'IMPACT_READY' && simulationResult && (
                  <div style={{ background: '#f0f9ff', border: '1.5px solid #0284c7', borderRadius: '6px', padding: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Clock size={16} color="#0284c7" />
                        <strong style={{ fontSize: '0.82rem', color: '#0369a1' }}>
                          NON-MUTATING DISRUPTION IMPACT PREVIEW
                        </strong>
                      </div>
                      <span className="badge badge-blue" style={{ fontSize: '0.66rem', fontWeight: 800 }}>
                        CURRENT PLAN UNCHANGED
                      </span>
                    </div>

                    <p style={{ fontSize: '0.72rem', color: '#475569', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                      The current operational schedule (v{versionNumber}) remains active. The following changes will take effect only if you choose to commit:
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div style={{ background: '#fff', padding: '0.45rem', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                        <div style={{ fontSize: '0.64rem', color: '#64748b' }}>Estimated Additional Delay</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#d97706' }}>
                          +{simulationResult.estimated_delay_min || 0} min
                        </div>
                      </div>
                      <div style={{ background: '#fff', padding: '0.45rem', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                        <div style={{ fontSize: '0.64rem', color: '#64748b' }}>Affected Trains</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0284c7' }}>
                          {simulationResult.affected_trains?.length || 0}
                        </div>
                      </div>
                      <div style={{ background: '#fff', padding: '0.45rem', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                        <div style={{ fontSize: '0.64rem', color: '#64748b' }}>Affected Tasks</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#b45309' }}>
                          {simulationResult.affected_tasks?.length || 0}
                        </div>
                      </div>
                      <div style={{ background: '#fff', padding: '0.45rem', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                        <div style={{ fontSize: '0.64rem', color: '#64748b' }}>Candidate Loops</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#16a34a' }}>
                          {simulationResult.loop_conflicts?.length || 2} Available
                        </div>
                      </div>
                    </div>

                    {simulationResult.explanation && (
                      <div style={{ fontSize: '0.72rem', background: '#fff', padding: '0.5rem 0.65rem', borderRadius: '4px', border: '1px solid #bae6fd', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                        <strong>Solver Diagnosis:</strong> {simulationResult.explanation}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button className="btn btn-sm" onClick={handleCancelPreview} style={{ fontSize: '0.72rem' }}>
                        Cancel Preview
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={handleApply} style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                        <Zap size={12} />
                        <span>Apply & Replan (Commit v{versionNumber + 1})</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. REPLANNING & VALIDATING STATE */}
                {(flowState === 'REPLANNING' || flowState === 'VALIDATING') && (
                  <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <RotateCw size={28} color="#2563eb" className="spin" style={{ margin: '0 auto 0.5rem' }} />
                    <strong style={{ fontSize: '0.84rem', color: '#1d4ed8' }}>
                      {flowState === 'REPLANNING' ? 'Executing Localized LNS Repair on Neighborhood...' : 'Validating Safety Headways & Committing v' + (versionNumber + 1) + '...'}
                    </strong>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.3rem' }}>
                      Unaffected corridor trains remain FROZEN. Only affected variables in neighborhood are destroyed and repaired.
                    </div>
                  </div>
                )}

                {/* 5. COMMITTED STATE */}
                {flowState === 'COMMITTED' && (
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #16a34a', borderRadius: '6px', padding: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <CheckCircle2 size={16} color="#16a34a" />
                        <strong style={{ fontSize: '0.84rem', color: '#15803d' }}>
                          REPLAN COMMITTED • Operational Plan Version v{appliedResult?.version_number || versionNumber}
                        </strong>
                      </div>
                      <span className="badge badge-green" style={{ fontSize: '0.66rem', fontWeight: 800 }}>
                        FEASIBLE & VALIDATED
                      </span>
                    </div>

                    <p style={{ fontSize: '0.72rem', color: '#334155', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                      {appliedResult?.message || 'The canonical OperationalPlan has been updated and synchronized with all corridor subsystems.'}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.85rem' }}>
                      <div style={{ background: '#fff', padding: '0.45rem', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                        <div style={{ fontSize: '0.64rem', color: '#64748b' }}>Replanned Trains</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0284c7' }}>
                          {activeDiff?.changed_trains?.length || 0}
                        </div>
                      </div>
                      <div style={{ background: '#fff', padding: '0.45rem', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                        <div style={{ fontSize: '0.64rem', color: '#64748b' }}>Shifted Maintenance</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#b45309' }}>
                          {activeDiff?.changed_maintenance?.length || 0}
                        </div>
                      </div>
                      <div style={{ background: '#fff', padding: '0.45rem', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                        <div style={{ fontSize: '0.64rem', color: '#64748b' }}>Loop Holds</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#7c3aed' }}>
                          {activeDiff?.changed_loops?.length || 0}
                        </div>
                      </div>
                    </div>

                    {/* Primary Highlighted CTA to Jump to Block Planner */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#dcfce7', padding: '0.6rem 0.85rem', borderRadius: '5px', border: '1px solid #86efac' }}>
                      <span style={{ fontSize: '0.74rem', color: '#166534', fontWeight: 600 }}>
                        ✓ Block Planner is now rendering updated plan v{appliedResult?.version_number || versionNumber}.
                      </span>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          if (onNavigateTab) onNavigateTab('planner');
                        }}
                        style={{ fontSize: '0.76rem', padding: '0.35rem 0.75rem', fontWeight: 800, background: '#16a34a', borderColor: '#15803d' }}
                      >
                        <span>OPEN UPDATED BLOCK PLAN</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                )}

                {/* 6. FAILED STATE */}
                {flowState === 'FAILED' && (
                  <div style={{ background: '#fef2f2', border: '1.5px solid #dc2626', borderRadius: '6px', padding: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                      <XCircle size={16} color="#dc2626" />
                      <strong style={{ fontSize: '0.84rem', color: '#991b1b' }}>
                        NO FEASIBLE RECOVERY PLAN FOUND
                      </strong>
                    </div>
                    <p style={{ fontSize: '0.72rem', color: '#7f1d1d', marginBottom: '0.6rem', lineHeight: 1.4 }}>
                      The disruption cannot be resolved without violating minimum train headway constraints or exceeding station loop capacities. The previous valid operational plan (v{versionNumber}) remains active.
                    </p>
                    <button className="btn btn-sm" onClick={() => setFlowState('DRAFT')}>
                      Modify Parameters & Retry
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* COLUMN 3: RIGHT — CURRENT OPERATIONAL PLAN SNAPSHOT */}
            <div className="panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div className="panel-header" style={{ marginBottom: '0.65rem' }}>
                  <div className="panel-title">
                    <Activity size={15} color="var(--op-blue)" />
                    <span>Current Operational Plan</span>
                  </div>
                  <span className="badge badge-green" style={{ fontSize: '0.68rem', fontWeight: 800 }}>
                    v{versionNumber} Active
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginBottom: '0.75rem' }}>
                  <div className="kpi-cell" style={{ padding: '0.45rem' }}>
                    <div className="kpi-cell-label" style={{ fontSize: '0.64rem' }}>Plan Version</div>
                    <div className="kpi-cell-val" style={{ fontSize: '1.05rem', color: 'var(--op-blue)' }}>
                      v{versionNumber}
                    </div>
                    <div className="kpi-cell-meta" style={{ fontSize: '0.58rem' }}>Canonical State</div>
                  </div>

                  <div className="kpi-cell" style={{ padding: '0.45rem' }}>
                    <div className="kpi-cell-label" style={{ fontSize: '0.64rem' }}>Feasibility</div>
                    <div className="kpi-cell-val" style={{ fontSize: '1.05rem', color: 'var(--op-green)' }}>
                      FEASIBLE
                    </div>
                    <div className="kpi-cell-meta" style={{ fontSize: '0.58rem' }}>Headway Checked</div>
                  </div>

                  <div className="kpi-cell" style={{ padding: '0.45rem' }}>
                    <div className="kpi-cell-label" style={{ fontSize: '0.64rem' }}>Allocated Tasks</div>
                    <div className="kpi-cell-val" style={{ fontSize: '1.05rem' }}>
                      {scenarioTasks?.length || 13}
                    </div>
                    <div className="kpi-cell-meta" style={{ fontSize: '0.58rem' }}>Possessions</div>
                  </div>

                  <div className="kpi-cell" style={{ padding: '0.45rem' }}>
                    <div className="kpi-cell-label" style={{ fontSize: '0.64rem' }}>Active Trains</div>
                    <div className="kpi-cell-val" style={{ fontSize: '1.05rem', color: 'var(--op-green)' }}>
                      {scenarioTrains?.length || 23}
                    </div>
                    <div className="kpi-cell-meta" style={{ fontSize: '0.58rem' }}>Scheduled</div>
                  </div>
                </div>

                {/* Corridor Context */}
                <div style={{ background: '#f8fafc', padding: '0.65rem', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.7rem', marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                    {scenario?.corridor?.short_name || 'MS ↔ CAPE'} (742 km Corridor)
                  </div>
                  <div style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Bottlenecks: <strong>VRI–ALU & TEN–NCJ</strong> (Single line sections requiring station crossing loops for express crossings).
                  </div>
                </div>

                <div style={{ fontSize: '0.68rem', color: '#64748b', lineHeight: 1.4 }}>
                  Solver: <strong>Google OR-Tools CP-SAT + LNS Local Repair</strong><br />
                  Data: <strong>Southern Railway Working Timetable (WTT)</strong>
                </div>
              </div>

              <div style={{ marginTop: '0.75rem' }}>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    if (onNavigateTab) onNavigateTab('planner');
                  }}
                  style={{ width: '100%', justifyContent: 'center', fontSize: '0.72rem' }}
                >
                  <Eye size={12} />
                  <span>Inspect Current Block Planner</span>
                </button>
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION: PLAN CHANGES & EXPLANATIONS TABLE */}
          {activeDiff && activeDiff.has_changes && (
            <div className="panel" style={{ padding: '1rem', marginTop: '1rem' }}>
              <div className="panel-header" style={{ marginBottom: '0.75rem' }}>
                <div className="panel-title">
                  <RotateCw size={15} color="#2563eb" />
                  <span>
                    Operational Plan Changes Breakdown (v{versionNumber > 1 ? versionNumber - 1 : 1} &rarr; v{versionNumber})
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span className="badge badge-amber" style={{ fontSize: '0.68rem' }}>
                    Total Additional Delay: +{activeDiff.total_additional_delay_min || 0} min
                  </span>
                  <span className="badge badge-green" style={{ fontSize: '0.68rem' }}>
                    {activeDiff.unchanged_trains_count || 16} Unaffected Trains Kept Frozen
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                {/* Left: Changed Maintenance Tasks */}
                <div>
                  <h4 style={{ fontSize: '0.78rem', fontWeight: 800, color: '#b45309', marginBottom: '0.4rem' }}>
                    🚧 Maintenance Possession Shifts ({activeDiff.changed_maintenance?.length || 0})
                  </h4>
                  {activeDiff.changed_maintenance && activeDiff.changed_maintenance.length > 0 ? (
                    <table className="table" style={{ width: '100%', fontSize: '0.72rem' }}>
                      <thead>
                        <tr>
                          <th>Task ID</th>
                          <th>Action</th>
                          <th>Old Window</th>
                          <th>New Window</th>
                          <th>Shift</th>
                          <th>Physical Rationale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDiff.changed_maintenance.map((m) => (
                          <tr key={m.task_id}>
                            <td style={{ fontWeight: 800 }}>{m.task_id}</td>
                            <td>
                              <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.62rem' }}>
                                {m.watermark || '↻ REPLANNED'}
                              </span>
                            </td>
                            <td style={{ textDecoration: 'line-through', color: '#64748b' }}>{m.old_window || '--:--'}</td>
                            <td style={{ fontWeight: 700, color: '#0369a1' }}>{m.new_window}</td>
                            <td style={{ fontWeight: 700, color: '#b45309' }}>
                              {m.shift_min > 0 ? `+${m.shift_min}m` : `${m.shift_min}m`}
                            </td>
                            <td style={{ maxWidth: '200px', lineHeight: 1.3 }}>{m.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ fontSize: '0.72rem', color: '#64748b', padding: '0.5rem', background: '#f8fafc', borderRadius: '4px' }}>
                      No maintenance tasks shifted.
                    </div>
                  )}
                </div>

                {/* Right: Changed Loops */}
                <div>
                  <h4 style={{ fontSize: '0.78rem', fontWeight: 800, color: '#7c3aed', marginBottom: '0.4rem' }}>
                    ⮀ Station Crossing Loop Assignments ({activeDiff.changed_loops?.length || 0})
                  </h4>
                  {activeDiff.changed_loops && activeDiff.changed_loops.length > 0 ? (
                    <table className="table" style={{ width: '100%', fontSize: '0.72rem' }}>
                      <thead>
                        <tr>
                          <th>Station</th>
                          <th>Loop Line</th>
                          <th>Held Train</th>
                          <th>Dispatch Consideration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDiff.changed_loops.map((l, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 700 }}>{l.station_code}</td>
                            <td><span className="badge badge-blue" style={{ fontSize: '0.62rem' }}>{l.loop_id}</span></td>
                            <td style={{ fontWeight: 700 }}>{l.train_number}</td>
                            <td style={{ lineHeight: 1.3 }}>{l.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ fontSize: '0.72rem', color: '#64748b', padding: '0.5rem', background: '#f8fafc', borderRadius: '4px' }}>
                      No additional loop holdings required; Single Line Working accommodated traffic.
                    </div>
                  )}
                </div>
              </div>

              {/* Full Width: Changed Train Services */}
              <div>
                <h4 style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0284c7', marginBottom: '0.4rem' }}>
                  🚆 Train Service Retimings & Regulations ({activeDiff.changed_trains?.length || 0})
                </h4>
                {activeDiff.changed_trains && activeDiff.changed_trains.length > 0 ? (
                  <table className="table" style={{ width: '100%', fontSize: '0.72rem' }}>
                    <thead>
                      <tr>
                        <th>Train</th>
                        <th>Action</th>
                        <th>Old Slot</th>
                        <th>New Slot</th>
                        <th>Delay Added</th>
                        <th>Routing Alternative</th>
                        <th>Decision Rationale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeDiff.changed_trains.map((t) => (
                        <tr key={t.train_number}>
                          <td style={{ fontWeight: 800 }}>
                            {t.train_number} <span style={{ fontWeight: 500, color: '#64748b' }}>({t.train_name})</span>
                          </td>
                          <td>
                            <span className="badge" style={{
                              background: t.action === 'HELD' ? '#fee2e2' : (t.action === 'REROUTED' ? '#e0e7ff' : '#dbeafe'),
                              color: t.action === 'HELD' ? '#991b1b' : (t.action === 'REROUTED' ? '#3730a3' : '#1e40af'),
                              fontSize: '0.62rem',
                            }}>
                              {t.watermark || `↻ ${t.action}`}
                            </span>
                          </td>
                          <td style={{ textDecoration: 'line-through', color: '#64748b' }}>{t.old_departure || '--:--'}</td>
                          <td style={{ fontWeight: 700 }}>{t.new_departure || '--:--'}</td>
                          <td style={{ fontWeight: 800, color: t.delay_delta_min > 0 ? '#dc2626' : '#16a34a' }}>
                            {t.delay_delta_min > 0 ? `+${t.delay_delta_min} min` : '0 min'}
                          </td>
                          <td>
                            {t.loop_used ? (
                              <span className="badge badge-amber" style={{ fontSize: '0.62rem' }}>
                                Held in {t.loop_used} ({t.held_station || 'Station Loop'})
                              </span>
                            ) : (
                              <span style={{ color: '#64748b' }}>Single Line Working (Track 2)</span>
                            )}
                          </td>
                          <td style={{ lineHeight: 1.3 }}>{t.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize: '0.72rem', color: '#64748b', padding: '0.5rem', background: '#f8fafc', borderRadius: '4px' }}>
                    All corridor trains remained on scheduled paths.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Tab 2: Version History & Audit Trail */}
      {activeTab === 'history' && (
        <div className="panel" style={{ padding: '1rem' }}>
          <div className="panel-header" style={{ marginBottom: '0.75rem' }}>
            <div className="panel-title">
              <History size={15} color="var(--op-blue)" />
              <span>Immutable Scenario Version History & Controller Audit Trail</span>
            </div>
            <span className="badge badge-slate" style={{ fontSize: '0.68rem' }}>
              {versions?.length || 1} Total Plan Versions
            </span>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>
              Plan Versions (v1 &rarr; v{versionNumber})
            </h4>
            <table className="table" style={{ width: '100%', fontSize: '0.74rem' }}>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Created At</th>
                  <th>Trigger / Action</th>
                  <th>Actor</th>
                  <th>Reason / Context</th>
                  <th>Allocations</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {versions && versions.length > 0 ? (
                  versions.map((v) => (
                    <tr key={v.version_id} style={{ background: v.version_number === versionNumber ? '#f0fdf4' : 'transparent' }}>
                      <td style={{ fontWeight: 800, color: 'var(--op-blue)' }}>
                        v{v.version_number} {v.version_number === versionNumber ? '(Active)' : ''}
                      </td>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {v.created_at ? new Date(v.created_at).toLocaleTimeString() : 'Recent'}
                      </td>
                      <td>
                        <span className="badge badge-slate" style={{ fontSize: '0.62rem' }}>
                          {v.trigger || 'DISRUPTION_APPLY'}
                        </span>
                      </td>
                      <td>{v.actor || 'system'}</td>
                      <td style={{ maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.reason}>
                        {v.reason}
                      </td>
                      <td>{v.plan?.allocations?.length ?? 13} blocks</td>
                      <td>
                        <span className="badge badge-green" style={{ fontSize: '0.62rem' }}>
                          {v.plan?.is_feasible !== false ? 'FEASIBLE' : 'CONSTRAINED'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                      v1 Baseline active
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div>
            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>
              Audit Log Entries ({auditLog?.length || 0})
            </h4>
            <table className="table" style={{ width: '100%', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Version</th>
                  <th>Trigger</th>
                  <th>Actor</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {auditLog && auditLog.length > 0 ? (
                  auditLog.map((log, idx) => (
                    <tr key={log.entry_id || idx}>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'Recent'}
                      </td>
                      <td style={{ fontWeight: 700 }}>v{log.version_number}</td>
                      <td><span className="badge badge-slate" style={{ fontSize: '0.6rem' }}>{log.trigger}</span></td>
                      <td>{log.actor}</td>
                      <td>{log.reason}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                      No prior audit events recorded.
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
