"""
CARB-Planner — Canonical Railway Corridor Catalog
Provides verified corridor specifications across Tamil Nadu railway network.
"""

from __future__ import annotations

from typing import List
from backend.models.scenario import CorridorConfig

PRIMARY_CORRIDOR = CorridorConfig(
    corridor_id="SR_GST_01",
    name="Southern Railway Grand South Trunk Corridor",
    short_name="MS ↔ CAPE",
    origin="Chennai Egmore (MS)",
    origin_code="MS",
    destination="Kanniyakumari (CAPE)",
    destination_code="CAPE",
    total_distance_km=742.0,
    zone="Southern Railway (SR)",
    divisions=[
        "Chennai (MAS)",
        "Tiruchirappalli (TPJ)",
        "Madurai (MDU)",
        "Thiruvananthapuram (TVC)",
    ],
    electrification="25 kV AC 50 Hz OHE (100% Electrified)",
    gauge="Broad Gauge 1676 mm",
    planning_directions=["BOTH", "DOWN", "UP"],
    source="Southern Railway Official Working Time Table (WTT) & OpenRailwayMap",
    source_url="https://sr.indianrailways.gov.in",
    data_version="SR-GST-2026-V2",
    effective_date="2026-09-18",
    verification_status="publicly verified",
    alternate_routes=[
        {
            "name": "Delta Alternate Route",
            "path": "Villupuram (VM) ↔ Mayiladuthurai (MV) ↔ Thanjavur (TJ) ↔ Tiruchirappalli (TPJ)",
            "distance_km": 240.0,
            "status": "FEASIBLE",
            "capacity": "Single / Double mixed Broad Gauge",
        },
        {
            "name": "Chettinad Chord",
            "path": "Tiruchirappalli (TPJ) ↔ Karaikkudi (KKDI) ↔ Manamadurai (MNM) ↔ Madurai (MDU)",
            "distance_km": 199.0,
            "status": "FEASIBLE",
            "capacity": "Single Line Broad Gauge with Crossing Loops",
        },
        {
            "name": "Tenkasi Western Ghats Chord",
            "path": "Virudhunagar (VPT) ↔ Tenkasi (TSI) ↔ Tirunelveli (TEN)",
            "distance_km": 115.0,
            "status": "FEASIBLE",
            "capacity": "Single Line Broad Gauge (Scenic Foothills)",
        },
    ],
)

CORRIDOR_REGISTRY: List[CorridorConfig] = [PRIMARY_CORRIDOR]


def get_primary_corridor() -> CorridorConfig:
    return PRIMARY_CORRIDOR


def get_corridor_by_id(corridor_id: str) -> CorridorConfig:
    for c in CORRIDOR_REGISTRY:
        if c.corridor_id == corridor_id:
            return c
    return PRIMARY_CORRIDOR
