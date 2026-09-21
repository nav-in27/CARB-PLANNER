import React, { useState } from 'react';
import { ListCheck, Search, Filter, HelpCircle, ShieldAlert, CheckCircle, Clock } from 'lucide-react';

function slotToTime(slot) {
  if (slot === null || slot === undefined) return '—';
  const totalMin = slot * 15;
  const hours = Math.floor(totalMin / 60) % 24;
  const mins = totalMin % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export default function TaskQueueTab({ tasks, onOpenExplanation }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');

  const filteredTasks = tasks.filter((t) => {
    // Search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const match =
        t.task_id.toLowerCase().includes(q) ||
        t.section_id.toLowerCase().includes(q) ||
        t.department.toLowerCase().includes(q) ||
        t.task_type.toLowerCase().includes(q);
      if (!match) return false;
    }
    // Dept
    if (deptFilter !== 'ALL' && t.department.toLowerCase() !== deptFilter.toLowerCase()) {
      return false;
    }
    // Status
    if (statusFilter !== 'ALL' && t.status.toLowerCase() !== statusFilter.toLowerCase()) {
      return false;
    }
    // Risk
    if (riskFilter !== 'ALL' && t.risk_level.toLowerCase() !== riskFilter.toLowerCase()) {
      return false;
    }
    return true;
  });

  return (
    <div>
      {/* Search & Filter Header */}
      <div
        className="panel"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '0.85rem 1.25rem',
          marginBottom: '1rem',
        }}
      >
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1', minWidth: '220px' }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search by Task ID, Section, Department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              padding: '0.4rem 0.75rem',
              fontSize: '0.8rem',
              width: '100%',
            }}
          />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* Dept */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              padding: '0.4rem 0.6rem',
              fontSize: '0.75rem',
            }}
          >
            <option value="ALL">All Departments</option>
            <option value="Engineering">Engineering (P.Way)</option>
            <option value="S&T">S&T (Signals)</option>
            <option value="Electrical">Electrical (OHE)</option>
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              padding: '0.4rem 0.6rem',
              fontSize: '0.75rem',
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Deferred">Deferred</option>
            <option value="Pending">Pending</option>
          </select>

          {/* Risk */}
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              padding: '0.4rem 0.6rem',
              fontSize: '0.75rem',
            }}
          >
            <option value="ALL">All Risk Levels</option>
            <option value="CRITICAL">Critical Risk</option>
            <option value="HIGH">High Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="LOW">Low Risk</option>
          </select>
        </div>
      </div>

      {/* Task Queue Table */}
      <div className="panel" style={{ padding: '0.5rem', overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Task ID</th>
              <th>Dept & Work Type</th>
              <th>Section</th>
              <th>Asset Age / Defect</th>
              <th>AI Risk Tier</th>
              <th>AI Duration (P50 / P90)</th>
              <th>Allocated Window</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Explain</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((t) => {
              const isSched = t.status?.toLowerCase().includes('sched');
              const isDef = t.status?.toLowerCase().includes('def');
              const isCrit = t.risk_level === 'CRITICAL';

              return (
                <tr key={t.task_id} className="clickable" onClick={() => onOpenExplanation(t.task_id)}>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{t.task_id}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Priority {t.priority}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span
                        className="badge"
                        style={{
                          background:
                            t.department === 'Engineering'
                              ? 'rgba(249, 115, 22, 0.15)'
                              : t.department === 'S&T'
                              ? 'rgba(59, 130, 246, 0.15)'
                              : 'rgba(139, 92, 246, 0.15)',
                          color:
                            t.department === 'Engineering'
                              ? '#f97316'
                              : t.department === 'S&T'
                              ? '#3b82f6'
                              : '#8b5cf6',
                        }}
                      >
                        {t.department}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      {t.task_type}
                    </div>
                  </td>
                  <td>
                    <strong>{t.section_id}</strong>
                  </td>
                  <td>
                    <div>{t.asset_age || 10} yrs</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {t.defect_count || 0} defects • Cond {t.condition_score || 0.5}
                    </div>
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background:
                          t.risk_level === 'CRITICAL'
                            ? 'rgba(239, 68, 68, 0.2)'
                            : t.risk_level === 'HIGH'
                            ? 'rgba(249, 115, 22, 0.2)'
                            : t.risk_level === 'MEDIUM'
                            ? 'rgba(245, 158, 11, 0.2)'
                            : 'rgba(16, 185, 129, 0.2)',
                        color:
                          t.risk_level === 'CRITICAL'
                            ? '#ef4444'
                            : t.risk_level === 'HIGH'
                            ? '#f97316'
                            : t.risk_level === 'MEDIUM'
                            ? '#f59e0b'
                            : '#10b981',
                      }}
                    >
                      {t.risk_level} ({(t.risk_score * 100).toFixed(0)}%)
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      P50: {t.predicted_p50_min || 90}m • <strong>P90: {t.predicted_p90_min || 120}m</strong>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#10b981' }}>
                      +{(t.predicted_p90_min || 120) - (t.predicted_p50_min || 90)}m buffer
                    </div>
                  </td>
                  <td>
                    {t.allocated_start_slot !== null && t.allocated_start_slot !== undefined ? (
                      <div>
                        <strong style={{ color: 'var(--accent-cyan)' }}>
                          {slotToTime(t.allocated_start_slot)} – {slotToTime(t.allocated_end_slot)}
                        </strong>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          Slots {t.allocated_start_slot} – {t.allocated_end_slot}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Deferred</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        isSched ? 'badge-scheduled' : isDef ? 'badge-deferred' : isCrit ? 'badge-critical' : 'badge-pending'
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="btn btn-outline"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenExplanation(t.task_id);
                      }}
                    >
                      <HelpCircle size={14} />
                      <span>Why?</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
