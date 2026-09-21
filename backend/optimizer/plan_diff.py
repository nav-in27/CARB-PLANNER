"""
CARB-Planner — Plan Diff & Explainability Engine

Calculates exact deterministic deltas between an old OperationalPlan
and a newly repaired/replanned OperationalPlan after a disruption event:
  - Detects added, removed, changed, and frozen allocations
  - Computes per-train delay breakdowns (+18m, +17m, etc.)
  - Identifies loop holding and track rerouting decisions
  - Formulates human-readable explanations derived from physical constraints
  - Supplies watermarks for UI rendering (REPLANNED, HELD, MOVED, REROUTED)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from backend.models.plan import SchedulePlan
from backend.models.task import MaintenanceTask
from backend.models.train import Train


def compare_plans(
    old_plan: Optional[SchedulePlan],
    new_plan: SchedulePlan,
    disruption_event: Optional[Any] = None,
    tasks_lookup: Optional[Dict[str, Any]] = None,
    services_lookup: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Compare previous committed plan with repaired operational plan.

    Returns structured diff with per-train and per-maintenance changes.
    """
    if not old_plan:
        return {
            "has_changes": False,
            "changed_trains": [],
            "changed_maintenance": [],
            "changed_loops": [],
            "unchanged_trains_count": len(new_plan.train_assignments),
            "unchanged_maintenance_count": len(new_plan.allocations),
            "total_additional_delay_min": 0,
            "breakdown_by_train": {},
            "summary_headline": "Baseline Operational Plan committed.",
            "changed_object_ids": [],
        }

    old_allocs_by_task = {a.task_id: a for a in old_plan.allocations}
    new_allocs_by_task = {a.task_id: a for a in new_plan.allocations}

    old_trains_by_num = {t.get("train_number"): t for t in old_plan.train_assignments if t.get("train_number")}
    new_trains_by_num = {t.get("train_number"): t for t in new_plan.train_assignments if t.get("train_number")}

    disrupted_sec = getattr(disruption_event, "affected_section", "") if disruption_event else ""
    disrupt_type = getattr(disruption_event, "disruption_type", "") if disruption_event else ""
    if hasattr(disrupt_type, "value"):
        disrupt_type = disrupt_type.value

    # ── 1. Maintenance Changes ──
    changed_maintenance = []
    unchanged_maint_count = 0
    all_task_ids = set(old_allocs_by_task.keys()) | set(new_allocs_by_task.keys())

    for tid in all_task_ids:
        old_a = old_allocs_by_task.get(tid)
        new_a = new_allocs_by_task.get(tid)

        if not old_a and new_a:
            # Emergency or newly scheduled task
            start_m = new_a.start_slot * 15
            end_m = new_a.end_slot * 15
            changed_maintenance.append({
                "task_id": tid,
                "action": "ADDED",
                "watermark": "EMERGENCY_BLOCK",
                "old_window": None,
                "new_window": f"{start_m//60:02d}:{start_m%60:02d}–{end_m//60:02d}:{end_m%60:02d}",
                "old_slots": None,
                "new_slots": [new_a.start_slot, new_a.end_slot],
                "section_id": new_a.section_id,
                "shift_min": 0,
                "reason": f"Emergency possession injected for {disrupt_type or 'unplanned maintenance'}",
            })
        elif old_a and not new_a:
            # Cancelled or deferred
            start_m = old_a.start_slot * 15
            end_m = old_a.end_slot * 15
            changed_maintenance.append({
                "task_id": tid,
                "action": "CANCELLED",
                "watermark": "DEFERRED",
                "old_window": f"{start_m//60:02d}:{start_m%60:02d}–{end_m//60:02d}:{end_m%60:02d}",
                "new_window": "Deferred / Unsched",
                "old_slots": [old_a.start_slot, old_a.end_slot],
                "new_slots": None,
                "section_id": old_a.section_id,
                "shift_min": 0,
                "reason": "Possession cancelled/deferred to restore traffic throughput",
            })
        elif old_a and new_a:
            start_diff = (new_a.start_slot - old_a.start_slot) * 15
            sec_changed = old_a.section_id != new_a.section_id
            dur_diff = (new_a.end_slot - new_a.start_slot) - (old_a.end_slot - old_a.start_slot)

            if start_diff != 0 or sec_changed or dur_diff != 0:
                old_sm = old_a.start_slot * 15
                old_em = old_a.end_slot * 15
                new_sm = new_a.start_slot * 15
                new_em = new_a.end_slot * 15
                shift_sign = f"+{start_diff}" if start_diff > 0 else str(start_diff)
                changed_maintenance.append({
                    "task_id": tid,
                    "action": "MOVED",
                    "watermark": "↻ REPLANNED",
                    "old_window": f"{old_sm//60:02d}:{old_sm%60:02d}–{old_em//60:02d}:{old_em%60:02d}",
                    "new_window": f"{new_sm//60:02d}:{new_sm%60:02d}–{new_em//60:02d}:{new_em%60:02d}",
                    "old_slots": [old_a.start_slot, old_a.end_slot],
                    "new_slots": [new_a.start_slot, new_a.end_slot],
                    "section_id": new_a.section_id,
                    "shift_min": start_diff,
                    "reason": f"Shifted by {shift_sign} min to accommodate emergency disruption on {disrupted_sec or old_a.section_id}",
                })
            else:
                unchanged_maint_count += 1

    # ── 2. Train Movements Changes ──
    changed_trains = []
    unchanged_trains_count = 0
    total_add_delay = 0
    breakdown_by_train = {}

    all_train_nums = set(old_trains_by_num.keys()) | set(new_trains_by_num.keys())

    for tnum in all_train_nums:
        old_t = old_trains_by_num.get(tnum, {})
        new_t = new_trains_by_num.get(tnum, {})

        old_entry = old_t.get("scheduled_departure_min", old_t.get("entry_time_min", 0))
        new_entry = new_t.get("scheduled_departure_min", new_t.get("entry_time_min", 0))

        old_delay = old_t.get("delay_min", old_t.get("actual_delay_min", 0))
        new_delay = new_t.get("delay_min", new_t.get("actual_delay_min", 0))

        old_route = old_t.get("route", [])
        new_route = new_t.get("route", [])

        old_loop = old_t.get("loop_used")
        new_loop = new_t.get("loop_used")

        delay_delta = new_delay - old_delay
        if delay_delta < 0 and new_entry > old_entry:
            delay_delta = new_entry - old_entry

        is_rerouted = new_route != old_route if (old_route and new_route) else new_t.get("is_rerouted", False)
        is_held = new_t.get("is_held", False) or (new_loop and not old_loop)
        time_shifted = abs(new_entry - old_entry) >= 5 or delay_delta > 0

        if time_shifted or is_rerouted or is_held or (new_loop != old_loop):
            action = "HELD" if is_held else ("REROUTED" if is_rerouted else "RETIMED")
            watermark = f"↻ {action}"

            # Derive explanation
            if is_held and new_loop:
                reason = f"Held at {new_t.get('held_at_station', 'station')} crossing loop ({new_loop}) while track isolated"
            elif is_rerouted:
                reason = f"Rerouted via alternate track to bypass blocked section {disrupted_sec}"
            elif delay_delta > 0:
                reason = f"Delayed by +{delay_delta}m due to headway regulation and single line working"
            else:
                reason = f"Rescheduled entry slot ({new_entry//60:02d}:{new_entry%60:02d}) to clear maintenance possession"

            changed_trains.append({
                "train_number": tnum,
                "train_name": new_t.get("train_name", old_t.get("train_name", f"Train {tnum}")),
                "action": action,
                "watermark": watermark,
                "old_departure": f"{old_entry//60:02d}:{old_entry%60:02d}",
                "new_departure": f"{new_entry//60:02d}:{new_entry%60:02d}",
                "old_delay_min": old_delay,
                "new_delay_min": new_delay,
                "delay_delta_min": max(0, delay_delta),
                "loop_used": new_loop,
                "held_station": new_t.get("held_at_station"),
                "reason": reason,
            })
            if delay_delta > 0:
                total_add_delay += delay_delta
                breakdown_by_train[tnum] = delay_delta
        else:
            unchanged_trains_count += 1

    # ── 3. Changed Loops ──
    changed_loops = []
    if new_plan.loop_routing_decisions:
        for d in new_plan.loop_routing_decisions:
            changed_loops.append({
                "loop_id": d.get("loop_id", "LOOP-01"),
                "station_code": d.get("station_code", "VRI"),
                "train_number": d.get("train_number", "22xxx"),
                "reason": d.get("reason", "Crossing loop regulation to avoid headway deadlock"),
            })
    elif any(t.get("loop_used") for t in changed_trains):
        for t in changed_trains:
            if t.get("loop_used"):
                changed_loops.append({
                    "loop_id": t["loop_used"],
                    "station_code": t.get("held_station", "STN"),
                    "train_number": t["train_number"],
                    "reason": t["reason"],
                })

    # Summary headline
    total_changed = len(changed_trains) + len(changed_maintenance)
    has_changes = total_changed > 0
    headline = (
        f"{len(changed_trains)} train movements, "
        f"{len(changed_maintenance)} maintenance tasks, "
        f"{len(changed_loops)} loop assignments changed"
    )

    changed_object_ids = [t["train_number"] for t in changed_trains] + [m["task_id"] for m in changed_maintenance]

    return {
        "has_changes": has_changes,
        "changed_trains": changed_trains,
        "changed_maintenance": changed_maintenance,
        "changed_loops": changed_loops,
        "unchanged_trains_count": unchanged_trains_count,
        "unchanged_maintenance_count": unchanged_maint_count,
        "total_additional_delay_min": total_add_delay,
        "breakdown_by_train": breakdown_by_train,
        "summary_headline": headline,
        "changed_object_ids": changed_object_ids,
        "trigger": disruption_event.description if disruption_event else "Localized LNS Replanning",
        "affected_section": disrupted_sec,
    }
