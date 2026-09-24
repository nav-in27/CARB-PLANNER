import React, { useState } from 'react';
import { ScenarioProvider, useScenario } from './context/ScenarioContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import OverviewTab from './components/OverviewTab';
import BlockPlannerTab from './components/BlockPlannerTab';
import MonthlyPlannerView from './components/MonthlyPlannerView';
import WeeklyPlannerView from './components/WeeklyPlannerView';
import MultiHorizonDashboard from './components/MultiHorizonDashboard';
import TraceabilityModal from './components/TraceabilityModal';
import DownstreamImpactModal from './components/DownstreamImpactModal';
import HorizonReportsModal from './components/HorizonReportsModal';
import MaintenanceQueueTab from './components/MaintenanceQueueTab';
import NetworkTab from './components/NetworkTab';
import DisruptionsTab from './components/DisruptionsTab';
import AnalyticsTab from './components/AnalyticsTab';
import SystemStatusTab from './components/SystemStatusTab';
import DataProvenanceTab from './components/DataProvenanceTab';
import HumanApprovalModal from './components/HumanApprovalModal';

function AppContent() {
  const [activeTab, setActiveTab] = useState('overview');
  const [approvalModalMode, setApprovalModalMode] = useState(null); // 'review' | 'approve' | 'override' | null
  const { selectEntity, approvalStatus, replan, isLoading, activeHorizon } = useScenario();

  const handleOpenTaskDetail = (taskId) => {
    selectEntity('task', taskId, null);
    setActiveTab('queue');
  };

  return (
    <div className="app-container">
      {/* Clean Narrow Operational Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Workspace Area */}
      <div className="main-content">
        {/* Compact Operational Header */}
        <Header
          onReviewPlan={() => setApprovalModalMode('review')}
          onApprovePlan={() => setApprovalModalMode('approve')}
          onManualOverride={() => setApprovalModalMode('override')}
          onResetDemo={replan}
        />

        {/* Multi-Horizon Operational Dashboard Banner */}
        <MultiHorizonDashboard onNavigateTab={setActiveTab} />

        {/* Dynamic Operational Screens */}
        {activeTab === 'overview' && (
          <OverviewTab
            onNavigateTab={setActiveTab}
            onOpenTaskDetail={handleOpenTaskDetail}
          />
        )}

        {activeTab === 'planner' && (
          <>
            {activeHorizon === 'monthly' && <MonthlyPlannerView />}
            {activeHorizon === 'weekly' && <WeeklyPlannerView />}
            {activeHorizon === 'daily' && (
              <BlockPlannerTab
                onOpenTaskDetail={handleOpenTaskDetail}
                onApprovePlan={() => setApprovalModalMode('approve')}
              />
            )}
          </>
        )}

        {activeTab === 'queue' && (
          <MaintenanceQueueTab />
        )}

        {activeTab === 'network' && (
          <NetworkTab onNavigateTab={setActiveTab} />
        )}

        {activeTab === 'disruptions' && (
          <DisruptionsTab
            onOpenOverrideModal={() => setApprovalModalMode('override')}
            onApprovePlan={() => setApprovalModalMode('approve')}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'analytics' && <AnalyticsTab />}

        {activeTab === 'provenance' && <DataProvenanceTab />}

        {activeTab === 'system' && <SystemStatusTab />}
      </div>

      {/* Human Approval Modal (Review / Approve / Override) */}
      {approvalModalMode && (
        <HumanApprovalModal
          mode={approvalModalMode}
          onClose={() => setApprovalModalMode(null)}
        />
      )}

      {/* Multi-Horizon Modals */}
      <TraceabilityModal />
      <DownstreamImpactModal />
      <HorizonReportsModal />
    </div>
  );
}

export default function App() {
  return (
    <ScenarioProvider>
      <AppContent />
    </ScenarioProvider>
  );
}
