import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchScenario,
  updateScenario as apiUpdateScenario,
  updateMaintenanceTask as apiUpdateTask,
  generatePlan,
  executeReplan,
  runLnsOptimization,
  simulateDisruption as apiSimulateDisruption,
  applyDisruption as apiApplyDisruption,
  fetchScenarioVersions,
  fetchScenarioAuditLog,
  fetchDebugTrainAssignments,
  fetchDebugMaintenanceAssignments,
  fetchSystemHealth,
  fetchHorizonOverview,
  fetchMonthlyPlan,
  optimizeMonthlyPlan as apiOptimizeMonthly,
  runMonthlyLns as apiRunMonthlyLns,
  approveMonthlyPlan as apiApproveMonthly,
  fetchMonthlyImpact,
  fetchWeeklyPlan,
  optimizeWeeklyPlan as apiOptimizeWeekly,
  runWeeklyLns as apiRunWeeklyLns,
  approveWeeklyPlan as apiApproveWeekly,
  fetchWeeklyImpact,
  fetchTaskTraceability,
  fetchHorizonReport,
} from '../api';

const ScenarioContext = createContext(null);

export function ScenarioProvider({ children }) {
  const [scenario, setScenario] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedEntity, setSelectedEntity] = useState(null);

  // Multi-Horizon Planning States
  const [activeHorizon, setActiveHorizon] = useState('daily'); // 'monthly' | 'weekly' | 'daily'
  const [selectedWeekNum, setSelectedWeekNum] = useState(3);
  const [horizonOverview, setHorizonOverview] = useState(null);
  const [monthlyPlan, setMonthlyPlan] = useState(null);
  const [weeklyPlan, setWeeklyPlan] = useState(null);
  const [traceTaskData, setTraceTaskData] = useState(null);
  const [traceModalOpen, setTraceModalOpen] = useState(false);
  const [impactReport, setImpactReport] = useState(null);
  const [impactModalOpen, setImpactModalOpen] = useState(false);
  const [reportsModalOpen, setReportsModalOpen] = useState(false);
  const [activeReportHorizon, setActiveReportHorizon] = useState('monthly');
  const [activeReportData, setActiveReportData] = useState(null);
  const [isHorizonLoading, setIsHorizonLoading] = useState(false);

  const [versions, setVersions] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);
  const [debugTrainAssignments, setDebugTrainAssignments] = useState(null);
  const [debugMaintenanceAssignments, setDebugMaintenanceAssignments] = useState(null);

  // Initial scenario fetch
  const refreshScenario = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await fetchScenario();
      setScenario(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load canonical scenario:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshVersions = useCallback(async () => {
    try {
      const data = await fetchScenarioVersions();
      setVersions(data);
    } catch (err) {
      console.warn('Could not fetch versions:', err);
    }
  }, []);

  const refreshAuditLog = useCallback(async () => {
    try {
      const data = await fetchScenarioAuditLog();
      setAuditLog(data);
    } catch (err) {
      console.warn('Could not fetch audit log:', err);
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const data = await fetchSystemHealth();
      setSystemHealth(data);
    } catch (err) {
      console.warn('Could not fetch system health:', err);
    }
  }, []);

  const refreshDebugData = useCallback(async () => {
    try {
      const [trainsDbg, maintDbg] = await Promise.all([
        fetchDebugTrainAssignments().catch(() => null),
        fetchDebugMaintenanceAssignments().catch(() => null),
      ]);
      if (trainsDbg) setDebugTrainAssignments(trainsDbg);
      if (maintDbg) setDebugMaintenanceAssignments(maintDbg);
    } catch (err) {
      console.warn('Could not fetch debug data:', err);
    }
  }, []);

  const refreshHorizonOverview = useCallback(async () => {
    try {
      const data = await fetchHorizonOverview();
      setHorizonOverview(data);
    } catch (err) {
      console.warn('Could not fetch horizon overview:', err);
    }
  }, []);

  const refreshMonthlyPlan = useCallback(async () => {
    try {
      setIsHorizonLoading(true);
      const data = await fetchMonthlyPlan();
      setMonthlyPlan(data);
    } catch (err) {
      console.warn('Could not fetch monthly plan:', err);
    } finally {
      setIsHorizonLoading(false);
    }
  }, []);

  const refreshWeeklyPlan = useCallback(async (weekNum = 3) => {
    try {
      setIsHorizonLoading(true);
      const data = await fetchWeeklyPlan(weekNum);
      setWeeklyPlan(data);
    } catch (err) {
      console.warn(`Could not fetch weekly plan for week ${weekNum}:`, err);
    } finally {
      setIsHorizonLoading(false);
    }
  }, []);

  const optimizeMonthlyAction = useCallback(async () => {
    try {
      setIsHorizonLoading(true);
      const data = await apiOptimizeMonthly();
      setMonthlyPlan(data);
      await refreshHorizonOverview();
      return data;
    } catch (err) {
      console.error('Failed to optimize monthly plan:', err);
      throw err;
    } finally {
      setIsHorizonLoading(false);
    }
  }, [refreshHorizonOverview]);

  const runMonthlyLnsAction = useCallback(async (iterations = 10) => {
    try {
      setIsHorizonLoading(true);
      const data = await apiRunMonthlyLns(iterations);
      if (data.plan) setMonthlyPlan(data.plan);
      await refreshHorizonOverview();
      return data;
    } catch (err) {
      console.error('Failed to run monthly LNS:', err);
      throw err;
    } finally {
      setIsHorizonLoading(false);
    }
  }, [refreshHorizonOverview]);

  const approveMonthlyAction = useCallback(async (mode = 'APPROVED', notes = '') => {
    try {
      const data = await apiApproveMonthly(mode, notes);
      setMonthlyPlan(data);
      await refreshHorizonOverview();
      return data;
    } catch (err) {
      console.error('Failed to approve monthly plan:', err);
      throw err;
    }
  }, [refreshHorizonOverview]);

  const optimizeWeeklyAction = useCallback(async (weekNum = 3) => {
    try {
      setIsHorizonLoading(true);
      const data = await apiOptimizeWeekly(weekNum);
      setWeeklyPlan(data);
      await refreshHorizonOverview();
      return data;
    } catch (err) {
      console.error('Failed to optimize weekly plan:', err);
      throw err;
    } finally {
      setIsHorizonLoading(false);
    }
  }, [refreshHorizonOverview]);

  const runWeeklyLnsAction = useCallback(async (weekNum = 3, iterations = 10) => {
    try {
      setIsHorizonLoading(true);
      const data = await apiRunWeeklyLns(weekNum, iterations);
      await refreshWeeklyPlan(weekNum);
      await refreshHorizonOverview();
      return data;
    } catch (err) {
      console.error('Failed to run weekly LNS:', err);
      throw err;
    } finally {
      setIsHorizonLoading(false);
    }
  }, [refreshWeeklyPlan, refreshHorizonOverview]);

  const approveWeeklyAction = useCallback(async (weekNum = 3, mode = 'APPROVED', notes = '') => {
    try {
      const data = await apiApproveWeekly(weekNum, mode, notes);
      setWeeklyPlan(data);
      await refreshHorizonOverview();
      return data;
    } catch (err) {
      console.error('Failed to approve weekly plan:', err);
      throw err;
    }
  }, [refreshHorizonOverview]);

  const openTraceModal = useCallback(async (taskId) => {
    try {
      const data = await fetchTaskTraceability(taskId);
      setTraceTaskData(data);
      setTraceModalOpen(true);
    } catch (err) {
      console.error('Failed to fetch traceability for task:', err);
    }
  }, []);

  const closeTraceModal = useCallback(() => {
    setTraceModalOpen(false);
    setTraceTaskData(null);
  }, []);

  const checkDownstreamImpact = useCallback(async (taskId, newWeek = null, newDay = null) => {
    try {
      const data = await fetchMonthlyImpact(taskId, newWeek, newDay);
      setImpactReport(data);
      setImpactModalOpen(true);
      return data;
    } catch (err) {
      console.error('Failed to check downstream impact:', err);
    }
  }, []);

  const closeImpactModal = useCallback(() => {
    setImpactModalOpen(false);
    setImpactReport(null);
  }, []);

  const openReportsModal = useCallback(async (horizon = 'monthly') => {
    try {
      setActiveReportHorizon(horizon);
      const data = await fetchHorizonReport(horizon);
      setActiveReportData(data);
      setReportsModalOpen(true);
    } catch (err) {
      console.error('Failed to fetch horizon report:', err);
    }
  }, []);

  const closeReportsModal = useCallback(() => {
    setReportsModalOpen(false);
    setActiveReportData(null);
  }, []);

  useEffect(() => {
    refreshScenario();
    refreshVersions();
    refreshAuditLog();
    refreshHealth();
    refreshDebugData();
    refreshHorizonOverview();
    refreshMonthlyPlan();
    refreshWeeklyPlan(selectedWeekNum);
  }, [refreshScenario, refreshVersions, refreshAuditLog, refreshHealth, refreshDebugData, refreshHorizonOverview, refreshMonthlyPlan, refreshWeeklyPlan, selectedWeekNum]);

  // Select entity across components (Map <-> Planner <-> Queue <-> Timetable)
  const selectEntity = useCallback((type, id, data) => {
    setSelectedEntity({ type, id, data });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEntity(null);
  }, []);

  // Update scenario context parameters (corridor, date, direction, sections)
  const updateScenarioContext = useCallback(async (params) => {
    try {
      setIsLoading(true);
      const updated = await apiUpdateScenario(params);
      setScenario(updated);
    } catch (err) {
      console.error('Failed to update scenario context:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update task status or timing
  const updateTask = useCallback(async (taskId, updates) => {
    try {
      const updatedTask = await apiUpdateTask(taskId, updates);
      // Synchronize in-memory scenario
      setScenario((prev) => {
        if (!prev) return prev;
        const newTasks = (prev.tasks || []).map((t) => (t.task_id === taskId ? updatedTask : t));
        return { ...prev, tasks: newTasks };
      });
      return updatedTask;
    } catch (err) {
      console.error(`Failed to update task ${taskId}:`, err);
      throw err;
    }
  }, []);

  // Re-plan using solver
  const replan = useCallback(async () => {
    try {
      setIsLoading(true);
      try {
        await executeReplan(30.0);
      } catch (lnsErr) {
        await generatePlan(96, 30.0);
      }
      await refreshScenario();
      await refreshVersions();
      await refreshAuditLog();
      await refreshHealth();
    } catch (err) {
      console.error('Failed to execute replan:', err);
    } finally {
      setIsLoading(false);
    }
  }, [refreshScenario, refreshVersions, refreshAuditLog, refreshHealth]);

  // Run LNS Optimization
  const runLns = useCallback(async (maxIterations = 20, timeLimitSec = 15.0, destroyOperator = 'ALL') => {
    try {
      setIsOptimizing(true);
      const result = await runLnsOptimization(maxIterations, timeLimitSec, destroyOperator);
      await refreshScenario();
      await refreshVersions();
      await refreshAuditLog();
      return result;
    } catch (err) {
      console.error('Failed to run LNS optimization:', err);
      throw err;
    } finally {
      setIsOptimizing(false);
    }
  }, [refreshScenario, refreshVersions, refreshAuditLog]);

  // Simulate Disruption (non-mutating)
  const simulateDisruption = useCallback(async (disruption, timeLimitSec = 10.0) => {
    try {
      return await apiSimulateDisruption(disruption, timeLimitSec);
    } catch (err) {
      console.error('Failed to simulate disruption:', err);
      throw err;
    }
  }, []);

  // Apply Disruption (mutating + replan + new version)
  const applyDisruption = useCallback(async (disruption, autoReplan = true, timeLimitSec = 15.0) => {
    try {
      setIsLoading(true);
      const result = await apiApplyDisruption(disruption, autoReplan, timeLimitSec);
      await refreshScenario();
      await refreshVersions();
      await refreshAuditLog();
      await refreshHealth();
      return result;
    } catch (err) {
      console.error('Failed to apply disruption:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [refreshScenario, refreshVersions, refreshAuditLog, refreshHealth]);

  // Derived convenience accessors
  const corridor = scenario?.corridor || {
    corridor_id: 'SR_GST_01',
    name: 'Southern Railway Grand South Trunk Corridor',
    short_name: 'MS <-> CAPE',
    origin: 'Chennai Egmore (MS)',
    origin_code: 'MS',
    destination: 'Kanniyakumari (CAPE)',
    destination_code: 'CAPE',
    total_distance_km: 742.0,
    divisions: ['Chennai (MAS)', 'Tiruchirappalli (TPJ)', 'Madurai (MDU)', 'Thiruvananthapuram (TVC)'],
    electrification: '25 kV AC 50 Hz OHE (100% Electrified)',
    gauge: 'Broad Gauge 1676 mm',
    state: 'Tamil Nadu (100% within State)',
    alternate_routes: [],
  };

  const planningDate = scenario?.planning_date || '2026-09-18';
  const timetableVersion = scenario?.timetable_version || 'SR-WTT-2026-V1';
  const networkVersion = scenario?.network_version || 'SR-GIS-TN-V2';
  const dataMode = scenario?.data_mode || 'PUBLIC_TIMETABLE';
  const tasks = scenario?.tasks || [];
  const trains = scenario?.train_services || [];
  const conflicts = scenario?.conflicts || [];
  const loopUtilization = scenario?.loop_utilization || [];
  const kpis = scenario?.kpis || {};
  const solverStatus = scenario?.solver_status || 'OPTIMAL';
  const approvalStatus = scenario?.approval_status || 'Feasible';
  const plan = scenario?.operational_plan || scenario?.optimization_state || null;
  const allocations = plan?.allocations || [];
  const trainAssignments = scenario?.train_assignments || plan?.train_assignments || [];
  const maintenanceAssignments = scenario?.maintenance_assignments || plan?.maintenance_assignments || [];
  const unassignedMovements = scenario?.unassigned_movements || plan?.unassigned_movements || [];
  const versionNumber = scenario?.version_number || 1;
  const planVersionTag = scenario?.plan_version_tag || `v${versionNumber}`;
  const planDiff = scenario?.last_diff || null;
  const changedObjectIds = useMemo(() => new Set(scenario?.changed_objects || []), [scenario?.changed_objects]);

  const isObjectChanged = useCallback((id) => {
    if (!id || !changedObjectIds) return false;
    return changedObjectIds.has(String(id));
  }, [changedObjectIds]);

  const value = {
    scenario,
    corridor,
    planningDate,
    timetableVersion,
    networkVersion,
    dataMode,
    tasks,
    trains,
    conflicts,
    loopUtilization,
    kpis,
    solverStatus,
    approvalStatus,
    plan,
    allocations,
    trainAssignments,
    maintenanceAssignments,
    unassignedMovements,
    versionNumber,
    planVersionTag,
    planDiff,
    changedObjectIds,
    isObjectChanged,
    versions,
    auditLog,
    systemHealth,
    debugTrainAssignments,
    debugMaintenanceAssignments,
    selectedEntity,
    selectEntity,
    clearSelection,
    updateScenarioContext,
    updateTask,
    replan,
    runLns,
    simulateDisruption,
    applyDisruption,
    refreshScenario,
    refreshVersions,
    refreshAuditLog,
    refreshHealth,
    refreshDebugData,
    isLoading,
    isOptimizing,
    error,
    // Multi-Horizon Planning Exports
    activeHorizon,
    setActiveHorizon,
    selectedWeekNum,
    setSelectedWeekNum,
    horizonOverview,
    monthlyPlan,
    weeklyPlan,
    traceTaskData,
    traceModalOpen,
    impactReport,
    impactModalOpen,
    reportsModalOpen,
    activeReportHorizon,
    activeReportData,
    isHorizonLoading,
    refreshHorizonOverview,
    refreshMonthlyPlan,
    refreshWeeklyPlan,
    optimizeMonthlyAction,
    runMonthlyLnsAction,
    approveMonthlyAction,
    optimizeWeeklyAction,
    runWeeklyLnsAction,
    approveWeeklyAction,
    openTraceModal,
    closeTraceModal,
    checkDownstreamImpact,
    closeImpactModal,
    openReportsModal,
    closeReportsModal,
  };

  return (
    <ScenarioContext.Provider value={value}>
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario() {
  const context = useContext(ScenarioContext);
  if (!context) {
    throw new Error('useScenario must be used within a ScenarioProvider');
  }
  return context;
}

