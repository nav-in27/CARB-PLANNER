import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCheck,
  Edit3,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useScenario } from '../context/ScenarioContext';

export default function Header({
  onReviewPlan,
  onApprovePlan,
  onManualOverride,
  onResetDemo,
}) {
  const {
    corridor,
    planningDate,
    dataMode,
    solverStatus,
    approvalStatus,
    isLoading,
  } = useScenario();

  const isFeasible = solverStatus === 'OPTIMAL' || solverStatus === 'FEASIBLE';

  // Format planning date e.g. "2026-09-18" -> "18 Sep 2026"
  const formattedDate = (() => {
    try {
      const d = new Date(planningDate);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return planningDate;
    }
  })();

  return (
    <header className="top-header">
      {/* Left Metadata */}
      <div className="header-left">
        <div className="division-badge">
          <span>{corridor.zone} • Tamil Nadu Network</span>
        </div>

        <div style={{ height: '14px', width: '1px', background: 'var(--border-subtle)' }} />

        <div className="header-meta">
          <Clock size={13} color="var(--op-blue)" />
          <span>
            Corridor: <strong>{corridor.origin_code} ↔ {corridor.destination_code} ({corridor.total_distance_km} km)</strong>
          </span>
        </div>

        <div style={{ height: '14px', width: '1px', background: 'var(--border-subtle)' }} />

        <div className="header-meta">
          <span>Plan Status:</span>
          {approvalStatus === 'Approved' ? (
            <span className="badge badge-green">Plan Approved</span>
          ) : approvalStatus === 'Override' ? (
            <span className="badge badge-amber">Manual Override</span>
          ) : isFeasible ? (
            <span className="badge badge-green">Feasible</span>
          ) : (
            <span className="badge badge-red">Infeasible / Conflict</span>
          )}
        </div>

        <div style={{ height: '14px', width: '1px', background: 'var(--border-subtle)' }} />

        <div className="header-meta">
          <span>Solver: <strong>{solverStatus}</strong></span>
        </div>
      </div>

      {/* Right Metadata & Controller Human Approval Actions */}
      <div className="header-right">
        <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.74rem' }}>
          {formattedDate}
        </div>

        <span className={`badge ${dataMode === 'PUBLIC_TIMETABLE' ? 'badge-blue' : 'badge-amber'}`} style={{ fontSize: '0.65rem' }}>
          {dataMode === 'PUBLIC_TIMETABLE' ? 'PUBLIC TIMETABLE' : 'SIMULATION MODE'}
        </span>

        <span className="badge badge-slate" style={{ fontSize: '0.65rem' }}>
          System Operational
        </span>

        {/* Human Controller Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
          <button
            className="btn btn-sm"
            onClick={onReviewPlan}
            title="Review plan constraints and affected train paths"
          >
            <FileCheck size={13} />
            <span>Review Plan</span>
          </button>

          <button
            className={`btn btn-sm ${approvalStatus === 'Approved' ? 'btn-success' : 'btn-primary'}`}
            onClick={onApprovePlan}
            title="Human controller formal authorization"
          >
            <ShieldCheck size={13} />
            <span>{approvalStatus === 'Approved' ? 'Approved ✓' : 'Approve Plan'}</span>
          </button>

          <button
            className="btn btn-sm"
            onClick={onManualOverride}
            title="Controller manual override for emergency adjustment"
          >
            <Edit3 size={13} />
            <span>Override</span>
          </button>

          <button
            className="btn btn-sm"
            style={{ padding: '0.3rem 0.45rem', color: 'var(--text-muted)' }}
            onClick={onResetDemo}
            title="Re-run optimization and refresh scenario"
            disabled={isLoading}
          >
            <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
          </button>
        </div>
      </div>
    </header>
  );
}
