"""
CARB-Planner — Conflict Detection Engine
Detects time-space conflicts between train movements and maintenance possessions.

Conflict Types:
  1. TRACK — Two trains on same single-line section simultaneously
  2. STATION — Multiple arrivals/departures exceeding platform capacity
  3. LOOP — Multiple trains requesting same loop simultaneously
  4. POSSESSION — Maintenance block overlapping train movement
  5. HEADWAY — Train following too closely behind another (< minimum headway)

NOTE: This is a PROTOTYPE conflict engine for decision-support research.
It uses simplified constraints, not Indian Railways' official operating rules.
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, Field

from backend.models.train import (
    DataMode,
    TimeSpaceOccupancy,
    TrainDirection,
    TrainService,
)


# ── Enums ──────────────────────────────────────────────────────────────────────

class ConflictType(str, Enum):
    TRACK = "TRACK"
    STATION = "STATION"
    LOOP = "LOOP"
    POSSESSION = "POSSESSION"
    HEADWAY = "HEADWAY"


class ConflictSeverity(str, Enum):
    CRITICAL = "CRITICAL"   # Safety-critical — must be resolved
    HIGH = "HIGH"           # Operational — should be resolved
    MEDIUM = "MEDIUM"       # Advisory — can be mitigated
    LOW = "LOW"             # Informational


class ResolutionType(str, Enum):
    HOLD_IN_LOOP = "HOLD_IN_LOOP"
    DELAY_TRAIN = "DELAY_TRAIN"
    REROUTE = "REROUTE"
    RESCHEDULE_POSSESSION = "RESCHEDULE_POSSESSION"
    SPLIT_POSSESSION = "SPLIT_POSSESSION"
    CANCEL_TRAIN = "CANCEL_TRAIN"
    NO_ACTION = "NO_ACTION"


# ── Conflict Models ───────────────────────────────────────────────────────────

class ConflictResolution(BaseModel):
    """A proposed resolution for a conflict."""
    resolution_type: ResolutionType
    description: str = ""
    affected_train_id: Optional[str] = None
    delay_minutes: int = 0
    loop_id: Optional[str] = None
    feasible: bool = True
    cost_estimate: float = 0.0  # Abstract cost for optimizer


class Conflict(BaseModel):
    """A single detected conflict."""
    conflict_id: str
    conflict_type: ConflictType
    severity: ConflictSeverity
    section_id: str = ""
    station_id: str = ""

    # Time window
    start_min: int = 0
    end_min: int = 0

    # Affected entities
    train_ids: List[str] = Field(default_factory=list)
    train_numbers: List[str] = Field(default_factory=list)
    task_id: Optional[str] = None

    # Description
    description: str = ""
    detail: str = ""

    # Resolutions
    resolutions: List[ConflictResolution] = Field(default_factory=list)
    resolved: bool = False
    chosen_resolution: Optional[ResolutionType] = None


class ConflictReport(BaseModel):
    """Complete conflict analysis report."""
    total_conflicts: int = 0
    critical_conflicts: int = 0
    high_conflicts: int = 0
    medium_conflicts: int = 0
    low_conflicts: int = 0
    conflicts: List[Conflict] = Field(default_factory=list)

    # Summary
    affected_trains: int = 0
    affected_sections: int = 0
    total_delay_minutes: int = 0

    def compute_stats(self):
        self.total_conflicts = len(self.conflicts)
        self.critical_conflicts = sum(1 for c in self.conflicts if c.severity == ConflictSeverity.CRITICAL)
        self.high_conflicts = sum(1 for c in self.conflicts if c.severity == ConflictSeverity.HIGH)
        self.medium_conflicts = sum(1 for c in self.conflicts if c.severity == ConflictSeverity.MEDIUM)
        self.low_conflicts = sum(1 for c in self.conflicts if c.severity == ConflictSeverity.LOW)

        train_set: Set[str] = set()
        section_set: Set[str] = set()
        for c in self.conflicts:
            train_set.update(c.train_ids)
            if c.section_id:
                section_set.add(c.section_id)
        self.affected_trains = len(train_set)
        self.affected_sections = len(section_set)


# ── Section Metadata ──────────────────────────────────────────────────────────

# Section track count (1 = single line, 2 = double line)
SECTION_TRACKS: Dict[str, int] = {
    "S01": 2,   # MS-CGL: Double/Quad
    "S02": 2,   # CGL-VM: Double
    "S03": 2,   # VM-VRI: Double
    "S04": 1,   # VRI-ALU: Single line (BOTTLENECK)
    "S05": 2,   # ALU-TPJ: Double
    "S06": 2,   # TPJ-DG: Double
    "S07": 2,   # DG-MDU: Double
    "S08": 2,   # MDU-VPT: Double
    "S09": 2,   # VPT-CVP: Double
    "S10": 2,   # CVP-TEN: Double
    "S11": 1,   # TEN-NCJ: Mixed Single/Double (BOTTLENECK)
    "S12": 2,   # NCJ-CAPE: Double
}

# Station platform capacities
STATION_PLATFORMS: Dict[str, int] = {
    "STN_A": 11,   # MS
    "STN_TBM": 8,  # TBM
    "STN_B": 8,    # CGL
    "STN_C": 6,    # VM
    "STN_D": 5,    # VRI
    "STN_E": 3,    # ALU
    "STN_F": 8,    # TPJ
    "STN_H": 5,    # DG
    "STN_I": 8,    # MDU
    "STN_J": 4,    # VPT
    "STN_K": 3,    # CVP
    "STN_L": 5,    # TEN
    "STN_M": 6,    # NCJ
    "STN_N": 4,    # CAPE
}

# Minimum headway (minutes) between consecutive trains on same section
MIN_HEADWAY_DOUBLE = 5    # Double line
MIN_HEADWAY_SINGLE = 15   # Single line


# ── Conflict Detection Engine ─────────────────────────────────────────────────

class ConflictEngine:
    """Detects time-space conflicts on the corridor.

    NOTE: This is a simplified conflict engine for demonstration purposes.
    Real railway conflict detection uses much more complex rules including
    block section signaling, aspect sequences, route locking, and overlap
    calculations.
    """

    def __init__(self):
        self._conflict_counter = 0

    def _next_id(self) -> str:
        self._conflict_counter += 1
        return f"CONF-{self._conflict_counter:04d}"

    def _time_overlap(self, s1: int, e1: int, s2: int, e2: int) -> bool:
        """Check if two time windows overlap, handling overnight wraparound."""
        # Normalize for overnight comparison
        if e1 < s1:
            e1 += 1440
        if e2 < s2:
            e2 += 1440

        return s1 < e2 and s2 < e1

    def detect_all_conflicts(
        self,
        services: List[TrainService],
        maintenance_blocks: Optional[List[dict]] = None,
    ) -> ConflictReport:
        """Run all conflict detection checks and produce a report.

        Args:
            services: List of train services with computed occupancy
            maintenance_blocks: Optional list of maintenance task dicts with
                               keys: task_id, section_id, start_min, end_min, dept
        """
        self._conflict_counter = 0
        conflicts: List[Conflict] = []

        # 1. Track conflicts (single-line sections)
        conflicts.extend(self._detect_track_conflicts(services))

        # 2. Headway conflicts
        conflicts.extend(self._detect_headway_conflicts(services))

        # 3. Station capacity conflicts
        conflicts.extend(self._detect_station_conflicts(services))

        # 4. Possession conflicts (maintenance vs train)
        if maintenance_blocks:
            conflicts.extend(self._detect_possession_conflicts(services, maintenance_blocks))

        report = ConflictReport(conflicts=conflicts)
        report.compute_stats()
        return report

    def _detect_track_conflicts(self, services: List[TrainService]) -> List[Conflict]:
        """Detect opposing-direction trains on single-line sections."""
        conflicts: List[Conflict] = []

        # Group occupancies by section
        section_occ: Dict[str, List[Tuple[TrainService, TimeSpaceOccupancy]]] = {}
        for svc in services:
            for occ in svc.occupancy:
                section_occ.setdefault(occ.section_id, []).append((svc, occ))

        # Check single-line sections for opposing movements
        for section_id, occ_list in section_occ.items():
            tracks = SECTION_TRACKS.get(section_id, 2)
            if tracks >= 2:
                continue  # Double line — opposing directions use separate tracks

            # Single line — check all pairs
            for i in range(len(occ_list)):
                svc_a, occ_a = occ_list[i]
                for j in range(i + 1, len(occ_list)):
                    svc_b, occ_b = occ_list[j]

                    if svc_a.direction == svc_b.direction:
                        continue  # Same direction — not a track conflict

                    if self._time_overlap(occ_a.entry_time_min, occ_a.exit_time_min,
                                          occ_b.entry_time_min, occ_b.exit_time_min):
                        conf = Conflict(
                            conflict_id=self._next_id(),
                            conflict_type=ConflictType.TRACK,
                            severity=ConflictSeverity.CRITICAL,
                            section_id=section_id,
                            start_min=max(occ_a.entry_time_min, occ_b.entry_time_min),
                            end_min=min(occ_a.exit_time_min, occ_b.exit_time_min),
                            train_ids=[svc_a.train_id, svc_b.train_id],
                            train_numbers=[svc_a.train_number, svc_b.train_number],
                            description=f"Single-line track conflict on {section_id}",
                            detail=(
                                f"{svc_a.train_number} {svc_a.train_name} ({svc_a.direction.value}) "
                                f"vs {svc_b.train_number} {svc_b.train_name} ({svc_b.direction.value}) "
                                f"on single-line section {section_id}"
                            ),
                            resolutions=[
                                ConflictResolution(
                                    resolution_type=ResolutionType.HOLD_IN_LOOP,
                                    description=f"Hold {svc_b.train_number} in crossing loop",
                                    affected_train_id=svc_b.train_id,
                                    feasible=True,
                                ),
                                ConflictResolution(
                                    resolution_type=ResolutionType.DELAY_TRAIN,
                                    description=f"Delay {svc_b.train_number} by 15 min",
                                    affected_train_id=svc_b.train_id,
                                    delay_minutes=15,
                                    feasible=True,
                                ),
                            ],
                        )
                        conflicts.append(conf)

        return conflicts

    def _detect_headway_conflicts(self, services: List[TrainService]) -> List[Conflict]:
        """Detect trains following too closely on same section/direction."""
        conflicts: List[Conflict] = []

        # Group by (section, direction)
        grouped: Dict[Tuple[str, str], List[Tuple[TrainService, TimeSpaceOccupancy]]] = {}
        for svc in services:
            for occ in svc.occupancy:
                key = (occ.section_id, svc.direction.value)
                grouped.setdefault(key, []).append((svc, occ))

        for (section_id, direction), occ_list in grouped.items():
            tracks = SECTION_TRACKS.get(section_id, 2)
            min_headway = MIN_HEADWAY_SINGLE if tracks == 1 else MIN_HEADWAY_DOUBLE

            # Sort by entry time
            sorted_occ = sorted(occ_list, key=lambda x: x[1].entry_time_min)

            for i in range(len(sorted_occ) - 1):
                svc_a, occ_a = sorted_occ[i]
                svc_b, occ_b = sorted_occ[i + 1]

                gap = occ_b.entry_time_min - occ_a.exit_time_min
                if gap < 0:
                    gap += 1440  # overnight wrap

                if gap < min_headway and gap >= 0:
                    conflicts.append(Conflict(
                        conflict_id=self._next_id(),
                        conflict_type=ConflictType.HEADWAY,
                        severity=ConflictSeverity.MEDIUM,
                        section_id=section_id,
                        start_min=occ_a.exit_time_min,
                        end_min=occ_b.entry_time_min,
                        train_ids=[svc_a.train_id, svc_b.train_id],
                        train_numbers=[svc_a.train_number, svc_b.train_number],
                        description=f"Headway violation on {section_id} ({direction})",
                        detail=(
                            f"Only {gap} min gap between {svc_a.train_number} exit and "
                            f"{svc_b.train_number} entry (minimum: {min_headway} min)"
                        ),
                    ))

        return conflicts

    def _detect_station_conflicts(self, services: List[TrainService]) -> List[Conflict]:
        """Detect multiple trains at a station exceeding platform capacity."""
        conflicts: List[Conflict] = []

        # Build station occupancy windows
        station_windows: Dict[str, List[Tuple[TrainService, int, int]]] = {}
        for svc in services:
            for mvt in svc.movements:
                arr = mvt.scheduled_arrival
                dep = mvt.scheduled_departure
                if arr is None and dep is None:
                    continue

                start = arr if arr is not None else dep
                end = dep if dep is not None else arr
                if start is None or end is None:
                    continue

                # Origin/terminal has only one time
                if start == end:
                    end = start + max(mvt.halt_minutes, 5)

                station_windows.setdefault(mvt.station_id, []).append((svc, start, end))

        # Check each station for capacity exceedance
        for station_id, windows in station_windows.items():
            capacity = STATION_PLATFORMS.get(station_id, 99)

            # Check each 5-minute slot
            for slot_start in range(0, 1440, 5):
                slot_end = slot_start + 5
                occupants = [
                    (svc, s, e)
                    for svc, s, e in windows
                    if self._time_overlap(s, e, slot_start, slot_end)
                ]

                if len(occupants) > capacity:
                    train_ids = list(set(svc.train_id for svc, _, _ in occupants))
                    train_nums = list(set(svc.train_number for svc, _, _ in occupants))
                    conflicts.append(Conflict(
                        conflict_id=self._next_id(),
                        conflict_type=ConflictType.STATION,
                        severity=ConflictSeverity.HIGH,
                        station_id=station_id,
                        start_min=slot_start,
                        end_min=slot_end,
                        train_ids=train_ids,
                        train_numbers=train_nums,
                        description=f"Station capacity exceeded at {station_id}",
                        detail=(
                            f"{len(occupants)} trains at station with {capacity} platforms "
                            f"at {slot_start // 60:02d}:{slot_start % 60:02d}"
                        ),
                    ))

        return conflicts

    def _detect_possession_conflicts(
        self,
        services: List[TrainService],
        maintenance_blocks: List[dict],
    ) -> List[Conflict]:
        """Detect maintenance possessions conflicting with train movements."""
        conflicts: List[Conflict] = []

        for block in maintenance_blocks:
            block_section = block.get("section_id", "")
            block_start = block.get("start_min", 0)
            block_end = block.get("end_min", 0)
            task_id = block.get("task_id", "")
            dept = block.get("dept", "")

            # Find all trains occupying this section during the block
            affected = []
            for svc in services:
                for occ in svc.occupancy:
                    if occ.section_id != block_section:
                        continue
                    if self._time_overlap(occ.entry_time_min, occ.exit_time_min,
                                          block_start, block_end):
                        affected.append(svc)
                        break

            if affected:
                severity = ConflictSeverity.CRITICAL if len(affected) >= 3 else ConflictSeverity.HIGH
                conflicts.append(Conflict(
                    conflict_id=self._next_id(),
                    conflict_type=ConflictType.POSSESSION,
                    severity=severity,
                    section_id=block_section,
                    start_min=block_start,
                    end_min=block_end,
                    task_id=task_id,
                    train_ids=[s.train_id for s in affected],
                    train_numbers=[s.train_number for s in affected],
                    description=f"Maintenance block {task_id} conflicts with {len(affected)} train(s)",
                    detail=(
                        f"{dept} maintenance on {block_section} "
                        f"({block_start // 60:02d}:{block_start % 60:02d} – "
                        f"{block_end // 60:02d}:{block_end % 60:02d}) "
                        f"affects: {', '.join(s.train_number for s in affected)}"
                    ),
                    resolutions=[
                        ConflictResolution(
                            resolution_type=ResolutionType.HOLD_IN_LOOP,
                            description="Hold affected trains in crossing loops",
                            feasible=True,
                        ),
                        ConflictResolution(
                            resolution_type=ResolutionType.RESCHEDULE_POSSESSION,
                            description="Reschedule possession to night shadow window",
                            feasible=True,
                        ),
                    ],
                ))

        return conflicts

    def detect_possession_conflicts_for_task(
        self,
        services: List[TrainService],
        task_id: str,
        section_id: str,
        start_min: int,
        end_min: int,
        dept: str = "",
    ) -> List[Conflict]:
        """Detect conflicts for a single maintenance task."""
        return self._detect_possession_conflicts(
            services,
            [{"task_id": task_id, "section_id": section_id,
              "start_min": start_min, "end_min": end_min, "dept": dept}],
        )
