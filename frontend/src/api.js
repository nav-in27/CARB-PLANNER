/**
 * CARB-Planner — Frontend API Client
 * Interfaces with FastAPI backend at /api
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export async function fetchStatus() {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new Error(`Failed to fetch status: ${res.statusText}`);
  return res.json();
}

export async function resetDemo() {
  const res = await fetch(`${API_BASE}/demo/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to reset demo: ${res.statusText}`);
  return res.json();
}

export async function fetchNetwork() {
  const res = await fetch(`${API_BASE}/network`);
  if (!res.ok) throw new Error(`Failed to fetch network: ${res.statusText}`);
  return res.json();
}

export async function fetchTasks() {
  const res = await fetch(`${API_BASE}/tasks`);
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.statusText}`);
  return res.json();
}

export async function fetchTrains() {
  const res = await fetch(`${API_BASE}/trains`);
  if (!res.ok) throw new Error(`Failed to fetch trains: ${res.statusText}`);
  return res.json();
}

export async function fetchPlan() {
  const res = await fetch(`${API_BASE}/plan`);
  if (!res.ok) throw new Error(`Failed to fetch plan: ${res.statusText}`);
  return res.json();
}

export async function generatePlan(horizonSlots = 96, timeLimitSec = 30.0) {
  const res = await fetch(`${API_BASE}/plan/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ horizon_slots: horizonSlots, time_limit_sec: timeLimitSec }),
  });
  if (!res.ok) throw new Error(`Failed to generate plan: ${res.statusText}`);
  return res.json();
}

export async function injectDefect(sectionId = 'S03', description = 'Unexpected rail fracture detected') {
  const res = await fetch(`${API_BASE}/disruptions/defect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section_id: sectionId, description }),
  });
  if (!res.ok) throw new Error(`Failed to inject defect: ${res.statusText}`);
  return res.json();
}

export async function cancelBlock(taskId) {
  const res = await fetch(`${API_BASE}/disruptions/cancel-block`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId }),
  });
  if (!res.ok) throw new Error(`Failed to cancel block: ${res.statusText}`);
  return res.json();
}

export async function injectDepartmentConflict(sectionId = 'S05') {
  const res = await fetch(`${API_BASE}/disruptions/department-conflict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section_id: sectionId }),
  });
  if (!res.ok) throw new Error(`Failed to inject department conflict: ${res.statusText}`);
  return res.json();
}

export async function executeReplan(timeLimitSec = 30.0) {
  const res = await fetch(`${API_BASE}/replan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ time_limit_sec: timeLimitSec }),
  });
  if (!res.ok) throw new Error(`Failed to execute replan: ${res.statusText}`);
  return res.json();
}

export async function fetchExplanation(taskId) {
  const res = await fetch(`${API_BASE}/explanations/${taskId}`);
  if (!res.ok) throw new Error(`Failed to fetch explanation for ${taskId}: ${res.statusText}`);
  return res.json();
}

export async function fetchAllExplanations() {
  const res = await fetch(`${API_BASE}/explanations`);
  if (!res.ok) throw new Error(`Failed to fetch explanations: ${res.statusText}`);
  return res.json();
}

export async function fetchKPIs() {
  const res = await fetch(`${API_BASE}/kpis`);
  if (!res.ok) throw new Error(`Failed to fetch KPIs: ${res.statusText}`);
  return res.json();
}

export async function fetchBaseline() {
  const res = await fetch(`${API_BASE}/baseline`);
  if (!res.ok) throw new Error(`Failed to fetch baseline: ${res.statusText}`);
  return res.json();
}

export async function fetchAblation() {
  const res = await fetch(`${API_BASE}/ablation`);
  if (!res.ok) throw new Error(`Failed to fetch ablation: ${res.statusText}`);
  return res.json();
}

export async function fetchAnalytics() {
  const res = await fetch(`${API_BASE}/analytics`);
  if (!res.ok) throw new Error(`Failed to fetch analytics: ${res.statusText}`);
  return res.json();
}

export async function fetchDisruptions() {
  const res = await fetch(`${API_BASE}/disruptions`);
  if (!res.ok) throw new Error(`Failed to fetch disruptions: ${res.statusText}`);
  return res.json();
}

export async function fetchNetworkGraph() {
  const res = await fetch(`${API_BASE}/network/graph`);
  if (!res.ok) throw new Error(`Failed to fetch network graph: ${res.statusText}`);
  return res.json();
}

export async function validateTopology() {
  const res = await fetch(`${API_BASE}/topology/validate`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to validate topology: ${res.statusText}`);
  return res.json();
}

export async function fetchAlternateRoutes(sectionId = 'S04') {
  const res = await fetch(`${API_BASE}/routes/alternate?section_id=${sectionId}`);
  if (!res.ok) throw new Error(`Failed to fetch alternate routes: ${res.statusText}`);
  return res.json();
}

export async function injectOverrun(taskId = 'T02', overrunMinutes = 45, sectionId = 'S02') {
  const res = await fetch(`${API_BASE}/disruptions/overrun`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, overrun_minutes: overrunMinutes, section_id: sectionId }),
  });
  if (!res.ok) throw new Error(`Failed to inject overrun: ${res.statusText}`);
  return res.json();
}

export async function fetchProvenance() {
  const res = await fetch(`${API_BASE}/provenance`);
  if (!res.ok) throw new Error(`Failed to fetch provenance: ${res.statusText}`);
  return res.json();
}

export async function approvePlan(controllerName = 'Senior Section Controller (SR/TPJ)', mode = 'APPROVE', notes = '') {
  const res = await fetch(`${API_BASE}/plan/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ controller_name: controllerName, mode, notes }),
  });
  if (!res.ok) throw new Error(`Failed to approve plan: ${res.statusText}`);
  return res.json();
}

export async function fetchCorridors() {
  const res = await fetch(`${API_BASE}/corridors`);
  if (!res.ok) throw new Error(`Failed to fetch corridors: ${res.statusText}`);
  return res.json();
}

export async function fetchStations() {
  const res = await fetch(`${API_BASE}/stations`);
  if (!res.ok) throw new Error(`Failed to fetch stations: ${res.statusText}`);
  return res.json();
}

export async function fetchStationDetails(stationIdOrCode) {
  const res = await fetch(`${API_BASE}/stations/${stationIdOrCode}`);
  if (!res.ok) throw new Error(`Failed to fetch station ${stationIdOrCode}: ${res.statusText}`);
  return res.json();
}

export async function fetchStationTopology(stationIdOrCode) {
  const res = await fetch(`${API_BASE}/stations/${stationIdOrCode}/topology`);
  if (!res.ok) throw new Error(`Failed to fetch station topology for ${stationIdOrCode}: ${res.statusText}`);
  return res.json();
}

export async function fetchTracks() {
  const res = await fetch(`${API_BASE}/tracks`);
  if (!res.ok) throw new Error(`Failed to fetch tracks: ${res.statusText}`);
  return res.json();
}

export async function fetchTrackDetails(trackId) {
  const res = await fetch(`${API_BASE}/tracks/${trackId}`);
  if (!res.ok) throw new Error(`Failed to fetch track ${trackId}: ${res.statusText}`);
  return res.json();
}

export async function fetchLoops() {
  const res = await fetch(`${API_BASE}/loops`);
  if (!res.ok) throw new Error(`Failed to fetch loops: ${res.statusText}`);
  return res.json();
}

export async function fetchSidings() {
  const res = await fetch(`${API_BASE}/sidings`);
  if (!res.ok) throw new Error(`Failed to fetch sidings: ${res.statusText}`);
  return res.json();
}

export async function fetchYards() {
  const res = await fetch(`${API_BASE}/yards`);
  if (!res.ok) throw new Error(`Failed to fetch yards: ${res.statusText}`);
  return res.json();
}

export async function fetchAssets() {
  const res = await fetch(`${API_BASE}/assets`);
  if (!res.ok) throw new Error(`Failed to fetch assets: ${res.statusText}`);
  return res.json();
}

export async function fetchPossessions() {
  const res = await fetch(`${API_BASE}/possessions`);
  if (!res.ok) throw new Error(`Failed to fetch possessions: ${res.statusText}`);
  return res.json();
}

export async function fetchTopology() {
  const res = await fetch(`${API_BASE}/topology`);
  if (!res.ok) throw new Error(`Failed to fetch topology: ${res.statusText}`);
  return res.json();
}

// ─── Timetable & Operations APIs (Phase 3 & 4) ───
export async function fetchTimetable() {
  const res = await fetch(`${API_BASE}/timetable`);
  if (!res.ok) throw new Error(`Failed to fetch timetable: ${res.statusText}`);
  return res.json();
}

export async function fetchTrainDetail(trainNumber) {
  const res = await fetch(`${API_BASE}/timetable/${trainNumber}`);
  if (!res.ok) throw new Error(`Failed to fetch train ${trainNumber}: ${res.statusText}`);
  return res.json();
}

export async function fetchSectionTrains(sectionId) {
  const res = await fetch(`${API_BASE}/timetable/section/${sectionId}`);
  if (!res.ok) throw new Error(`Failed to fetch trains for section ${sectionId}: ${res.statusText}`);
  return res.json();
}

export async function fetchConflicts() {
  const res = await fetch(`${API_BASE}/conflicts`);
  if (!res.ok) throw new Error(`Failed to fetch conflicts: ${res.statusText}`);
  return res.json();
}

export async function fetchLoopUtilization() {
  const res = await fetch(`${API_BASE}/loop-utilization`);
  if (!res.ok) throw new Error(`Failed to fetch loop utilization: ${res.statusText}`);
  return res.json();
}

export async function fetchTrainDensity() {
  const res = await fetch(`${API_BASE}/train-density`);
  if (!res.ok) throw new Error(`Failed to fetch train density: ${res.statusText}`);
  return res.json();
}

// ─── Single Source of Truth Canonical APIs ───
export async function fetchScenario() {
  const res = await fetch(`${API_BASE}/scenario`);
  if (!res.ok) throw new Error(`Failed to fetch scenario: ${res.statusText}`);
  return res.json();
}

export async function updateScenario(params = {}) {
  const res = await fetch(`${API_BASE}/scenario/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to update scenario: ${res.statusText}`);
  return res.json();
}

export async function fetchCorridor() {
  const res = await fetch(`${API_BASE}/corridor`);
  if (!res.ok) throw new Error(`Failed to fetch corridor: ${res.statusText}`);
  return res.json();
}

export async function fetchMaintenanceTasks() {
  const res = await fetch(`${API_BASE}/maintenance`);
  if (!res.ok) throw new Error(`Failed to fetch maintenance tasks: ${res.statusText}`);
  return res.json();
}

export async function updateMaintenanceTask(taskId, updates = {}) {
  const res = await fetch(`${API_BASE}/maintenance/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update maintenance task ${taskId}: ${res.statusText}`);
  return res.json();
}

// ─── LNS & Disruption Engine APIs (Phase 4 & 5) ───
export async function runLnsOptimization(maxIterations = 20, timeLimitSec = 15.0, destroyOperator = 'ALL') {
  const res = await fetch(`${API_BASE}/optimizer/lns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      max_iterations: maxIterations,
      time_limit_sec: timeLimitSec,
      destroy_operator: destroyOperator,
    }),
  });
  if (!res.ok) throw new Error(`Failed to run LNS optimization: ${res.statusText}`);
  return res.json();
}

export async function simulateDisruption(disruption, timeLimitSec = 10.0) {
  const res = await fetch(`${API_BASE}/disruptions/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disruption, time_limit_sec: timeLimitSec }),
  });
  if (!res.ok) throw new Error(`Failed to simulate disruption: ${res.statusText}`);
  return res.json();
}

export async function applyDisruption(disruption, autoReplan = true, timeLimitSec = 15.0) {
  const res = await fetch(`${API_BASE}/disruptions/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disruption, auto_replan: autoReplan, time_limit_sec: timeLimitSec }),
  });
  if (!res.ok) throw new Error(`Failed to apply disruption: ${res.statusText}`);
  return res.json();
}

export async function fetchScenarioVersions() {
  const res = await fetch(`${API_BASE}/scenario/versions`);
  if (!res.ok) throw new Error(`Failed to fetch scenario versions: ${res.statusText}`);
  return res.json();
}

export async function fetchScenarioAuditLog() {
  const res = await fetch(`${API_BASE}/scenario/audit-log`);
  if (!res.ok) throw new Error(`Failed to fetch scenario audit log: ${res.statusText}`);
  return res.json();
}

export async function fetchDebugTrainAssignments() {
  const res = await fetch(`${API_BASE}/debug/train-assignments`);
  if (!res.ok) throw new Error(`Failed to fetch debug train assignments: ${res.statusText}`);
  return res.json();
}

export async function fetchDebugMaintenanceAssignments() {
  const res = await fetch(`${API_BASE}/debug/maintenance-assignments`);
  if (!res.ok) throw new Error(`Failed to fetch debug maintenance assignments: ${res.statusText}`);
  return res.json();
}

export async function fetchSystemHealth() {
  const res = await fetch(`${API_BASE}/system/health`);
  if (!res.ok) throw new Error(`Failed to fetch system health: ${res.statusText}`);
  return res.json();
}

// ── Multi-Horizon Planning APIs ───────────────────────────────────────────────

export async function fetchHorizonOverview() {
  const res = await fetch(`${API_BASE}/horizons/overview`);
  if (!res.ok) throw new Error(`Failed to fetch horizon overview: ${res.statusText}`);
  return res.json();
}

export async function fetchMonthlyPlan() {
  const res = await fetch(`${API_BASE}/horizons/monthly`);
  if (!res.ok) throw new Error(`Failed to fetch monthly plan: ${res.statusText}`);
  return res.json();
}

export async function optimizeMonthlyPlan() {
  const res = await fetch(`${API_BASE}/horizons/monthly/optimize`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to optimize monthly plan: ${res.statusText}`);
  return res.json();
}

export async function runMonthlyLns(iterations = 10) {
  const res = await fetch(`${API_BASE}/horizons/monthly/lns?iterations=${iterations}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to run monthly LNS: ${res.statusText}`);
  return res.json();
}

export async function approveMonthlyPlan(mode = 'APPROVED', notes = '') {
  const res = await fetch(`${API_BASE}/horizons/monthly/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, notes }),
  });
  if (!res.ok) throw new Error(`Failed to approve monthly plan: ${res.statusText}`);
  return res.json();
}

export async function fetchMonthlyImpact(taskId, newWeek = null, newDay = null) {
  const res = await fetch(`${API_BASE}/horizons/monthly/impact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, new_week: newWeek, new_day: newDay }),
  });
  if (!res.ok) throw new Error(`Failed to check monthly impact: ${res.statusText}`);
  return res.json();
}

export async function fetchWeeklyPlan(weekNum = 3) {
  const res = await fetch(`${API_BASE}/horizons/weekly?week_num=${weekNum}`);
  if (!res.ok) throw new Error(`Failed to fetch weekly plan: ${res.statusText}`);
  return res.json();
}

export async function optimizeWeeklyPlan(weekNum = 3) {
  const res = await fetch(`${API_BASE}/horizons/weekly/optimize?week_num=${weekNum}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to optimize weekly plan: ${res.statusText}`);
  return res.json();
}

export async function runWeeklyLns(weekNum = 3, iterations = 10) {
  const res = await fetch(`${API_BASE}/horizons/weekly/lns?week_num=${weekNum}&iterations=${iterations}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to run weekly LNS: ${res.statusText}`);
  return res.json();
}

export async function approveWeeklyPlan(weekNum = 3, mode = 'APPROVED', notes = '') {
  const res = await fetch(`${API_BASE}/horizons/weekly/approve?week_num=${weekNum}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, notes }),
  });
  if (!res.ok) throw new Error(`Failed to approve weekly plan: ${res.statusText}`);
  return res.json();
}

export async function fetchWeeklyImpact(taskId, newDay = null) {
  const res = await fetch(`${API_BASE}/horizons/weekly/impact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, new_day: newDay }),
  });
  if (!res.ok) throw new Error(`Failed to check weekly impact: ${res.statusText}`);
  return res.json();
}

export async function fetchTaskTraceability(taskId) {
  const res = await fetch(`${API_BASE}/horizons/traceability/${taskId}`);
  if (!res.ok) throw new Error(`Failed to fetch traceability for ${taskId}: ${res.statusText}`);
  return res.json();
}

export async function fetchHorizonReport(horizon = 'monthly') {
  const res = await fetch(`${API_BASE}/horizons/reports/${horizon}`);
  if (!res.ok) throw new Error(`Failed to fetch report for ${horizon}: ${res.statusText}`);
  return res.json();
}


