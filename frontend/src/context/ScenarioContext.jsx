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
} from '../api';

const ScenarioContext = createContext(null);

export function ScenarioProvider({ children }) {
  const [scenario, setScenario] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedEntity, setSelectedEntity] = useState(null);

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

  useEffect(() => {
    refreshScenario();
    refreshVersions();
    refreshAuditLog();
    refreshHealth();
    refreshDebugData();
  }, [refreshScenario, refreshVersions, refreshAuditLog, refreshHealth, refreshDebugData]);

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

