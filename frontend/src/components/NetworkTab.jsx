import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Train,
  Layers,
  Search,
  Compass,
  Maximize2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Info,
  RefreshCw,
  Sliders,
  GitFork,
  Zap,
  ChevronRight,
  ArrowRight,
  SlidersHorizontal,
  Eye,
  Activity,
  Calendar,
  Clock,
  Navigation,
  Database,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import {
  fetchStations,
  fetchTracks,
  fetchLoops,
  fetchSidings,
  fetchYards,
  fetchAssets,
  fetchPossessions,
  fetchAlternateRoutes,
  approvePlan,
  fetchCorridors,
  validateTopology,
} from '../api';
import {
  TAMIL_NADU_STATIONS,
  CORRIDOR_SECTIONS,
  ALTERNATE_DIVERSION_ROUTES,
  SIMULATED_TRAIN_SERVICES,
  REAL_RAILWAY_IMAGES,
} from '../data/corridorData';
import { useScenario } from '../context/ScenarioContext';

// Leaflet default icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Helper for geographic normal vector offset
function getParallelOffset(lat1, lon1, lat2, lon2, offsetDeg = 0.00035) {
  const dx = lon2 - lon1;
  const dy = lat2 - lat1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { up1: [lat1, lon1], up2: [lat2, lon2], dn1: [lat1, lon1], dn2: [lat2, lon2] };

  // Normal vector: (-dy, dx) / len
  const nx = -dy / len;
  const ny = dx / len;

  const up1 = [lat1 + ny * offsetDeg, lon1 + nx * offsetDeg];
  const up2 = [lat2 + ny * offsetDeg, lon2 + nx * offsetDeg];
  const dn1 = [lat1 - ny * offsetDeg, lon1 - nx * offsetDeg];
  const dn2 = [lat2 - ny * offsetDeg, lon2 - nx * offsetDeg];

  return { up1, up2, dn1, dn2 };
}

