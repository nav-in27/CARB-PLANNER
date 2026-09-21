import React, { useState } from 'react';
import { ShieldCheck, Edit3, X, CheckCircle2, AlertTriangle, FileCheck } from 'lucide-react';
import { useScenario } from '../context/ScenarioContext';

export default function HumanApprovalModal({
  mode, // 'review' | 'approve' | 'override'
  onClose,
  onConfirmApprove,
  onConfirmOverride,
}) {
  const { scenario, corridor, tasks, trains, updateTask } = useScenario();

  const [overrideTask, setOverrideTask] = useState(tasks?.[0]?.task_id || 'ENG-014');
  const [overrideTime, setOverrideTime] = useState('11:00–12:45');
  const [overrideReason, setOverrideReason] = useState(
    'Special track inspection window requested by Divisional Railway Manager (DRM) inspection special'
  );

  const selectedTaskObj = tasks?.find((t) => (t.task_id || t.taskId) === overrideTask);

  const corridorTitle = corridor ? `${corridor.name} (${corridor.origin_code} ↔ ${corridor.destination_code} • ${corridor.length_km} km)` : 'Grand South Trunk Corridor (MS ↔ CAPE • 742 km)';
  const divisionText = corridor?.divisions ? `Southern Railway • ${corridor.divisions.join(', ')} Divisions` : 'Southern Railway • Chennai, Trichy, Madurai, TVC Divisions';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.65rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {mode === 'override' ? (
              <Edit3 size={16} color="var(--op-amber)" />
            ) : mode === 'approve' ? (
              <ShieldCheck size={16} color="var(--op-green)" />
            ) : (
              <FileCheck size={16} color="var(--op-blue)" />
            )}
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
              {mode === 'override'
                ? 'Manual Controller Override'
                : mode === 'approve'
                ? 'Authorize Corridor Block Plan'
                : 'Controller Operations Plan Review'}
            </h3>
          </div>
          <button
            className="btn btn-sm"
            style={{ border: 'none', padding: '0.2rem' }}
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        {/* Content depending on mode */}
        {mode === 'approve' ? (
          <div>
            <div style={{ padding: '0.75rem', borderRadius: '4px', background: 'var(--op-green-bg)', border: '1px solid var(--op-green-border)', marginBottom: '1rem', fontSize: '0.78rem' }}>
              <strong style={{ color: 'var(--op-green)' }}>Formal Section Controller Authorization</strong>
              <p style={{ marginTop: '0.25rem', color: 'var(--text-secondary)' }}>
                You are authorizing the coordinated rolling maintenance block plan for {divisionText} across the {corridorTitle}.
              </p>
            </div>

            <div style={{ fontSize: '0.76rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
              <div className="audit-row">
                <div className="audit-label">Asset Availability Certified</div>
                <div className="audit-value"><strong>94.8%</strong> (Exceeds 90% benchmark)</div>
              </div>
              <div className="audit-row">
                <div className="audit-label">Headway Safety Margin</div>
                <div className="audit-value">Zero train conflicts; LightGBM P90 duration uncertainty buffers active</div>
              </div>
              <div className="audit-row">
                <div className="audit-label">Section Controller In Charge</div>
                <div className="audit-value">SC-SR-TPJ-MAS-01 (Southern Railway Central Operations Control)</div>
              </div>
              <div className="audit-row">
                <div className="audit-label">Bottlenecks Protected</div>
                <div className="audit-value">VRI–ALU (54 km) and TEN–NCJ (73 km) single-line absolute block protocol</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-success"
                onClick={() => {
                  if (onConfirmApprove) onConfirmApprove();
                  onClose();
                }}
              >
                <CheckCircle2 size={13} />
                <span>Confirm & Sign Plan</span>
              </button>
            </div>
          </div>
        ) : mode === 'override' ? (
          <div>
            <div style={{ padding: '0.75rem', borderRadius: '4px', background: 'var(--op-amber-bg)', border: '1px solid var(--op-amber-border)', marginBottom: '1rem', fontSize: '0.78rem' }}>
              <strong style={{ color: 'var(--op-amber)' }}>Safety Protocol Notice</strong>
              <p style={{ marginTop: '0.25rem', color: 'var(--text-secondary)' }}>
                Manual overrides shift system-calculated CP-SAT optimal windows. Reason will be logged in the Southern Railway permanent audit trail.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.76rem', marginBottom: '1rem' }}>
              <div>
                <label className="audit-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
                  Select Maintenance Task to Override
                </label>
                <select
                  value={overrideTask}
                  onChange={(e) => setOverrideTask(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-workspace)',
                  }}
                >
                  {(tasks && tasks.length > 0 ? tasks : [
                    { task_id: 'ENG-014', work_type: 'Track Tamping CSM-09', section_id: 'MS-CGL' },
                    { task_id: 'TRD-009', work_type: 'OHE Contact Wire Inspection', section_id: 'CGL-VM' },
                    { task_id: 'SNT-021', work_type: 'Electronic Interlocking Point Calibration', section_id: 'VRI-ALU' },
                    { task_id: 'ENG-022', work_type: 'BCM Deep Ballast Screening', section_id: 'VRI-ALU' },
                    { task_id: 'ENG-040', work_type: 'Night Shadow Heavy Track Tamping', section_id: 'MS-CGL' },
                    { task_id: 'TRD-042', work_type: 'Night OHE Catenary Wire Renewal', section_id: 'CGL-VM' },
                  ]).map((t) => {
                    const tid = t.task_id || t.taskId;
                    const name = t.work_type || t.short_title || t.title;
                    const sec = t.section_id || t.sectionId;
                    return (
                      <option key={tid} value={tid}>
                        {tid}: {name} ({sec})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="audit-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
                  System Calculated Allocation (Previous Decision)
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedTaskObj ? `${selectedTaskObj.planned_block || '08:45–10:30'} (P90: ${selectedTaskObj.p90_duration || 105} min)` : '08:45–10:30 (P90: 105 min)'}
                  style={{
                    width: '100%',
                    padding: '0.4rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-workspace)',
                    color: 'var(--text-muted)',
                  }}
                />
              </div>

              <div>
                <label className="audit-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
                  Revised Controller Decision (New Window)
                </label>
                <input
                  type="text"
                  value={overrideTime}
                  onChange={(e) => setOverrideTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    background: '#ffffff',
                  }}
                />
              </div>

              <div>
                <label className="audit-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
                  Operational Justification / Reason
                </label>
                <textarea
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    background: '#ffffff',
                    fontSize: '0.76rem',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  updateTask(overrideTask, { planned_block: overrideTime, status: 'Overridden' });
                  if (onConfirmOverride) {
                    onConfirmOverride({ task: overrideTask, newWindow: overrideTime, reason: overrideReason });
                  }
                  onClose();
                }}
              >
                <span>Apply Manual Override</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Review Plan Summary */}
            <div style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem' }}>
              <div className="audit-row">
                <div className="audit-label">Corridor Route</div>
                <div className="audit-value">{corridorTitle}</div>
              </div>
              <div className="audit-row">
                <div className="audit-label">Divisional Jurisdiction</div>
                <div className="audit-value">{divisionText}</div>
              </div>
              <div className="audit-row">
                <div className="audit-label">Active Train Movements</div>
                <div className="audit-value">{trains?.length || 23} Corridor Services (Vande Bharat, Tejas, Superfast, Express, Freight)</div>
              </div>
              <div className="audit-row">
                <div className="audit-label">Delay Impact Evaluation</div>
                <div className="audit-value">0 min express delay; 100% safety headway certified</div>
              </div>
              <div className="audit-row">
                <div className="audit-label">Bottleneck Sections Protected</div>
                <div className="audit-value">Vriddhachalam–Ariyalur (VRI–ALU, 54 km) &amp; Tirunelveli–Nagercoil (TEN–NCJ, 73 km)</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={onClose}>Close Review</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
