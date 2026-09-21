"""Quick smoke test: generate data, train ML, run CP-SAT, print plan."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.data.generator import generate_demo_scenario
from backend.ml.duration_model import DurationPredictor
from backend.ml.risk_model import RiskPredictor
from backend.optimizer.cp_sat import solve_block_plan
from backend.optimizer.greedy_baseline import solve_greedy
from backend.simulation.railway_sim import compute_detailed_kpis
from backend.explanations.generator import generate_explanations

print("=" * 60)
print("CARB-Planner — Backend Smoke Test")
print("=" * 60)

# Phase 1: Generate data
print("\n[1] Generating synthetic railway data...")
scenario = generate_demo_scenario(seed=42)
network = scenario["network"]
trains = scenario["trains"]
tasks = scenario["tasks"]
print(f"    Stations: {len(network.stations)}")
print(f"    Sections: {len(network.sections)}")
print(f"    Trains: {len(trains)}")
print(f"    Tasks: {len(tasks)}")

# Phase 2: Train ML models
print("\n[2] Training ML models...")
dur_pred = DurationPredictor()
dur_pred.train(seed=42)
print(f"    Duration model: {dur_pred.model_type}")

risk_pred = RiskPredictor()
risk_pred.train(seed=42)
print(f"    Risk model: {risk_pred.model_type}")

# Phase 3: Apply predictions
print("\n[3] Applying AI predictions to tasks...")
tasks = dur_pred.predict_all(tasks)
tasks = risk_pred.predict_all(tasks)
for t in tasks:
    print(f"    {t.task_id}: P50={t.predicted_p50_min}min P90={t.predicted_p90_min}min Risk={t.risk_level.value} ({t.risk_score:.2f})")

# Phase 4: Run CP-SAT optimizer
print("\n[4] Running CP-SAT block optimizer...")
plan = solve_block_plan(network, tasks, trains, horizon_slots=96, time_limit_sec=30.0)
print(f"    Status: {plan.solver_status}")
print(f"    Feasible: {plan.is_feasible}")
print(f"    Solve time: {plan.solve_time_sec:.3f}s")
print(f"    Allocations: {len(plan.allocations)}")

if plan.is_feasible:
    plan.kpis = compute_detailed_kpis(plan, network)
    print(f"\n    === KPIs ===")
    print(f"    Asset Availability: {plan.kpis.asset_availability_pct}%")
    print(f"    Maintenance Completed: {plan.kpis.maintenance_completed}/{plan.kpis.maintenance_total}")
    print(f"    Train Delay: {plan.kpis.total_train_delay_min} min")
    print(f"    Conflicts: {plan.kpis.conflicts}")
    print(f"    Critical Scheduled: {plan.kpis.critical_tasks_scheduled}/{plan.kpis.critical_tasks_total}")

    print(f"\n    === Block Plan ===")
    for a in plan.allocations:
        start_h = (a.start_slot * 15) // 60
        start_m = (a.start_slot * 15) % 60
        end_h = (a.end_slot * 15) // 60
        end_m = (a.end_slot * 15) % 60
        print(f"    {a.task_id}: Section {a.section_id} | {start_h:02d}:{start_m:02d}-{end_h:02d}:{end_m:02d} | {a.department}")

    # Phase 5: Generate explanations
    print(f"\n[5] Generating explanations...")
    explanations = generate_explanations(plan)
    for tid, exp in explanations.items():
        print(f"\n    --- {tid} ({exp.status.value}) ---")
        for line in exp.reason_lines:
            print(f"    • {line}")
        if exp.competing_task_id:
            print(f"    Competing: {exp.competing_task_id}")
            print(f"    {exp.competing_reason}")
        if exp.alternative_window:
            print(f"    Alternative: {exp.alternative_window}")
        print(f"    Confidence: {exp.decision_confidence}")

    # Phase 6: Run greedy baseline
    print(f"\n[6] Running greedy baseline...")
    import copy
    greedy_tasks = copy.deepcopy(tasks)
    greedy_trains = copy.deepcopy(trains)
    greedy_plan = solve_greedy(network, greedy_tasks, greedy_trains)
    greedy_plan.kpis = compute_detailed_kpis(greedy_plan, network)

    print(f"\n    === Comparison ===")
    print(f"    {'Metric':<30} {'CARB':>10} {'Greedy':>10}")
    print(f"    {'-'*50}")
    print(f"    {'Maintenance Completed':<30} {plan.kpis.maintenance_completed:>10} {greedy_plan.kpis.maintenance_completed:>10}")
    print(f"    {'Asset Availability %':<30} {plan.kpis.asset_availability_pct:>10.1f} {greedy_plan.kpis.asset_availability_pct:>10.1f}")
    print(f"    {'Train Delay (min)':<30} {plan.kpis.total_train_delay_min:>10} {greedy_plan.kpis.total_train_delay_min:>10}")
    print(f"    {'Conflicts':<30} {plan.kpis.conflicts:>10} {greedy_plan.kpis.conflicts:>10}")

else:
    print(f"\n    INFEASIBLE: {plan.infeasibility_reason}")

print("\n" + "=" * 60)
print("Smoke test complete!")
print("=" * 60)
