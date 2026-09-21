"""
CARB-Planner — Automated Tests for Railway Infrastructure REST APIs
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_get_corridors():
    res = client.get("/api/corridors")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    corridor = data[0]
    assert corridor["origin"] == "Chennai Egmore (MS)"
    assert corridor["destination"] == "Kanniyakumari (CAPE)"
    assert corridor["total_distance_km"] == 742.0
    assert "Tamil Nadu" in corridor["state"]
    assert len(corridor["alternate_routes"]) == 3


def test_get_stations():
    res = client.get("/api/stations")
    assert res.status_code == 200
    stations = res.json()
    assert len(stations) == 14
    codes = [s["code"] for s in stations]
    assert "MS" in codes
    assert "TPJ" in codes
    assert "MDU" in codes
    assert "CAPE" in codes
    for s in stations:
        assert s["platform_count"] >= 2
        assert s["verification_status"] == "publicly verified"


def test_get_station_detail():
    res = client.get("/api/stations/TPJ")
    assert res.status_code == 200
    data = res.json()
    assert data["station"]["code"] == "TPJ"
    assert data["station"]["platform_count"] == 8
    assert len(data["platforms"]) == 8
    assert len(data["loops"]) >= 1
    assert len(data["sidings"]) >= 1
    assert len(data["yards"]) >= 1


def test_get_station_topology():
    res = client.get("/api/stations/TPJ/topology")
    assert res.status_code == 200
    topo = res.json()
    assert topo["code"] == "TPJ"
    assert topo["platform_count"] == 8
    assert len(topo["crossovers"]) >= 2
    assert "Electronic Interlocking" in topo["interlocking_type"]


def test_get_tracks():
    res = client.get("/api/tracks")
    assert res.status_code == 200
    tracks = res.json()
    assert len(tracks) >= 26
    for t in tracks:
        assert "track_id" in t
        assert t["speed_limit_kmh"] >= 30


def test_get_loops():
    res = client.get("/api/loops")
    assert res.status_code == 200
    loops = res.json()
    assert len(loops) >= 12
    for l in loops:
        assert l["length_m"] >= 700


def test_get_sidings():
    res = client.get("/api/sidings")
    assert res.status_code == 200
    sidings = res.json()
    assert len(sidings) >= 10
    purposes = [s["purpose"] for s in sidings]
    assert any("Cement" in p for p in purposes)
    assert any("EMU" in p for p in purposes)


def test_get_yards():
    res = client.get("/api/yards")
    assert res.status_code == 200
    yards = res.json()
    assert len(yards) >= 5
    names = [y["name"] for y in yards]
    assert any("Golden Rock" in n for n in names)


def test_get_assets():
    res = client.get("/api/assets")
    assert res.status_code == 200
    assets = res.json()
    assert len(assets) >= 10
    types = [a["asset_type"] for a in assets]
    assert "Bridge" in types
    assert "OHE Substation" in types
    assert "Signal" in types


def test_get_data_provenance():
    res = client.get("/api/data/provenance")
    assert res.status_code == 200
    data = res.json()
    assert data["data_mode"] == "HYBRID_DECISION_SUPPORT"
    assert len(data["provenance_registry"]) >= 4
