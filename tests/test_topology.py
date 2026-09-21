"""
CARB-Planner — Automated Tests for Real Railway Topology & Advanced Features

Tests cover:
  1. Real infrastructure GPS coordinate verification
  2. Topology graph reachability & structural validation
  3. Loop line detection and alternative route evaluation
  4. Multi-department possession bundling logic
  5. Maintenance duration overrun disruption & LNS replan
  6. Data provenance registry integrity
"""

import copy
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from backend.data.generator import generate_demo_scenario, generate_network
from backend.data.topology_graph import RailwayTopologyGraph
from backend.ml.duration_model import DurationPredictor
from backend.ml.risk_model import RiskPredictor
from backend.models.network import SourceType, TrackDirection, TrackType
from backend.models.plan import DisruptionEvent, DisruptionType, TaskStatus
from backend.optimizer.cp_sat import solve_block_plan
from backend.optimizer.lns_repair import apply_disruption
from backend.optimizer.possession_bundling import identify_possession_bundles


@pytest.fixture(scope="module")
def network():
    return generate_network(seed=42)


def test_real_coordinates_present(network):
    """All stations must have non-zero WGS84 coordinates and station codes within Tamil Nadu."""
    for stn in network.stations:
        assert stn.latitude >= 8.0 and stn.latitude <= 14.0, f"{stn.name} latitude out of Tamil Nadu bounds"
        assert stn.longitude >= 77.0 and stn.longitude <= 81.0, f"{stn.name} longitude out of Tamil Nadu bounds"
        assert len(stn.code) >= 2, f"{stn.name} missing Indian Railways station code"


def test_topology_validation_passes(network):
    """Network validation should report valid topology with zero structural errors."""
    graph = RailwayTopologyGraph(network)
    report = graph.validate_topology()
    assert report["is_valid"] is True
    assert report["error_count"] == 0
    assert report["metrics"]["total_stations"] >= 13
    assert report["metrics"]["total_sections"] >= 24
    assert report["metrics"]["total_loop_lines"] >= 10


def test_loop_line_alternatives_evaluation(network):
    """Evaluating a blocked section should return valid station loop holding options."""
    graph = RailwayTopologyGraph(network)
    alternatives = graph.evaluate_loop_and_alternate_routes("S04", TrackDirection.DOWN)
    assert len(alternatives) > 0

    loop_alts = [a for a in alternatives if a["alternative_type"] == "LOOP_LINE_HOLD"]
    assert len(loop_alts) >= 1
    assert loop_alts[0]["is_physically_connected"] is True
    assert loop_alts[0]["safety_isolation_satisfied"] is True


def test_possession_bundling_identifies_compatible_tasks():
    """Possession bundler should identify multi-department opportunities on the same section."""
    scenario = generate_demo_scenario(seed=42)
    tasks = scenario["tasks"]
    # Run duration and risk predictions
    dp = DurationPredictor()
    dp.train(seed=42)
    tasks = dp.predict_all(tasks)

    bundles = identify_possession_bundles(tasks)
    assert len(bundles) > 0, "Should identify at least one bundling opportunity"
    b0 = bundles[0]
    assert len(b0.bundled_tasks) >= 2
    assert b0.time_saved_min > 0


def test_duration_overrun_replanning(network):
    """Injecting a +45 min maintenance overrun must re-solve locally without breaking feasibility."""
    scenario = generate_demo_scenario(seed=42)
    tasks = scenario["tasks"]
    trains = scenario["trains"]

    dp = DurationPredictor()
    dp.train(seed=42)
    tasks = dp.predict_all(tasks)

    initial_plan = solve_block_plan(network, tasks, trains, horizon_slots=96, time_limit_sec=15.0)
    assert initial_plan.is_feasible is True

    # Inject duration overrun
    disruption = DisruptionEvent(
        disruption_id="TEST_OVERRUN_01",
        disruption_type=DisruptionType.MAINTENANCE_OVERRUN,
        affected_section="S02",
        cancelled_task_id="T02",
        overrun_minutes=45,
    )

    repaired_plan, info = apply_disruption(
        disruption=disruption,
        current_plan=initial_plan,
        tasks=copy.deepcopy(tasks),
        trains=copy.deepcopy(trains),
        network=network,
    )

    assert repaired_plan.is_feasible is True
    assert info["frozen_tasks"] >= 5, "LNS must freeze majority of unaffected tasks"


def test_provenance_registry_integrity(network):
    """Infrastructure entities must reference authoritative real/public sources."""
    assert "INFRASTRUCTURE" in network.provenance_registry
    prov = network.provenance_registry["INFRASTRUCTURE"]
    assert prov.source_type == SourceType.REAL_PUBLIC
    assert "openrailwaymap" in prov.source_url.lower() or "indianrailways" in prov.source_url.lower()
