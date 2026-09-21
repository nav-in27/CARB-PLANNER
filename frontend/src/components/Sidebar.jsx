import React from 'react';
import {
  LayoutDashboard,
  Calendar,
  ListOrdered,
  GitFork,
  AlertTriangle,
  BarChart3,
  Server,
  Train,
  CheckCircle2,
  Database,
} from 'lucide-react';
import { useScenario } from '../context/ScenarioContext';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'planner', label: 'Block Planner', icon: Calendar },
  { id: 'queue', label: 'Maintenance Queue', icon: ListOrdered },
  { id: 'network', label: 'Network & Routes', icon: GitFork },
  { id: 'disruptions', label: 'Disruptions & LNS', icon: AlertTriangle },
  { id: 'provenance', label: 'Data & Provenance', icon: Database },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'system', label: 'System Status', icon: Server },
];

export default function Sidebar({ activeTab, setActiveTab }) {
  const { scenario, corridor } = useScenario();
  const isLive = scenario?.mode === 'LIVE';

  return (
    <aside className="sidebar">
      {/* Top Sidebar Brand */}
      <div className="sidebar-brand">
        <h1>
          <Train size={17} color="#0f3460" />
          <span>CARB-Planner</span>
        </h1>
        <p>Block Planning & Asset Availability</p>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Mode & Corridor Indicator */}
      <div className="sidebar-footer">
        <div className="sim-indicator">
          <span className="sim-dot" style={{ backgroundColor: isLive ? 'var(--status-green)' : 'var(--accent-amber)' }} />
          <span>{isLive ? 'LIVE OPERATIONS' : 'SIMULATION MODE'}</span>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem', marginTop: '0.25rem', lineHeight: 1.3 }}>
          {corridor ? `${corridor.name} (${corridor.origin_code} ↔ ${corridor.destination_code} • ${corridor.length_km} km)` : 'Chennai (MS) ↔ Kanniyakumari (CAPE) [742 km]'}
        </div>
      </div>
    </aside>
  );
}

