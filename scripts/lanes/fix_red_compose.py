"""Compose every deterministic fix-red class on one head, then run them with no model.

Split from fix_red_classes and lane_runner so those files stay inside the company
size ceiling. Stamp the body before a fixer push. An action outside the leaf order
(alias graduation) is not run as a partial compose.
"""
from __future__ import annotations

import types


def compose_actions(actions: list[str]) -> list[str]:
    """Stable order for leaf actions. Drops anything outside the order, including `compose`."""
    import fix_red_classes as classes

    order = (
        classes.SYNC_MAIN, classes.STAMP_CHANGELOG, classes.WIRE_CI_FAST, classes.RENUMBER,
        classes.SNAP_SPACING, classes.STRIP_CACHE, classes.MERGE_NARROWED, classes.REGISTER_DOMAIN,
        classes.ATOMIC_WRITE, classes.REPAIR_SCREEN_CERT, classes.BALANCE_HEADINGS, classes.RERUN)
    rank = {name: index for index, name in enumerate(order)}
    chosen: list[str] = []
    for action in actions:
        if action in rank and action not in chosen:
            chosen.append(action)
    return sorted(chosen, key=rank.__getitem__)


def composed_route(raw: list[str], compose: str, agent: str) -> tuple[str, str, list[str]]:
    """(cls, action, actions). A dropped leaf becomes mixed/agent and runs nothing here."""
    actions = compose_actions(raw)
    if len(actions) != len(dict.fromkeys(raw)):
        return "mixed", agent, []
    if len(actions) > 1:
        return "composed", compose, actions
    if len(actions) == 1:
        # Two classes, one leaf (census + design both sync). The single-action route runs it.
        return "composed", actions[0], actions
    return "mixed", agent, []


def deterministic_fixer(lane, action: str):
    """Resolve leaf fixers on the owning runner, including after a loader rebind."""
    import fix_red_classes as classes

    return lane.fix_red_screen_cert.dispatch(classes, lane.sh, {
        "wire": lane.wire_ci_fast_fix, "atomic": lane.atomic_state_fix,
        "renumber": lane.renumber_migrations_fix, "snap": lane.snap_spacing_fix,
        "strip": lane.strip_cache_exports_fix, "merge": lane.merge_narrowed_preflight_fix,
        "register": lane.register_domain_writes_fix,
    }).get(action)


def compose_deterministic_fix(lane, host, pr, route, worktree, log, receipt):
    """Run every deterministic action on one red head. None sends the head to the model."""
    import fix_red_classes as classes

    actions = compose_actions(route.get("actions") or [])
    if len(actions) < 2 or any(action not in classes.DETERMINISTIC for action in actions):
        return None
    agent = None
    done = []
    for action in actions:
        if action == classes.STAMP_CHANGELOG:
            if not lane.stamp_changelog_decision(host, pr):
                return None
        elif action == classes.RERUN:
            if not lane._rerun_failed(pr):
                return None
        elif action == classes.SYNC_MAIN:
            if lane.pr_events.sync_main(host, lane.THIS, pr, lane.time.time(), terminal_ok=True) != "synced":
                return None
        else:
            fixer = deterministic_fixer(lane, action)
            if fixer is None or (agent := fixer(host, pr, route, worktree, log, receipt)) is None:
                return None
        done.append(action)
    receipt["composedActions"] = done
    receipt["resolution"] = "composed-deterministic"
    return agent or types.SimpleNamespace(returncode=0)
