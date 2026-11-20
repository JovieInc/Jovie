"""Scenario tests for the no-abandonment ledger (simulations.md S1-S10 are encoded here)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from noabandon import ledger as L  # noqa: E402

NOW = 1_795_110_000.0
HEAD = "00ea61c9e17d4ef47584af3d5df7781816370350"


def leased(lane="codex", attempts=(), **kw):
    lease = L.grant(None, lane=lane, worker_id=f"{lane}/w", head=HEAD, now=NOW, next_kind="ci_result",
                    item="JOV-1", pr=25253)
    for row in attempts:
        lease = L.record_attempt(lease, row)
    lease.update(kw)
    return lease


def row(lane, outcome="red", sig="s1", head=HEAD):
    return {"lane": lane, "sig": sig, "head": head, "outcome": outcome, "at": NOW}


class Signature(unittest.TestCase):
    def test_noise_does_not_split_one_failure_class(self):
        a = L.signature("Affected Unit Tests (4/4)", "Error at /tmp/x/a.ts:12:3 after 790s (sha 00ea61c9e1)", "1813089c")
        b = L.signature("Affected Unit Tests (4/4)", "Error at /tmp/y/a.ts:99:1 after 423s (sha 4bf5a38b36)", "1813089c")
        self.assertEqual(a, b)

    def test_different_check_is_a_different_class(self):
        self.assertNotEqual(L.signature("PR Ready", "x"), L.signature("Source Validation", "x"))


class OriginalWorkerGetsTheEvent(unittest.TestCase):
    def test_red_goes_back_to_holder_until_its_cap(self):
        lease = leased("codex", [row("codex"), row("codex")])
        self.assertEqual(L.next_rung(lease, origin="codex", head=HEAD, sig="s1", is_sensitive=False,
                                     cooldowns={}, now=NOW), "codex")

    def test_holder_cap_moves_to_next_rung_not_back(self):  # S1 thrash loop
        lease = leased("codex", [row("codex")] * 3)
        nxt = L.next_rung(lease, origin="codex", head=HEAD, sig="s1", is_sensitive=False, cooldowns={}, now=NOW)
        self.assertEqual(nxt, "deterministic")

    def test_new_signature_resets_the_holder_budget(self):
        lease = leased("codex", [row("codex")] * 3)
        self.assertEqual(L.next_rung(lease, origin="codex", head=HEAD, sig="s2", is_sensitive=False,
                                     cooldowns={}, now=NOW), "codex")


class UsageLimitHandoff(unittest.TestCase):
    def test_quota_release_cools_the_lane_and_skips_it(self):  # S3 quota burn
        lease, cools = L.release(leased("hyperagent"), "quota", NOW, {})
        self.assertGreater(cools["hyperagent"], NOW)
        nxt = L.next_rung(lease, origin="hyperagent", head=HEAD, sig="s1", is_sensitive=False, cooldowns=cools, now=NOW)
        self.assertEqual(nxt, "deterministic")

    def test_quota_does_not_consume_attempt_budget(self):
        lease = L.record_attempt(leased("hyperagent"), row("hyperagent", outcome="quota"))
        self.assertEqual(L.attempts_for(lease, HEAD, "s1"), 0)

    def test_silent_death_is_an_expired_lease(self):  # S8 54h dark gap
        lease = leased("codex")
        self.assertTrue(L.lease_live(lease, NOW + 60))
        self.assertFalse(L.lease_live(lease, NOW + L.TTL_S["codex"] + 1))
        item = {"state": "open", "lease": lease, "pending_run": False}
        self.assertEqual(L.disposition(item, NOW + L.TTL_S["codex"] + 1), "abandoned")

    def test_disabled_receiver_is_skipped_not_handled(self):  # the swarm-off-since-Nov-2 drop
        lease, _ = L.release(leased("codex"), "gave_up", NOW, {})
        nxt = L.next_rung(lease, origin="codex", head=HEAD, sig="s1", is_sensitive=False, cooldowns={}, now=NOW,
                          receivers_enabled={"deterministic": False, "swarm": False})
        self.assertEqual(nxt, "lanes")


class Renewal(unittest.TestCase):
    def test_bare_renew_is_capped_push_is_not(self):  # S6 gaming the heartbeat
        lease = leased("lanes")
        for _ in range(5):
            lease = L.renew(lease, NOW + 100, HEAD, pushed=False)
        self.assertEqual(lease["renewals"], L.MAX_RENEWALS_PER_HEAD)
        later = L.renew(lease, NOW + 9000, "newhead", pushed=False)
        self.assertFalse(L.lease_live(later, NOW + 9000 + L.TTL_S["lanes"] + 1))
        pushed = L.renew(lease, NOW + 9000, "newhead", pushed=True)
        self.assertTrue(L.lease_live(pushed, NOW + 9001))


class Ladder(unittest.TestCase):
    def test_sensitive_paths_skip_cheap_model_rungs(self):
        self.assertTrue(L.sensitive([".github/workflows/ci.yml"]))
        lease, _ = L.release(leased("codex"), "gave_up", NOW, {})
        nxt = L.next_rung(lease, origin="codex", head=HEAD, sig="s1", is_sensitive=True, cooldowns={}, now=NOW)
        self.assertEqual(nxt, "lanes")

    def test_item_lifetime_cap_escalates_to_owning_agent_not_tim(self):  # S5 unfixable PR
        lease = leased("codex", [row(l, sig=f"s{i}") for i, l in enumerate(["codex", "swarm", "lanes", "hyperagent",
                                                                                "codex", "swarm"])])
        self.assertEqual(L.next_rung(lease, origin="codex", head=HEAD, sig="s9", is_sensitive=False,
                                     cooldowns={}, now=NOW), "owning_agent")
        self.assertNotIn("tim", L.LADDER)

    def test_every_rung_spent_escalates(self):
        lease = leased("hyperagent", [row(l) for l in ("codex", "deterministic", "swarm", "lanes")])
        lease, _ = L.release(lease, "gave_up", NOW, {})
        self.assertEqual(L.next_rung(lease, origin="codex", head=HEAD, sig="s1", is_sensitive=False,
                                     cooldowns={}, now=NOW), "owning_agent")


class Disposition(unittest.TestCase):
    def test_owner_reserved_wait_is_not_abandoned_until_card_ages(self):  # S9 secrets/spend
        item = {"state": "open", "lease": None, "owner_card_at": NOW - 3600}
        self.assertEqual(L.disposition(item, NOW), "waiting_owner_reserved")
        self.assertEqual(L.disposition(item, NOW + L.OWNER_CARD_MAX_AGE_S), "abandoned")

    def test_dependency_on_abandoned_item_is_abandoned(self):
        self.assertEqual(L.disposition({"state": "open", "depends_on_state": "live"}, NOW), "waiting_dependency")
        self.assertEqual(L.disposition({"state": "open", "depends_on_state": "abandoned"}, NOW), "abandoned")

    def test_scheduled_run_counts_as_next_event(self):
        self.assertEqual(L.disposition({"state": "open", "pending_run": True}, NOW), "live")

    def test_only_verification_is_terminal(self):
        self.assertEqual(L.disposition({"state": "verified"}, NOW), "verified")
        self.assertEqual(L.disposition({"state": "merged"}, NOW), "abandoned")


class Swarm(unittest.TestCase):
    def test_merge_queue_always_wins(self):
        self.assertEqual(L.swarm_admission(capacity=60, in_progress_jobs=0, mq_queued_over_60s=True,
                                           red_without_lease=11, max_parallel=20), 0)

    def test_fan_out_is_bounded_by_verified_capacity(self):
        self.assertEqual(L.swarm_admission(capacity=60, in_progress_jobs=10, mq_queued_over_60s=False,
                                           red_without_lease=11, max_parallel=20), 6)
        self.assertEqual(L.swarm_admission(capacity=60, in_progress_jobs=40, mq_queued_over_60s=False,
                                           red_without_lease=11, max_parallel=20), 0)

    def test_kill_switch(self):
        self.assertEqual(L.swarm_admission(capacity=60, in_progress_jobs=0, mq_queued_over_60s=False,
                                           red_without_lease=11, max_parallel=20, enabled=False), 0)

    def test_shared_red_groups_one_fix(self):  # S2 ten PRs, one cause
        groups = L.shared_red({p: ["s4"] for p in range(10)} | {99: ["solo"]})
        self.assertEqual(list(groups), ["s4"])
        self.assertEqual(len(groups["s4"]), 10)


class Lease(unittest.TestCase):
    def test_round_trip_and_epoch_bumps(self):  # S4 two swarmers: the older epoch loses
        first = leased("swarm")
        second = L.grant(first, lane="swarm", worker_id="swarm/2", head=HEAD, now=NOW + 1, next_kind="ci_result",
                         item="JOV-1", pr=25253)
        self.assertEqual(second["epoch"], first["epoch"] + 1)
        self.assertEqual(L.parse_lease(L.render_lease(second))["epoch"], second["epoch"])
        self.assertIsNone(L.parse_lease("lane claim kind=fix"))

    def test_attempt_rows_are_capped(self):
        lease = leased("swarm", [row("swarm", sig=f"s{i}") for i in range(30)])
        self.assertEqual(len(lease["attempts"]), L.MAX_ATTEMPT_ROWS)
        self.assertEqual(lease["lifetime_attempts"], 30)

    def test_handoff_payload_is_bounded(self):
        lease = leased("codex", [row("codex")])
        h = L.handoff(item="JOV-1", repo="JovieInc/Jovie", pr=25253, head=HEAD, base="1813089c", lease=lease,
                      frm={"lane": "codex", "reason": "quota"}, to_lane="swarm",
                      failing=[{"check": "PR Ready", "extract": "x" * 9000}], usd_left_today=3.4)
        self.assertEqual(len(h["failing"][0]["extract"]), 4000)
        self.assertEqual(h["budget"]["attempts_left_head"], 2)
        self.assertEqual(h["schema"], L.SCHEMA_HANDOFF)

    def test_unknown_release_reason_refused(self):
        with self.assertRaises(ValueError):
            L.release(leased(), "bored", NOW, {})


class OriginalLane(unittest.TestCase):
    def test_worker_line_wins_over_prefix(self):
        self.assertEqual(L.original_lane("glm/x", "Worker: codex\n"), "codex")
        self.assertEqual(L.original_lane("codex/jov-1"), "codex")
        self.assertEqual(L.original_lane("glm/x"), "hyperagent")
        self.assertEqual(L.original_lane("weird-branch"), "lanes")


if __name__ == "__main__":
    unittest.main()
