import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  X,
  Layers,
  Clock,
  ArrowRight,
  TrendingDown,
  Info,
} from 'lucide-react';
import { useScenario } from '../context/ScenarioContext';

export default function DownstreamImpactModal() {
  const {
    impactModalOpen,
    closeImpactModal,
    impactReport,
  } = useScenario();

  if (!impactModalOpen || !impactReport) return null;

  const {
    change_description,
    affected_weekly_plans,
    affected_daily_plans,
    affected_train_movements,
    affected_joint_possessions,
    replanning_required,
    message,
  } = impactReport;

  return (
    <div className="horizon-modal-overlay" onClick={closeImpactModal}>
      <div className="horizon-modal-content" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="horizon-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingDown size={18} color={replanning_required ? 'var(--op-amber)' : 'var(--op-blue)'} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                Downstream Cascading Impact Assessment
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                PREVENTS SILENT MUTATIONS ACROSS LOWER PLANNING HORIZONS
              </div>
            </div>
          </div>
          <button className="btn btn-sm" onClick={closeImpactModal}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="horizon-modal-body">
          {/* Change Intent Summary */}
          <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px', marginBottom: '14px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              PROPOSED HORIZON MODIFICATION
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
              {change_description}
            </div>
          </div>

          {/* Status Alert */}
          <div
            style={{
              background: replanning_required ? 'var(--op-amber-bg)' : 'var(--op-green-bg)',
              border: `1px solid ${replanning_required ? 'var(--op-amber-border)' : 'var(--op-green-border)'}`,
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '14px',
              display: 'flex',
              gap: '10px',
            }}
          >
            {replanning_required ? (
              <AlertTriangle size={20} color="var(--op-amber)" style={{ flexShrink: 0, marginTop: '2px' }} />
            ) : (
              <CheckCircle2 size={20} color="var(--op-green)" style={{ flexShrink: 0, marginTop: '2px' }} />
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.84rem', color: replanning_required ? 'var(--op-amber)' : 'var(--op-green)' }}>
                {replanning_required ? 'DOWNSTREAM REPLANNING REQUIRED' : 'ZERO DOWNSTREAM CLASHES'}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                {message}
              </div>
            </div>
          </div>

          {/* Impact Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '14px' }}>
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '8px', textAlign: 'center', background: '#ffffff' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Affected Weeks
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {affected_weekly_plans?.length || 0}
              </div>
            </div>

            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '8px', textAlign: 'center', background: '#ffffff' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Affected Daily Plans
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {affected_daily_plans?.length || 0}
              </div>
            </div>

            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '8px', textAlign: 'center', background: '#ffffff' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Train Paths Shifted
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--op-blue)' }}>
                {affected_train_movements || 0}
              </div>
            </div>

            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '8px', textAlign: 'center', background: '#ffffff' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Broken Bundles
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: affected_joint_possessions > 0 ? 'var(--op-red)' : 'var(--op-green)' }}>
                {affected_joint_possessions || 0}
              </div>
            </div>
          </div>

          {/* Affected Plan Versions */}
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px 12px', background: '#fafafa' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
              AFFECTED DOWNSTREAM PLAN VERSIONS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(affected_weekly_plans || []).map((w, idx) => (
                <span key={idx} className="badge badge-slate" style={{ fontSize: '0.72rem' }}>
                  {w}
                </span>
              ))}
              {(affected_daily_plans || []).map((d, idx) => (
                <span key={idx} className="badge badge-blue" style={{ fontSize: '0.72rem' }}>
                  {d}
                </span>
              ))}
              {(!affected_weekly_plans || affected_weekly_plans.length === 0) && (!affected_daily_plans || affected_daily_plans.length === 0) && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>None</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="horizon-modal-footer">
          <button className="btn btn-sm" onClick={closeImpactModal}>
            Cancel
          </button>
          <button className="btn btn-sm btn-primary" onClick={closeImpactModal}>
            Acknowledge Impact
          </button>
        </div>
      </div>
    </div>
  );
}
