import React, { useState } from 'react';
import {
  FileText,
  X,
  Copy,
  Check,
  Calendar,
  Layers,
  Clock,
  Download,
} from 'lucide-react';
import { useScenario } from '../context/ScenarioContext';

export default function HorizonReportsModal() {
  const {
    reportsModalOpen,
    closeReportsModal,
    activeReportHorizon,
    activeReportData,
    openReportsModal,
  } = useScenario();

  const [copied, setCopied] = useState(false);

  if (!reportsModalOpen) return null;

  const horizon = activeReportHorizon || 'monthly';
  const data = activeReportData || {};

  const handleCopy = () => {
    const text = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="horizon-modal-overlay" onClick={closeReportsModal}>
      <div className="horizon-modal-content" style={{ maxWidth: '780px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="horizon-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--op-blue)" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                Multi-Horizon Formal Planning Report
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                EXECUTIVE SUMMARY & DECISION AUDIT RECORD
              </div>
            </div>
          </div>
          <button className="btn btn-sm" onClick={closeReportsModal}>
            <X size={14} />
          </button>
        </div>

        {/* Horizon Tab Selector */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: '#fafafa', padding: '6px 14px', gap: '6px' }}>
          <button
            className={`btn btn-sm ${horizon === 'monthly' ? 'btn-primary' : ''}`}
            onClick={() => openReportsModal('monthly')}
            style={{ fontSize: '0.74rem' }}
          >
            <Calendar size={12} />
            Monthly Strategy Report
          </button>
          <button
            className={`btn btn-sm ${horizon === 'weekly' ? 'btn-primary' : ''}`}
            onClick={() => openReportsModal('weekly')}
            style={{ fontSize: '0.74rem' }}
          >
            <Layers size={12} />
            Weekly Possession Report
          </button>
          <button
            className={`btn btn-sm ${horizon === 'daily' ? 'btn-primary' : ''}`}
            onClick={() => openReportsModal('daily')}
            style={{ fontSize: '0.74rem' }}
          >
            <Clock size={12} />
            Daily Operational Report
          </button>
        </div>

        {/* Body */}
        <div className="horizon-modal-body" style={{ background: '#f8fafc', fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {data ? JSON.stringify(data, null, 2) : 'Generating formal multi-horizon report...'}
        </div>

        {/* Footer */}
        <div className="horizon-modal-footer">
          <button className="btn btn-sm" onClick={handleCopy}>
            {copied ? <Check size={13} color="var(--op-green)" /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy JSON'}</span>
          </button>
          <button className="btn btn-sm btn-primary" onClick={closeReportsModal}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
