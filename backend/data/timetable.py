"""
CARB-Planner — Verified Public Timetable Database
Southern Railway Chennai Egmore (MS) → Kanniyakumari (CAPE) Corridor

Data Sources:
  - eRail.in (public timetable aggregator)
  - ConfirmTkt.com (public timetable)
  - RailYatri.in (public timetable)
  - Wikipedia (train articles with schedules)

Data Mode: PUBLIC_TIMETABLE for verified real trains
           SIMULATION for freight and MEMU services

Retrieved: 2026-09-18
Coverage:  Daily services on MS-CAPE corridor (742 km)
Limitations: Timings from public aggregator sites, not official WTT.
             May differ from actual operational schedules by ±5 minutes.

NOTE: This is a PROTOTYPE demonstration timetable for decision-support
research. It is NOT connected to Indian Railways operational systems.
"""

from __future__ import annotations

from typing import List

from backend.models.train import (
    CorridorTimetable,
    DataMode,
    PriorityClass,
    TrainCategory,
    TrainDirection,
    TrainMovement,
    TrainService,
)

# ── Station ID Mapping (matches network model) ────────────────────────────────
# station_code → station_id (from backend/data/generator.py)
STN = {
    "MS": "STN_A",
    # Tambaram is an intermediate operating point inside the MS-CGL block
    # and is explicitly represented in the network for station-level views.
    "TBM": "STN_TBM",
    "CGL": "STN_B",
    "VM": "STN_C",
    "VRI": "STN_D",
    "ALU": "STN_E",
    "TPJ": "STN_F",
    "DG": "STN_H",
    "MDU": "STN_I",
    "VPT": "STN_J",
    "CVP": "STN_K",
    "TEN": "STN_L",
    "NCJ": "STN_M",
    "CAPE": "STN_N",
}

# ── Section ID Mapping (code-pair → section_id from network model) ────────────
SEC = {
    ("MS", "CGL"): "S01",
    ("CGL", "VM"): "S02",
    ("VM", "VRI"): "S03",
    ("VRI", "ALU"): "S04",
    ("ALU", "TPJ"): "S05",
    ("VM", "PDY"): "S06",
    ("TPJ", "DG"): "S13",
    ("DG", "MDU"): "S14",
    ("MDU", "VPT"): "S15",
    ("VPT", "CVP"): "S16",
    ("CVP", "TEN"): "S17",
    ("TEN", "NCJ"): "S18",
    ("NCJ", "CAPE"): "S19",
    ("CGL", "MS"): "S07",
    ("VM", "CGL"): "S08",
    ("VRI", "VM"): "S09",
    ("ALU", "VRI"): "S10",
    ("TPJ", "ALU"): "S11",
    ("PDY", "VM"): "S12",
    ("DG", "TPJ"): "S20",
    ("MDU", "DG"): "S21",
    ("VPT", "MDU"): "S22",
    ("CVP", "VPT"): "S23",
    ("TEN", "CVP"): "S24",
    ("NCJ", "TEN"): "S25",
    ("CAPE", "NCJ"): "S26",
}

DOWN_TO_UP_SECTION = {
    "S01": "S07",
    "S02": "S08",
    "S03": "S09",
    "S04": "S10",
    "S05": "S11",
    "S06": "S12",
    "S13": "S20",
    "S14": "S21",
    "S15": "S22",
    "S16": "S23",
    "S17": "S24",
    "S18": "S25",
    "S19": "S26",
}
UP_TO_DOWN_SECTION = {value: key for key, value in DOWN_TO_UP_SECTION.items()}


def _directional_section(section_id: str, direction: TrainDirection) -> str:
    if direction == TrainDirection.UP:
        return DOWN_TO_UP_SECTION.get(section_id, section_id)
    return UP_TO_DOWN_SECTION.get(section_id, section_id)


def _track_id(section_id: str) -> str | None:
    if not section_id:
        return None
    track_direction = "UP" if section_id in UP_TO_DOWN_SECTION else "DOWN"
    return f"TRK_{section_id}_{track_direction}"


def _sec(from_code: str, to_code: str) -> str:
    """Get the directional section ID from a station code pair."""
    return SEC.get((from_code, to_code), "")


def _mvt(seq: int, code: str, name: str, dist: float,
         arr: int | None, dep: int | None, halt: int = 0,
         sec_before: str = "", sec_after: str = "") -> TrainMovement:
    """Shorthand for creating a TrainMovement."""
    track_section = sec_after or sec_before
    return TrainMovement(
        station_id=STN.get(code, code),
        station_code=code,
        station_name=name,
        sequence=seq,
        distance_km=dist,
        scheduled_arrival=arr,
        scheduled_departure=dep,
        halt_minutes=halt,
        section_id_before=sec_before,
        section_id_after=sec_after,
        track_id=_track_id(track_section),
    )


CORRIDOR_METADATA = {
    "MS": {"id": "STN_A", "name": "Chennai Egmore", "km": 0.0},
    "TBM": {"id": "STN_TBM", "name": "Tambaram", "km": 25.0},
    "CGL": {"id": "STN_B", "name": "Chengalpattu Jn", "km": 56.0},
    "VM": {"id": "STN_C", "name": "Villupuram Jn", "km": 159.0},
    "VRI": {"id": "STN_D", "name": "Vriddhachalam Jn", "km": 214.0},
    "ALU": {"id": "STN_E", "name": "Ariyalur", "km": 268.0},
    "TPJ": {"id": "STN_F", "name": "Tiruchirappalli Jn", "km": 336.0},
    "DG": {"id": "STN_H", "name": "Dindigul Jn", "km": 430.0},
    "MDU": {"id": "STN_I", "name": "Madurai Jn", "km": 492.0},
    "VPT": {"id": "STN_J", "name": "Virudhunagar Jn", "km": 535.0},
    "CVP": {"id": "STN_K", "name": "Kovilpatti", "km": 584.0},
    "TEN": {"id": "STN_L", "name": "Tirunelveli Jn", "km": 650.0},
    "NCJ": {"id": "STN_M", "name": "Nagercoil Jn", "km": 723.0},
    "CAPE": {"id": "STN_N", "name": "Kanniyakumari", "km": 742.0},
    "PDY": {"id": "STN_G", "name": "Puducherry", "km": 197.0},
}

DOWN_CHAIN = ["MS", "TBM", "CGL", "VM", "VRI", "ALU", "TPJ", "DG", "MDU", "VPT", "CVP", "TEN", "NCJ", "CAPE"]
UP_CHAIN = list(reversed(DOWN_CHAIN))

DOWN_SECTIONS = {
    ("MS", "TBM"): "S01",
    ("TBM", "CGL"): "S01",
    ("CGL", "VM"): "S02",
    ("VM", "VRI"): "S03",
    ("VRI", "ALU"): "S04",
    ("ALU", "TPJ"): "S05",
    ("VM", "PDY"): "S06",
    ("TPJ", "DG"): "S13",
    ("DG", "MDU"): "S14",
    ("MDU", "VPT"): "S15",
    ("VPT", "CVP"): "S16",
    ("CVP", "TEN"): "S17",
    ("TEN", "NCJ"): "S18",
    ("NCJ", "CAPE"): "S19",
}

UP_SECTIONS = {
    ("CAPE", "NCJ"): "S26",
    ("NCJ", "TEN"): "S25",
    ("TEN", "CVP"): "S24",
    ("CVP", "VPT"): "S23",
    ("VPT", "MDU"): "S22",
    ("MDU", "DG"): "S21",
    ("DG", "TPJ"): "S20",
    ("TPJ", "ALU"): "S11",
    ("ALU", "VRI"): "S10",
    ("VRI", "VM"): "S09",
    ("VM", "CGL"): "S08",
    ("CGL", "TBM"): "S07",
    ("TBM", "MS"): "S07",
    ("PDY", "VM"): "S12",
}


