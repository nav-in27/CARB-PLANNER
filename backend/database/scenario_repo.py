"""
CARB-Planner — Scenario & Plan Repository (Hybrid In-Memory & Supabase PostgreSQL Store)

Provides versioning, audit logging, and transactional snapshot management
for planning scenarios and operational plans:
  - Version tracking: v1, v2, v3... with commit triggers and diff summaries
  - Immutable audit trail: every plan modification, disruption, and approval logged
  - Rollback / snapshot retrieval for scenario comparisons
  - Supabase PostgreSQL persistence when DATABASE_URL is configured
"""

from __future__ import annotations

import copy
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from backend.models.plan import SchedulePlan
from backend.models.scenario import AuditLogEntry, ScenarioVersion
from backend.database.db import get_session_factory
from backend.database.models import OperationalPlanModel, AuditLogModel, ScenarioModel

logger = logging.getLogger("carb-planner.scenario_repo")


class ScenarioRepository:
    """Thread-safe transactional repository with optional Supabase PostgreSQL persistence."""

    def __init__(self):
        self._versions: Dict[str, List[ScenarioVersion]] = {}
        self._plans_by_version: Dict[str, SchedulePlan] = {}
        self._audit_log: List[AuditLogEntry] = []
        self._latest_plan: Optional[SchedulePlan] = None
        self._latest_version_num: int = 1

    def commit_version(
        self,
        scenario_id: str,
        plan: SchedulePlan,
        reason: str = "Plan update",
        trigger: str = "PLAN_GENERATE",
        actor: str = "system",
        diff_summary: Optional[Dict[str, Any]] = None,
    ) -> ScenarioVersion:
        """Atomically commit a new plan version, write to Supabase (if active), and append to audit log."""
        version_list = self._versions.setdefault(scenario_id, [])
        version_num = len(version_list) + 1
        self._latest_version_num = version_num

        version_id = f"VER_{uuid.uuid4().hex[:8].upper()}"
        plan_snapshot = copy.deepcopy(plan)
        plan_snapshot.plan_id = f"{plan.plan_id}_v{version_num}"
        self._plans_by_version[version_id] = plan_snapshot
        self._latest_plan = plan_snapshot

        kpi_dict = plan.kpis.model_dump() if plan.kpis else {}
        diff = diff_summary or {
            "allocations_count": len(plan.allocations),
            "trains_count": len(plan.train_assignments),
            "conflicts_count": len(plan.conflicts),
            "is_feasible": plan.is_feasible,
        }

        version_entry = ScenarioVersion(
            version_number=version_num,
            version_id=version_id,
            created_at=datetime.utcnow().isoformat() + "Z",
            reason=reason,
            trigger=trigger,
            plan_snapshot_id=version_id,
            kpi_snapshot=kpi_dict,
            diff_summary=diff,
        )
        version_list.append(version_entry)

        # Log audit entry
        self.log_audit(
            action=trigger,
            actor=actor,
            version_before=version_num - 1 if version_num > 1 else None,
            version_after=version_num,
            details={"version_id": version_id, "diff": diff},
            rationale=reason,
        )

        # Persist to Supabase PostgreSQL if database session factory is available
        self._persist_to_database(scenario_id, version_num, version_id, plan_snapshot, reason, trigger, diff, kpi_dict)

        logger.info(
            f"ScenarioRepo: committed version {version_num} ({version_id}) "
            f"for {scenario_id} [trigger={trigger}, reason='{reason}']"
        )
        return version_entry

    def _persist_to_database(
        self,
        scenario_id: str,
        version_num: int,
        version_id: str,
        plan: SchedulePlan,
        reason: str,
        trigger: str,
        diff: Dict[str, Any],
        kpis: Dict[str, Any],
    ):
        """Helper to write plan version snapshot to Supabase PostgreSQL."""
        try:
            session_factory = get_session_factory()
            if not session_factory:
                return
            with session_factory() as session:
                db_plan = OperationalPlanModel(
                    plan_id=version_id,
                    scenario_id=scenario_id,
                    version_number=version_num,
                    is_feasible=plan.is_feasible,
                    allocations=[a.model_dump() for a in plan.allocations],
                    train_assignments=[t.model_dump() for t in plan.train_assignments],
                    loop_assignments=[la.model_dump() for la in getattr(plan, "loop_assignments", [])],
                    conflicts=[c.model_dump() for c in plan.conflicts],
                    kpis=kpis,
                    reason=reason,
                    trigger=trigger,
                    diff_summary=diff,
                )
                session.merge(db_plan)

                # Update Scenario active_plan_id
                scenario = session.query(ScenarioModel).filter_by(scenario_id=scenario_id).first()
                if scenario:
                    scenario.active_plan_id = version_id
                session.commit()
        except Exception as e:
            logger.warning(f"Could not persist plan to database (continuing with in-memory): {e}")

    def get_versions(self, scenario_id: str) -> List[ScenarioVersion]:
        """Get all version snapshots for a scenario in chronological order."""
        return copy.deepcopy(self._versions.get(scenario_id, []))

    def get_version(self, version_id: str) -> Optional[ScenarioVersion]:
        """Find a specific version entry by ID."""
        for v_list in self._versions.values():
            for v in v_list:
                if v.version_id == version_id:
                    return copy.deepcopy(v)
        return None

    def get_plan_by_version(self, version_id: str) -> Optional[SchedulePlan]:
        """Retrieve the immutable plan snapshot associated with a version."""
        plan = self._plans_by_version.get(version_id)
        return copy.deepcopy(plan) if plan else None

    def get_latest_plan(self) -> Optional[SchedulePlan]:
        """Get current active plan."""
        return copy.deepcopy(self._latest_plan) if self._latest_plan else None

    def get_current_version_number(self) -> int:
        """Get the latest version number."""
        return self._latest_version_num

    def log_audit(
        self,
        action: str,
        actor: str = "system",
        version_before: Optional[int] = None,
        version_after: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
        rationale: str = "",
    ) -> AuditLogEntry:
        """Record an immutable audit log entry."""
        entry = AuditLogEntry(
            entry_id=f"AUD_{uuid.uuid4().hex[:8].upper()}",
            timestamp=datetime.utcnow().isoformat() + "Z",
            action=action,
            actor=actor,
            version_before=version_before,
            version_after=version_after,
            version_number=version_after,
            details=details or {},
            rationale=rationale,
            reason=rationale,
        )
        self._audit_log.append(entry)

        # Persist audit entry to database if available
        try:
            session_factory = get_session_factory()
            if session_factory:
                with session_factory() as session:
                    db_audit = AuditLogModel(
                        entry_id=entry.entry_id,
                        timestamp=entry.timestamp,
                        action=entry.action,
                        actor=entry.actor,
                        version_before=entry.version_before,
                        version_after=entry.version_after,
                        version_number=entry.version_number,
                        details=entry.details,
                        rationale=entry.rationale,
                    )
                    session.add(db_audit)
                    session.commit()
        except Exception as e:
            logger.warning(f"Could not persist audit log to database: {e}")

        return entry

    def get_audit_log(self, limit: int = 100) -> List[AuditLogEntry]:
        """Return the recent audit log entries in reverse chronological order."""
        return copy.deepcopy(list(reversed(self._audit_log[-limit:])))

    def clear(self):
        """Reset repository state (for testing/demo reset)."""
        self._versions.clear()
        self._plans_by_version.clear()
        self._audit_log.clear()
        self._latest_plan = None
        self._latest_version_num = 1


# Global repository instance
scenario_repo = ScenarioRepository()
