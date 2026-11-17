"""Cloud integration at the runner claim and reconciliation boundaries."""
import sys

import cloud_lane


def execution_gate(runner, host, issue, linear, name, claimed) -> dict | None:
    """JOV-10357: the single cloud chokepoint in the claimed execution path.

    Runs after the durable execution claim and before any lane launch (worktree take,
    install, prompt, agent). Fully dormant unless LANES_CLOUD_ENABLED is set: the gate
    returns None and the local lane runs unchanged. A live cloud claim blocks every
    ordinary intake and recovery path before any provider call (R4); the claim is
    retained asynchronously and only a human clears it.
    """
    if not cloud_lane.enabled():
        return None
    live = cloud_lane.live_claim(issue.identifier)
    if live is not None:
        return {"verdict": live["stage"], "reason": f"cloud-claim-live:{live.get('reason', 'active')}",
                "pr": live.get("pr"), "prUrl": live.get("prUrl"), "issue": issue.identifier}
    labels = {str(label).lower() for label in issue.labels}
    if cloud_lane.OPT_IN_LABEL not in labels:
        return None
    ok, _why = cloud_lane.eligible(issue.labels, issue.title + "\n" + (issue.description or ""))
    if not ok:
        return None
    prompt = runner.render_prompt(issue, "main", runner.context_pack(issue), provider=name,
                           prior_attempts=runner.prior_attempts_context(host, linear, issue),
                           machine=runner.machine_gate(host, issue.identifier, issue.title, issue.labels,
                                                issue.description or "", name))
    route = cloud_lane.route(issue.identifier, "codex", issue.labels,
                             issue.title + "\n" + (issue.description or ""), prompt,
                             fencing_token=claimed.get("fencingToken"))
    if route.get("route") == "gem":
        return None  # headroom or provider configuration fell back: the local lane runs
    if route.get("route") == "cloud":
        return {"verdict": "cloud-pending", "reason": f"submitted:{route['remote']}",
                "remote": route["remote"], "branch": route["branch"], "issue": issue.identifier}
    return {"verdict": "cloud-held", "reason": route.get("reason", "unknown"), "issue": issue.identifier}


def record_receipt(runner, runs, receipt, cloud):
    # JOV-10357 (R4): cloud dispositions are explicit and never return to Todo; the
    # durable execution claim stays live with the cloud claim so cleanup and retry skip.
    receipt.update(verdict=cloud["verdict"], reasons=[cloud["reason"]], cloud=cloud,
                   endedAt=runner.now_iso(),
                   result={"verdict": cloud["verdict"], "pr": cloud.get("pr"),
                           "commit": cloud.get("commitSha"), "prUrl": cloud.get("prUrl")})
    runner.append_json_object(runs / "ledger.jsonl", receipt)
    return receipt


def reconcile_turn(host):
    if cloud_lane.enabled():
        # JOV-10357 reconciliation turn (R7): the worker slot's reconciliation step
        # (requeue_verified above) is immediately followed by the cloud lane's
        # status -> collect -> authorize -> draft-publish pass. Dormant by default.
        try:
            cloud_lane.reconcile(repo_dir=host.repo)
        except Exception as error:
            print(f"cloud reconcile failed: {type(error).__name__}: {error}"[:300], file=sys.stderr)


def retain_disposition(linear, issue, receipt, slot):
    verdict = receipt.get("verdict")
    if verdict in cloud_lane.RETAINED_VERDICTS:
        # JOV-10357 (R4): cloud-pending / cloud-held / cloud-draft-created never fall
        # through to the failure handler, never return to Todo, and never fail over to
        # another lane; the durable cloud claim is the hold until a human clears it.
        if verdict == "cloud-held":
            held = receipt.get("cloud") or {}
            paths = "".join(f"\n- `{path}`" for path in held.get("paths", []))
            linear.comment(issue.id, f"🤖 cloud lane held {issue.identifier} "
                                     f"({', '.join(receipt.get('reasons', []))}); retained for a human "
                                     f"decision.{paths}")
        slot.release()
        return True
    return False


def execute_claimed_issue(runner, host, name, spec, linear, issue):
    receipt = {}
    try:
        # A live cloud claim blocks the epic path too (JOV-10357 R4): run_issue's gate
        # then returns the retained disposition instead of a second provider call.
        cloud_blocked = cloud_lane.enabled() and cloud_lane.live_claim(issue.identifier) is not None
        receipt = (runner.epics.run_epic(runner, host, name, spec, linear, issue, host.repo)
                   if runner.epics.is_epic(issue) and not cloud_blocked
                   else runner.run_issue(host, name, spec, linear, issue))
    finally:
        if receipt.get("verdict") != "cloud-pending":
            # R4: an overlap reservation is not released while an issue is cloud-pending.
            runner.file_overlap.release_task(host.state, issue.identifier)
    return receipt