def _normalize_service_route(service: TrainService) -> None:
    """Align timetable sections and track IDs with directional network edges."""
    for movement in service.movements:
        if movement.section_id_before:
            movement.section_id_before = _directional_section(movement.section_id_before, service.direction)
        if movement.section_id_after:
            movement.section_id_after = _directional_section(movement.section_id_after, service.direction)
        movement.track_id = _track_id(movement.section_id_after or movement.section_id_before)


def interpolate_service_movements(service: TrainService) -> None:
    """Ensure every train service has contiguous, gapless station movements
    across the entire traversed corridor segment, interpolating pass-through
    movements for non-stopping intermediate stations.
    """
    if len(service.movements) < 2:
        return

    is_down = service.direction == TrainDirection.DOWN
    chain = DOWN_CHAIN if is_down else UP_CHAIN
    sec_map = DOWN_SECTIONS if is_down else UP_SECTIONS

    new_movements: List[TrainMovement] = []

    for i in range(len(service.movements) - 1):
        m_curr = service.movements[i]
        m_next = service.movements[i + 1]
        new_movements.append(m_curr)

        c_curr = m_curr.station_code
        c_next = m_next.station_code

        if c_curr in chain and c_next in chain:
            idx_c = chain.index(c_curr)
            idx_n = chain.index(c_next)

            if idx_n > idx_c + 1:
                # Missing intermediate stations between c_curr and c_next
                inter_codes = chain[idx_c + 1 : idx_n]

                t_dep = m_curr.scheduled_departure if m_curr.scheduled_departure is not None else m_curr.scheduled_arrival
                t_arr = m_next.scheduled_arrival if m_next.scheduled_arrival is not None else m_next.scheduled_departure

                if t_dep is not None and t_arr is not None:
                    arr_adj = t_arr
                    if arr_adj < t_dep:
                        arr_adj += 1440
                    total_time = max(1, arr_adj - t_dep)

                    km_start = CORRIDOR_METADATA.get(c_curr, {}).get("km", m_curr.distance_km)
                    km_end = CORRIDOR_METADATA.get(c_next, {}).get("km", m_next.distance_km)
                    total_dist = max(1.0, abs(km_end - km_start))

                    prev_code = c_curr
                    for k, mid_code in enumerate(inter_codes):
                        km_mid = CORRIDOR_METADATA.get(mid_code, {}).get("km", km_start)
                        dist_from_start = abs(km_mid - km_start)
                        frac = dist_from_start / total_dist if total_dist > 0 else (k + 1) / (len(inter_codes) + 1)
                        inter_time = int(round(t_dep + frac * total_time)) % 1440

                        next_hop = inter_codes[k + 1] if k + 1 < len(inter_codes) else c_next
                        sec_before = sec_map.get((prev_code, mid_code), "")
                        sec_after = sec_map.get((mid_code, next_hop), "")

                        inter_mvt = TrainMovement(
                            station_id=CORRIDOR_METADATA[mid_code]["id"],
                            station_code=mid_code,
                            station_name=CORRIDOR_METADATA[mid_code]["name"],
                            sequence=0,
                            distance_km=km_mid,
                            scheduled_arrival=inter_time,
                            scheduled_departure=inter_time,
                            halt_minutes=0,
                            section_id_before=sec_before,
                            section_id_after=sec_after,
                            track_id=_track_id(sec_after or sec_before),
                            is_pass_through=True,
                            route_source="INTERPOLATED",
                            confidence=0.95,
                        )
                        new_movements.append(inter_mvt)
                        prev_code = mid_code

    new_movements.append(service.movements[-1])

    # Re-index sequence and verify sections
    for idx in range(len(new_movements)):
        m = new_movements[idx]
        m.sequence = idx
        prev_m = new_movements[idx - 1] if idx > 0 else None
        next_m = new_movements[idx + 1] if idx < len(new_movements) - 1 else None

        if prev_m:
            sec_b = sec_map.get((prev_m.station_code, m.station_code), m.section_id_before)
            if not sec_b:
                sec_b = SEC.get((prev_m.station_code, m.station_code), m.section_id_before)
            m.section_id_before = sec_b
        else:
            m.section_id_before = ""

        if next_m:
            sec_a = sec_map.get((m.station_code, next_m.station_code), m.section_id_after)
            if not sec_a:
                sec_a = SEC.get((m.station_code, next_m.station_code), m.section_id_after)
            m.section_id_after = sec_a
        else:
            m.section_id_after = ""

        track_sec = m.section_id_after or m.section_id_before
        m.track_id = _track_id(track_sec)

    service.movements = new_movements


# ═══════════════════════════════════════════════════════════════════════════════
# DOWN DIRECTION (MS → CAPE / MDU / TEN / NCJ)
# ═══════════════════════════════════════════════════════════════════════════════

def _train_20627_vande_bharat_down() -> TrainService:
    """20627 MS-NCJ Vande Bharat Express — Premium semi-high-speed service."""
    return TrainService(
        train_id="SVC_20627",
        train_number="20627",
        train_name="MS-NCJ Vande Bharat Express",
        category=TrainCategory.VANDE_BHARAT,
        priority_class=PriorityClass.P1_CRITICAL,
        source_station="MS", source_station_name="Chennai Egmore",
        destination_station="NCJ", destination_station_name="Nagercoil Jn",
        direction=TrainDirection.DOWN,
        total_distance_km=723,
        operating_days="Daily except Wednesday",
        delay_cost_per_min=5.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "MS", "Chennai Egmore", 0, None, 300, sec_after=_sec("MS", "CGL")),       # dep 05:00
            _mvt(1, "TBM", "Tambaram", 25, 318, 320, 2, _sec("MS", "CGL"), _sec("MS", "CGL")),  # 05:18/05:20
            _mvt(2, "CGL", "Chengalpattu Jn", 56, 340, None, 0, _sec("MS", "CGL"), ""),       # arr 05:40 (pass)
            _mvt(3, "VM", "Villupuram Jn", 159, 405, 410, 5, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 06:45/06:50
            _mvt(4, "TPJ", "Tiruchirappalli Jn", 336, 510, 515, 5, _sec("ALU", "TPJ"), _sec("TPJ", "DG")),  # 08:30/08:35
            _mvt(5, "DG", "Dindigul Jn", 430, 570, 572, 2, _sec("TPJ", "DG"), _sec("DG", "MDU")),  # 09:30/09:32
            _mvt(6, "MDU", "Madurai Jn", 492, 620, 625, 5, _sec("DG", "MDU"), _sec("MDU", "VPT")),  # 10:20/10:25
            _mvt(7, "CVP", "Kovilpatti", 584, 695, 697, 2, _sec("VPT", "CVP"), _sec("CVP", "TEN")),  # 11:35/11:37
            _mvt(8, "TEN", "Tirunelveli Jn", 650, 745, 750, 5, _sec("CVP", "TEN"), _sec("TEN", "NCJ")),  # 12:25/12:30
            _mvt(9, "NCJ", "Nagercoil Jn", 723, 830, None, 0, _sec("TEN", "NCJ"), ""),        # arr 13:50
        ],
    )


