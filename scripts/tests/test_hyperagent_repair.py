"""End-to-end Hyperagent remote PR repair against a fake Hyperagent and a fake GitHub.

The fake Hyperagent reads the repair prompt and "pushes" to the PR branch exactly as the
real agent would (a new tip carrying the attempt trailer); the fake GitHub then runs the
required checks. Every GitHub and Hyperagent call goes through the injected seams.
"""
import json
import re
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import hyperagent_repair as repair  # noqa: E402

NOW = 1_800_000_000.0


def iso(at):
    return datetime.fromtimestamp(at, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha(n):
    return f"{n:040x}"


class FakeWorld:
    """GitHub + Hyperagent for one test. `pushes` controls what the agent does."""

    def __init__(self, test):
        self.test = test
        self.clock_at = NOW
        self.prs = {}
        self.commits = {}
        self.checks = {}
        self.comments = {}
        self.calls = []
        self.threads = {}
        self.push_mode = "attributed"   # attributed | none | unattributed
        self.check_outcome = "pass"     # pass | fail
        self.remote_runs_forever = False
        self.next_comment = 100

    # -- fixtures
    def add_pr(self, number, *, state="DIRTY", title="fix: something", labels=(), created="2026-10-01T00:00:00Z",
               head_age=3600, head_message="feat: work", draft=False):
        head = sha(number)
        self.prs[number] = {"number": number, "title": title, "url": f"https://github.com/JovieInc/Jovie/pull/{number}",
                            "createdAt": created, "isDraft": draft, "headRefName": f"tim/branch-{number}",
                            "headRefOid": head, "mergeStateStatus": state, "isCrossRepository": False,
                            "labels": [{"name": name} for name in labels], "state": "OPEN"}
        self.commits[head] = {"date": iso(self.clock_at - head_age), "message": head_message}
        self.checks[number] = [{"name": "CI / unit", "bucket": "fail" if state != "DIRTY" else "pass",
                                "link": f"https://github.com/JovieInc/Jovie/actions/runs/1/job/{number}"}]

    # -- seams
    def clock(self):
        return self.clock_at

    def sleep(self, seconds):
        self.clock_at += max(seconds, 1)
        # Checks on a pushed head settle after the first poll.
        for number, pr in self.prs.items():
            if pr.get("pushedAwaitingChecks"):
                pr["pushedAwaitingChecks"] = False
                self.checks[number] = [{"name": "CI / unit", "bucket": self.check_outcome, "link": ""}]
                pr["mergeStateStatus"] = "CLEAN" if self.check_outcome == "pass" else "BLOCKED"

    def out(self, payload, code=0):
        return subprocess.CompletedProcess([], code, json.dumps(payload) if payload is not None else "", "")

    def gh(self, args):
        self.calls.append(("gh", list(args)))
        if args[:2] == ["pr", "list"]:
            return self.out([dict(pr) for pr in self.prs.values()])
        if args[:2] == ["pr", "checks"]:
            return self.out(self.checks[int(args[2])], 8)
        if args[:2] == ["pr", "view"]:
            pr = self.prs[int(args[2])]
            return self.out({key: pr[key] for key in ("state", "headRefOid", "mergeStateStatus")})
        if args[:2] == ["pr", "comment"]:
            self.comments[self.next_comment] = {"pr": int(args[2]), "body": args[args.index("--body") + 1]}
            self.next_comment += 1
            return self.out({})
        if args[:2] == ["run", "view"]:
            return subprocess.CompletedProcess([], 0, "unit\tstep\tError: expected 1 received 2\nunit\tstep\tok\n", "")
        if args[0] == "api":
            path = next(a for a in args[1:] if not a.startswith("-") and a not in ("DELETE",))
            if "-X" in args and args[args.index("-X") + 1] == "DELETE":
                self.comments.pop(int(path.rsplit("/", 1)[1]), None)
                return self.out(None)
            if path.endswith("/comments") and "-f" in args:
                number = int(path.split("/")[-2])
                self.comments[self.next_comment] = {"pr": number, "body": args[args.index("-f") + 1][5:]}
                self.next_comment += 1
                return self.out({"id": self.next_comment - 1})
            if "/comments?" in path:  # claim_active read
                number = int(path.split("/issues/")[1].split("/")[0])
                bodies = [c["body"] for c in self.comments.values() if c["pr"] == number and c["body"].startswith("🤖 lane claim ")]
                return subprocess.CompletedProcess([], 0, "\n".join(bodies), "")
            if "/commits/" in path:
                return self.out(self.commits.get(path.rsplit("/", 1)[1]))
            if "/compare/" in path:
                return self.out({"status": "ahead"})
        raise AssertionError(f"unexpected gh call {args}")

    def call(self, name, args):
        self.calls.append(("hyperagent", name))
        if name == "list_agents":
            return {"agents": [{"id": "agent-1", "name": "GLM 5.3 Developer", "executionMode": "auto"}]}
        if name == "create_thread":
            prompt = args["message"]
            number = int(re.search(r"PR #(\d+)", prompt).group(1))
            attempt = re.search(r"Hyperagent-Repair: ([a-f0-9]+)", prompt).group(1)
            thread = f"thread-{len(self.threads) + 1}"
            self.threads[thread] = {"pr": number, "attempt": attempt, "prompt": prompt, "polls": 0}
            return {"threadId": thread}
        if name == "get_thread":
            job = self.threads[args["threadId"]]
            job["polls"] += 1
            running = self.remote_runs_forever or job["polls"] < 2
            payload = {"thread": {"id": args["threadId"], "namedAgentId": "agent-1"},
                       "isRunning": running, "awaitingApproval": False, "messages": []}
            if not running:
                payload["messages"] = [{"role": "assistant", "content": self.agent_push(job)}]
            return payload
        raise AssertionError(f"unexpected hyperagent call {name}")

    def agent_push(self, job):
        """What the remote agent does on the PR branch."""
        if self.push_mode == "none":
            return "no-change: could not resolve"
        pr = self.prs[job["pr"]]
        new = sha(10_000 + job["pr"])
        trailer = f"\n\nHyperagent-Repair: {job['attempt']}\nLane-Receipt: x" if self.push_mode == "attributed" else ""
        self.commits[new] = {"date": iso(self.clock_at), "message": "Merge origin/main" + trailer}
        pr.update(headRefOid=new, mergeStateStatus="BLOCKED", pushedAwaitingChecks=True)
        self.checks[job["pr"]] = [{"name": "CI / unit", "bucket": "pending", "link": ""}]
        return f"pushed: {new}"


class HyperagentRepairTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name) / "state"
        self.bridge = Path(self.tmp.name) / "bridge"
        self.bridge.mkdir()
        self.world = FakeWorld(self)
        self.spec = {"model": "z-ai/glm-5.3", "agentId": "agent-1", "agentName": "GLM 5.3 Developer"}

    def tearDown(self):
        self.tmp.cleanup()

    def deps(self, **overrides):
        proof = {"agentId": "agent-1", "model": "z-ai/glm-5.3"}
        return repair.Deps(state=self.state, gh=self.world.gh, call=self.world.call, spec=self.spec,
                           bridge_dir=self.bridge, cap=24, host="gem", clock=self.world.clock,
                           sleep=self.world.sleep, refresh=lambda spec, now: (proof, None), **overrides)

    def attempts(self):
        path = self.state / "fix-attempts.json"
        return json.loads(path.read_text()) if path.exists() else {}

    def ledger(self):
        return [json.loads(line) for line in (self.state / "runs/ledger.jsonl").read_text().splitlines()]

    def created(self):
        return [c for c in self.world.calls if c == ("hyperagent", "create_thread")]

    def test_conflict_repair_end_to_end_is_attributed_verified_and_released(self):
        self.world.add_pr(41)
        receipt = repair.repair(self.deps())
        self.assertEqual(receipt["verdict"], "repaired")
        self.assertTrue(receipt["success"])
        self.assertEqual(receipt["repairKind"], "conflict")
        self.assertEqual(receipt["pushedHead"], sha(10_041))
        self.assertTrue(receipt["replyMatchesHead"])
        self.assertIn(f"Hyperagent-Repair: {receipt['attempt']}", self.world.commits[receipt["pushedHead"]]["message"])
        prompt = self.world.threads["thread-1"]["prompt"]
        self.assertIn("Merge origin/main into the branch", prompt)
        self.assertIn("tim/branch-41", prompt)
        self.assertIn("never force-push", prompt)
        for stamp in ("startedAt", "leasedAt", "dispatchedAt", "remoteDoneAt", "pushSeenAt", "checksSettledAt", "endedAt"):
            self.assertIn(stamp, receipt["stamps"])
        # Lane receipt in the shared ledger, prompt counted toward today's cap.
        self.assertEqual(self.ledger()[-1]["runId"], receipt["runId"])
        self.assertEqual(repair.runs_today(self.deps()), 1)
        # Lease released: record ended with the pushed head, no local attempt charged, claim deleted.
        record = self.attempts()["41"]
        self.assertIn("endedAt", record)
        self.assertEqual(record["pushedHead"], sha(10_041))
        self.assertEqual(record["count"], 0)
        self.assertFalse(any("lane claim" in c["body"] for c in self.world.comments.values()))
        self.assertTrue(any("hyperagent repair verdict=repaired" in c["body"] for c in self.world.comments.values()))

    def test_red_check_repair_sends_the_log_excerpt(self):
        self.world.add_pr(42, state="BLOCKED")
        receipt = repair.repair(self.deps())
        self.assertEqual((receipt["repairKind"], receipt["verdict"]), ("red", "repaired"))
        self.assertEqual(receipt["failedChecks"], ["CI / unit"])
        self.assertIn("Error: expected 1 received 2", self.world.threads["thread-1"]["prompt"])

    def test_red_checks_after_push_are_not_success_and_release_the_lease(self):
        self.world.add_pr(43)
        self.world.check_outcome = "fail"
        receipt = repair.repair(self.deps())
        self.assertEqual(receipt["verdict"], "checks-red")
        self.assertFalse(receipt["success"])
        self.assertIn("endedAt", self.attempts()["43"])
        free = repair.Flock(self.state / "locks/repair-pr-43.lock")
        self.assertTrue(free.held)
        free.release()

    def test_no_push_and_unattributed_push_fail(self):
        self.world.add_pr(44)
        self.world.push_mode = "none"
        self.assertEqual(repair.repair(self.deps())["verdict"], "no-push")
        self.world.push_mode = "unattributed"
        self.world.clock_at += 3600
        receipt = repair.repair(self.deps())
        self.assertEqual(receipt["verdict"], "unattributed-push")
        self.assertFalse(receipt["success"])

    def test_daily_cap_is_shared_with_the_bridge_and_issue_runs(self):
        self.world.add_pr(45)
        stamp = datetime.fromtimestamp(NOW, timezone.utc)
        (self.bridge / f"runs-{stamp:%Y-%m-%d}.txt").write_text("20")
        runs = self.state / "runs"
        runs.mkdir(parents=True)
        for i in range(4):
            (runs / f"{stamp:%Y%m%d}T0{i}0000Z-JOV-{i}-hyperagent-abc{i}.prompt.md").write_text("issue")
        receipt = repair.repair(self.deps())
        self.assertEqual(receipt["verdict"], "daily-cap")
        self.assertEqual(self.created(), [])
        self.assertEqual(repair.lane_turn.__name__, "lane_turn")

    def test_recent_foreign_push_and_hold_label_are_never_touched(self):
        self.world.add_pr(46, head_age=600)               # pushed 10 min ago by someone else
        self.world.add_pr(47, labels=("hold",))
        receipt = repair.repair(self.deps())
        self.assertEqual(receipt["verdict"], "idle")
        self.assertEqual(receipt["skipped"], [{"pr": 46, "reason": "recent-foreign-push"}])
        self.assertEqual(self.created(), [])

    def test_priority_revenue_then_compounding_then_oldest(self):
        self.world.add_pr(50, created="2026-09-01T00:00:00Z")
        self.world.add_pr(51, created="2026-10-01T00:00:00Z", labels=("compounding",))
        self.world.add_pr(52, created="2026-10-20T00:00:00Z", title="fix(billing): checkout retries")
        self.world.add_pr(53, created="2026-08-01T00:00:00Z")
        order = [pr["number"] for pr in repair.candidates(self.deps())]
        self.assertEqual(order, [52, 51, 53, 50])
        self.assertEqual(repair.repair(self.deps())["pr"], 52)

    def test_a_local_repair_lease_blocks_a_second_writer(self):
        self.world.add_pr(54)
        local = repair.Flock(self.state / "locks/repair-pr-54.lock")
        try:
            receipt = repair.repair(self.deps())
        finally:
            local.release()
        self.assertEqual(receipt["verdict"], "lease-unavailable")
        self.assertEqual(receipt["reasons"], ["lease-held-locally"])
        self.assertEqual(self.created(), [])

    def test_another_hosts_claim_blocks_a_second_writer(self):
        self.world.add_pr(55)
        self.world.comments[1] = {"pr": 55, "body": f"🤖 lane claim kind=fix sha={sha(55)} host=mac at={iso(NOW - 60)}"}
        self.assertEqual(repair.repair(self.deps())["reasons"], ["claimed-elsewhere"])

    def test_unknown_remote_outcome_keeps_the_lease_until_its_ttl(self):
        self.world.add_pr(56)
        self.world.remote_runs_forever = True
        receipt = repair.repair(self.deps(remote_timeout=60))
        self.assertEqual(receipt["verdict"], "remote-timeout")
        record = self.attempts()["56"]
        self.assertNotIn("endedAt", record)  # local lanes keep skipping it (in_flight) until FIX_LEASE_S
        self.assertTrue(any("lane claim kind=fix" in c["body"] for c in self.world.comments.values()))

    def test_lane_turn_reports_capped_so_the_issue_path_stops_too(self):
        stamp = datetime.fromtimestamp(NOW, timezone.utc)
        (self.bridge / f"runs-{stamp:%Y-%m-%d}.txt").write_text("24")
        deps = self.deps()
        original = repair.real_deps
        repair.real_deps = lambda state, spec: deps
        try:
            self.assertEqual(repair.lane_turn(self.state, {"remoteRepairs": True}), ("capped", None))
        finally:
            repair.real_deps = original


if __name__ == "__main__":
    unittest.main()
