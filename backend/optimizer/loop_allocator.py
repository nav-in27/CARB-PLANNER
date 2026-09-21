"""
CARB-Planner — Loop Allocation Engine
Allocates crossing loops to trains affected by maintenance possessions
or opposing-direction conflicts on single-line sections.

Implements the 10-point loop feasibility checklist:
  1. Physical connection exists
  2. Loop is operationally available (not under maintenance)
  3. Loop length accommodates train consist
  4. No other train currently occupying loop
  5. Entry/exit time is compatible with block window
  6. Signal interlocking permits movement
  7. Speed restriction allows safe entry
  8. No conflicting shunting operations
  9. Sufficient margin before next train
  10. Loop line track condition is adequate

NOTE: This is a simplified prototype. Real loop allocation uses interlocking
tables, aspect sequencing, and overlap calculations.
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, Field

from backend.models.train import TrainService, TimeSpaceOccupancy


# ── Enums ──────────────────────────────────────────────────────────────────────

class LoopStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    OCCUPIED = "OCCUPIED"
    RESERVED = "RESERVED"
    MAINTENANCE = "MAINTENANCE"
    UNAVAILABLE = "UNAVAILABLE"


class AllocationResult(str, Enum):
    ALLOCATED = "ALLOCATED"
    REJECTED_NO_CAPACITY = "REJECTED_NO_CAPACITY"
    REJECTED_LENGTH = "REJECTED_LENGTH"
    REJECTED_TIME = "REJECTED_TIME"
    REJECTED_MAINTENANCE = "REJECTED_MAINTENANCE"
    REJECTED_OCCUPIED = "REJECTED_OCCUPIED"


# ── Models ─────────────────────────────────────────────────────────────────────

class LoopDefinition(BaseModel):
    """Physical loop line specification."""
    loop_id: str
    station_id: str
    station_code: str
    station_name: str
    section_id: str  # The section this loop serves
    length_m: int = Field(750, description="Effective loop length in meters")
    max_train_length_m: int = Field(700, description="Max train length accommodated")
    can_accommodate_freight: bool = True
    has_water_column: bool = False
    electrified: bool = True
    status: LoopStatus = LoopStatus.AVAILABLE


class LoopReservation(BaseModel):
    """A time-bounded reservation of a loop for a specific train."""
    reservation_id: str
    loop_id: str
    train_id: str
    train_number: str = ""
    entry_time_min: int
    exit_time_min: int
    reason: str = ""
    status: LoopStatus = LoopStatus.RESERVED
    feasibility_score: float = 1.0  # 0.0 = rejected, 1.0 = fully feasible


class FeasibilityCheck(BaseModel):
    """Result of the 10-point loop feasibility checklist."""
    check_id: int
    check_name: str
    passed: bool = True
    detail: str = ""


class LoopAllocationDecision(BaseModel):
    """Complete allocation decision for one train-loop pair."""
    train_id: str
    train_number: str = ""
    loop_id: str
    station_code: str = ""
    result: AllocationResult = AllocationResult.ALLOCATED
    feasibility_checks: List[FeasibilityCheck] = Field(default_factory=list)
    passed_checks: int = 0
    total_checks: int = 10
    reservation: Optional[LoopReservation] = None
    rejection_reason: str = ""


class LoopUtilizationReport(BaseModel):
    """Aggregate loop utilization metrics."""
    total_loops: int = 0
    loops_used: int = 0
    total_reservations: int = 0
    total_rejections: int = 0
    utilization_pct: float = 0.0
    decisions: List[LoopAllocationDecision] = Field(default_factory=list)
    reservations: List[LoopReservation] = Field(default_factory=list)

    # Per-loop utilization
    loop_utilization: Dict[str, float] = Field(default_factory=dict)
    loop_reservation_count: Dict[str, int] = Field(default_factory=dict)


# ── Loop Infrastructure ───────────────────────────────────────────────────────

# Loops available on the corridor, keyed by station code
CORRIDOR_LOOPS: List[LoopDefinition] = [
    LoopDefinition(
        loop_id="LOOP_MS_1", station_id="STN_A", station_code="MS",
        station_name="Chennai Egmore", section_id="S01",
        length_m=850, max_train_length_m=800,
    ),
    LoopDefinition(
        loop_id="LOOP_TBM_1", station_id="STN_TBM", station_code="TBM",
        station_name="Tambaram", section_id="S01",
        length_m=750, max_train_length_m=700,
    ),
    LoopDefinition(
        loop_id="LOOP_CGL_1", station_id="STN_B", station_code="CGL",
        station_name="Chengalpattu Jn", section_id="S02",
        length_m=750, max_train_length_m=700,
    ),
    LoopDefinition(
        loop_id="LOOP_VM_1", station_id="STN_C", station_code="VM",
        station_name="Villupuram Jn", section_id="S03",
        length_m=820, max_train_length_m=770,
    ),
    LoopDefinition(
        loop_id="LOOP_VRI_1", station_id="STN_D", station_code="VRI",
        station_name="Vriddhachalam Jn", section_id="S04",
        length_m=720, max_train_length_m=670,
    ),
    LoopDefinition(
        loop_id="LOOP_ALU_1", station_id="STN_E", station_code="ALU",
        station_name="Ariyalur", section_id="S04",
        length_m=700, max_train_length_m=650,
        can_accommodate_freight=True,
    ),
    LoopDefinition(
        loop_id="LOOP_TPJ_1", station_id="STN_F", station_code="TPJ",
        station_name="Tiruchirappalli Jn (Golden Rock)", section_id="S06",
        length_m=850, max_train_length_m=800,
    ),
    LoopDefinition(
        loop_id="LOOP_DG_1", station_id="STN_H", station_code="DG",
        station_name="Dindigul Jn", section_id="S07",
        length_m=750, max_train_length_m=700,
    ),
    LoopDefinition(
        loop_id="LOOP_MDU_1", station_id="STN_I", station_code="MDU",
        station_name="Madurai Jn", section_id="S08",
        length_m=800, max_train_length_m=750,
    ),
    LoopDefinition(
        loop_id="LOOP_VPT_1", station_id="STN_J", station_code="VPT",
        station_name="Virudhunagar Jn", section_id="S09",
        length_m=720, max_train_length_m=670,
    ),
    LoopDefinition(
        loop_id="LOOP_CVP_1", station_id="STN_K", station_code="CVP",
        station_name="Kovilpatti", section_id="S10",
        length_m=750, max_train_length_m=700,
    ),
    LoopDefinition(
        loop_id="LOOP_TEN_1", station_id="STN_L", station_code="TEN",
        station_name="Tirunelveli Jn", section_id="S11",
        length_m=800, max_train_length_m=750,
    ),
    LoopDefinition(
        loop_id="LOOP_NCJ_1", station_id="STN_M", station_code="NCJ",
        station_name="Nagercoil Jn", section_id="S12",
        length_m=750, max_train_length_m=700,
    ),
]


# ── Loop Allocator ─────────────────────────────────────────────────────────────

class LoopAllocator:
    """Allocates crossing loops to trains based on the 10-point feasibility checklist."""

    def __init__(self, loops: Optional[List[LoopDefinition]] = None):
        self.loops = loops or CORRIDOR_LOOPS
        self.reservations: List[LoopReservation] = []
        self.decisions: List[LoopAllocationDecision] = []
        self._reservation_counter = 0

    def _next_res_id(self) -> str:
        self._reservation_counter += 1
        return f"LRES-{self._reservation_counter:04d}"

    def _is_loop_available(self, loop_id: str, entry: int, exit_time: int) -> bool:
        """Check if loop has no overlapping reservations."""
        for res in self.reservations:
            if res.loop_id != loop_id:
                continue
            # Check overlap
            if entry < res.exit_time_min and exit_time > res.entry_time_min:
                return False
        return True

    def _run_feasibility_checks(
        self,
        loop: LoopDefinition,
        train: TrainService,
        entry_min: int,
        exit_min: int,
        is_freight: bool = False,
    ) -> List[FeasibilityCheck]:
        """Run the 10-point feasibility checklist."""
        checks = []

        # 1. Physical connection
        checks.append(FeasibilityCheck(
            check_id=1,
            check_name="Physical connection exists",
            passed=True,
            detail=f"Loop {loop.loop_id} at {loop.station_code} is physically connected",
        ))

        # 2. Operationally available
        available = loop.status == LoopStatus.AVAILABLE
        checks.append(FeasibilityCheck(
            check_id=2,
            check_name="Loop operationally available",
            passed=available,
            detail=f"Loop status: {loop.status.value}",
        ))

        # 3. Length accommodation
        # Simplified: freight needs > 650m, passenger > 500m
        min_length = 650 if is_freight else 500
        length_ok = loop.max_train_length_m >= min_length
        checks.append(FeasibilityCheck(
            check_id=3,
            check_name="Loop length accommodates consist",
            passed=length_ok,
            detail=f"Loop: {loop.max_train_length_m}m, Required: {min_length}m",
        ))

        # 4. No current occupant
        not_occupied = self._is_loop_available(loop.loop_id, entry_min, exit_min)
        checks.append(FeasibilityCheck(
            check_id=4,
            check_name="No conflicting occupation",
            passed=not_occupied,
            detail="Loop is free" if not_occupied else "Loop already reserved",
        ))

        # 5. Time compatibility
        time_ok = exit_min > entry_min and (exit_min - entry_min) <= 120
        checks.append(FeasibilityCheck(
            check_id=5,
            check_name="Entry/exit time compatible",
            passed=time_ok,
            detail=f"Hold duration: {exit_min - entry_min} min",
        ))

        # 6. Signal interlocking
        checks.append(FeasibilityCheck(
            check_id=6,
            check_name="Signal interlocking permits movement",
            passed=True,
            detail="Simplified — interlocking assumed compatible",
        ))

        # 7. Speed restriction
        checks.append(FeasibilityCheck(
            check_id=7,
            check_name="Speed restriction allows safe entry",
            passed=True,
            detail="15 km/h turnout speed assumed acceptable",
        ))

        # 8. No conflicting shunting
        checks.append(FeasibilityCheck(
            check_id=8,
            check_name="No conflicting shunting operations",
            passed=True,
            detail="No shunting scheduled (simplified)",
        ))

        # 9. Sufficient margin
        margin_ok = True
        for res in self.reservations:
            if res.loop_id == loop.loop_id:
                gap = abs(entry_min - res.exit_time_min)
                if gap < 5:
                    margin_ok = False
                    break
        checks.append(FeasibilityCheck(
            check_id=9,
            check_name="Sufficient margin before next train",
            passed=margin_ok,
            detail="5-min minimum margin" + (" met" if margin_ok else " NOT met"),
        ))

        # 10. Track condition
        checks.append(FeasibilityCheck(
            check_id=10,
            check_name="Loop track condition adequate",
            passed=True,
            detail="Track condition assumed adequate (simplified)",
        ))

        return checks

    def allocate(
        self,
        train: TrainService,
        section_id: str,
        hold_start_min: int,
        hold_end_min: int,
        reason: str = "",
    ) -> LoopAllocationDecision:
        """Try to allocate a loop for a train on a given section.

        Finds the best available loop near the section, runs feasibility
        checks, and creates a reservation if feasible.
        """
        is_freight = train.category.value == "Freight"

        # Find candidate loops for this section
        candidates = [
            loop for loop in self.loops
            if loop.section_id == section_id or
               any(loop.section_id == occ.section_id for occ in train.occupancy)
        ]

        # Also consider loops at adjacent stations
        if not candidates:
            candidates = self.loops  # Fallback to all loops

        best_decision: Optional[LoopAllocationDecision] = None

        for loop in candidates:
            checks = self._run_feasibility_checks(
                loop, train, hold_start_min, hold_end_min, is_freight
            )
            passed = sum(1 for c in checks if c.passed)

            if passed == len(checks):
                # All checks passed — allocate
                res = LoopReservation(
                    reservation_id=self._next_res_id(),
                    loop_id=loop.loop_id,
                    train_id=train.train_id,
                    train_number=train.train_number,
                    entry_time_min=hold_start_min,
                    exit_time_min=hold_end_min,
                    reason=reason,
                    feasibility_score=passed / len(checks),
                )
                self.reservations.append(res)

                decision = LoopAllocationDecision(
                    train_id=train.train_id,
                    train_number=train.train_number,
                    loop_id=loop.loop_id,
                    station_code=loop.station_code,
                    result=AllocationResult.ALLOCATED,
                    feasibility_checks=checks,
                    passed_checks=passed,
                    reservation=res,
                )
                self.decisions.append(decision)
                return decision

            # Track best partial match
            if best_decision is None or passed > best_decision.passed_checks:
                # Determine rejection reason from first failing check
                first_fail = next((c for c in checks if not c.passed), None)
                reject_reason = first_fail.check_name if first_fail else "Unknown"

                result_type = AllocationResult.REJECTED_NO_CAPACITY
                if first_fail and first_fail.check_id == 3:
                    result_type = AllocationResult.REJECTED_LENGTH
                elif first_fail and first_fail.check_id == 4:
                    result_type = AllocationResult.REJECTED_OCCUPIED
                elif first_fail and first_fail.check_id == 2:
                    result_type = AllocationResult.REJECTED_MAINTENANCE

                best_decision = LoopAllocationDecision(
                    train_id=train.train_id,
                    train_number=train.train_number,
                    loop_id=loop.loop_id,
                    station_code=loop.station_code,
                    result=result_type,
                    feasibility_checks=checks,
                    passed_checks=passed,
                    rejection_reason=reject_reason,
                )

        # No loop could be allocated
        if best_decision is None:
            best_decision = LoopAllocationDecision(
                train_id=train.train_id,
                train_number=train.train_number,
                loop_id="NONE",
                result=AllocationResult.REJECTED_NO_CAPACITY,
                rejection_reason="No candidate loops found for section",
            )

        self.decisions.append(best_decision)
        return best_decision

    def generate_utilization_report(self) -> LoopUtilizationReport:
        """Generate a summary of loop utilization across the corridor."""
        report = LoopUtilizationReport(
            total_loops=len(self.loops),
            total_reservations=len(self.reservations),
            decisions=self.decisions,
            reservations=self.reservations,
        )

        # Count used loops
        used_loops: Set[str] = set()
        loop_time: Dict[str, int] = {}
        loop_count: Dict[str, int] = {}

        for res in self.reservations:
            used_loops.add(res.loop_id)
            duration = max(0, res.exit_time_min - res.entry_time_min)
            loop_time[res.loop_id] = loop_time.get(res.loop_id, 0) + duration
            loop_count[res.loop_id] = loop_count.get(res.loop_id, 0) + 1

        report.loops_used = len(used_loops)
        report.total_rejections = sum(
            1 for d in self.decisions
            if d.result != AllocationResult.ALLOCATED
        )

        # Per-loop utilization (as % of 24h)
        for loop in self.loops:
            total_time = loop_time.get(loop.loop_id, 0)
            report.loop_utilization[loop.loop_id] = round(total_time / 1440 * 100, 1)
            report.loop_reservation_count[loop.loop_id] = loop_count.get(loop.loop_id, 0)

        if report.total_loops > 0:
            report.utilization_pct = round(
                sum(report.loop_utilization.values()) / report.total_loops, 1
            )

        return report
