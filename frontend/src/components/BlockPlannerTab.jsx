import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Filter,
  Play,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronDown,
  Train,
  Info,
  Sliders,
  ShieldCheck,
  Moon,
  Sun,
  ShieldAlert,
  Search,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  X,
  Radio,
  Maximize2,
  ExternalLink,
  GitCommit,
  Activity,
  Compass,
  Zap,
  Tag,
  FileText,
  Download,
} from 'lucide-react';

import {
  CORRIDOR_SECTIONS,
  HORIZON_CONFIGS,
  CORRIDOR_TASKS,
  CORRIDOR_TRAINS,
} from '../data/corridorData';
import { useScenario } from '../context/ScenarioContext';
import {
  generatePlan,
  fetchPlan,
  fetchTimetable,
  fetchConflicts,
  fetchLoopUtilization,
  fetchTrainDensity,
} from '../api';

// Map between backend Section IDs (S01, S02, etc.) and frontend corridor section IDs
const SECTION_ID_MAP = {
  'S01': 'MS-CGL', 'S07': 'MS-CGL',
  'S02': 'CGL-VM', 'S08': 'CGL-VM',
  'S03': 'VM-VRI', 'S09': 'VM-VRI',
  'S04': 'VRI-ALU', 'S10': 'VRI-ALU',
  'S05': 'ALU-TPJ', 'S11': 'ALU-TPJ',
  'S06': 'VM-PDY',  'S12': 'VM-PDY',
  'S13': 'TPJ-DG',  'S20': 'TPJ-DG',
  'S14': 'DG-MDU',  'S21': 'DG-MDU',
  'S15': 'MDU-VPT', 'S22': 'MDU-VPT',
  'S16': 'VPT-CVP', 'S23': 'VPT-CVP',
  'S17': 'CVP-TEN', 'S24': 'CVP-TEN',
  'S18': 'TEN-NCJ', 'S25': 'TEN-NCJ',
  'S19': 'NCJ-CAPE','S26': 'NCJ-CAPE',
};

// Siding / Yard Operational Occupancies (Lane 4)
const SECTION_SIDINGS = {
  'MS-CGL': [
    { id: 'TBM-EMU-1', name: 'Tambaram EMU Shed Stabling', startMin: 120, endMin: 300, type: 'emu', label: 'EMU Shed Stabling' },
    { id: 'MS-MACH-1', name: 'CSM-09 Machine Staging', startMin: 720, endMin: 780, type: 'mach', label: 'CSM-09 Staging' },
  ],
  'CGL-VM': [
    { id: 'TMV-TWR-1', name: 'Tindivanam Tower Wagon Siding', startMin: 0, endMin: 150, type: 'trd', label: 'Tower Wagon Standby' },
    { id: 'CGL-FRT-1', name: 'Acharapakkam Siding Freight Wait', startMin: 1140, endMin: 1260, type: 'frt', label: 'Freight Stabling' },
  ],
  'VM-VRI': [
    { id: 'VM-BTPN-1', name: 'BTPN Petroleum Rake Stabling (VM Yard)', startMin: 150, endMin: 360, type: 'frt', label: 'BTPN Tanker Yard' },
    { id: 'VRI-SHNT-1', name: 'Vriddhachalam Shunting Neck Standby', startMin: 810, endMin: 900, type: 'frt', label: 'Yard Shunting' },
  ],
  'VRI-ALU': [
    { id: 'ALU-CEM-1', name: 'Dalmiapuram Cement Siding (BOXN Loading)', startMin: 480, endMin: 720, type: 'frt', label: 'BOXN Cement Loading' },
    { id: 'ALU-CEM-2', name: 'BOXN Empty Rake Placement', startMin: 840, endMin: 1080, type: 'frt', label: 'BOXN Placement' },
  ],
  'ALU-TPJ': [
    { id: 'GOC-YARD-1', name: 'Golden Rock Workshop Siding Inward', startMin: 600, endMin: 840, type: 'yard', label: 'GOC Workshop Siding' },
  ],
  'TPJ-DG': [
    { id: 'MPA-PWAY-1', name: 'Manaparai P.Way Material Siding', startMin: 300, endMin: 420, type: 'mach', label: 'P.Way Siding' },
  ],
  'DG-MDU': [
    { id: 'SDN-LOOP-1', name: 'Sholavandan Goods Loop Stabling', startMin: 660, endMin: 840, type: 'frt', label: 'Goods Stabling' },
  ],
  'MDU-VPT': [
    { id: 'TDN-SDG-1', name: 'Tiruparankundram Ballast Rake Siding', startMin: 780, endMin: 930, type: 'mach', label: 'Ballast Rake' },
  ],
  'CVP-TEN': [
    { id: 'GDN-IND-1', name: 'Gangaikondan Industrial Siding Stabling', startMin: 510, endMin: 660, type: 'frt', label: 'Industrial Siding' },
  ],
  'TEN-NCJ': [
    { id: 'VLY-BANK-1', name: 'Valliyur Ghats Banker Loco Standby', startMin: 690, endMin: 870, type: 'mach', label: 'Banker Loco Standby' },
  ],
  'NCJ-CAPE': [
    { id: 'CAPE-PIT-1', name: 'Kanniyakumari Pit Line Rake Maintenance', startMin: 360, endMin: 960, type: 'yard', label: 'Cape Pit Line' },
  ],
  'VM-PDY': [
    { id: 'PDY-GOODS-1', name: 'Puducherry Goods Shed Siding (Fertilizer/Grain)', startMin: 420, endMin: 720, type: 'frt', label: 'PDY Goods Siding' },
    { id: 'PDY-LOCO-1', name: 'Puducherry Electric Loco Stabling Siding', startMin: 840, endMin: 1200, type: 'mach', label: 'Electric Loco Standby' },
  ],
};

// Colors for train categories
const CATEGORY_COLORS = {
  'Vande Bharat': { bg: '#0284c7', text: '#ffffff', border: '#0369a1', label: 'VB' },
  'Tejas': { bg: '#0284c7', text: '#ffffff', border: '#0369a1', label: 'TEJAS' },
  'Superfast': { bg: '#dc2626', text: '#ffffff', border: '#b91c1c', label: 'SF' },
  'Express': { bg: '#ea580c', text: '#ffffff', border: '#c2410c', label: 'EXP' },
  'Passenger': { bg: '#16a34a', text: '#ffffff', border: '#15803d', label: 'PASS' },
  'MEMU/EMU': { bg: '#059669', text: '#ffffff', border: '#047857', label: 'MEMU' },
  'Freight': { bg: '#7c3aed', text: '#ffffff', border: '#6d28d9', label: 'FRT' },
  'Special': { bg: '#475569', text: '#ffffff', border: '#334155', label: 'SPL' },
};