def _train_22671_tejas_down() -> TrainService:
    """22671 MS-MDU Tejas Express — Premium intercity service."""
    return TrainService(
        train_id="SVC_22671",
        train_number="22671",
        train_name="MS-MDU Tejas Express",
        category=TrainCategory.TEJAS,
        priority_class=PriorityClass.P1_CRITICAL,
        source_station="MS", source_station_name="Chennai Egmore",
        destination_station="MDU", destination_station_name="Madurai Jn",
        direction=TrainDirection.DOWN,
        total_distance_km=497,
        operating_days="6 days/week (except one maintenance day)",
        delay_cost_per_min=4.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "MS", "Chennai Egmore", 0, None, 360, sec_after=_sec("MS", "CGL")),    # dep 06:00
            _mvt(1, "TBM", "Tambaram", 25, 378, 380, 2, _sec("MS", "CGL"), _sec("MS", "CGL")),
            _mvt(2, "CGL", "Chengalpattu Jn", 56, 405, 407, 2, _sec("MS", "CGL"), _sec("CGL", "VM")),
            _mvt(3, "VM", "Villupuram Jn", 159, 480, 485, 5, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 08:00/08:05
            _mvt(4, "VRI", "Vriddhachalam Jn", 213, 525, 527, 2, _sec("VM", "VRI"), _sec("VRI", "ALU")),
            _mvt(5, "TPJ", "Tiruchirappalli Jn", 336, 600, 605, 5, _sec("ALU", "TPJ"), _sec("TPJ", "DG")),  # 10:00/10:05
            _mvt(6, "DG", "Dindigul Jn", 430, 660, 663, 3, _sec("TPJ", "DG"), _sec("DG", "MDU")),  # 11:00/11:03
            _mvt(7, "MDU", "Madurai Jn", 497, 735, None, 0, _sec("DG", "MDU"), ""),           # arr 12:15
        ],
    )


def _train_12635_vaigai_down() -> TrainService:
    """12635 Vaigai Superfast Express — Most popular daily Chennai-Madurai service."""
    return TrainService(
        train_id="SVC_12635",
        train_number="12635",
        train_name="Vaigai SF Express",
        category=TrainCategory.SUPERFAST,
        priority_class=PriorityClass.P2_HIGH,
        source_station="MS", source_station_name="Chennai Egmore",
        destination_station="MDU", destination_station_name="Madurai Jn",
        direction=TrainDirection.DOWN,
        total_distance_km=497,
        operating_days="Daily",
        delay_cost_per_min=3.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "MS", "Chennai Egmore", 0, None, 795, sec_after=_sec("MS", "CGL")),   # dep 13:15
            _mvt(1, "TBM", "Tambaram", 25, 820, 822, 2, _sec("MS", "CGL"), _sec("MS", "CGL")),  # 13:40/13:42
            _mvt(2, "CGL", "Chengalpattu Jn", 56, 848, 850, 2, _sec("MS", "CGL"), _sec("CGL", "VM")),  # 14:08/14:10
            _mvt(3, "VM", "Villupuram Jn", 159, 930, 935, 5, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 15:30/15:35
            _mvt(4, "VRI", "Vriddhachalam Jn", 213, 974, 976, 2, _sec("VM", "VRI"), _sec("VRI", "ALU")),  # 16:14/16:16
            _mvt(5, "ALU", "Ariyalur", 267, 1009, 1010, 1, _sec("VRI", "ALU"), _sec("ALU", "TPJ")),  # 16:49/16:50
            _mvt(6, "TPJ", "Tiruchirappalli Jn", 336, 1085, 1090, 5, _sec("ALU", "TPJ"), _sec("TPJ", "DG")),  # 18:05/18:10
            _mvt(7, "DG", "Dindigul Jn", 431, 1157, 1160, 3, _sec("TPJ", "DG"), _sec("DG", "MDU")),  # 19:17/19:20
            _mvt(8, "MDU", "Madurai Jn", 497, 1235, None, 0, _sec("DG", "MDU"), ""),          # arr 20:35
        ],
    )


def _train_12605_pallavan_down() -> TrainService:
    """12605 Pallavan Superfast Express — Daily Chennai-Trichy service."""
    return TrainService(
        train_id="SVC_12605",
        train_number="12605",
        train_name="Pallavan SF Express",
        category=TrainCategory.SUPERFAST,
        priority_class=PriorityClass.P2_HIGH,
        source_station="MS", source_station_name="Chennai Egmore",
        destination_station="TPJ", destination_station_name="Tiruchirappalli Jn",
        direction=TrainDirection.DOWN,
        total_distance_km=336,
        operating_days="Daily",
        delay_cost_per_min=3.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "MS", "Chennai Egmore", 0, None, 940, sec_after=_sec("MS", "CGL")),   # dep 15:40
            _mvt(1, "TBM", "Tambaram", 25, 965, 967, 2, _sec("MS", "CGL"), _sec("MS", "CGL")),
            _mvt(2, "CGL", "Chengalpattu Jn", 56, 998, 1000, 2, _sec("MS", "CGL"), _sec("CGL", "VM")),  # 16:38/16:40
            _mvt(3, "VM", "Villupuram Jn", 159, 1090, 1095, 5, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 18:10/18:15
            _mvt(4, "VRI", "Vriddhachalam Jn", 213, 1135, 1137, 2, _sec("VM", "VRI"), _sec("VRI", "ALU")),
            _mvt(5, "ALU", "Ariyalur", 267, 1175, 1176, 1, _sec("VRI", "ALU"), _sec("ALU", "TPJ")),
            _mvt(6, "TPJ", "Tiruchirappalli Jn", 336, 1240, None, 0, _sec("ALU", "TPJ"), ""),  # arr 20:40
        ],
    )


def _train_20605_chendur_down() -> TrainService:
    """20605 Chendur Superfast Express — Daily Chennai-Tiruchendur (via corridor)."""
    return TrainService(
        train_id="SVC_20605",
        train_number="20605",
        train_name="Chendur SF Express",
        category=TrainCategory.SUPERFAST,
        priority_class=PriorityClass.P2_HIGH,
        source_station="MS", source_station_name="Chennai Egmore",
        destination_station="TCN", destination_station_name="Tiruchendur",
        direction=TrainDirection.DOWN,
        total_distance_km=710,
        operating_days="Daily",
        delay_cost_per_min=2.5,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "MS", "Chennai Egmore", 0, None, 960, sec_after=_sec("MS", "CGL")),  # dep 16:00
            _mvt(1, "CGL", "Chengalpattu Jn", 56, 1015, 1017, 2, _sec("MS", "CGL"), _sec("CGL", "VM")),
            _mvt(2, "VM", "Villupuram Jn", 159, 1110, 1115, 5, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 18:30/18:35
            _mvt(3, "VRI", "Vriddhachalam Jn", 213, 1160, 1162, 2, _sec("VM", "VRI"), _sec("VRI", "ALU")),
            _mvt(4, "TPJ", "Tiruchirappalli Jn", 336, 1265, 1270, 5, _sec("ALU", "TPJ"), _sec("TPJ", "DG")),  # 21:05/21:10
            _mvt(5, "DG", "Dindigul Jn", 430, 1340, 1342, 2, _sec("TPJ", "DG"), _sec("DG", "MDU")),  # 22:20
            _mvt(6, "MDU", "Madurai Jn", 492, 1405, 1410, 5, _sec("DG", "MDU"), _sec("MDU", "VPT")),  # 23:25/23:30
            _mvt(7, "TEN", "Tirunelveli Jn", 650, 90, 95, 5, _sec("CVP", "TEN"), _sec("TEN", "NCJ")),  # 01:30 (+1) / 01:35
        ],
    )