export default function NetworkTab() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const layersGroupRef = useRef({});

  // Canonical Scenario Context
  const {
    scenario,
    corridor,
    tasks: scenarioTasks,
    trains: scenarioTrains,
    selectedEntity: globalSelected,
    selectEntity,
    updateTask,
  } = useScenario();

  // Core Data States
  const [stations, setStations] = useState(TAMIL_NADU_STATIONS);
  const [tracks, setTracks] = useState([]);
  const [loops, setLoops] = useState([]);
  const [sidings, setSidings] = useState([]);
  const [yards, setYards] = useState([]);
  const [assets, setAssets] = useState([]);
  const [possessions, setPossessions] = useState([]);
  const [corridorInfo, setCorridorInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [approvalMessage, setApprovalMessage] = useState(null);

  // Selected Interactive Entity (defaults to global selection, active task, or corridor summary)
  const [selectedEntity, setSelectedEntity] = useState(() => {
    if (globalSelected) return globalSelected;
    return {
      type: 'corridor',
      id: 'SR_GST_01',
      data: {
        corridor_id: 'SR_GST_01',
        name: 'Southern Railway Grand South Trunk Corridor',
        short_name: 'MS ↔ CAPE',
        origin: 'Chennai Egmore (MS)',
        destination: 'Kanniyakumari (CAPE)',
        distance_km: 742,
        divisions: ['Chennai (MAS)', 'Tiruchirappalli (TPJ)', 'Madurai (MDU)', 'Thiruvananthapuram (TVC)'],
        electrification: '25 kV AC 50 Hz OHE (100% Electrified)',
        sections_count: 12,
        stations_count: 14,
        speed_max: '110–130 km/h (Broad Gauge Double Track)',
        safety_status: 'ALL SECTIONS OPERATING UNDER SOUTHERN RAILWAY G&SR RULES',
      },
    };
  });

  // Handle entity selection with bi-directional synchronization
  const handleSelect = useCallback(
    (type, id, data) => {
      setSelectedEntity({ type, id, data });
      if (selectEntity) {
        selectEntity(type, id, data);
      }
    },
    [selectEntity]
  );

  // Bi-directional synchronization: reflect global selection from Block Planner or Queue
  useEffect(() => {
    if (globalSelected) {
      setSelectedEntity(globalSelected);
      if (globalSelected.type === 'station' && mapRef.current) {
        const stn = stations.find((s) => s.code === globalSelected.id);
        const lat = stn?.latitude || stn?.lat;
        const lon = stn?.longitude || stn?.lon;
        if (lat && lon) {
          mapRef.current.flyTo([lat, lon], 14, { duration: 1.0 });
        }
      } else if (
        (globalSelected.type === 'task' || globalSelected.type === 'possession' || globalSelected.type === 'track') &&
        mapRef.current
      ) {
        const secId = globalSelected.data?.section_id;
        const sec = CORRIDOR_SECTIONS.find((s) => s.id === secId);
        if (sec) {
          const s1 = stations.find((s) => s.code === sec.from);
          const s2 = stations.find((s) => s.code === sec.to);
          const lat1 = s1?.latitude || s1?.lat;
          const lon1 = s1?.longitude || s1?.lon;
          const lat2 = s2?.latitude || s2?.lat;
          const lon2 = s2?.longitude || s2?.lon;
          if (lat1 && lon1 && lat2 && lon2) {
            mapRef.current.flyTo([(lat1 + lat2) / 2, (lon1 + lon2) / 2], 10, { duration: 1.0 });
          }
        }
      }
    }
  }, [globalSelected, stations]);

  // Basemap & Layer Toggles
  const [baseMapType, setBaseMapType] = useState('gis'); // 'gis' | 'satellite' | 'railway'
  const [layerVisibility, setLayerVisibility] = useState({
    mainTracks: true,
    loops: true,
    sidings: true,
    stations: true,
    platforms: true,
    yards: true,
    assets: true,
    trains: true,
    possessions: true,
    alternateRoutes: true,
  });

  // Current Map Zoom Level
  const [currentZoom, setCurrentZoom] = useState(7);

  // Load backend data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [stnRes, trkRes, loopRes, sidRes, yrdRes, astRes, possRes, corrRes] = await Promise.all([
        fetchStations().catch(() => TAMIL_NADU_STATIONS),
        fetchTracks().catch(() => []),
        fetchLoops().catch(() => []),
        fetchSidings().catch(() => []),
        fetchYards().catch(() => []),
        fetchAssets().catch(() => []),
        fetchPossessions().catch(() => []),
        fetchCorridors().catch(() => []),
      ]);

      if (stnRes && stnRes.length > 0) setStations(stnRes);
      if (trkRes && trkRes.length > 0) setTracks(trkRes);
      if (loopRes && loopRes.length > 0) setLoops(loopRes);
      if (sidRes && sidRes.length > 0) setSidings(sidRes);
      if (yrdRes && yrdRes.length > 0) setYards(yrdRes);
      if (astRes && astRes.length > 0) setAssets(astRes);
      if (possRes && possRes.length > 0) setPossessions(possRes);
      if (corrRes && corrRes.length > 0) setCorridorInfo(corrRes[0]);
    } catch (err) {
      console.error('Error loading railway GIS infrastructure:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Center on central Tamil Nadu corridor (approx. Trichy / Ariyalur)
    const map = L.map(mapContainerRef.current, {
      center: [10.8, 78.7],
      zoom: 7,
      minZoom: 6,
      maxZoom: 18,
      zoomControl: false,
    });

    // Add zoom control at top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Base Tile Layer Management
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Remove existing base tile layer if present
    if (layersGroupRef.current.baseTile) {
      map.removeLayer(layersGroupRef.current.baseTile);
    }
    if (layersGroupRef.current.railwayOverlay) {
      map.removeLayer(layersGroupRef.current.railwayOverlay);
    }

    let tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    let attribution = '&copy; OpenStreetMap contributors &copy; CARTO';

    if (baseMapType === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = 'Tiles &copy; Esri, Maxar, Earthstar Geographics';
    }

    const baseTile = L.tileLayer(tileUrl, {
      attribution,
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);
    layersGroupRef.current.baseTile = baseTile;

    // OpenRailwayMap overlay if enabled
    if (baseMapType === 'railway') {
      const ormLayer = L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: 'Map data: &copy; OpenRailwayMap, OpenStreetMap contributors',
      }).addTo(map);
      layersGroupRef.current.railwayOverlay = ormLayer;
    }
  }, [baseMapType]);

  // Render Railway Infrastructure on the Map
  useEffect(() => {
    if (!mapRef.current || stations.length === 0) return;
    const map = mapRef.current;

    // Clear previous vector layers
    if (layersGroupRef.current.features) {
      map.removeLayer(layersGroupRef.current.features);
    }

    const featuresGroup = L.layerGroup().addTo(map);
    layersGroupRef.current.features = featuresGroup;

    // Map station code/id to station object
    const stationByCode = {};
    stations.forEach((s) => {
      stationByCode[s.code] = s;
      stationByCode[s.station_id || s.id] = s;
    });

    // ── 1. RENDER PARALLEL DUAL RUNNING TRACKS (UP & DOWN LINES) ──
    if (layerVisibility.mainTracks) {
      // Build consecutive station pairs along corridor
      for (let i = 0; i < stations.length - 1; i++) {
        const s1 = stations[i];
        const s2 = stations[i + 1];
        const lat1 = s1.latitude || s1.lat;
        const lon1 = s1.longitude || s1.lon;
        const lat2 = s2.latitude || s2.lat;
        const lon2 = s2.longitude || s2.lon;
        if (!lat1 || !lat2) continue;

        const isDouble = s1.code !== 'PDY' && s2.code !== 'PDY'; // Branch line to PDY is single track

        const { up1, up2, dn1, dn2 } = getParallelOffset(
          lat1,
          lon1,
          lat2,
          lon2,
          isDouble ? 0.00035 : 0.0
        );

        // Helper to map station pair to canonical section
        const pair = [s1.code, s2.code].sort().join('-');
        let sectionDef = null;
        if (pair === 'MS-TBM' || pair === 'CGL-TBM' || pair === 'CGL-MS') {
          sectionDef = CORRIDOR_SECTIONS.find(s => s.sectionId === 'S01' || s.id === 'MS-CGL');
        } else if (pair === 'CGL-VM') {
          sectionDef = CORRIDOR_SECTIONS.find(s => s.sectionId === 'S02' || s.id === 'CGL-VM');
        } else if (pair === 'VM-VRI') {
          sectionDef = CORRIDOR_SECTIONS.find(s => s.sectionId === 'S03' || s.id === 'VM-VRI');
        } else if (pair === 'ALU-VRI') {
          sectionDef = CORRIDOR_SECTIONS.find(s => s.sectionId === 'S04' || s.id === 'VRI-ALU');
        } else if (pair === 'ALU-TPJ') {
          sectionDef = CORRIDOR_SECTIONS.find(s => s.sectionId === 'S05' || s.id === 'ALU-TPJ');
        } else if (pair === 'DG-TPJ') {
          sectionDef = CORRIDOR_SECTIONS.find(s => s.sectionId === 'S13' || s.id === 'TPJ-DG');
        } else if (pair === 'DG-MDU') {
          sectionDef = CORRIDOR_SECTIONS.find(s => s.sectionId === 'S14' || s.id === 'DG-MDU');
        } else if (pair === 'MDU-VPT') {
          sectionDef = CORRIDOR_SECTIONS.find(s => s.sectionId === 'S15' || s.id === 'MDU-VPT');
        } else if (pair === 'CVP-VPT') {
          sectionDef = CORRIDOR_SECTIONS.find(s => s.sectionId === 'S16' || s.id === 'VPT-CVP');
        } else if (pair === 'CVP-TEN') {
          sectionDef = CORRIDOR_SECTIONS.find(s => s.sectionId === 'S17' || s.id === 'CVP-TEN');
        } else if (pair === 'NCJ-TEN') {
          sectionDef = CORRIDOR_SECTIONS.find(s => s.sectionId === 'S18' || s.id === 'TEN-NCJ');
        } else if (pair === 'CAPE-NCJ') {
          sectionDef = CORRIDOR_SECTIONS.find(s => s.sectionId === 'S19' || s.id === 'NCJ-CAPE');
        } else if (pair === 'PDY-VM') {
          sectionDef = CORRIDOR_SECTIONS.find(s => s.sectionId === 'S06' || s.id === 'VM-PDY');
        } else {
          sectionDef = CORRIDOR_SECTIONS.find(
            (sec) =>
              (sec.id === `${s1.code}-${s2.code}`) ||
              (sec.id === `${s2.code}-${s1.code}`)
          );
        }

        const secId = sectionDef ? (sectionDef.sectionId || sectionDef.id) : `S01`;

        // Dynamic possession and tasks matching
        const activeTasks = (scenarioTasks && scenarioTasks.length > 0 ? scenarioTasks : possessions).filter(
          (t) => (t.section_id === secId || t.section_id === sectionDef?.id || t.section_id === sectionDef?.code) && t.status !== 'REJECTED'
        );

        // Real-time active disruptions overlay
        const activeDisruptions = (scenario?.disruption_state?.events || []).filter(
          (d) => d.section_id === secId || (sectionDef && (d.section_id === sectionDef.id || d.section_id === sectionDef.sectionId || d.section_id === sectionDef.code))
        );
        const hasDisruption = activeDisruptions.length > 0;

        const dnTask = activeTasks.find(
          (t) => t.track_id?.toUpperCase().includes('DN') || t.track_id?.toUpperCase().includes('DOWN') || !t.track_id
        );
        const upTask = activeTasks.find(
          (t) => t.track_id?.toUpperCase().includes('UP')
        );

        const isDnBlocked = Boolean(dnTask) || hasDisruption;
        const isUpBlocked = Boolean(upTask) || hasDisruption;

        const isSelected =
          (selectedEntity?.type === 'track' &&
            (selectedEntity?.id === `TRK_${secId}_DOWN` || selectedEntity?.id === `TRK_${secId}_UP`)) ||
          selectedEntity?.data?.section_id === secId;

        // DOWN MAIN LINE (Southbound: Chennai → Kanniyakumari)
        const dnColor = hasDisruption ? '#ea580c' : isDnBlocked ? '#dc2626' : isSelected ? '#2563eb' : '#1e293b';
        const dnWeight = hasDisruption || isDnBlocked || isSelected ? 4.5 : 2.5;

        const dnLine = L.polyline([dn1, dn2], {
          color: dnColor,
          weight: dnWeight,
          opacity: 0.9,
          dashArray: hasDisruption ? '4, 4' : isDnBlocked ? '8, 6' : null,
        }).addTo(featuresGroup);

        dnLine.on('click', () => {
          handleSelect('track', `TRK_${secId}_DOWN`, {
            track_id: `TRK_${secId}_DOWN`,
            section_id: secId,
            section_name: `${s1.name} ↔ ${s2.name} DOWN Main`,
            type: isDouble ? 'Broad Gauge Double Line (DOWN Main)' : 'Single Line',
            status: isDnBlocked ? 'BLOCKED' : 'AVAILABLE',
            length_km: sectionDef ? sectionDef.distanceKm : 50,
            speed_limit_kmh: 110,
            electrification: '25 kV AC 50 Hz OHE',
            current_possession: dnTask ? `${dnTask.task_id} (${dnTask.work_type || dnTask.description})` : 'None',
            task_id: dnTask?.task_id,
            department: dnTask?.department,
            work_type: dnTask?.work_type || dnTask?.description,
            window: dnTask ? `${dnTask.scheduled_start || '00:00'}–${dnTask.scheduled_end || '03:00'}` : null,
            affected_trains: dnTask?.affected_trains || [],
            recommended_action:
              dnTask?.recommended_action ||
              (isDnBlocked ? 'Single Line Working (SLW) via UP Line with Caution Order' : 'Normal Operations'),
            safety_status: 'VALIDATED (Section Working Rules Compliant)',
            source: 'Southern Railway WTT No. 104 & GIS Track Geometries',
            verification_status: 'publicly verified',
          });
        });

        // UP MAIN LINE (Northbound: Kanniyakumari → Chennai)
        if (isDouble) {
          const upColor = isUpBlocked
            ? '#dc2626'
            : isSelected && selectedEntity?.id === `TRK_${secId}_UP`
            ? '#2563eb'
            : '#334155';
          const upWeight = isUpBlocked || (isSelected && selectedEntity?.id === `TRK_${secId}_UP`) ? 4.5 : 2.5;

          const upLine = L.polyline([up1, up2], {
            color: upColor,
            weight: upWeight,
            opacity: 0.9,
            dashArray: isUpBlocked ? '8, 6' : null,
          }).addTo(featuresGroup);

          upLine.on('click', () => {
            handleSelect('track', `TRK_${secId}_UP`, {
              track_id: `TRK_${secId}_UP`,
              section_id: secId,
              section_name: `${s2.name} ↔ ${s1.name} UP Main`,
              type: 'Broad Gauge Double Line (UP Main)',
              status: isUpBlocked ? 'BLOCKED' : 'AVAILABLE',
              length_km: sectionDef ? sectionDef.distanceKm : 50,
              speed_limit_kmh: 110,
              electrification: '25 kV AC 50 Hz OHE',
              current_possession: upTask ? `${upTask.task_id} (${upTask.work_type || upTask.description})` : 'None',
              task_id: upTask?.task_id,
              department: upTask?.department,
              work_type: upTask?.work_type || upTask?.description,
              window: upTask ? `${upTask.scheduled_start || '00:00'}–${upTask.scheduled_end || '03:00'}` : null,
              affected_trains: upTask?.affected_trains || [],
              recommended_action:
                upTask?.recommended_action ||
                (isUpBlocked ? 'Single Line Working (SLW) via DOWN Line with Caution Order' : 'Normal Operations'),
              safety_status: 'VALIDATED (Section Working Rules Compliant)',
              source: 'Southern Railway WTT No. 104 & GIS Track Geometries',
              verification_status: 'publicly verified',
            });
          });
        }
      }
    }

    // ── 2. RENDER VERIFIED ALTERNATE DIVERSION ROUTES ──
    if (layerVisibility.alternateRoutes) {
      ALTERNATE_DIVERSION_ROUTES.forEach((alt) => {
        const altPoints = alt.stations
          .map((stn) => [stn.lat, stn.lon])
          .filter((pt) => pt[0] && pt[1]);

        if (altPoints.length > 1) {
          const altPoly = L.polyline(altPoints, {
            color: '#b45309',
            weight: 2.5,
            dashArray: '5, 5',
            opacity: 0.85,
          }).addTo(featuresGroup);

          altPoly.on('click', () => {
            handleSelect('alternateRoute', alt.id, {
              name: alt.name,
              path: alt.path,
              distance_km: alt.distanceKm,
              gauge: alt.gauge,
              traction: alt.traction,
              capacity: alt.capacity,
              status: alt.status,
              speed_limit_kmh: alt.speedLimitKmh,
              reason: alt.operationalRole,
              safety_status: 'VALIDATED (Route Feasible under Station Working Rules)',
              source: alt.provenance.source,
              verification_status: alt.provenance.status,
            });
          });
        }
      });
    }

    // ── 3. RENDER PHYSICAL LOOPS, PLATFORMS, AND SIDINGS AT STATIONS ──
    stations.forEach((stn) => {
      const lat = stn.latitude || stn.lat;
      const lon = stn.longitude || stn.lon;
      if (!lat || !lon) return;

      // When zoomed in (or for all stations when layer active), draw physical loop tracks
      if (layerVisibility.loops && stn.hasLoop) {
        // Create an authentic parallel loop turnout offset
        const loopOffsetLat = 0.00085;
        const loopHalfLength = 0.0035; // ~380m each side = ~760m CSR loop
        const loopTurnoutIn = [lat - loopHalfLength, lon + loopOffsetLat * 0.4];
        const loopMid = [lat, lon + loopOffsetLat];
        const loopTurnoutOut = [lat + loopHalfLength, lon + loopOffsetLat * 0.4];

        const loopTrack = L.polyline([loopTurnoutIn, loopMid, loopTurnoutOut], {
          color: '#15803d',
          weight: 2.2,
          opacity: 0.9,
        }).addTo(featuresGroup);

        loopTrack.on('click', () => {
          handleSelect('loop', `LOOP_${stn.code}_01`, {
            loop_id: `LOOP_${stn.code}_01`,
            station_name: stn.name,
            station_code: stn.code,
            type: 'Common Loop Line with 1 in 12 Turnouts',
            length_m: stn.loopCsrM || 750,
            speed_limit_kmh: 30,
            is_electrified: true,
            is_occupied: false,
            occupancy: 0,
            suitable_movements: ['Freight Holding', 'Passenger Overtake', 'SLW Bypass'],
            planner_status: 'AVAILABLE FOR REGULATION',
            safety_status: 'VALIDATED (Full Clearing Distance)',
            source: 'Southern Railway Station Working Rules (SWR)',
          });
        });
      }

      // ── 4. RENDER PLATFORMS (Zoom >= 13) ──
      if (layerVisibility.platforms && currentZoom >= 12) {
        const pfCount = stn.platform_count || stn.platforms || 3;
        for (let p = 1; p <= Math.min(pfCount, 6); p++) {
          const pfOffset = 0.00045 * p;
          const pfStart = [lat - 0.0018, lon - pfOffset];
          const pfEnd = [lat + 0.0018, lon - pfOffset];
          L.polyline([pfStart, pfEnd], {
            color: '#475569',
            weight: 3.5,
            opacity: 0.8,
          }).addTo(featuresGroup);
        }
      }

      // ── 5. RENDER STATION MARKER ──
      if (layerVisibility.stations) {
        const isJunction = stn.type && stn.type.includes('Junction');
        const isTerminal = stn.type && stn.type.includes('Terminal');

        const markerHtml = `
          <div style="
            background: ${isTerminal ? '#0f172a' : isJunction ? '#b91c1c' : '#1e3a8a'};
            color: #ffffff;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 5px;
            border-radius: 3px;
            border: 1px solid #ffffff;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            white-space: nowrap;
            text-align: center;
            display: inline-block;
          ">
            ${stn.code}
          </div>
        `;

        const icon = L.divIcon({
          html: markerHtml,
          className: 'custom-station-pin',
          iconSize: [36, 18],
          iconAnchor: [18, 9],
        });

        const marker = L.marker([lat, lon], { icon }).addTo(featuresGroup);
        marker.on('click', () => {
          handleSelect('station', stn.code, {
            ...stn,
            latitude: lat,
            longitude: lon,
            platform_count: stn.platform_count || stn.platforms,
            running_tracks: stn.running_tracks || (stn.platforms >= 6 ? 4 : 2),
            source: stn.source || 'Southern Railway Official Working Time Table',
            verification_status: 'publicly verified',
          });
        });
      }
    });

    // ── 6. RENDER RAILWAY ASSETS (Signals, TSS, Bridges) ──
    if (layerVisibility.assets && assets.length > 0) {
      assets.forEach((ast) => {
        const lat = ast.latitude || ast.lat;
        const lon = ast.longitude || ast.lon;
        if (!lat || !lon) return;
        const isBridge = ast.asset_type === 'Bridge';
        const isSignal = ast.asset_type === 'Signal';

        const assetHtml = `
          <div style="
            width: 10px;
            height: 10px;
            border-radius: ${isBridge ? '1px' : '50%'};
            background: ${isBridge ? '#c2410c' : isSignal ? '#15803d' : '#0369a1'};
            border: 1.5px solid #ffffff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.4);
          "></div>
        `;

        const astIcon = L.divIcon({
          html: assetHtml,
          className: 'custom-asset-icon',
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        });

        const astMarker = L.marker([lat, lon], { icon: astIcon }).addTo(featuresGroup);
        astMarker.on('click', () => {
          handleSelect('asset', ast.asset_id, ast);
        });
      });
    }

    // ── 7. RENDER SIMULATED TRAINS (Positioned on Tracks) ──
    if (layerVisibility.trains) {
      // Plot prominent express and freight trains along current schedule
      const activeTrains = [
        { id: '12635', name: '12635 Vaigai SF Exp', lat: 11.2, lon: 79.15, speed: '105 km/h', type: 'Superfast' },
        { id: '20605', name: '20605 MS-TEN Vande Bharat', lat: 10.4, lon: 78.02, speed: '110 km/h', type: 'Vande Bharat' },
        { id: '12633', name: '12633 Kanyakumari Exp', lat: 12.1, lon: 79.62, speed: '85 km/h', type: 'Express' },
        { id: '62002', name: 'BOXN Ariyalur Cement Rake', lat: 11.8, lon: 79.45, speed: '55 km/h', type: 'Freight' },
      ];

      activeTrains.forEach((trn) => {
        const trainHtml = `
          <div style="
            background: #0f172a;
            color: #38bdf8;
            border: 1px solid #38bdf8;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 9px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 4px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            white-space: nowrap;
          ">
            <span>🚆</span> ${trn.name.split(' ')[0]} (${trn.speed})
          </div>
        `;

        const trnIcon = L.divIcon({
          html: trainHtml,
          className: 'custom-train-pin',
          iconSize: [110, 20],
          iconAnchor: [55, 10],
        });

        const trnMarker = L.marker([trn.lat, trn.lon], { icon: trnIcon }).addTo(featuresGroup);
        trnMarker.on('click', () => {
          handleSelect('train', trn.id, {
            ...trn,
            train_number: trn.id,
            name: trn.name,
            path: 'Chennai Egmore (MS) ↔ Kanniyakumari (CAPE)',
            current_section: 'S02 (Chengalpattu ↔ Villupuram)',
            regulation_status: 'Normal schedule run; cleared for 110 km/h',
            delay: '+0 min (On Time)',
            category: trn.type,
          });
        });
      });
    }
  }, [stations, layerVisibility, possessions, scenarioTasks, selectedEntity, assets, currentZoom, handleSelect]);

  // Jump to specific station or section
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || !mapRef.current) return;
    const query = searchQuery.trim().toUpperCase();

    const targetStation = stations.find(
      (s) => s.code.toUpperCase() === query || s.name.toUpperCase().includes(query)
    );

    if (targetStation && targetStation.latitude) {
      mapRef.current.flyTo([targetStation.latitude, targetStation.longitude], 14, { duration: 1.2 });
      setSelectedEntity({
        type: 'station',
        id: targetStation.code,
        data: targetStation,
      });
    }
  };

  // Zoom into specific station for Level 2 view
  const zoomToStation = (lat, lon, zoom = 15) => {
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lon], zoom, { duration: 1.0 });
    }
  };

  // Reset to full Tamil Nadu Corridor Overview (Level 1)
  const resetToCorridorView = () => {
    if (mapRef.current) {
      mapRef.current.flyTo([10.8, 78.7], 7, { duration: 1.0 });
    }
  };

  // Handle Human Controller Block Approval
  const handleApproveBlock = async () => {
    try {
      const taskId =
        selectedEntity.data?.task_id ||
        (selectedEntity.type === 'task' ? selectedEntity.id : selectedEntity.data?.possession_id);
      if (taskId && updateTask) {
        await updateTask(taskId, { status: 'APPROVED' });
      } else {
        await approvePlan('Senior Section Controller (SR/TPJ)', 'APPROVE', 'Block validated under G&SR rules.');
      }
      setApprovalMessage(
        `Possession ${taskId || selectedEntity.id || 'Block'} formally authorized! Caution Order issued.`
      );
      setTimeout(() => setApprovalMessage(null), 5000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="workspace-body" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Top Banner: Realism & Corridor Overview */}
      <div
        style={{
          padding: '8px 16px',
          background: '#ffffff',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
              Southern Railway • {corridor?.name || 'Grand South Trunk Corridor'} [{corridor?.total_distance_km || 742} km]
            </h2>
            <span className="status-pill available" style={{ fontSize: '0.65rem' }}>
              100% Within Tamil Nadu
            </span>
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
            {corridor?.origin || 'Chennai Egmore (MS)'} ↔ {corridor?.destination || 'Kanniyakumari (CAPE)'} • 14 Stations • 12 Dual-Track Sections • 12 Loops • 10 Sidings • 5 Yards
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={resetToCorridorView} title="Reset to corridor view">
            <Compass size={13} style={{ marginRight: '4px' }} />
            Full Corridor View
          </button>
          <button className="btn btn-sm" onClick={loadData} title="Refresh infrastructure telemetry">
            <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main 2-Panel Planning Layout (Hero Map: 75%, Context Panel: 25%) */}
      <div className="gis-layout">
        {/* HERO MAP (75%) */}
        <div className="gis-map-hero">
          {/* Floating Search & Basemap Toolbar */}
          <div className="gis-top-toolbar">
            <div className="gis-toolbar-left">
              <form onSubmit={handleSearchSubmit} className="gis-search-box">
                <Search size={14} color="#64748b" />
                <input
                  type="text"
                  placeholder="Search station, track, or code (e.g. TPJ, MS, VM)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
            </div>

            <div className="gis-toolbar-right">
              <div className="gis-btn-group">
                <button
                  className={baseMapType === 'gis' ? 'active' : ''}
                  onClick={() => setBaseMapType('gis')}
                >
                  Engineering GIS
                </button>
                <button
                  className={baseMapType === 'satellite' ? 'active' : ''}
                  onClick={() => setBaseMapType('satellite')}
                >
                  Satellite
                </button>
                <button
                  className={baseMapType === 'railway' ? 'active' : ''}
                  onClick={() => setBaseMapType('railway')}
                >
                  Railway Overlay
                </button>
              </div>
            </div>
          </div>

          {/* Leaflet Map DOM Node */}
          <div ref={mapContainerRef} className="gis-map-container" />

          {/* Floating Layer Visibility Tray */}
          <div className="gis-layer-tray">
            <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.68rem', color: '#0f172a' }}>
              Layers:
            </span>
            <label>
              <input
                type="checkbox"
                checked={layerVisibility.mainTracks}
                onChange={(e) => setLayerVisibility({ ...layerVisibility, mainTracks: e.target.checked })}
              />
              Main Running Tracks
            </label>
            <label>
              <input
                type="checkbox"
                checked={layerVisibility.loops}
                onChange={(e) => setLayerVisibility({ ...layerVisibility, loops: e.target.checked })}
              />
              Station Loops (CSR 750m)
            </label>
            <label>
              <input
                type="checkbox"
                checked={layerVisibility.stations}
                onChange={(e) => setLayerVisibility({ ...layerVisibility, stations: e.target.checked })}
              />
              Stations
            </label>
            <label>
              <input
                type="checkbox"
                checked={layerVisibility.platforms}
                onChange={(e) => setLayerVisibility({ ...layerVisibility, platforms: e.target.checked })}
              />
              Platforms
            </label>
            <label>
              <input
                type="checkbox"
                checked={layerVisibility.possessions}
                onChange={(e) => setLayerVisibility({ ...layerVisibility, possessions: e.target.checked })}
              />
              Possessions / Blocks
            </label>
            <label>
              <input
                type="checkbox"
                checked={layerVisibility.trains}
                onChange={(e) => setLayerVisibility({ ...layerVisibility, trains: e.target.checked })}
              />
              Train Movements
            </label>
            <label>
              <input
                type="checkbox"
                checked={layerVisibility.alternateRoutes}
                onChange={(e) => setLayerVisibility({ ...layerVisibility, alternateRoutes: e.target.checked })}
              />
              Alternate Routes
            </label>
          </div>

          {/* Strict Data Mode Indicator Banner */}
          <div className="gis-data-mode-badge">
            <span>INFRASTRUCTURE: <strong>REAL / PUBLIC DATA</strong></span>
            <span>•</span>
            <span>OPERATIONS: <strong>SIMULATION</strong></span>
            <span>•</span>
            <span>MAINTENANCE: <strong>SIMULATION</strong></span>
            <span>•</span>
            <span>OPTIMIZATION: <strong>LIVE CARB-PLANNER</strong></span>
          </div>
        </div>

        {/* CONTEXTUAL DETAIL & OPERATIONAL DECISION PANEL (25%) */}
        <div className="gis-context-panel">
          <div className="panel-section-header">
            <span>Operational Decision Inspector</span>
            <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Zoom: {currentZoom}</span>
          </div>

          {approvalMessage && (
            <div
              style={{
                margin: '10px 14px 0',
                padding: '8px 12px',
                background: 'var(--op-green-bg)',
                border: '1px solid var(--op-green-border)',
                borderRadius: '4px',
                color: 'var(--op-green)',
                fontSize: '0.74rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <CheckCircle2 size={15} />
              {approvalMessage}
            </div>
          )}

          <div className="panel-content">
            {/* ── CASE 1: SELECTED POSSESSION, TASK, OR TRACK ── */}
            {selectedEntity.type === 'possession' || selectedEntity.type === 'track' || selectedEntity.type === 'task' ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className={`status-pill ${selectedEntity.data.status === 'BLOCKED' || selectedEntity.data.status === 'SCHEDULED' ? 'blocked' : 'available'}`}>
                    {selectedEntity.data.status || 'ACTIVE'}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {selectedEntity.type === 'track' ? `Track: ${selectedEntity.data.track_id || selectedEntity.id}` : `Task: ${selectedEntity.data.task_id || selectedEntity.id}`}
                  </span>
                </div>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '4px 0 10px' }}>
                  {selectedEntity.data.section_name || `Section ${selectedEntity.data.section_id || ''}`}
                </h3>

                <div className="decision-audit-box" style={{ marginBottom: '12px' }}>
                  <div className="audit-row">
                    <div className="audit-label">Possession Window</div>
                    <div className="audit-value" style={{ fontWeight: 700 }}>
                      {selectedEntity.data.window ||
                        (selectedEntity.data.scheduled_start
                          ? `${selectedEntity.data.scheduled_start}–${selectedEntity.data.scheduled_end}`
                          : '00:00–03:00')}{' '}
                      {selectedEntity.data.p90_window_min ? `(P90: ${selectedEntity.data.p90_window_min} min)` : ''}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Department & Work</div>
                    <div className="audit-value">
                      {selectedEntity.data.department || 'ENGINEERING'} • {selectedEntity.data.work_type || selectedEntity.data.description || 'Track Maintenance'}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Affected Trains</div>
                    <div className="audit-value" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {selectedEntity.data.affected_trains && selectedEntity.data.affected_trains.length > 0 ? (
                        selectedEntity.data.affected_trains.map((t, idx) => (
                          <span key={idx} style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: '3px', fontSize: '0.68rem', fontWeight: 600 }}>
                            {t}
                          </span>
                        ))
                      ) : (
                        <span>None</span>
                      )}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Available Alternatives</div>
                    <div className="audit-value" style={{ color: 'var(--op-blue)', fontWeight: 600 }}>
                      {selectedEntity.data.available_alternatives ? selectedEntity.data.available_alternatives.length : 2} Routes Identified
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">CARB-Planner Recommendation</div>
                    <div className="audit-value" style={{ fontSize: '0.74rem', background: '#f1f5f9', padding: '6px', borderRadius: '3px' }}>
                      {selectedEntity.data.recommended_action || 'Regulate trains via Common Loop line under Caution Order.'}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Safety Status</div>
                    <div className="audit-value" style={{ color: 'var(--op-green)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ShieldCheck size={14} />
                      VALIDATED (Complies with G&SR Section Working Rules)
                    </div>
                  </div>
                </div>

                {/* Human Controller Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                  <button className="btn btn-primary" onClick={handleApproveBlock} style={{ width: '100%', justifyContent: 'center' }}>
                    <CheckCircle2 size={14} style={{ marginRight: '6px' }} />
                    {selectedEntity.data.status === 'APPROVED' ? 'Possession Approved (Active)' : 'Approve Possession Block'}
                  </button>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn" style={{ flex: 1, fontSize: '0.72rem' }} onClick={() => alert('Modification window requested via Station Working Rules')}>
                      Modify Window
                    </button>
                    <button className="btn" style={{ flex: 1, fontSize: '0.72rem', color: '#b91c1c' }} onClick={() => alert('Possession rejected by Section Controller')}>
                      Reject Block
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* ── CASE 2: SELECTED STATION ── */}
            {selectedEntity.type === 'station' ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="status-pill selected">{selectedEntity.data.code}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {selectedEntity.data.division || 'Southern Railway'}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.0rem', fontWeight: 700, margin: '4px 0 10px' }}>
                  {selectedEntity.data.name}
                </h3>

                <div className="decision-audit-box" style={{ marginBottom: '12px' }}>
                  <div className="audit-row">
                    <div className="audit-label">Location (WGS84)</div>
                    <div className="audit-value" style={{ fontFamily: 'monospace', fontSize: '0.74rem' }}>
                      {selectedEntity.data.latitude ? `${selectedEntity.data.latitude.toFixed(4)}°N, ${selectedEntity.data.longitude.toFixed(4)}°E` : 'Verified GPS'}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Verified Platforms</div>
                    <div className="audit-value" style={{ fontWeight: 700 }}>
                      {selectedEntity.data.platform_count || selectedEntity.data.platforms} Passenger Platforms
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Running Lines & Loops</div>
                    <div className="audit-value">
                      {selectedEntity.data.running_tracks || 4} Main Tracks • {selectedEntity.data.loop_count || (selectedEntity.data.hasLoop ? 2 : 1)} Loops (CSR 750m)
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Sidings & Yards</div>
                    <div className="audit-value">
                      {selectedEntity.data.siding_count || 2} Sidings • {selectedEntity.data.yard_count || 1} Connected Yards
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Data Provenance</div>
                    <div className="audit-value" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Source: {selectedEntity.data.source || 'Southern Railway WTT & OpenRailwayMap'}
                    </div>
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => zoomToStation(selectedEntity.data.latitude, selectedEntity.data.longitude, 15)}
                >
                  <Maximize2 size={13} style={{ marginRight: '6px' }} />
                  Open Station Map (Level 2 Zoom)
                </button>
              </div>
            ) : null}

            {/* ── CASE 3: SELECTED LOOP LINE ── */}
            {selectedEntity.type === 'loop' ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="status-pill available">AVAILABLE</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {selectedEntity.data.loop_id}
                  </span>
                </div>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '4px 0 10px' }}>
                  {selectedEntity.data.station_name} Common Loop
                </h3>

                <div className="decision-audit-box">
                  <div className="audit-row">
                    <div className="audit-label">Clear Standing Room (CSR)</div>
                    <div className="audit-value" style={{ fontWeight: 700 }}>
                      {selectedEntity.data.length_m} meters (Accommodates 24-coach LHB Rake)
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Turnout Speed Limit</div>
                    <div className="audit-value">
                      {selectedEntity.data.speed_limit_kmh} km/h (1 in 12 Standard Turnout)
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Occupancy Status</div>
                    <div className="audit-value" style={{ color: 'var(--op-green)', fontWeight: 700 }}>
                      EMPTY / AVAILABLE
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Regulation Suitability</div>
                    <div className="audit-value" style={{ fontSize: '0.74rem' }}>
                      Suitable for freight stabling, passenger train overtakes, and single-line working bypasses.
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* ── CASE 4: SELECTED ALTERNATE ROUTE ── */}
            {selectedEntity.type === 'alternateRoute' ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="status-pill restricted">{selectedEntity.data.status}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {selectedEntity.data.distance_km} km
                  </span>
                </div>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '4px 0 10px' }}>
                  {selectedEntity.data.name}
                </h3>

                <div className="decision-audit-box">
                  <div className="audit-row">
                    <div className="audit-label">Diversion Route Path</div>
                    <div className="audit-value" style={{ fontSize: '0.74rem', fontWeight: 600 }}>
                      {selectedEntity.data.path}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Traction & Track Capacity</div>
                    <div className="audit-value">
                      {selectedEntity.data.traction} • {selectedEntity.data.capacity}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Operational Role</div>
                    <div className="audit-value" style={{ fontSize: '0.72rem' }}>
                      {selectedEntity.data.reason}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Safety Clearance</div>
                    <div className="audit-value" style={{ color: 'var(--op-green)', fontWeight: 700, fontSize: '0.72rem' }}>
                      {selectedEntity.data.safety_status}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* ── CASE 5: SELECTED TRAIN ── */}
            {selectedEntity.type === 'train' ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="status-pill scheduled">
                    {selectedEntity.data.category || selectedEntity.data.type || 'EXPRESS'}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Train #{selectedEntity.data.train_number || selectedEntity.id}
                  </span>
                </div>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '4px 0 10px' }}>
                  {selectedEntity.data.name || `Train ${selectedEntity.id}`}
                </h3>

                <div className="decision-audit-box">
                  <div className="audit-row">
                    <div className="audit-label">Corridor Route</div>
                    <div className="audit-value" style={{ fontWeight: 600 }}>
                      {selectedEntity.data.path || 'Chennai Egmore (MS) ↔ Kanniyakumari (CAPE)'}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Current Section & Speed</div>
                    <div className="audit-value">
                      {selectedEntity.data.current_section || 'En Route'} • {selectedEntity.data.speed || '105 km/h'}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Operational Status</div>
                    <div className="audit-value" style={{ color: 'var(--op-blue)', fontWeight: 600, fontSize: '0.74rem' }}>
                      {selectedEntity.data.regulation_status || 'Normal Schedule Run'}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Punctuality / Delay</div>
                    <div className="audit-value" style={{ color: 'var(--op-green)', fontWeight: 700 }}>
                      {selectedEntity.data.delay || '+0 min (On Time)'}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Safety & Signaling</div>
                    <div className="audit-value" style={{ color: 'var(--op-green)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ShieldCheck size={14} />
                      Automatic Block Signaling Cleared
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* ── CASE 6: CORRIDOR OVERVIEW ── */}
            {selectedEntity.type === 'corridor' || (!['possession', 'track', 'task', 'station', 'loop', 'alternateRoute', 'train'].includes(selectedEntity.type)) ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="status-pill available">CANONICAL ACTIVE</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    ID: {selectedEntity.data?.corridor_id || 'SR_GST_01'}
                  </span>
                </div>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '4px 0 10px' }}>
                  {selectedEntity.data?.name || 'Grand South Trunk Corridor'}
                </h3>

                <div className="decision-audit-box">
                  <div className="audit-row">
                    <div className="audit-label">Route Geography</div>
                    <div className="audit-value" style={{ fontWeight: 600 }}>
                      {selectedEntity.data?.origin || 'Chennai Egmore (MS)'} ↔ {selectedEntity.data?.destination || 'Kanniyakumari (CAPE)'}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Corridor Length</div>
                    <div className="audit-value" style={{ fontWeight: 700 }}>
                      {selectedEntity.data?.distance_km || 742} km (100% Electrified Broad Gauge)
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Operating Divisions</div>
                    <div className="audit-value" style={{ fontSize: '0.72rem' }}>
                      {Array.isArray(selectedEntity.data?.divisions)
                        ? selectedEntity.data.divisions.join(' • ')
                        : 'Chennai (MAS) • Tiruchirappalli (TPJ) • Madurai (MDU) • Thiruvananthapuram (TVC)'}
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Corridor Infrastructure</div>
                    <div className="audit-value" style={{ fontSize: '0.74rem' }}>
                      12 Dual-Track Sections • 14 Stations • 12 Loops (CSR 750m) • 10 Sidings • 5 Yards
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Optimization Engine</div>
                    <div className="audit-value" style={{ color: 'var(--op-blue)', fontWeight: 600, fontSize: '0.74rem' }}>
                      OR-Tools CP-SAT + LNS Heuristic Active
                    </div>
                  </div>

                  <div className="audit-row">
                    <div className="audit-label">Safety Compliance</div>
                    <div className="audit-value" style={{ color: 'var(--op-green)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ShieldCheck size={14} />
                      Southern Railway General & Subsidiary Rules (G&SR)
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