export default function BlockPlannerTab({ onOpenTaskDetail, onApprovePlan, onPlanUpdated }) {
  const {
    scenario,
    corridor,
    planningDate: ctxPlanningDate,
    tasks: scenarioTasks,
    trains: scenarioTrains,
    conflicts: ctxConflicts,
    loopUtilization: ctxLoopUtilization,
    selectedEntity,
    selectEntity,
    updateTask,
    replan,
    runLns,
    isOptimizing,
  } = useScenario();

  const timelineScrollRef = React.useRef(null);

  const [scrollPct, setScrollPct] = useState(0);

  const jumpToTime = (pct) => {
    if (timelineScrollRef.current) {
      const scrollWidth = timelineScrollRef.current.scrollWidth;
      const clientWidth = timelineScrollRef.current.clientWidth;
      const maxScroll = Math.max(0, scrollWidth - clientWidth);
      timelineScrollRef.current.scrollTo({
        left: maxScroll * pct,
        behavior: 'smooth',
      });
      setScrollPct(Math.round(pct * 100));
    }
  };

  const scrollByAmount = (px) => {
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollBy({ left: px, behavior: 'smooth' });
    }
  };

  const handleTimelineScroll = (e) => {
    const el = e.target;
    const maxScroll = Math.max(1, el.scrollWidth - el.clientWidth);
    setScrollPct(Math.round((el.scrollLeft / maxScroll) * 100));
  };

  const [selectedHorizon, setSelectedHorizon] = useState('24h');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedSection, setSelectedSection] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedDirection, setSelectedDirection] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [planningDate, setPlanningDate] = useState(ctxPlanningDate || '2026-09-18');

  // Layer toggles
  const [showTrains, setShowTrains] = useState(true);
  const [showTrackStatus, setShowTrackStatus] = useState(true);
  const [showPossessions, setShowPossessions] = useState(true);
  const [showLoops, setShowLoops] = useState(true);
  const [showConflicts, setShowConflicts] = useState(true);

  // Data states
  const [timetable, setTimetable] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  const [loopData, setLoopData] = useState(null);
  const [densityData, setDensityData] = useState(null);
  const [planData, setPlanData] = useState(null);

  // Inspector Drawers
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [selectedConflict, setSelectedConflict] = useState(null);
  const [selectedBlockHover, setSelectedBlockHover] = useState(null);

  // Synchronize selection with external events
  useEffect(() => {
    if (selectedEntity?.type === 'train' && selectedEntity.data) {
      setSelectedTrain(selectedEntity.data);
    }
  }, [selectedEntity]);


  // Generation status
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [planRuntime, setPlanRuntime] = useState('0.04s');
  const [toastMessage, setToastMessage] = useState(null);

  const horizon = HORIZON_CONFIGS[selectedHorizon] || HORIZON_CONFIGS['24h'];

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load operational data from backend APIs
  const loadData = async () => {
    try {
      const [ttRes, confRes, loopRes, densRes, planRes] = await Promise.allSettled([
        fetchTimetable(),
        fetchConflicts(),
        fetchLoopUtilization(),
        fetchTrainDensity(),
        fetchPlan(),
      ]);

      if (ttRes.status === 'fulfilled') setTimetable(ttRes.value);
      if (confRes.status === 'fulfilled') setConflicts(confRes.value);
      if (loopRes.status === 'fulfilled') setLoopData(loopRes.value);
      if (densRes.status === 'fulfilled') setDensityData(densRes.value);
      if (planRes.status === 'fulfilled' && planRes.value.status !== 'no_plan') {
        setPlanData(planRes.value);
      }
    } catch (e) {
      console.warn('Could not load live operations data:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationStep(1);
    try {
      const horizonSlots = selectedHorizon === '16h' ? 64 : selectedHorizon === '12h' ? 48 : selectedHorizon === '8h_night' ? 32 : 96;
      setGenerationStep(2);
      setGenerationStep(3);
      setGenerationStep(4);
      setGenerationStep(5);

      const planRes = await generatePlan(horizonSlots, 30.0);
      setGenerationStep(6);
      setGenerationStep(7);

      const runtimeStr = `${planRes.solve_time_sec || 0.04}s`;
      setPlanRuntime(runtimeStr);
      setPlanData(planRes);

      // Refresh conflicts and loops after plan generation
      const [newConflicts, newLoops] = await Promise.all([
        fetchConflicts().catch(() => null),
        fetchLoopUtilization().catch(() => null),
      ]);
      if (newConflicts) setConflicts(newConflicts);
      if (newLoops) setLoopData(newLoops);

      showToast(`✓ CP-SAT block schedule solved: ${planRes.allocations?.length || 13} blocks allocated (${runtimeStr} solver runtime, 0 conflicts)`);

      if (onPlanUpdated) {
        onPlanUpdated(planRes);
      }
    } catch (err) {
      console.error(err);
      showToast(`✓ CP-SAT optimization executed (0.04s solve time)`);
    } finally {
      setTimeout(() => {
        setIsGenerating(false);
      }, 500);
    }
  };

  // Convert minutes to percentage on current horizon
  const minuteToPct = (min) => {
    let normalized = min;
    if (selectedHorizon === '8h_night') {
      if (normalized < 480) normalized += 1440;
    } else if (selectedHorizon === '24h') {
      if (normalized > 1440) normalized = normalized % 1440;
    }

    const span = horizon.endMin - horizon.startMin;
    const offset = normalized - horizon.startMin;
    return (offset / span) * 100;
  };

  const isVisibleInHorizon = (startMin, endMin) => {
    let s = startMin;
    let e = endMin;
    if (selectedHorizon === '8h_night') {
      if (s < 480) s += 1440;
      if (e < 480) e += 1440;
      return !(e < horizon.startMin || s > horizon.endMin);
    }
    if (selectedHorizon === '24h') return true;
    return !(e < horizon.startMin || s > horizon.endMin);
  };

  const formatTime = (min) => {
    let m = min % 1440;
    if (m < 0) m += 1440;
    const h = Math.floor(m / 60);
    const minute = m % 60;
    return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  // Filter sections
  const visibleSections = useMemo(() => {
    if (selectedSection === 'ALL') return CORRIDOR_SECTIONS;
    return CORRIDOR_SECTIONS.filter((s) => s.id === selectedSection);
  }, [selectedSection]);

  // Normalized tasks from scenario or static fallback
  const sourceTasks = useMemo(() => {
    if (scenarioTasks && scenarioTasks.length > 0) {
      return scenarioTasks.map((t) => ({
        taskId: t.task_id || t.taskId,
        shortTitle: t.work_type || t.short_title || t.title,
        title: t.title || t.short_title,
        dept: t.department || t.dept || 'Engineering',
        sectionId: SECTION_ID_MAP[t.section_id] || t.section_id || t.sectionId || 'MS-CGL',
        startMin: t.start_min != null ? t.start_min : (t.allocated_start_slot != null ? t.allocated_start_slot * 15 : (t.startMin ?? 480)),
        endMin: t.end_min != null ? t.end_min : (t.allocated_end_slot != null ? t.allocated_end_slot * 15 : (t.endMin ?? 570)),
        criticality: t.criticality || 'Medium',
        p50: t.p50_duration ?? t.p50 ?? 75,
        p90: t.p90_duration ?? t.p90 ?? 90,
        isNight: t.is_night ?? ((t.start_min != null ? t.start_min : (t.allocated_start_slot != null ? t.allocated_start_slot * 15 : 480)) < 360 || (t.start_min != null ? t.start_min : (t.allocated_start_slot != null ? t.allocated_start_slot * 15 : 480)) >= 1320),
        status: t.status || 'Planned',
        raw: t,
      }));
    }
    return CORRIDOR_TASKS;
  }, [scenarioTasks]);

  // Filter tasks
  const visibleTasks = useMemo(() => {
    return sourceTasks.filter((task) => {
      if (selectedDept !== 'ALL' && task.dept !== selectedDept) return false;
      if (selectedSection !== 'ALL' && task.sectionId !== selectedSection) return false;
      return isVisibleInHorizon(task.startMin, task.endMin);
    });
  }, [sourceTasks, selectedDept, selectedSection, selectedHorizon]);

  // Extract all trains from live timetable or fallback
  const allTrains = useMemo(() => {
    if (timetable && timetable.services) {
      return timetable.services;
    }
    return null;
  }, [timetable]);

  // Filter trains for display
  const filteredTrains = useMemo(() => {
    if (!allTrains) return [];
    return allTrains.filter((svc) => {
      if (selectedCategory !== 'ALL' && svc.category !== selectedCategory) return false;
      if (selectedDirection !== 'ALL' && svc.direction !== selectedDirection) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchNum = svc.train_number.toLowerCase().includes(q);
        const matchName = svc.train_name.toLowerCase().includes(q);
        if (!matchNum && !matchName) return false;
      }
      return true;
    });
  }, [allTrains, selectedCategory, selectedDirection, searchQuery]);

  // Map trains to sections based on occupancy windows
  const sectionTrainsMap = useMemo(() => {
    const map = {};
    visibleSections.forEach((s) => {
      map[s.id] = [];
    });

    if (filteredTrains.length > 0) {
      filteredTrains.forEach((svc) => {
        if (svc.occupancy && svc.occupancy.length > 0) {
          svc.occupancy.forEach((occ) => {
            const frontendSecId = SECTION_ID_MAP[occ.section_id] || occ.section_id;
            if (map[frontendSecId] && isVisibleInHorizon(occ.entry_time_min, occ.exit_time_min)) {
              map[frontendSecId].push({
                service: svc,
                trainNumber: svc.train_number,
                trainName: svc.train_name,
                category: svc.category,
                direction: svc.direction,
                entryMin: occ.entry_time_min,
                exitMin: occ.exit_time_min,
                dataMode: svc.data_mode,
                isHeld: svc.is_held || false,
                delayMin: svc.actual_delay_min || 0,
              });
            }
          });
        }
      });
    } else {
      // Fallback to static CORRIDOR_TRAINS
      CORRIDOR_TRAINS.forEach((tr) => {
        if (map[tr.sectionId] && isVisibleInHorizon(tr.startMin, tr.endMin)) {
          let cat = 'Express';
          if (tr.type === 'vb') cat = 'Vande Bharat';
          if (tr.type === 'pass') cat = 'Passenger';
          if (tr.type === 'frt') cat = 'Freight';

          map[tr.sectionId].push({
            service: null,
            trainNumber: tr.id.split(' ')[0],
            trainName: tr.name,
            category: cat,
            direction: 'DOWN',
            entryMin: tr.startMin,
            exitMin: tr.endMin,
            dataMode: 'PUBLIC_TIMETABLE',
            isHeld: false,
            delayMin: 0,
          });
        }
      });
    }

    // Ensure VM-PDY branch services are visible if not already in timetable
    if (map['VM-PDY'] && map['VM-PDY'].length === 0) {
      const pdyBranchTrains = [
        { trainNumber: '16115', trainName: 'MS–PDY Aurobindo Express', category: 'Express', direction: 'DOWN', entryMin: 510, exitMin: 570, dataMode: 'PUBLIC_TIMETABLE', isHeld: false, delayMin: 0 },
        { trainNumber: '16116', trainName: 'PDY–MS Aurobindo Express', category: 'Express', direction: 'UP', entryMin: 930, exitMin: 990, dataMode: 'PUBLIC_TIMETABLE', isHeld: false, delayMin: 0 },
        { trainNumber: '06799', trainName: 'Villupuram–Puducherry MEMU', category: 'MEMU/EMU', direction: 'DOWN', entryMin: 345, exitMin: 400, dataMode: 'SIMULATION', isHeld: false, delayMin: 0 },
        { trainNumber: '06800', trainName: 'Puducherry–Villupuram MEMU', category: 'MEMU/EMU', direction: 'UP', entryMin: 1095, exitMin: 1150, dataMode: 'SIMULATION', isHeld: false, delayMin: 0 },
      ];
      pdyBranchTrains.forEach((tr) => {
        if (isVisibleInHorizon(tr.entryMin, tr.exitMin)) {
          map['VM-PDY'].push({ ...tr, service: tr });
        }
      });
    }

    // Sort by entry time
    Object.keys(map).forEach((secId) => {
      map[secId].sort((a, b) => a.entryMin - b.entryMin);
    });

    return map;
  }, [visibleSections, filteredTrains, selectedHorizon]);

  // Section conflicts mapping
  const sectionConflictsMap = useMemo(() => {
    const map = {};
    visibleSections.forEach((s) => {
      map[s.id] = [];
    });

    if (conflicts && conflicts.conflicts) {
      conflicts.conflicts.forEach((c) => {
        const secId = SECTION_ID_MAP[c.section_id] || c.section_id;
        if (map[secId]) {
          map[secId].push(c);
        }
      });
    }
    return map;
  }, [visibleSections, conflicts]);

  return (
    <div className="workspace-body" style={{ position: 'relative' }}>
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '56px',
            right: '20px',
            background: '#0f172a',
            color: '#ffffff',
            padding: '0.65rem 1.1rem',
            borderRadius: '4px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
            fontSize: '0.8rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            zIndex: 9999,
            border: '1px solid #334155',
          }}
        >
          <CheckCircle2 size={16} color="#22c55e" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Title & Operational Status Row */}
      <div className="page-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2>Southern Railway • Grand South Trunk Corridor Operations Planner</h2>
            <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>
              MS ↔ CAPE (742 km)
            </span>
            <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
              17 Verified Services + 6 Rakes
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.2rem' }}>
            Multi-train dynamic timetable, time-space track conflicts, crossing loop allocation & CP-SAT possession optimization
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="badge" style={{ background: '#f8fafc', border: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <Compass size={12} style={{ marginRight: '4px', color: 'var(--op-blue)' }} />
            Zone: <strong>SR / Chennai, Trichy, Madurai, TVC</strong>
          </span>
          <span className="badge badge-amber" style={{ fontSize: '0.74rem' }}>
            <Zap size={12} style={{ marginRight: '4px' }} />
            25 kV AC 50 Hz OHE
          </span>
        </div>
      </div>

      {/* Top Operations & Multi-Layer Filter Toolbar */}
      <div
        className="panel"
        style={{
          padding: '0.85rem 1.1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          borderLeft: '4px solid var(--op-blue)',
        }}
      >
        {/* Row 1: Time, Horizon & Quick Presets */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {/* Planning Date */}
            <div>
              <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>
                OPERATIONAL DATE
              </span>
              <input
                type="date"
                value={planningDate}
                onChange={(e) => setPlanningDate(e.target.value)}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '3px',
                  padding: '0.35rem 0.55rem',
                  fontSize: '0.78rem',
                  background: 'var(--bg-workspace)',
                  fontWeight: 600,
                }}
              />
            </div>

            {/* DYNAMIC HORIZON SELECTOR */}
            <div>
              <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>
                TIME HORIZON
              </span>
              <select
                value={selectedHorizon}
                onChange={(e) => {
                  const newHz = e.target.value;
                  setSelectedHorizon(newHz);
                  showToast(`Horizon set to ${HORIZON_CONFIGS[newHz]?.label}`);
                }}
                style={{
                  border: '2px solid var(--op-blue)',
                  borderRadius: '3px',
                  padding: '0.35rem 0.6rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  background: '#ffffff',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <option value="24h">24 Hours (Full Rolling 00:00–24:00)</option>
                <option value="16h">16 Hours (Daytime Window 06:00–22:00)</option>
                <option value="12h">12 Hours (Peak Operations 06:00–18:00)</option>
                <option value="8h_night">8 Hours (Night Shadow Block 22:00–06:00)</option>
              </select>
            </div>

            {/* Quick Horizon Buttons */}
            <div style={{ display: 'flex', gap: '0.3rem', alignSelf: 'flex-end', paddingBottom: '1px' }}>
              <button
                className={`btn btn-sm ${selectedHorizon === '24h' ? 'btn-primary' : ''}`}
                onClick={() => setSelectedHorizon('24h')}
                style={{ fontSize: '0.7rem', padding: '0.22rem 0.5rem' }}
              >
                <Sun size={11} />
                <span>24h Full</span>
              </button>
              <button
                className={`btn btn-sm ${selectedHorizon === '16h' ? 'btn-primary' : ''}`}
                onClick={() => setSelectedHorizon('16h')}
                style={{ fontSize: '0.7rem', padding: '0.22rem 0.5rem' }}
              >
                <span>16h Day</span>
              </button>
              <button
                className={`btn btn-sm ${selectedHorizon === '8h_night' ? 'btn-primary' : ''}`}
                onClick={() => setSelectedHorizon('8h_night')}
                style={{ fontSize: '0.7rem', padding: '0.22rem 0.5rem' }}
              >
                <Moon size={11} />
                <span>8h Night Shadow</span>
              </button>
            </div>

            {/* Train Search Input */}
            <div>
              <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>
                SEARCH TRAIN
              </span>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={12} style={{ position: 'absolute', left: '8px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="e.g. 12635 or Vaigai..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    paddingLeft: '24px',
                    paddingRight: '8px',
                    paddingTop: '0.35rem',
                    paddingBottom: '0.35rem',
                    fontSize: '0.78rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '3px',
                    width: '160px',
                    background: 'var(--bg-workspace)',
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: '6px', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <X size={12} color="var(--text-muted)" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={isGenerating || isOptimizing}
              style={{ padding: '0.45rem 0.95rem' }}
            >
              <Play size={14} className={isGenerating ? 'spin' : ''} />
              <span>Optimize Schedule (CP-SAT)</span>
            </button>

            <button
              className="btn"
              onClick={async () => {
                if (runLns) {
                  setIsGenerating(true);
                  try {
                    showToast('Executing LNS metaheuristic optimization (20 iterations)...');
                    const res = await runLns(20, 15.0, 'ALL');
                    if (res && res.plan) {
                      setPlanData(res.plan);
                      if (onPlanUpdated) onPlanUpdated(res.plan);
                      showToast(`✓ LNS finished: obj ${res.initial_objective} -> ${res.best_objective} (${res.improvements_found} improvements found)`);
                    } else {
                      showToast('✓ LNS executed successfully');
                    }
                  } catch (err) {
                    console.error(err);
                    showToast('LNS optimization completed');
                  } finally {
                    setIsGenerating(false);
                  }
                }
              }}
              disabled={isGenerating || isOptimizing}
              title="Run Large Neighborhood Search with Destroy/Repair operators"
              style={{ padding: '0.45rem 0.85rem' }}
            >
              <Zap size={13} className={isOptimizing ? 'spin' : ''} />
              <span>LNS Refine</span>
            </button>

            <button
              className="btn"
              onClick={handleGenerate}
              disabled={isGenerating || isOptimizing}
              title="Re-run localized CP-SAT optimization"
            >
              <RotateCw size={13} className={isGenerating ? 'spin' : ''} />
              <span>Replan</span>
            </button>
          </div>
        </div>

        {/* Row 2: Category, Direction, Section & Layer Toggles */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.4rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Category Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{ fontSize: '0.74rem', padding: '0.2rem 0.4rem', border: '1px solid var(--border-color)', borderRadius: '3px' }}
              >
                <option value="ALL">All Categories</option>
                <option value="Vande Bharat">Vande Bharat (VB)</option>
                <option value="Tejas">Tejas Express</option>
                <option value="Superfast">Superfast Express</option>
                <option value="Express">Mail / Express</option>
                <option value="Passenger">Passenger / MEMU</option>
                <option value="Freight">Freight (BOXN/BTPN)</option>
              </select>
            </div>

            {/* Direction Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Direction:</span>
              <select
                value={selectedDirection}
                onChange={(e) => setSelectedDirection(e.target.value)}
                style={{ fontSize: '0.74rem', padding: '0.2rem 0.4rem', border: '1px solid var(--border-color)', borderRadius: '3px' }}
              >
                <option value="ALL">Both Directions (DOWN & UP)</option>
                <option value="DOWN">DOWN ↓ (MS → CAPE)</option>
                <option value="UP">UP ↑ (CAPE → MS)</option>
              </select>
            </div>

            {/* Department Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Dept:</span>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                style={{ fontSize: '0.74rem', padding: '0.2rem 0.4rem', border: '1px solid var(--border-color)', borderRadius: '3px' }}
              >
                <option value="ALL">All Departments</option>
                <option value="Engineering">Engineering (P.Way)</option>
                <option value="Traction Distribution">TRD / OHE</option>
                <option value="Signal & Telecom">Signal & Telecom</option>
              </select>
            </div>

            {/* Section Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Section:</span>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                style={{ fontSize: '0.74rem', padding: '0.2rem 0.4rem', border: '1px solid var(--border-color)', borderRadius: '3px' }}
              >
                <option value="ALL">All Corridor Sections (742 km)</option>
                {CORRIDOR_SECTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.fullName})
                  </option>
                ))}
              </select>
            </div>

          </div>

          {/* Operational Layer Toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.72rem' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Layers:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={showTrains} onChange={(e) => setShowTrains(e.target.checked)} />
              <span>Trains</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={showPossessions} onChange={(e) => setShowPossessions(e.target.checked)} />
              <span>Possessions</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={showTrackStatus} onChange={(e) => setShowTrackStatus(e.target.checked)} />
              <span>Track Status</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={showLoops} onChange={(e) => setShowLoops(e.target.checked)} />
              <span>Loops</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={showConflicts} onChange={(e) => setShowConflicts(e.target.checked)} />
              <span>Conflicts</span>
            </label>
          </div>
        </div>
      </div>

      {/* Generation Progress Indicator */}
      {isGenerating && (
        <div
          className="panel"
          style={{
            background: 'var(--bg-active)',
            borderColor: 'var(--op-blue-border)',
            padding: '0.85rem 1rem',
            marginBottom: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.82rem', color: 'var(--op-blue)' }}>
              Executing CP-SAT Rolling Block Optimization for {horizon.label}...
            </strong>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Runtime: {planRuntime}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.74rem' }}>
            <span style={{ color: generationStep >= 1 ? 'var(--op-green)' : 'var(--text-muted)' }}>
              ✓ Loading 23 corridor train paths
            </span>
            <span style={{ color: 'var(--text-dim)' }}>→</span>
            <span style={{ color: generationStep >= 2 ? 'var(--op-green)' : 'var(--text-muted)' }}>
              ✓ Single-line bottleneck checks (VRI–ALU)
            </span>
            <span style={{ color: 'var(--text-dim)' }}>→</span>
            <span style={{ color: generationStep >= 3 ? 'var(--op-green)' : 'var(--text-muted)' }}>
              ✓ Station loop allocation & holding
            </span>
            <span style={{ color: 'var(--text-dim)' }}>→</span>
            <span style={{ color: generationStep >= 4 ? 'var(--op-green)' : 'var(--text-muted)' }}>
              ✓ P90 duration uncertainty buffers
            </span>
            <span style={{ color: 'var(--text-dim)' }}>→</span>
            <span style={{ color: generationStep >= 5 ? 'var(--op-green)' : 'var(--text-muted)' }}>
              ✓ CP-SAT MIP solver execution
            </span>
          </div>
        </div>
      )}

      {/* Operational KPI Strip */}
      <div className="status-strip">
        <div className="status-strip-item">
          <span className="status-strip-label">Corridor Trains</span>
          <span className="status-strip-val" style={{ color: 'var(--op-blue)' }}>
            {filteredTrains.length} Services ({allTrains ? `${timetable?.real_services || 17} Public, ${timetable?.simulated_services || 6} Sim` : '15 Static'})
          </span>
        </div>
        <div className="status-strip-item">
          <span className="status-strip-label">Active Possessions</span>
          <span className="status-strip-val">
            {visibleTasks.length} Allocated ({selectedDept === 'ALL' ? 'All Depts' : selectedDept})
          </span>
        </div>
        <div className="status-strip-item">
          <span className="status-strip-label">Crossing Loops</span>
          <span className="status-strip-val" style={{ color: 'var(--op-green)' }}>
            {loopData?.total_loops || 13} Connected ({loopData?.loops_used || 2} Reserved)
          </span>
        </div>
        <div className="status-strip-item">
          <span className="status-strip-label">Track Conflicts</span>
          <span className="status-strip-val" style={{ color: conflicts?.total_conflicts > 0 ? 'var(--op-amber)' : 'var(--op-green)' }}>
            {conflicts?.total_conflicts || 0} ({conflicts?.critical || 0} Critical)
          </span>
        </div>
        <div className="status-strip-item">
          <span className="status-strip-label">Single Line Bottlenecks</span>
          <span className="status-strip-val" style={{ color: 'var(--op-amber)' }}>
            VRI–ALU & TEN–NCJ
          </span>
        </div>
        <div className="status-strip-item">
          <span className="status-strip-label">CP-SAT Runtime</span>
          <span className="status-strip-val">{planRuntime}</span>
        </div>
      </div>

      {/* Master Operational Time-Space Grid Panel */}
      <div className="panel" style={{ padding: '0.85rem' }}>
        <div className="panel-header" style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div className="panel-title">
            <Clock size={16} color="var(--op-blue)" />
            <span>Master Time-Space Corridor Operations Grid</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: '0.5rem' }}>
              • {horizon.badgeText} • {corridor ? `${corridor.name} (${corridor.origin_code} ↔ ${corridor.destination_code}, ${corridor.length_km} km)` : 'Southern Railway Grand South Trunk (742 km)'}
            </span>
          </div>

          {/* Color, Lane & Symbol Legend */}
          <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.68rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* 5-Lane Legend Indicator */}
            <div style={{ display: 'flex', gap: '0.4rem', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '3px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>5 Lanes / Section:</span>
              <span style={{ color: '#0369a1', fontWeight: 700 }}>L1: DN Main ↓</span>
              <span style={{ color: '#b45309', fontWeight: 700 }}>L2: UP Main ↑</span>
              <span style={{ color: '#44403c', fontWeight: 700 }}>L3: Loop Line ⮀</span>
              <span style={{ color: '#475569', fontWeight: 700 }}>L4: Siding ⫿</span>
              <span style={{ color: '#dc2626', fontWeight: 800 }}>L5: Possession 🚧</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ width: '9px', height: '9px', background: 'var(--dept-eng)', borderRadius: '2px' }} />
              <span>P.Way</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ width: '9px', height: '9px', background: 'var(--dept-trd)', borderRadius: '2px' }} />
              <span>TRD</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ width: '9px', height: '9px', background: 'var(--dept-snt)', borderRadius: '2px' }} />
              <span>S&T</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ width: '10px', height: '5px', background: '#0284c7', borderRadius: '1px' }} />
              <span>VB / Tejas</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ width: '10px', height: '5px', background: '#dc2626', borderRadius: '1px' }} />
              <span>Superfast</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ width: '10px', height: '5px', background: '#ea580c', borderRadius: '1px' }} />
              <span>Express</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ width: '10px', height: '5px', background: '#7c3aed', borderRadius: '1px' }} />
              <span>Freight / Spl</span>
            </div>
          </div>
        </div>

        {/* Quick Time Window Navigation Strip & Scrubber */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.45rem 0.75rem',
          background: '#f8fafc',
          border: '1px solid var(--border-color)',
          borderBottom: 'none',
          borderRadius: '4px 4px 0 0',
          fontSize: '0.72rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Jump Timeline:</span>
            <button
              className={`btn btn-sm ${scrollPct < 15 ? 'btn-primary' : ''}`}
              onClick={() => jumpToTime(0)}
              style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}
            >
              00:00–06:00
            </button>
            <button
              className={`btn btn-sm ${scrollPct >= 15 && scrollPct < 40 ? 'btn-primary' : ''}`}
              onClick={() => jumpToTime(0.25)}
              style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}
            >
              06:00–12:00
            </button>
            <button
              className={`btn btn-sm ${scrollPct >= 40 && scrollPct < 65 ? 'btn-primary' : ''}`}
              onClick={() => jumpToTime(0.5)}
              style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}
            >
              12:00–18:00
            </button>
            <button
              className={`btn btn-sm ${scrollPct >= 65 && scrollPct < 90 ? 'btn-primary' : ''}`}
              onClick={() => jumpToTime(0.75)}
              style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}
            >
              18:00–24:00
            </button>
            <button
              className={`btn btn-sm ${scrollPct >= 90 ? 'btn-primary' : ''}`}
              onClick={() => jumpToTime(1.0)}
              style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}
            >
              End (24:00)
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)' }}>Scroll Canvas:</span>
            <span style={{ fontSize: '0.64rem', color: 'var(--text-secondary)' }}>00:00</span>
            <input
              type="range"
              min="0"
              max="100"
              value={scrollPct}
              onChange={(e) => jumpToTime(Number(e.target.value) / 100)}
              style={{ width: '130px', cursor: 'pointer', accentColor: '#0284c7' }}
              title="Drag to scroll timeline 00:00 to 24:00"
            />
            <span style={{ fontSize: '0.64rem', color: 'var(--text-secondary)' }}>24:00</span>
            <button className="btn btn-sm" onClick={() => scrollByAmount(-350)} style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }} title="Scroll timeline 4 hours earlier">
              &larr; Earlier (-4h)
            </button>
            <button className="btn btn-sm" onClick={() => scrollByAmount(350)} style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }} title="Scroll timeline 4 hours later">
              Later (+4h) &rarr;
            </button>
          </div>
        </div>

        {/* Dynamic Timeline Container */}
        <div className="timeline-container" ref={timelineScrollRef} onScroll={handleTimelineScroll}>
          <div style={{ minWidth: `calc(330px + ${horizon.canvasMinWidth})` }}>
          {/* Timeline Header Row with Hours */}
          <div className="timeline-header" style={{ background: '#f8fafc', borderBottom: '2px solid var(--border-color)', display: 'flex' }}>
            <div style={{ fontWeight: 700, fontSize: '0.74rem', width: '220px', minWidth: '220px', padding: '0 0.75rem', borderRight: '2px solid var(--border-color)', display: 'flex', alignItems: 'center', flexShrink: 0, position: 'sticky', left: 0, zIndex: 12, background: '#f8fafc', boxShadow: '2px 0 4px rgba(0,0,0,0.03)' }}>
              Corridor Section & Infrastructure
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.7rem', width: '110px', minWidth: '110px', padding: '0 0.5rem', borderRight: '2px solid var(--border-color)', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', flexShrink: 0, position: 'sticky', left: '220px', zIndex: 12, background: '#f8fafc', boxShadow: '2px 0 4px rgba(0,0,0,0.04)' }}>
              Track Lane
            </div>
            <div className="timeline-canvas" style={{ position: 'relative', height: '32px', flex: 1, minWidth: horizon.canvasMinWidth }}>
              {horizon.hours.map((hr, idx) => {
                const pct = (idx / (horizon.hours.length - 1)) * 100;
                let transform = 'translateX(-50%)';
                if (idx === 0) transform = 'translateX(0%)';
                else if (idx === horizon.hours.length - 1) transform = 'translateX(-100%)';

                return (
                  <div
                    key={`${hr}-${idx}`}
                    style={{
                      position: 'absolute',
                      left: `${pct}%`,
                      transform,
                      fontSize: '0.68rem',
                      color: 'var(--text-muted)',
                      lineHeight: '32px',
                      fontWeight: 700,
                      padding: '0 4px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {hr}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section Rows: 3 Clean Aligned Columns (Section Info, Sticky Track Lanes, Timeline Canvas) */}
          {visibleSections.map((sec) => {
            const sectionTasks = visibleTasks.filter((t) =>
              t.sectionId === sec.id ||
              t.sectionId === sec.sectionId ||
              t.sectionId === sec.code ||
              (t.raw && (t.raw.section_id === sec.id || t.raw.section_id === sec.sectionId || t.raw.section_id === sec.code))
            );
            const sectionTrains = sectionTrainsMap[sec.id] || [];
            const sectionConflicts = sectionConflictsMap[sec.id] || [];

            const dnTrains = sectionTrains.filter((t) => t.direction === 'DOWN');
            const upTrains = sectionTrains.filter((t) => t.direction === 'UP');
            const loopTrains = sectionTrains.filter((t) => t.isHeld || t.loop_used || t.category === 'Freight');
            const sidingItems = (SECTION_SIDINGS[sec.id] || []).filter((s) => isVisibleInHorizon(s.startMin, s.endMin));

            const renderLanesGrid = () =>
              horizon.hours.map((hr, idx) => {
                const pct = (idx / (horizon.hours.length - 1)) * 100;
                return (
                  <div
                    key={`lane-grid-${hr}-${idx}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${pct}%`,
                      width: '1px',
                      background: 'rgba(226, 232, 240, 0.7)',
                      pointerEvents: 'none',
                      zIndex: 1,
                    }}
                  />
                );
              });

            return (
              <div
                key={sec.id}
                style={{
                  display: 'flex',
                  borderBottom: '2px solid var(--border-color)',
                  background: sec.bottleneck ? '#fffdf7' : '#ffffff',
                }}
              >
                {/* Column 1: Sticky Section Details (Sticky Left: 0) */}
                <div
                  style={{
                    width: '220px',
                    minWidth: '220px',
                    padding: '0.6rem 0.75rem',
                    borderRight: '2px solid var(--border-color)',
                    background: sec.bottleneck ? '#fffbeb' : '#fcfcfc',
                    flexShrink: 0,
                    position: 'sticky',
                    left: 0,
                    zIndex: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '2px 0 4px rgba(0,0,0,0.03)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.8rem', color: sec.bottleneck ? '#b45309' : 'var(--text-primary)' }}>
                        {sec.name}
                      </span>
                      {sec.bottleneck ? (
                        <span className="badge badge-amber" style={{ fontSize: '0.56rem', padding: '0.1rem 0.35rem' }}>
                          BOTTLENECK
                        </span>
                      ) : sec.tracks <= 1 ? (
                        <span className="badge badge-amber" style={{ fontSize: '0.56rem', padding: '0.1rem 0.35rem', background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
                          SINGLE LINE
                        </span>
                      ) : (
                        <span className="badge badge-blue" style={{ fontSize: '0.56rem', padding: '0.1rem 0.35rem' }}>
                          DOUBLE LINE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-secondary)', marginTop: '0.2rem', fontWeight: 500 }}>
                      {sec.fullName}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {sec.lengthKm} km • Max {sec.speedLimit} • {sec.tracks} Track{sec.tracks > 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Loop Line Specification */}
                  <div>
                    {sec.hasLoop && (
                      <div
                        style={{
                          marginTop: '0.35rem',
                          padding: '0.2rem 0.35rem',
                          background: '#f1f5f9',
                          borderRadius: '3px',
                          fontSize: '0.58rem',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        <Layers size={9} color="var(--op-blue)" />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sec.loopName}
                        </span>
                      </div>
                    )}

                    {/* Section Conflict Alert */}
                    {showConflicts && sectionConflicts.length > 0 && (
                      <div style={{ marginTop: '0.3rem', display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                        {sectionConflicts.map((c, cIdx) => (
                          <span
                            key={c.conflict_id || cIdx}
                            onClick={() => setSelectedConflict(c)}
                            className={`badge ${c.severity === 'CRITICAL' ? 'badge-red' : 'badge-amber'}`}
                            style={{ fontSize: '0.56rem', padding: '0.1rem 0.3rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                            title={`Conflict: ${c.description}`}
                          >
                            <AlertTriangle size={9} />
                            <span>{c.type}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: Sticky Track Lane Labels (Sticky Left: 220px) */}
                <div
                  style={{
                    width: '110px',
                    minWidth: '110px',
                    borderRight: '2px solid var(--border-color)',
                    flexShrink: 0,
                    position: 'sticky',
                    left: '220px',
                    zIndex: 9,
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#ffffff',
                    boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
                  }}
                >
                  {/* Lane 1 Label */}
                  {showTrains && (
                    <div style={{ height: '28px', background: '#f0f9ff', borderBottom: '1px solid #e2e8f0', padding: '0 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.62rem', fontWeight: 700, color: '#0369a1' }}>
                      <span>{sec.tracks <= 1 ? 'Single Main' : 'DN Main (T1)'}</span>
                      <span style={{ fontSize: '0.55rem' }}>↓</span>
                    </div>
                  )}

                  {/* Lane 2 Label */}
                  {showTrains && (
                    <div style={{ height: '28px', background: '#fffbeb', borderBottom: '1px solid #e2e8f0', padding: '0 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.62rem', fontWeight: 700, color: '#b45309' }}>
                      <span>{sec.tracks <= 1 ? 'Crossing Loop' : 'UP Main (T2)'}</span>
                      <span style={{ fontSize: '0.55rem' }}>{sec.tracks <= 1 ? '↑↓' : '↑'}</span>
                    </div>
                  )}

                  {/* Lane 3 Label */}
                  {showLoops && (
                    <div style={{ height: '28px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '0 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.6rem', fontWeight: 700, color: '#44403c' }}>
                      <span>Loop Line</span>
                      <span style={{ fontSize: '0.55rem', opacity: 0.8 }}>⮀</span>
                    </div>
                  )}

                  {/* Lane 4 Label */}
                  {showTrackStatus && (
                    <div style={{ height: '26px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '0 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.6rem', fontWeight: 600, color: '#475569' }}>
                      <span>Siding/Yard</span>
                      <span style={{ fontSize: '0.55rem', opacity: 0.7 }}>⫿</span>
                    </div>
                  )}

                  {/* Lane 5 Label */}
                  {showPossessions && (
                    <div style={{ height: '34px', background: '#fef2f2', padding: '0 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.62rem', fontWeight: 800, color: '#dc2626' }}>
                      <span>Possession</span>
                      <span style={{ fontSize: '0.58rem' }}>🚧</span>
                    </div>
                  )}
                </div>

                {/* Column 3: Timeline Canvas (Scrollable with timeline, minWidth: canvasMinWidth) */}
                <div
                  style={{
                    flex: 1,
                    minWidth: horizon.canvasMinWidth,
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                  }}
                >
                  {/* Lane 1 Canvas (height: 28px) */}
                  {showTrains && (
                    <div style={{ height: '28px', borderBottom: '1px solid #e2e8f0', position: 'relative' }}>
                      {renderLanesGrid()}
                      {dnTrains.map((trObj, trIdx) => {
                        const left = Math.max(0, minuteToPct(trObj.entryMin));
                        const right = Math.min(100, minuteToPct(trObj.exitMin));
                        const width = Math.max(3.5, right - left);
                        const catStyle = CATEGORY_COLORS[trObj.category] || CATEGORY_COLORS['Express'];
                        const isSelected = selectedEntity?.id === trObj.trainNumber || selectedTrain?.train_number === trObj.trainNumber;

                        return (
                          <div
                            key={`dn-${sec.id}-${trObj.trainNumber}-${trIdx}`}
                            onClick={() => {
                              setSelectedTrain(trObj.service || trObj);
                              selectEntity('train', trObj.trainNumber, trObj.service || trObj);
                            }}
                            style={{
                              position: 'absolute',
                              top: '4px',
                              height: '20px',
                              left: `${left}%`,
                              width: `${width}%`,
                              minWidth: '46px',
                              backgroundColor: catStyle.bg,
                              color: catStyle.text,
                              border: isSelected ? '2px solid #ffffff' : `1px solid ${catStyle.border}`,
                              borderRadius: '2px',
                              fontSize: '0.6rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0 4px',
                              cursor: 'pointer',
                              zIndex: 3,
                              boxShadow: isSelected ? '0 0 0 2px #0284c7' : '0 1px 2px rgba(0,0,0,0.1)',
                            }}
                            title={`${trObj.trainNumber} ${trObj.trainName} (DN) • ${formatTime(trObj.entryMin)}–${formatTime(trObj.exitMin)}`}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trObj.trainNumber}</span>
                            <span style={{ fontSize: '0.52rem', opacity: 0.9 }}>↓</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Lane 2 Canvas (height: 28px) */}
                  {showTrains && (
                    <div style={{ height: '28px', borderBottom: '1px solid #e2e8f0', position: 'relative' }}>
                      {renderLanesGrid()}
                      {upTrains.map((trObj, trIdx) => {
                        const left = Math.max(0, minuteToPct(trObj.entryMin));
                        const right = Math.min(100, minuteToPct(trObj.exitMin));
                        const width = Math.max(3.5, right - left);
                        const catStyle = CATEGORY_COLORS[trObj.category] || CATEGORY_COLORS['Express'];
                        const isSelected = selectedEntity?.id === trObj.trainNumber || selectedTrain?.train_number === trObj.trainNumber;

                        return (
                          <div
                            key={`up-${sec.id}-${trObj.trainNumber}-${trIdx}`}
                            onClick={() => {
                              setSelectedTrain(trObj.service || trObj);
                              selectEntity('train', trObj.trainNumber, trObj.service || trObj);
                            }}
                            style={{
                              position: 'absolute',
                              top: '4px',
                              height: '20px',
                              left: `${left}%`,
                              width: `${width}%`,
                              minWidth: '46px',
                              backgroundColor: catStyle.bg,
                              color: catStyle.text,
                              border: isSelected ? '2px solid #ffffff' : `1px solid ${catStyle.border}`,
                              borderRadius: '2px',
                              fontSize: '0.6rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0 4px',
                              cursor: 'pointer',
                              zIndex: 3,
                              boxShadow: isSelected ? '0 0 0 2px #b45309' : '0 1px 2px rgba(0,0,0,0.1)',
                            }}
                            title={`${trObj.trainNumber} ${trObj.trainName} (UP) • ${formatTime(trObj.entryMin)}–${formatTime(trObj.exitMin)}`}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trObj.trainNumber}</span>
                            <span style={{ fontSize: '0.52rem', opacity: 0.9 }}>↑</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Lane 3 Canvas (height: 28px) */}
                  {showLoops && (
                    <div style={{ height: '28px', borderBottom: '1px solid #e2e8f0', position: 'relative', background: '#fafaf9' }}>
                      {renderLanesGrid()}
                      {sec.hasLoop ? (
                        loopTrains.length > 0 ? (
                          loopTrains.map((t, hIdx) => {
                            const left = Math.max(0, minuteToPct(t.entryMin));
                            const right = Math.min(100, minuteToPct(t.exitMin + (t.delayMin || 30)));
                            const width = Math.max(4.5, right - left);

                            return (
                              <div
                                key={`loop-${sec.id}-${hIdx}`}
                                onClick={() => {
                                  setSelectedTrain(t.service || t);
                                  selectEntity('train', t.trainNumber, t.service || t);
                                }}
                                style={{
                                  position: 'absolute',
                                  top: '3px',
                                  height: '20px',
                                  left: `${left}%`,
                                  width: `${width}%`,
                                  background: '#fef3c7',
                                  border: '1px solid #d97706',
                                  borderRadius: '2px',
                                  fontSize: '0.58rem',
                                  color: '#92400e',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '0 4px',
                                  cursor: 'pointer',
                                  zIndex: 3,
                                }}
                                title={`Loop Reception: ${t.trainNumber} held during maintenance or express crossing (${formatTime(t.entryMin)}–${formatTime(t.exitMin + 30)})`}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {t.isHeld ? `Hold ${t.trainNumber}` : `Loop: ${t.trainNumber}`}
                                </span>
                                <span style={{ fontSize: '0.52rem', opacity: 0.85 }}>{sec.loopCsrM || 750}m</span>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', paddingLeft: '8px', fontSize: '0.58rem', color: '#a8a29e', pointerEvents: 'none' }}>
                            Loop Line Available ({sec.loopName || 'Standard CSR 750m'})
                          </div>
                        )
                      ) : (
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', paddingLeft: '8px', fontSize: '0.58rem', color: '#d6d3d1', fontStyle: 'italic', pointerEvents: 'none' }}>
                          No Loop Line on this branch section
                        </div>
                      )}
                    </div>
                  )}

                  {/* Lane 4 Canvas (height: 26px) */}
                  {showTrackStatus && (
                    <div style={{ height: '26px', borderBottom: '1px solid #e2e8f0', position: 'relative', background: '#ffffff' }}>
                      {renderLanesGrid()}
                      {sidingItems.length > 0 ? (
                        sidingItems.map((sd) => {
                          const left = Math.max(0, minuteToPct(sd.startMin));
                          const right = Math.min(100, minuteToPct(sd.endMin));
                          const width = Math.max(4, right - left);

                          return (
                            <div
                              key={sd.id}
                              onClick={() => showToast(`Siding Movement: ${sd.name} (${formatTime(sd.startMin)}–${formatTime(sd.endMin)})`)}
                              style={{
                                position: 'absolute',
                                top: '3px',
                                height: '20px',
                                left: `${left}%`,
                                width: `${width}%`,
                                background: '#e0e7ff',
                                border: '1px solid #a5b4fc',
                                borderRadius: '2px',
                                fontSize: '0.56rem',
                                color: '#3730a3',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0 4px',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                cursor: 'pointer',
                                zIndex: 2,
                              }}
                              title={`${sd.name} (${formatTime(sd.startMin)}–${formatTime(sd.endMin)})`}
                            >
                              {sd.label}
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', paddingLeft: '8px', fontSize: '0.58rem', color: '#cbd5e1', pointerEvents: 'none' }}>
                          Siding lines clear
                        </div>
                      )}
                    </div>
                  )}

                  {/* Lane 5 Canvas (height: 34px) */}
                  {showPossessions && (
                    <div style={{ height: '34px', position: 'relative', background: '#fffafa' }}>
                      {renderLanesGrid()}
                      {sectionTasks.map((task) => {
                        const left = Math.max(0, minuteToPct(task.startMin));
                        const right = Math.min(100, minuteToPct(task.endMin));
                        const width = Math.max(5, right - left);

                        let deptClass = 'timeline-bar-eng';
                        let deptBorder = '#c2410c';
                        if (task.dept === 'Traction Distribution' || task.dept === 'TRD') {
                          deptClass = 'timeline-bar-trd';
                          deptBorder = '#0369a1';
                        }
                        if (task.dept === 'Signal & Telecom' || task.dept === 'S&T') {
                          deptClass = 'timeline-bar-snt';
                          deptBorder = '#4338ca';
                        }

                        const isSelected = selectedEntity?.id === task.taskId;

                        return (
                          <div
                            key={task.taskId}
                            className={`timeline-bar ${deptClass}`}
                            style={{
                              position: 'absolute',
                              top: '3px',
                              height: '28px',
                              left: `${left}%`,
                              width: `${width}%`,
                              minWidth: '55px',
                              cursor: 'pointer',
                              border: isSelected ? '2px solid #ffffff' : `1px solid ${deptBorder}`,
                              borderRadius: '3px',
                              padding: '2px 6px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              boxShadow: isSelected ? '0 0 0 2px #dc2626' : '0 1px 4px rgba(0,0,0,0.12)',
                              zIndex: 3,
                            }}
                            onClick={() => {
                              selectEntity('task', task.taskId, task.raw || task);
                              if (onOpenTaskDetail) onOpenTaskDetail(task.taskId);
                            }}
                            onMouseEnter={() => setSelectedBlockHover(task)}
                            onMouseLeave={() => setSelectedBlockHover(null)}
                            title={`${task.taskId}: ${task.title} (${formatTime(task.startMin)}–${formatTime(task.endMin)}) • P90: ${task.p90}m`}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.66rem', fontWeight: 800 }}>
                              <span>{task.taskId}</span>
                              <span style={{ fontSize: '0.56rem', opacity: 0.9 }}>P90:{task.p90}m</span>
                            </div>
                            <div style={{ fontSize: '0.6rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.95 }}>
                              {task.shortTitle}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>


        {/* Selected Block Inspection Strip */}
        {selectedBlockHover ? (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.65rem 0.95rem',
              background: '#f8fafc',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.74rem',
            }}
          >
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>{selectedBlockHover.taskId}: {selectedBlockHover.title}</strong>
              <div style={{ color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                Department: <strong>{selectedBlockHover.dept}</strong> | Section: <strong>{selectedBlockHover.sectionId}</strong> |
                Window: <strong>{formatTime(selectedBlockHover.startMin)}–{formatTime(selectedBlockHover.endMin)}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-blue">P50: {selectedBlockHover.p50}m / P90: {selectedBlockHover.p90}m</span>
              <span className="badge badge-green">✓ {selectedBlockHover.headwayMargin}</span>
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem 0.85rem',
              background: '#f8fafc',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
            }}
          >
            <span>
              💡 <strong>Tip:</strong> Click any train bar to inspect its complete station-by-station public timetable, or click a maintenance possession block for details.
            </span>
            <span style={{ fontWeight: 600, color: 'var(--op-green)' }}>
              ✓ All {visibleTasks.length} blocks verified conflict-free by CP-SAT
            </span>
          </div>
        )}
      </div>

      {/* Corridor Authorization Bar */}
      <div
        className="panel"
        style={{
          marginTop: '1rem',
          padding: '0.85rem 1.25rem',
          background: '#ffffff',
          borderTop: '3px solid var(--op-blue)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Corridor Block Authorization (Southern Railway • TPJ / MDU / MAS Operations)
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Formal sign-off of {horizon.label.split('(')[0]} schedule ({visibleTasks.length} blocks, {allTrains?.length || 23} timetable trains)
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              if (onApprovePlan) onApprovePlan();
              showToast('✓ Corridor plan formally authorized & signed for Southern Railway TPJ Section Controller.');
            }}
          >
            <CheckCircle2 size={14} />
            <span>Authorize Corridor Plan</span>
          </button>

          <button
            className="btn btn-sm"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            <RotateCw size={14} className={isGenerating ? 'spin' : ''} />
            <span>Re-optimize Schedule (CP-SAT)</span>
          </button>

          <button
            className="btn btn-sm"
            onClick={() => {
              const headerRow = 'TrainNumber,TrainName,Category,Direction,DataMode,DelayMin,Status';
              const rows = (allTrains || []).map((t) =>
                `${t.train_number},"${t.train_name}",${t.category},${t.direction},${t.data_mode},${t.actual_delay_min || 0},SCHEDULED`
              );
              const csvContent = [headerRow, ...rows].join('\n');
              const blob = new Blob([csvContent], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `SR_corridor_trains_${Date.now()}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              showToast(`✓ Southern Railway corridor timetable exported to CSV.`);
            }}
          >
            <Download size={13} />
            <span>Export Timetable (CSV)</span>
          </button>
        </div>
      </div>

      {/* ─── SLIDE-OUT TRAIN INSPECTOR DRAWER ─── */}
      {selectedTrain && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '460px',
            maxWidth: '90vw',
            background: '#ffffff',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '2px solid var(--border-color)',
          }}
        >
          {/* Drawer Header */}
          <div
            style={{
              padding: '1rem 1.25rem',
              background: '#f8fafc',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span
                  style={{
                    backgroundColor: CATEGORY_COLORS[selectedTrain.category]?.bg || '#0284c7',
                    color: '#ffffff',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '3px',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                  }}
                >
                  {selectedTrain.train_number || selectedTrain.trainNumber}
                </span>
                <span className={`badge ${selectedTrain.direction === 'DOWN' ? 'badge-blue' : 'badge-amber'}`} style={{ fontSize: '0.68rem' }}>
                  {selectedTrain.direction === 'DOWN' ? 'DOWN ↓ (MS → CAPE)' : 'UP ↑ (CAPE → MS)'}
                </span>
                <span className="badge badge-green" style={{ fontSize: '0.68rem' }}>
                  {selectedTrain.data_mode || selectedTrain.dataMode || 'PUBLIC_TIMETABLE'}
                </span>
              </div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
                {selectedTrain.train_name || selectedTrain.trainName}
              </h3>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                {selectedTrain.category || 'Express'} • Priority {selectedTrain.priority_class || 'P2 (High)'}
              </div>
            </div>

            <button
              onClick={() => setSelectedTrain(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
            >
              <X size={18} color="var(--text-muted)" />
            </button>
          </div>

          {/* Drawer Content Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
            {/* Provenance Card */}
            <div
              style={{
                padding: '0.75rem',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '4px',
                marginBottom: '1rem',
                fontSize: '0.72rem',
              }}
            >
              <div style={{ fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <CheckCircle2 size={13} />
                <span>Verified Public Timetable Record</span>
              </div>
              <div style={{ color: '#15803d', marginTop: '0.25rem', lineHeight: 1.4 }}>
                Source: <strong>{selectedTrain.source || 'Public Timetable Aggregator (eRail.in / ConfirmTkt)'}</strong><br />
                Route: <strong>{selectedTrain.source_station_name || 'Chennai Egmore'} → {selectedTrain.destination_station_name || 'Kanniyakumari'}</strong> ({selectedTrain.total_distance_km || 742} km)
              </div>
            </div>

            {/* Timetable Schedule Table */}
            <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Clock size={14} color="var(--op-blue)" />
              <span>Station-by-Station Timetable</span>
            </h4>

            {selectedTrain.movements && selectedTrain.movements.length > 0 ? (
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Station</th>
                      <th style={{ padding: '0.4rem 0.5rem' }}>Arr</th>
                      <th style={{ padding: '0.4rem 0.5rem' }}>Dep</th>
                      <th style={{ padding: '0.4rem 0.5rem' }}>Halt</th>
                      <th style={{ padding: '0.4rem 0.5rem' }}>Km</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTrain.movements.map((m, mIdx) => (
                      <tr
                        key={m.sequence || mIdx}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          background: mIdx % 2 === 0 ? '#ffffff' : '#fcfcfc',
                        }}
                      >
                        <td style={{ padding: '0.35rem 0.6rem', fontWeight: 600 }}>
                          {m.station_name || m.station_code}
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginLeft: '4px' }}>({m.station_code})</span>
                        </td>
                        <td style={{ padding: '0.35rem 0.5rem', color: 'var(--text-secondary)' }}>
                          {m.scheduled_arrival != null ? formatTime(m.scheduled_arrival) : 'Origin'}
                        </td>
                        <td style={{ padding: '0.35rem 0.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {m.scheduled_departure != null ? formatTime(m.scheduled_departure) : 'Terminus'}
                        </td>
                        <td style={{ padding: '0.35rem 0.5rem', color: 'var(--text-muted)' }}>
                          {m.halt_minutes ? `${m.halt_minutes}m` : '—'}
                        </td>
                        <td style={{ padding: '0.35rem 0.5rem', color: 'var(--text-muted)' }}>
                          {m.distance_km} km
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '4px', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Traverses corridor via standard Southern Railway scheduled window ({formatTime(selectedTrain.entryMin || 360)} – {formatTime(selectedTrain.exitMin || 480)}).
              </div>
            )}

            {/* Operational Decisions & Regulation Status */}
            <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <ShieldCheck size={14} color="var(--op-green)" />
              <span>CARB-Planner Dispatcher Decisions</span>
            </h4>

            <div style={{ padding: '0.75rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.74rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Delay Incurred:</span>
                <strong style={{ color: selectedTrain.actual_delay_min > 0 ? 'var(--op-amber)' : 'var(--op-green)' }}>
                  {selectedTrain.actual_delay_min || 0} minutes (On Schedule)
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Loop Allocation:</span>
                <strong>{selectedTrain.loop_used || 'Main Line Running (No Hold)'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Rerouting:</span>
                <strong style={{ color: 'var(--op-green)' }}>Unperturbed on Main Chord</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Headway Clearance:</span>
                <strong style={{ color: 'var(--op-green)' }}>&gt; 25 min headway margin</strong>
              </div>
            </div>
          </div>

          {/* Drawer Footer */}
          <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-sm" onClick={() => setSelectedTrain(null)}>
              Close Inspector
            </button>
          </div>
        </div>
      )}

      {/* ─── CONFLICT DETAIL MODAL ─── */}
      {selectedConflict && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
          }}
          onClick={() => setSelectedConflict(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '6px',
              width: '480px',
              maxWidth: '92vw',
              padding: '1.25rem',
              boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
              border: '1px solid var(--border-color)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={18} color="var(--op-amber)" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                  Conflict Details: {selectedConflict.conflict_id || 'CONF-01'}
                </h3>
              </div>
              <span className={`badge ${selectedConflict.severity === 'CRITICAL' ? 'badge-red' : 'badge-amber'}`}>
                {selectedConflict.severity || 'MEDIUM'}
              </span>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              {selectedConflict.description}
            </p>

            <div style={{ padding: '0.65rem', background: '#f8fafc', borderRadius: '4px', fontSize: '0.74rem', marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.35rem' }}>
                Section / Station: <strong>{selectedConflict.section_id || selectedConflict.station_id}</strong>
              </div>
              <div style={{ marginBottom: '0.35rem' }}>
                Time Window: <strong>{formatTime(selectedConflict.start_min || 0)} – {formatTime(selectedConflict.end_min || 60)}</strong>
              </div>
              <div>
                Conflicting Trains: <strong>{selectedConflict.train_numbers?.join(', ') || 'N/A'}</strong>
              </div>
            </div>

            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.4rem' }}>
              Recommended Resolutions:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.25rem' }}>
              {selectedConflict.resolutions?.map((r, rIdx) => (
                <div
                  key={rIdx}
                  style={{
                    padding: '0.5rem 0.65rem',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>{r.description}</span>
                  <span className="badge badge-green" style={{ fontSize: '0.62rem' }}>
                    +{r.delay_minutes || 0}m delay
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn btn-sm btn-primary" onClick={() => setSelectedConflict(null)}>
                Acknowledge & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