def _train_12633_kanyakumari_down() -> TrainService:
    """12633 Kanyakumari Superfast Express — End-to-end corridor service."""
    return TrainService(
        train_id="SVC_12633",
        train_number="12633",
        train_name="Kanyakumari SF Express",
        category=TrainCategory.SUPERFAST,
        priority_class=PriorityClass.P2_HIGH,
        source_station="MS", source_station_name="Chennai Egmore",
        destination_station="CAPE", destination_station_name="Kanniyakumari",
        direction=TrainDirection.DOWN,
        total_distance_km=742,
        operating_days="Daily",
        delay_cost_per_min=3.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "MS", "Chennai Egmore", 0, None, 1040, sec_after=_sec("MS", "CGL")),  # dep 17:20
            _mvt(1, "TBM", "Tambaram", 25, 1065, 1067, 2, _sec("MS", "CGL"), _sec("MS", "CGL")),
            _mvt(2, "CGL", "Chengalpattu Jn", 56, 1093, 1095, 2, _sec("MS", "CGL"), _sec("CGL", "VM")),  # 18:13/18:15
            _mvt(3, "VM", "Villupuram Jn", 159, 1195, 1200, 5, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 19:55/20:00
            _mvt(4, "VRI", "Vriddhachalam Jn", 213, 1242, 1244, 2, _sec("VM", "VRI"), _sec("VRI", "ALU")),  # 20:42/20:44
            _mvt(5, "TPJ", "Tiruchirappalli Jn", 336, 1345, 1350, 5, _sec("ALU", "TPJ"), _sec("TPJ", "DG")),  # 22:25/22:30
            _mvt(6, "DG", "Dindigul Jn", 430, 1407, 1410, 3, _sec("TPJ", "DG"), _sec("DG", "MDU")),  # 23:27/23:30
            _mvt(7, "MDU", "Madurai Jn", 492, 45, 50, 5, _sec("DG", "MDU"), _sec("MDU", "VPT")),  # 00:45/00:50 (+1)
            _mvt(8, "VPT", "Virudhunagar Jn", 535, 88, 90, 2, _sec("MDU", "VPT"), _sec("VPT", "CVP")),  # 01:28/01:30
            _mvt(9, "CVP", "Kovilpatti", 584, 123, 125, 2, _sec("VPT", "CVP"), _sec("CVP", "TEN")),  # 02:03/02:05
            _mvt(10, "TEN", "Tirunelveli Jn", 650, 190, 195, 5, _sec("CVP", "TEN"), _sec("TEN", "NCJ")),  # 03:10/03:15
            _mvt(11, "NCJ", "Nagercoil Jn", 723, 280, 285, 5, _sec("TEN", "NCJ"), _sec("NCJ", "CAPE")),  # 04:40/04:45
            _mvt(12, "CAPE", "Kanniyakumari", 742, 330, None, 0, _sec("NCJ", "CAPE"), ""),  # arr 05:30
        ],
    )


def _train_12693_pearl_city_down() -> TrainService:
    """12693 Pearl City Express — Chennai-Tuticorin (via corridor to TEN)."""
    return TrainService(
        train_id="SVC_12693",
        train_number="12693",
        train_name="Pearl City Express",
        category=TrainCategory.EXPRESS,
        priority_class=PriorityClass.P3_NORMAL,
        source_station="MS", source_station_name="Chennai Egmore",
        destination_station="TUT", destination_station_name="Tuticorin",
        direction=TrainDirection.DOWN,
        total_distance_km=660,
        operating_days="Daily",
        delay_cost_per_min=2.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "MS", "Chennai Egmore", 0, None, 1155, sec_after=_sec("MS", "CGL")),  # dep 19:15
            _mvt(1, "CGL", "Chengalpattu Jn", 56, 1215, 1217, 2, _sec("MS", "CGL"), _sec("CGL", "VM")),
            _mvt(2, "VM", "Villupuram Jn", 159, 1325, 1330, 5, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 22:05/22:10
            _mvt(3, "VRI", "Vriddhachalam Jn", 213, 1375, 1377, 2, _sec("VM", "VRI"), _sec("VRI", "ALU")),
            _mvt(4, "TPJ", "Tiruchirappalli Jn", 336, 60, 65, 5, _sec("ALU", "TPJ"), _sec("TPJ", "DG")),  # 01:00/01:05 (+1)
            _mvt(5, "DG", "Dindigul Jn", 430, 130, 133, 3, _sec("TPJ", "DG"), _sec("DG", "MDU")),
            _mvt(6, "MDU", "Madurai Jn", 492, 200, 210, 10, _sec("DG", "MDU"), _sec("MDU", "VPT")),  # 03:20/03:30
            _mvt(7, "VPT", "Virudhunagar Jn", 535, 255, 258, 3, _sec("MDU", "VPT"), _sec("VPT", "CVP")),
        ],
    )


def _train_12631_nellai_down() -> TrainService:
    """12631 Nellai Superfast Express — Chennai-Tirunelveli overnight."""
    return TrainService(
        train_id="SVC_12631",
        train_number="12631",
        train_name="Nellai SF Express",
        category=TrainCategory.SUPERFAST,
        priority_class=PriorityClass.P2_HIGH,
        source_station="MS", source_station_name="Chennai Egmore",
        destination_station="TEN", destination_station_name="Tirunelveli Jn",
        direction=TrainDirection.DOWN,
        total_distance_km=650,
        operating_days="Daily",
        delay_cost_per_min=3.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "MS", "Chennai Egmore", 0, None, 1240, sec_after=_sec("MS", "CGL")),  # dep 20:40
            _mvt(1, "CGL", "Chengalpattu Jn", 56, 1305, 1307, 2, _sec("MS", "CGL"), _sec("CGL", "VM")),  # 21:45
            _mvt(2, "VM", "Villupuram Jn", 159, 1405, 1410, 5, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 23:25/23:30
            _mvt(3, "VRI", "Vriddhachalam Jn", 213, 30, 32, 2, _sec("VM", "VRI"), _sec("VRI", "ALU")),  # 00:30 (+1)
            _mvt(4, "TPJ", "Tiruchirappalli Jn", 336, 120, 125, 5, _sec("ALU", "TPJ"), _sec("TPJ", "DG")),  # 02:00/02:05
            _mvt(5, "DG", "Dindigul Jn", 430, 195, 198, 3, _sec("TPJ", "DG"), _sec("DG", "MDU")),  # 03:15
            _mvt(6, "MDU", "Madurai Jn", 492, 258, 263, 5, _sec("DG", "MDU"), _sec("MDU", "VPT")),  # 04:18/04:23
            _mvt(7, "VPT", "Virudhunagar Jn", 535, 303, 305, 2, _sec("MDU", "VPT"), _sec("VPT", "CVP")),
            _mvt(8, "CVP", "Kovilpatti", 584, 345, 347, 2, _sec("VPT", "CVP"), _sec("CVP", "TEN")),
            _mvt(9, "TEN", "Tirunelveli Jn", 650, 400, None, 0, _sec("CVP", "TEN"), ""),  # arr 06:40
        ],
    )


def _train_12637_pandian_down() -> TrainService:
    """12637 Pandian Superfast Express — Chennai-Madurai overnight."""
    return TrainService(
        train_id="SVC_12637",
        train_number="12637",
        train_name="Pandian SF Express",
        category=TrainCategory.SUPERFAST,
        priority_class=PriorityClass.P2_HIGH,
        source_station="MS", source_station_name="Chennai Egmore",
        destination_station="MDU", destination_station_name="Madurai Jn",
        direction=TrainDirection.DOWN,
        total_distance_km=497,
        operating_days="Daily",
        delay_cost_per_min=3.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "MS", "Chennai Egmore", 0, None, 1300, sec_after=_sec("MS", "CGL")),  # dep 21:40
            _mvt(1, "TBM", "Tambaram", 25, 1325, 1327, 2, _sec("MS", "CGL"), _sec("MS", "CGL")),  # 22:05/22:07
            _mvt(2, "CGL", "Chengalpattu Jn", 56, 1353, 1355, 2, _sec("MS", "CGL"), _sec("CGL", "VM")),  # 22:33/22:35
            _mvt(3, "VM", "Villupuram Jn", 159, 3, 5, 2, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 00:03/00:05 (+1)
            _mvt(4, "VRI", "Vriddhachalam Jn", 213, 50, 52, 2, _sec("VM", "VRI"), _sec("VRI", "ALU")),  # 00:50/00:52
            _mvt(5, "TPJ", "Tiruchirappalli Jn", 336, 165, 170, 5, _sec("ALU", "TPJ"), _sec("TPJ", "DG")),  # 02:45/02:50
            _mvt(6, "DG", "Dindigul Jn", 431, 232, 235, 3, _sec("TPJ", "DG"), _sec("DG", "MDU")),  # 03:52/03:55
            _mvt(7, "MDU", "Madurai Jn", 497, 325, None, 0, _sec("DG", "MDU"), ""),  # arr 05:25
        ],
    )


def _train_16701_rameswaram_down() -> TrainService:
    """16701 Rameswaram Express — Overnight via corridor to DG then branch."""
    return TrainService(
        train_id="SVC_16701",
        train_number="16701",
        train_name="Rameswaram Express",
        category=TrainCategory.EXPRESS,
        priority_class=PriorityClass.P3_NORMAL,
        source_station="MS", source_station_name="Chennai Egmore",
        destination_station="RMM", destination_station_name="Rameswaram",
        direction=TrainDirection.DOWN,
        total_distance_km=665,
        operating_days="Daily",
        delay_cost_per_min=2.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "MS", "Chennai Egmore", 0, None, 1300, sec_after=_sec("MS", "CGL")),  # dep 21:40
            _mvt(1, "CGL", "Chengalpattu Jn", 56, 1360, 1362, 2, _sec("MS", "CGL"), _sec("CGL", "VM")),
            _mvt(2, "VM", "Villupuram Jn", 159, 15, 20, 5, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 00:15/00:20 (+1)
            _mvt(3, "VRI", "Vriddhachalam Jn", 213, 65, 67, 2, _sec("VM", "VRI"), _sec("VRI", "ALU")),
            _mvt(4, "TPJ", "Tiruchirappalli Jn", 336, 180, 190, 10, _sec("ALU", "TPJ"), _sec("TPJ", "DG")),  # 03:00/03:10
            _mvt(5, "DG", "Dindigul Jn", 430, 265, 270, 5, _sec("TPJ", "DG"), ""),  # 04:25/04:30 (branches off)
        ],
    )


def _train_16127_guruvayur_down() -> TrainService:
    """16127 Chennai Egmore – Guruvayur Express — Daytime via corridor."""
    return TrainService(
        train_id="SVC_16127",
        train_number="16127",
        train_name="Guruvayur Express",
        category=TrainCategory.EXPRESS,
        priority_class=PriorityClass.P3_NORMAL,
        source_station="MS", source_station_name="Chennai Egmore",
        destination_station="GUV", destination_station_name="Guruvayur",
        direction=TrainDirection.DOWN,
        total_distance_km=740,
        operating_days="Daily",
        delay_cost_per_min=2.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "MS", "Chennai Egmore", 0, None, 620, sec_after=_sec("MS", "CGL")),  # dep 10:20
            _mvt(1, "CGL", "Chengalpattu Jn", 56, 685, 687, 2, _sec("MS", "CGL"), _sec("CGL", "VM")),  # 11:25
            _mvt(2, "VM", "Villupuram Jn", 159, 785, 790, 5, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 13:05/13:10
            _mvt(3, "VRI", "Vriddhachalam Jn", 213, 835, 837, 2, _sec("VM", "VRI"), _sec("VRI", "ALU")),
            _mvt(4, "ALU", "Ariyalur", 267, 880, 882, 2, _sec("VRI", "ALU"), _sec("ALU", "TPJ")),
            _mvt(5, "TPJ", "Tiruchirappalli Jn", 336, 940, 950, 10, _sec("ALU", "TPJ"), _sec("TPJ", "DG")),  # 15:40/15:50
            _mvt(6, "DG", "Dindigul Jn", 430, 1020, 1025, 5, _sec("TPJ", "DG"), _sec("DG", "MDU")),  # 17:00/17:05
            _mvt(7, "MDU", "Madurai Jn", 492, 1095, 1100, 5, _sec("DG", "MDU"), _sec("MDU", "VPT")),  # 18:15/18:20
        ],
    )


# ═══════════════════════════════════════════════════════════════════════════════
# UP DIRECTION (CAPE / MDU / TEN → MS)
# ═══════════════════════════════════════════════════════════════════════════════

def _train_20628_vande_bharat_up() -> TrainService:
    """20628 NCJ-MS Vande Bharat Express — UP direction return."""
    return TrainService(
        train_id="SVC_20628",
        train_number="20628",
        train_name="NCJ-MS Vande Bharat Express",
        category=TrainCategory.VANDE_BHARAT,
        priority_class=PriorityClass.P1_CRITICAL,
        source_station="NCJ", source_station_name="Nagercoil Jn",
        destination_station="MS", destination_station_name="Chennai Egmore",
        direction=TrainDirection.UP,
        total_distance_km=723,
        operating_days="Daily except Wednesday",
        delay_cost_per_min=5.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "NCJ", "Nagercoil Jn", 0, None, 870, sec_after=_sec("TEN", "NCJ")),  # dep 14:30
            _mvt(1, "TEN", "Tirunelveli Jn", 73, 940, 945, 5, _sec("TEN", "NCJ"), _sec("CVP", "TEN")),  # 15:40/15:45
            _mvt(2, "CVP", "Kovilpatti", 139, 1000, 1002, 2, _sec("CVP", "TEN"), _sec("VPT", "CVP")),
            _mvt(3, "MDU", "Madurai Jn", 231, 1075, 1080, 5, _sec("DG", "MDU"), _sec("TPJ", "DG")),  # 17:55/18:00
            _mvt(4, "DG", "Dindigul Jn", 293, 1120, 1122, 2, _sec("TPJ", "DG"), _sec("ALU", "TPJ")),
            _mvt(5, "TPJ", "Tiruchirappalli Jn", 387, 1195, 1200, 5, _sec("ALU", "TPJ"), _sec("VRI", "ALU")),  # 19:55/20:00
            _mvt(6, "VM", "Villupuram Jn", 564, 1320, 1325, 5, _sec("CGL", "VM"), _sec("MS", "CGL")),  # 22:00/22:05
            _mvt(7, "MS", "Chennai Egmore", 723, 1400, None, 0, _sec("MS", "CGL"), ""),  # arr 23:20
        ],
    )


def _train_12636_vaigai_up() -> TrainService:
    """12636 Vaigai SF Express — UP direction Madurai-Chennai."""
    return TrainService(
        train_id="SVC_12636",
        train_number="12636",
        train_name="Vaigai SF Express",
        category=TrainCategory.SUPERFAST,
        priority_class=PriorityClass.P2_HIGH,
        source_station="MDU", source_station_name="Madurai Jn",
        destination_station="MS", destination_station_name="Chennai Egmore",
        direction=TrainDirection.UP,
        total_distance_km=497,
        operating_days="Daily",
        delay_cost_per_min=3.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "MDU", "Madurai Jn", 0, None, 450, sec_after=_sec("DG", "MDU")),  # dep 07:30
            _mvt(1, "DG", "Dindigul Jn", 66, 510, 513, 3, _sec("DG", "MDU"), _sec("TPJ", "DG")),  # 08:30/08:33
            _mvt(2, "TPJ", "Tiruchirappalli Jn", 161, 590, 595, 5, _sec("TPJ", "DG"), _sec("ALU", "TPJ")),  # 09:50/09:55
            _mvt(3, "ALU", "Ariyalur", 230, 640, 641, 1, _sec("ALU", "TPJ"), _sec("VRI", "ALU")),
            _mvt(4, "VRI", "Vriddhachalam Jn", 284, 680, 682, 2, _sec("VRI", "ALU"), _sec("VM", "VRI")),
            _mvt(5, "VM", "Villupuram Jn", 338, 730, 735, 5, _sec("VM", "VRI"), _sec("CGL", "VM")),  # 12:10/12:15
            _mvt(6, "CGL", "Chengalpattu Jn", 441, 830, 832, 2, _sec("CGL", "VM"), _sec("MS", "CGL")),  # 13:50/13:52
            _mvt(7, "MS", "Chennai Egmore", 497, 895, None, 0, _sec("MS", "CGL"), ""),  # arr 14:55
        ],
    )


def _train_12634_kanyakumari_up() -> TrainService:
    """12634 Kanyakumari SF Express — UP direction CAPE-Chennai."""
    return TrainService(
        train_id="SVC_12634",
        train_number="12634",
        train_name="Kanyakumari SF Express",
        category=TrainCategory.SUPERFAST,
        priority_class=PriorityClass.P2_HIGH,
        source_station="CAPE", source_station_name="Kanniyakumari",
        destination_station="MS", destination_station_name="Chennai Egmore",
        direction=TrainDirection.UP,
        total_distance_km=742,
        operating_days="Daily",
        delay_cost_per_min=3.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "CAPE", "Kanniyakumari", 0, None, 1070, sec_after=_sec("NCJ", "CAPE")),  # dep 17:50
            _mvt(1, "NCJ", "Nagercoil Jn", 19, 1110, 1115, 5, _sec("NCJ", "CAPE"), _sec("TEN", "NCJ")),  # 18:30/18:35
            _mvt(2, "TEN", "Tirunelveli Jn", 92, 1200, 1205, 5, _sec("TEN", "NCJ"), _sec("CVP", "TEN")),  # 20:00/20:05
            _mvt(3, "CVP", "Kovilpatti", 158, 1255, 1257, 2, _sec("CVP", "TEN"), _sec("VPT", "CVP")),
            _mvt(4, "VPT", "Virudhunagar Jn", 207, 1295, 1297, 2, _sec("VPT", "CVP"), _sec("MDU", "VPT")),
            _mvt(5, "MDU", "Madurai Jn", 250, 1350, 1355, 5, _sec("MDU", "VPT"), _sec("DG", "MDU")),  # 22:30/22:35
            _mvt(6, "DG", "Dindigul Jn", 312, 1410, 1412, 2, _sec("DG", "MDU"), _sec("TPJ", "DG")),
            _mvt(7, "TPJ", "Tiruchirappalli Jn", 406, 75, 80, 5, _sec("TPJ", "DG"), _sec("ALU", "TPJ")),  # 01:15/01:20 (+1)
            _mvt(8, "VRI", "Vriddhachalam Jn", 529, 145, 147, 2, _sec("VRI", "ALU"), _sec("VM", "VRI")),
            _mvt(9, "VM", "Villupuram Jn", 583, 195, 200, 5, _sec("VM", "VRI"), _sec("CGL", "VM")),  # 03:15/03:20
            _mvt(10, "CGL", "Chengalpattu Jn", 686, 295, 297, 2, _sec("CGL", "VM"), _sec("MS", "CGL")),
            _mvt(11, "MS", "Chennai Egmore", 742, 370, None, 0, _sec("MS", "CGL"), ""),  # arr 06:10
        ],
    )


def _train_12606_pallavan_up() -> TrainService:
    """12606 Pallavan SF Express — UP direction TPJ-Chennai."""
    return TrainService(
        train_id="SVC_12606",
        train_number="12606",
        train_name="Pallavan SF Express",
        category=TrainCategory.SUPERFAST,
        priority_class=PriorityClass.P2_HIGH,
        source_station="TPJ", source_station_name="Tiruchirappalli Jn",
        destination_station="MS", destination_station_name="Chennai Egmore",
        direction=TrainDirection.UP,
        total_distance_km=336,
        operating_days="Daily",
        delay_cost_per_min=3.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "TPJ", "Tiruchirappalli Jn", 0, None, 390, sec_after=_sec("ALU", "TPJ")),  # dep 06:30
            _mvt(1, "ALU", "Ariyalur", 69, 435, 436, 1, _sec("ALU", "TPJ"), _sec("VRI", "ALU")),
            _mvt(2, "VRI", "Vriddhachalam Jn", 123, 475, 477, 2, _sec("VRI", "ALU"), _sec("VM", "VRI")),
            _mvt(3, "VM", "Villupuram Jn", 177, 530, 535, 5, _sec("VM", "VRI"), _sec("CGL", "VM")),  # 08:50/08:55
            _mvt(4, "CGL", "Chengalpattu Jn", 280, 630, 632, 2, _sec("CGL", "VM"), _sec("MS", "CGL")),  # 10:30/10:32
            _mvt(5, "MS", "Chennai Egmore", 336, 695, None, 0, _sec("MS", "CGL"), ""),  # arr 11:35
        ],
    )


def _train_12632_nellai_up() -> TrainService:
    """12632 Nellai SF Express — UP direction TEN-Chennai."""
    return TrainService(
        train_id="SVC_12632",
        train_number="12632",
        train_name="Nellai SF Express",
        category=TrainCategory.SUPERFAST,
        priority_class=PriorityClass.P2_HIGH,
        source_station="TEN", source_station_name="Tirunelveli Jn",
        destination_station="MS", destination_station_name="Chennai Egmore",
        direction=TrainDirection.UP,
        total_distance_km=650,
        operating_days="Daily",
        delay_cost_per_min=3.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "TEN", "Tirunelveli Jn", 0, None, 1280, sec_after=_sec("CVP", "TEN")),  # dep 21:20
            _mvt(1, "CVP", "Kovilpatti", 66, 1340, 1342, 2, _sec("CVP", "TEN"), _sec("VPT", "CVP")),
            _mvt(2, "VPT", "Virudhunagar Jn", 115, 1385, 1387, 2, _sec("VPT", "CVP"), _sec("MDU", "VPT")),
            _mvt(3, "MDU", "Madurai Jn", 158, 30, 35, 5, _sec("MDU", "VPT"), _sec("DG", "MDU")),  # 00:30/00:35 (+1)
            _mvt(4, "DG", "Dindigul Jn", 220, 100, 103, 3, _sec("DG", "MDU"), _sec("TPJ", "DG")),
            _mvt(5, "TPJ", "Tiruchirappalli Jn", 314, 180, 185, 5, _sec("TPJ", "DG"), _sec("ALU", "TPJ")),  # 03:00/03:05
            _mvt(6, "VRI", "Vriddhachalam Jn", 437, 250, 252, 2, _sec("VRI", "ALU"), _sec("VM", "VRI")),
            _mvt(7, "VM", "Villupuram Jn", 491, 300, 305, 5, _sec("VM", "VRI"), _sec("CGL", "VM")),  # 05:00/05:05
            _mvt(8, "CGL", "Chengalpattu Jn", 594, 395, 397, 2, _sec("CGL", "VM"), _sec("MS", "CGL")),
            _mvt(9, "MS", "Chennai Egmore", 650, 430, None, 0, _sec("MS", "CGL"), ""),  # arr 07:10
        ],
    )


def _train_12638_pandian_up() -> TrainService:
    """12638 Pandian SF Express — UP direction MDU-Chennai."""
    return TrainService(
        train_id="SVC_12638",
        train_number="12638",
        train_name="Pandian SF Express",
        category=TrainCategory.SUPERFAST,
        priority_class=PriorityClass.P2_HIGH,
        source_station="MDU", source_station_name="Madurai Jn",
        destination_station="MS", destination_station_name="Chennai Egmore",
        direction=TrainDirection.UP,
        total_distance_km=497,
        operating_days="Daily",
        delay_cost_per_min=3.0,
        data_mode=DataMode.PUBLIC_TIMETABLE,
        movements=[
            _mvt(0, "MDU", "Madurai Jn", 0, None, 1280, sec_after=_sec("DG", "MDU")),  # dep 21:20
            _mvt(1, "DG", "Dindigul Jn", 66, 1345, 1348, 3, _sec("DG", "MDU"), _sec("TPJ", "DG")),
            _mvt(2, "TPJ", "Tiruchirappalli Jn", 161, 30, 35, 5, _sec("TPJ", "DG"), _sec("ALU", "TPJ")),  # 00:30/00:35 (+1)
            _mvt(3, "VRI", "Vriddhachalam Jn", 284, 110, 112, 2, _sec("VRI", "ALU"), _sec("VM", "VRI")),
            _mvt(4, "VM", "Villupuram Jn", 338, 160, 165, 5, _sec("VM", "VRI"), _sec("CGL", "VM")),  # 02:40/02:45
            _mvt(5, "CGL", "Chengalpattu Jn", 441, 265, 267, 2, _sec("CGL", "VM"), _sec("MS", "CGL")),  # 04:25/04:27
            _mvt(6, "MS", "Chennai Egmore", 497, 340, None, 0, _sec("MS", "CGL"), ""),  # arr 05:40
        ],
    )


# ═══════════════════════════════════════════════════════════════════════════════
# SIMULATED SERVICES (Freight + MEMU/Passenger)
# ═══════════════════════════════════════════════════════════════════════════════

def _train_sim_frt_001() -> TrainService:
    """SIM-FRT-001: Ariyalur Cement Rake (BOXN) — night movement."""
    return TrainService(
        train_id="SIM_FRT_001",
        train_number="SIM-FRT-001",
        train_name="Ariyalur Cement Rake (BOXN)",
        category=TrainCategory.FREIGHT,
        priority_class=PriorityClass.P4_FLEXIBLE,
        source_station="ALU", source_station_name="Ariyalur (Dalmiapuram Siding)",
        destination_station="MS", destination_station_name="Chennai Port",
        direction=TrainDirection.UP,
        total_distance_km=267,
        operating_days="Daily (estimated)",
        delay_cost_per_min=0.5,
        data_mode=DataMode.SIMULATION,
        source="Simulated based on Dalmiapuram cement factory siding operations",
        source_url="internal://carb-planner/simulation",
        movements=[
            _mvt(0, "ALU", "Ariyalur", 0, None, 180, sec_after=_sec("VRI", "ALU")),  # dep 03:00
            _mvt(1, "VRI", "Vriddhachalam Jn", 54, 240, 255, 15, _sec("VRI", "ALU"), _sec("VM", "VRI")),  # 04:00/04:15
            _mvt(2, "VM", "Villupuram Jn", 108, 330, 350, 20, _sec("VM", "VRI"), _sec("CGL", "VM")),  # 05:30/05:50
            _mvt(3, "CGL", "Chengalpattu Jn", 211, 460, 475, 15, _sec("CGL", "VM"), _sec("MS", "CGL")),  # 07:40/07:55
        ],
    )


def _train_sim_frt_002() -> TrainService:
    """SIM-FRT-002: BTPN Petroleum Tanker — overnight."""
    return TrainService(
        train_id="SIM_FRT_002",
        train_number="SIM-FRT-002",
        train_name="BTPN Petroleum Tanker (Tondiarpet-MDU)",
        category=TrainCategory.FREIGHT,
        priority_class=PriorityClass.P4_FLEXIBLE,
        source_station="MS", source_station_name="Tondiarpet Yard",
        destination_station="MDU", destination_station_name="Madurai Goods Yard",
        direction=TrainDirection.DOWN,
        total_distance_km=497,
        operating_days="3-4 days/week (estimated)",
        delay_cost_per_min=0.5,
        data_mode=DataMode.SIMULATION,
        source="Simulated petroleum logistics movement",
        source_url="internal://carb-planner/simulation",
        movements=[
            _mvt(0, "CGL", "Chengalpattu Jn", 0, None, 60, sec_after=_sec("CGL", "VM")),  # dep 01:00
            _mvt(1, "VM", "Villupuram Jn", 103, 150, 170, 20, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 02:30/02:50
            _mvt(2, "VRI", "Vriddhachalam Jn", 157, 230, 245, 15, _sec("VM", "VRI"), _sec("VRI", "ALU")),  # 03:50/04:05
            _mvt(3, "ALU", "Ariyalur", 211, 305, 310, 5, _sec("VRI", "ALU"), _sec("ALU", "TPJ")),  # 05:05
            _mvt(4, "TPJ", "Tiruchirappalli Jn", 280, 380, 410, 30, _sec("ALU", "TPJ"), _sec("TPJ", "DG")),  # 06:20/06:50
            _mvt(5, "DG", "Dindigul Jn", 374, 490, 500, 10, _sec("TPJ", "DG"), _sec("DG", "MDU")),
            _mvt(6, "MDU", "Madurai Jn", 436, 570, None, 0, _sec("DG", "MDU"), ""),  # arr 09:30
        ],
    )


def _train_sim_frt_003() -> TrainService:
    """SIM-FRT-003: BOXN General Goods — southbound night."""
    return TrainService(
        train_id="SIM_FRT_003",
        train_number="SIM-FRT-003",
        train_name="BOXN General Goods (MS-TEN)",
        category=TrainCategory.FREIGHT,
        priority_class=PriorityClass.P4_FLEXIBLE,
        source_station="MS", source_station_name="Chennai Basin Bridge Yard",
        destination_station="TEN", destination_station_name="Tirunelveli Goods",
        direction=TrainDirection.DOWN,
        total_distance_km=650,
        operating_days="2-3 days/week (estimated)",
        delay_cost_per_min=0.5,
        data_mode=DataMode.SIMULATION,
        source="Simulated general goods movement",
        source_url="internal://carb-planner/simulation",
        movements=[
            _mvt(0, "CGL", "Chengalpattu Jn", 0, None, 1380, sec_after=_sec("CGL", "VM")),  # dep 23:00
            _mvt(1, "VM", "Villupuram Jn", 103, 60, 80, 20, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 01:00/01:20 (+1)
            _mvt(2, "VRI", "Vriddhachalam Jn", 157, 135, 145, 10, _sec("VM", "VRI"), _sec("VRI", "ALU")),
            _mvt(3, "TPJ", "Tiruchirappalli Jn", 280, 260, 290, 30, _sec("ALU", "TPJ"), _sec("TPJ", "DG")),  # 04:20/04:50
            _mvt(4, "MDU", "Madurai Jn", 436, 450, 480, 30, _sec("DG", "MDU"), _sec("MDU", "VPT")),  # 07:30/08:00
            _mvt(5, "VPT", "Virudhunagar Jn", 479, 525, 535, 10, _sec("MDU", "VPT"), _sec("VPT", "CVP")),
            _mvt(6, "TEN", "Tirunelveli Jn", 594, 660, None, 0, _sec("CVP", "TEN"), ""),  # arr 11:00
        ],
    )


def _train_sim_pass_001() -> TrainService:
    """SIM-PASS-001: TBM-TPJ MEMU Passenger (fast passenger)."""
    return TrainService(
        train_id="SIM_PASS_001",
        train_number="06725",
        train_name="TBM-TPJ Fast MEMU",
        category=TrainCategory.MEMU_EMU,
        priority_class=PriorityClass.P3_NORMAL,
        source_station="TBM", source_station_name="Tambaram",
        destination_station="TPJ", destination_station_name="Tiruchirappalli Jn",
        direction=TrainDirection.DOWN,
        total_distance_km=311,
        operating_days="Daily",
        delay_cost_per_min=1.0,
        data_mode=DataMode.SIMULATION,
        source="Simulated MEMU service pattern",
        source_url="internal://carb-planner/simulation",
        movements=[
            _mvt(0, "CGL", "Chengalpattu Jn", 0, None, 660, sec_after=_sec("CGL", "VM")),  # dep 11:00
            _mvt(1, "VM", "Villupuram Jn", 103, 760, 768, 8, _sec("CGL", "VM"), _sec("VM", "VRI")),  # 12:40/12:48
            _mvt(2, "VRI", "Vriddhachalam Jn", 157, 815, 820, 5, _sec("VM", "VRI"), _sec("VRI", "ALU")),  # 13:35/13:40
            _mvt(3, "ALU", "Ariyalur", 211, 870, 875, 5, _sec("VRI", "ALU"), _sec("ALU", "TPJ")),
            _mvt(4, "TPJ", "Tiruchirappalli Jn", 280, 945, None, 0, _sec("ALU", "TPJ"), ""),  # arr 15:45
        ],
    )


def _train_sim_pass_002() -> TrainService:
    """SIM-PASS-002: VM-MDU Passenger (slow stopping service)."""
    return TrainService(
        train_id="SIM_PASS_002",
        train_number="SIM-PASS-002",
        train_name="VM-MDU Passenger",
        category=TrainCategory.PASSENGER,
        priority_class=PriorityClass.P4_FLEXIBLE,
        source_station="VM", source_station_name="Villupuram Jn",
        destination_station="MDU", destination_station_name="Madurai Jn",
        direction=TrainDirection.DOWN,
        total_distance_km=338,
        operating_days="Daily",
        delay_cost_per_min=0.5,
        data_mode=DataMode.SIMULATION,
        source="Simulated unreserved passenger service",
        source_url="internal://carb-planner/simulation",
        movements=[
            _mvt(0, "VM", "Villupuram Jn", 0, None, 420, sec_after=_sec("VM", "VRI")),  # dep 07:00
            _mvt(1, "VRI", "Vriddhachalam Jn", 54, 480, 488, 8, _sec("VM", "VRI"), _sec("VRI", "ALU")),  # 08:00/08:08
            _mvt(2, "ALU", "Ariyalur", 108, 545, 553, 8, _sec("VRI", "ALU"), _sec("ALU", "TPJ")),  # 09:05/09:13
            _mvt(3, "TPJ", "Tiruchirappalli Jn", 177, 640, 660, 20, _sec("ALU", "TPJ"), _sec("TPJ", "DG")),  # 10:40/11:00
            _mvt(4, "DG", "Dindigul Jn", 271, 750, 758, 8, _sec("TPJ", "DG"), _sec("DG", "MDU")),  # 12:30/12:38
            _mvt(5, "MDU", "Madurai Jn", 338, 830, None, 0, _sec("DG", "MDU"), ""),  # arr 13:50
        ],
    )


def _train_sim_pass_003() -> TrainService:
    """SIM-PASS-003: TPJ-MS Morning Passenger (UP direction)."""
    return TrainService(
        train_id="SIM_PASS_003",
        train_number="SIM-PASS-003",
        train_name="TPJ-MS Morning Passenger",
        category=TrainCategory.PASSENGER,
        priority_class=PriorityClass.P4_FLEXIBLE,
        source_station="TPJ", source_station_name="Tiruchirappalli Jn",
        destination_station="MS", destination_station_name="Chennai Egmore",
        direction=TrainDirection.UP,
        total_distance_km=336,
        operating_days="Daily",
        delay_cost_per_min=0.5,
        data_mode=DataMode.SIMULATION,
        source="Simulated morning unreserved passenger",
        source_url="internal://carb-planner/simulation",
        movements=[
            _mvt(0, "TPJ", "Tiruchirappalli Jn", 0, None, 300, sec_after=_sec("ALU", "TPJ")),  # dep 05:00
            _mvt(1, "ALU", "Ariyalur", 69, 355, 363, 8, _sec("ALU", "TPJ"), _sec("VRI", "ALU")),
            _mvt(2, "VRI", "Vriddhachalam Jn", 123, 420, 428, 8, _sec("VRI", "ALU"), _sec("VM", "VRI")),  # 07:00/07:08
            _mvt(3, "VM", "Villupuram Jn", 177, 490, 500, 10, _sec("VM", "VRI"), _sec("CGL", "VM")),  # 08:10/08:20
            _mvt(4, "CGL", "Chengalpattu Jn", 280, 600, 608, 8, _sec("CGL", "VM"), _sec("MS", "CGL")),  # 10:00/10:08
            _mvt(5, "MS", "Chennai Egmore", 336, 670, None, 0, _sec("MS", "CGL"), ""),  # arr 11:10
        ],
    )


# ═══════════════════════════════════════════════════════════════════════════════
# TIMETABLE ASSEMBLY
# ═══════════════════════════════════════════════════════════════════════════════

def build_corridor_timetable(planning_date: str = "2026-09-18") -> CorridorTimetable:
    """Build the complete corridor timetable with all verified and simulated services.

    Returns a CorridorTimetable with 25+ train services, each with full
    station-by-station movements and computed time-space occupancy.
    """
    services: List[TrainService] = [
        # DOWN direction (11 verified + 3 simulated = 14)
        _train_20627_vande_bharat_down(),
        _train_22671_tejas_down(),
        _train_12635_vaigai_down(),
        _train_12605_pallavan_down(),
        _train_20605_chendur_down(),
        _train_12633_kanyakumari_down(),
        _train_12693_pearl_city_down(),
        _train_12631_nellai_down(),
        _train_12637_pandian_down(),
        _train_16701_rameswaram_down(),
        _train_16127_guruvayur_down(),

        # UP direction (6 verified)
        _train_20628_vande_bharat_up(),
        _train_12636_vaigai_up(),
        _train_12634_kanyakumari_up(),
        _train_12606_pallavan_up(),
        _train_12632_nellai_up(),
        _train_12638_pandian_up(),

        # Simulated freight (3)
        _train_sim_frt_001(),
        _train_sim_frt_002(),
        _train_sim_frt_003(),

        # Simulated passenger/MEMU (3)
        _train_sim_pass_001(),
        _train_sim_pass_002(),
        _train_sim_pass_003(),
    ]

    # Compute interpolated station movements and time-space occupancy for all services
    for svc in services:
        interpolate_service_movements(svc)
        _normalize_service_route(svc)
        svc.compute_occupancy()

    timetable = CorridorTimetable(
        planning_date=planning_date,
        services=services,
    )
    timetable.compute_stats()

    return timetable
