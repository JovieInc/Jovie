"""Reason result publication and recovery; no live provider or destination calls."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

# Pytest collects the short module name; unittest uses the package name.
# Reuse the same fixture module so its reason/lane patches retain one identity.
fixtures = sys.modules.get("test_reason_lane")
if fixtures is None:
    from scripts.tests import test_reason_lane as fixtures
sys.modules.setdefault("test_reason_lane", fixtures)
sys.modules.setdefault("scripts.tests.test_reason_lane", fixtures)

reason = fixtures.reason
CONFIG, JOB_BLOCK, AGREE, PROPOSAL = fixtures.CONFIG, fixtures.JOB_BLOCK, fixtures.AGREE, fixtures.PROPOSAL
Runner, StoringGbrain, FakeLinear = fixtures.Runner, fixtures.StoringGbrain, fixtures.FakeLinear
description, done, claude_ok = fixtures.description, fixtures.done, fixtures.claude_ok
result_block = fixtures.result_block


class OneJobTest(unittest.TestCase):
    def setUp(self):
        routing = patch.object(reason, "catalog_command", lambda slug: ["gbrain", "get", slug])
        routing.start()
        self.addCleanup(routing.stop)

    issue = {"id": "i-9", "identifier": "JOV-9", "title": "t", "description": description(), "createdAt": "1"}

    def test_success_comments_the_block_writes_gbrain_and_closes(self):
        issue = {**self.issue, "description": description({**JOB_BLOCK, "contextRefs": []})}
        linear = FakeLinear(jobs=[issue])
        run = Runner(proposer_stub=claude_ok(), grok=[done("logged in"), done(json.dumps(AGREE))], gbrain=StoringGbrain())
        with tempfile.TemporaryDirectory() as tmp:
            record = reason.one_job(linear, issue, CONFIG, Path(tmp), run=run)
            self.assertEqual(json.loads(reason.budget_path(Path(tmp)).read_text()).popitem()[1]["jobs"], 1)
        self.assertEqual(linear.moves, [("i-9", "Done")])
        block = result_block(linear.comments[-1][1])
        self.assertEqual((block["schema"], block["confidence"], block["job"]), (reason.RESULT_SCHEMA, "high", "JOV-9"))
        self.assertEqual(block, {key: value for key, value in record.items() if key != "publication"})
        self.assertEqual(record["publication"]["status"], "published")
        put, get = run.made("gbrain")
        self.assertEqual(put, ["gbrain", "put", record["gbrainSlug"]])
        self.assertEqual(get, ["gbrain", "get", record["gbrainSlug"]])
        self.assertNotIn(reason.RESULT_MARKER, run.calls[-2][1]["input"])

    def test_gbrain_exit_zero_without_a_stored_body_is_not_stored(self):
        # JOV-7715: Gem's wrapper exited 0 and kept a frontmatter-only page; the receipt said stored.
        empty = '---\ntype: concept\ntitle: 2026 10 03 Jov 7709\n---\n\n'
        for stored in (done(empty), done("", 1), OSError("x")):
            def gbrain(args, kw, stored=stored):
                if args[1] == "get" and args[2].startswith("ops/summer/decisions/"):
                    if isinstance(stored, BaseException):
                        raise stored
                    return stored
                return done("ok")
            linear = FakeLinear(jobs=[self.issue])
            run = Runner(proposer_stub=claude_ok(), grok=[done("logged in"), done(json.dumps(AGREE))], gbrain=gbrain)
            with tempfile.TemporaryDirectory() as tmp:
                record = reason.one_job(linear, self.issue, CONFIG, Path(tmp), run=run)
            self.assertIsNone(record["gbrainSlug"])
            self.assertEqual(record["publication"]["status"], "blocked")
            self.assertNotIn((self.issue["id"], "Done"), linear.moves)

    def test_gbrain_hanging_after_a_real_write_is_verified_by_read_back(self):
        store = StoringGbrain(hang=True)
        self.assertTrue(reason.write_gbrain("s", "t", "# t\n\nmemo body", run=Runner(gbrain=store)))
        self.assertFalse(reason.write_gbrain("s", "t", "  \n", run=Runner(gbrain=store)))

    def test_gbrain_failure_drops_the_slug(self):
        linear = FakeLinear(jobs=[self.issue])
        run = Runner(proposer_stub=claude_ok(), grok=[done("logged in"), done(json.dumps(AGREE))], gbrain=done("", 1))
        with tempfile.TemporaryDirectory() as tmp:
            record = reason.one_job(linear, self.issue, CONFIG, Path(tmp), run=run)
        self.assertIsNone(record["gbrainSlug"])
        self.assertEqual(record["publication"]["status"], "blocked")
        self.assertNotIn((self.issue["id"], "Done"), linear.moves)
        self.assertTrue(reason.write_gbrain("s", "t", "b", run=Runner(gbrain=OSError("x"))) is False)

    def test_prior_art_failure_blocks_models_and_budget_spend(self):
        linear = FakeLinear(jobs=[self.issue])
        issue = {**self.issue, "description": description({**JOB_BLOCK, "question": "How should we price Jovie?",
                                                            "contextRefs": []})}
        run = Runner(gbrain=done("", 1, "gbrain offline"), proposer_stub=claude_ok())
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            record = reason.one_job(linear, issue, CONFIG, state, run=run)
            self.assertFalse(reason.budget_path(state).exists())
        self.assertEqual(record["priorArt"]["status"], "retrieval-failed")
        self.assertEqual(run.made("proposer_stub"), [])
        self.assertEqual(linear.moves[-1], ("i-9", "Todo"))

    def test_failed_research_publication_keeps_full_result_and_retries_without_model_spend(self):
        memo = "# Exact memo\n\n" + "Evidence that must survive beyond summary. " * 400 + "\nUnique complete memo tail"
        self.assertGreater(len(memo), 12000)
        issue = {**self.issue, "description": description({**JOB_BLOCK, "decisionType": "research",
                                                         "contextRefs": []})}
        linear = FakeLinear(jobs=[issue])
        first = Runner(hyperagent=done(json.dumps({"text": memo})), gbrain=done("ok"))
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            record = reason.one_job(linear, issue, CONFIG, state, run=first)
            self.assertNotIn((issue["id"], "Done"), linear.moves)
            self.assertEqual(record["publication"]["status"], "blocked")
            self.assertEqual(record["publication"]["owner"], "reason-lane")
            self.assertTrue(record["publication"]["nextAction"])
            path = reason.publication_path(state, issue)
            saved = json.loads(path.read_text())
            self.assertEqual(saved["outcome"]["research"], memo)
            self.assertIn(memo, saved["memoBody"])
            self.assertNotIn(memo, saved["outcome"]["comment"], "Linear preview stays bounded; the canonical memo is complete")
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
            before_budget = reason.budget_path(state).read_bytes()
            store = StoringGbrain()
            retry = Runner(gbrain=store)
            with patch.object(reason, "execute", side_effect=AssertionError("must reuse saved bytes")):
                completed = reason.one_job(linear, issue, CONFIG, state, run=retry)
            self.assertEqual(completed["publication"]["status"], "published")
            self.assertEqual(linear.moves[-1], (issue["id"], "Done"))
            self.assertEqual(reason.budget_path(state).read_bytes(), before_budget)
            self.assertEqual(retry.made("hyperagent"), [])
            self.assertIn(memo, store.pages[completed["gbrainSlug"]])
            self.assertIn(completed["gbrainSlug"], linear.comments[-1][1])
            self.assertEqual(completed["publication"]["linearCreatedAt"], "2026-11-16T23:00:00.123Z")

    def test_stale_middle_content_cannot_pass_gbrain_readback(self):
        expected = "# Same title\n\nExpected unique middle\n\nSame final line"
        stale = "# Same title\n\nWrong older middle\n\nSame final line"
        self.assertFalse(reason.write_gbrain("s", "t", expected, run=Runner(gbrain=done(stale))))

    def test_ambiguous_linear_publish_reuses_exact_comment_id_after_readback(self):
        linear = FakeLinear(jobs=[self.issue])
        linear.comment_failure = OSError("response lost after remote commit")
        run = Runner(proposer_stub=claude_ok(), grok=[done("logged in"), done(json.dumps(AGREE))],
                     gbrain=StoringGbrain())
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            first = reason.one_job(linear, self.issue, CONFIG, state, run=run)
            self.assertEqual(first["publication"]["status"], "blocked")
            self.assertNotIn((self.issue["id"], "Done"), linear.moves)
            self.assertEqual(len(linear.published), 1)
            linear.comment_failure = None
            count = len(linear.comments)
            with patch.object(reason, "execute", side_effect=AssertionError("no repeated model")):
                second = reason.one_job(linear, self.issue, CONFIG, state, run=Runner(gbrain=StoringGbrain()))
            self.assertEqual(second["publication"]["status"], "published")
            self.assertEqual(len(linear.published), 1)
            self.assertEqual(len(linear.comments), count)

    def test_changed_or_corrupt_saved_result_is_preserved_and_cannot_publish(self):
        for corruption in (False, True):
            with self.subTest(corrupt=corruption), tempfile.TemporaryDirectory() as tmp:
                state = Path(tmp)
                linear = FakeLinear(jobs=[self.issue])
                run = Runner(proposer_stub=claude_ok(), grok=[done("logged in"), done(json.dumps(AGREE))],
                             gbrain=done("ok"))
                reason.one_job(linear, self.issue, CONFIG, state, run=run)
                path = reason.publication_path(state, self.issue)
                if corruption:
                    path.write_text("{corrupt")
                previous = path.read_bytes()
                changed = {**self.issue, "description": self.issue["description"] + "\nNew exact revision"}
                linear.jobs = [changed]
                with patch.object(reason, "execute", side_effect=AssertionError("no stale execution")):
                    record = reason.one_job(linear, changed, CONFIG, state, run=Runner())
                self.assertEqual(record["publication"]["status"], "blocked")
                self.assertEqual(path.read_bytes(), previous)
                self.assertNotIn((self.issue["id"], "Done"), linear.moves)
                self.assertEqual(linear.published, {})

    def test_tampered_publication_fields_and_malformed_saved_shapes_fail_closed(self):
        def remove_record(saved):
            saved["outcome"].pop("record")
            return saved
        changes = [lambda saved: {**saved, "memoBody": "unrelated replacement"},
                   lambda saved: {**saved, "commentId": "different comment"},
                   lambda saved: {**saved, "input": {**saved["input"], "title": "different input"}},
                   lambda saved: [], remove_record, lambda saved: {**saved, "publication": None}]
        for change in changes:
            with self.subTest(change=change), tempfile.TemporaryDirectory() as tmp:
                state = Path(tmp)
                linear = FakeLinear(jobs=[self.issue])
                reason.one_job(linear, self.issue, CONFIG, state, run=Runner(proposer_stub=claude_ok(),
                    grok=[done("logged in"), done(json.dumps(AGREE))], gbrain=done("ok")))
                path = reason.publication_path(state, self.issue)
                path.write_text(json.dumps(change(json.loads(path.read_text()))))
                previous = path.read_bytes()
                with patch.object(reason, "execute", side_effect=AssertionError("must retain saved result")):
                    record = reason.one_job(linear, self.issue, CONFIG, state, run=Runner())
                self.assertEqual(record["publication"]["status"], "blocked")
                self.assertEqual(path.read_bytes(), previous)
                self.assertEqual(linear.published, {})
                self.assertNotIn((self.issue["id"], "Done"), linear.moves)

    def test_changed_input_during_terminal_move_cannot_be_reported_published(self):
        linear = FakeLinear(jobs=[self.issue])
        move = linear.move
        def changed_move(issue_id, state, owner=None):
            move(issue_id, state, owner)
            if state == "Done":
                linear.jobs = [{**self.issue, "description": "A new authoritative input"}]
        linear.move = changed_move
        with tempfile.TemporaryDirectory() as tmp:
            record = reason.one_job(linear, self.issue, CONFIG, Path(tmp), run=Runner(proposer_stub=claude_ok(),
                grok=[done("logged in"), done(json.dumps(AGREE))], gbrain=StoringGbrain()))
        self.assertEqual(record["publication"]["status"], "blocked")
        self.assertEqual(record["publication"]["reason"], "reason-result-input-changed-or-unavailable")

    def test_lost_terminal_ack_reconciles_same_result_without_duplicate_model_or_comment(self):
        linear = FakeLinear(jobs=[self.issue])
        move = linear.move
        def ambiguous_move(issue_id, state, owner=None):
            move(issue_id, state, owner)
            if state == "Done":
                raise OSError("terminal move response lost")
        linear.move = ambiguous_move
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            first = reason.one_job(linear, self.issue, CONFIG, state, run=Runner(proposer_stub=claude_ok(),
                grok=[done("logged in"), done(json.dumps(AGREE))], gbrain=StoringGbrain()))
            self.assertEqual(first["publication"]["status"], "blocked")
            self.assertEqual(linear.state_of(self.issue["id"]), "Done")
            count = len(linear.comments)
            linear.move = move
            with patch.object(reason, "execute", side_effect=AssertionError("no repeated model")):
                recovered = reason.one_job(linear, self.issue, CONFIG, state, run=Runner(gbrain=StoringGbrain()))
            self.assertEqual(recovered["publication"]["status"], "published")
            self.assertEqual(len(linear.comments), count)

    def test_full_memo_readback_decodes_known_json_mcp_and_sse_page_envelopes(self):
        memo = "# Exact title\n\nThe entire unique middle must match.\n\nFinal line"
        wrappers = [lambda body: json.dumps({"slug": "s", "compiled_truth": body}),
            lambda body: json.dumps({"page": {"slug": "s", "content": body}}),
            lambda body: json.dumps({"data": {"page": {"slug": "s", "body": body}}}),
            lambda body: json.dumps({"jsonrpc": "2.0", "id": 2, "result": {"content": [
                {"type": "text", "text": json.dumps({"slug": "s", "compiled_truth": body})}]}}),
            lambda body: "event: message\ndata: " + json.dumps({"jsonrpc": "2.0", "id": 2, "result": {
                "content": [{"type": "text", "text": json.dumps({"slug": "s", "compiled_truth": body})}]}}) + "\n\n"]
        for wrap in wrappers:
            for changed in (False, True):
                with self.subTest(wrap=wrap, changed=changed):
                    stored = wrap(memo.replace("entire unique middle", "older unrelated middle") if changed else memo)
                    self.assertEqual(reason.write_gbrain("s", "title", memo, run=Runner(gbrain=done(stored))), not changed)
        for stored in (json.dumps({"unrecognized": memo}),
                       json.dumps({"slug": "another-page", "compiled_truth": memo}),
                       json.dumps({"result": {"isError": True, "content": [{"type": "text", "text": memo}]}})):
            self.assertFalse(reason.write_gbrain("s", "title", memo, run=Runner(gbrain=done(stored))))

    def test_expired_pending_result_retains_bytes_and_never_publishes_or_spends(self):
        linear = FakeLinear(jobs=[self.issue])
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            reason.one_job(linear, self.issue, CONFIG, state, run=Runner(proposer_stub=claude_ok(),
                grok=[done("logged in"), done(json.dumps(AGREE))], gbrain=done("ok")))
            path = reason.publication_path(state, self.issue)
            produced = json.loads(path.read_text())["outcome"]
            linear.states[self.issue["id"]] = "In Progress"
            with patch.object(reason, "expired", return_value=True), \
                    patch.object(reason, "execute", side_effect=AssertionError("no model retry")):
                run = Runner()
                blocked = reason.one_job(linear, self.issue, CONFIG, state, run=run)
            self.assertEqual(blocked["publication"]["reason"], "reason-result-deadline-passed")
            self.assertEqual(linear.moves[-1], (self.issue["id"], "Todo"))
            self.assertEqual(json.loads(path.read_text())["outcome"], produced)
            self.assertEqual(run.calls, [])
            self.assertEqual(linear.published, {})
            self.assertNotIn((self.issue["id"], "Done"), linear.moves)

    def test_saved_result_with_public_permissions_is_not_read_or_published(self):
        linear = FakeLinear(jobs=[self.issue])
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            reason.one_job(linear, self.issue, CONFIG, state, run=Runner(proposer_stub=claude_ok(),
                grok=[done("logged in"), done(json.dumps(AGREE))], gbrain=done("ok")))
            path = reason.publication_path(state, self.issue)
            path.chmod(0o644)
            previous = path.read_bytes()
            blocked = reason.one_job(linear, self.issue, CONFIG, state, run=Runner())
            self.assertEqual(blocked["publication"]["status"], "blocked")
            self.assertEqual(path.read_bytes(), previous)
            self.assertEqual(linear.published, {})

    def test_fresh_result_crossing_deadline_is_saved_but_never_published(self):
        linear = FakeLinear(jobs=[self.issue])
        linear.states[self.issue["id"]] = "In Progress"
        run = Runner(proposer_stub=claude_ok(), grok=[done("logged in"), done(json.dumps(AGREE))],
                     gbrain=StoringGbrain())
        with tempfile.TemporaryDirectory() as tmp, patch.object(reason, "expired", side_effect=[False, True]):
            state = Path(tmp)
            blocked = reason.one_job(linear, self.issue, CONFIG, state, run=run)
            self.assertTrue(reason.publication_path(state, self.issue).exists())
        self.assertEqual(blocked["publication"]["reason"], "reason-result-deadline-passed")
        self.assertEqual(linear.moves[-1], (self.issue["id"], "Todo"))
        self.assertEqual([call for call in run.made("gbrain") if call[1] == "put"], [])
        self.assertEqual(linear.published, {})

    def test_known_yc_playbook_reaches_the_prompt_before_a_fresh_experiment(self):
        linear = FakeLinear(jobs=[self.issue])
        issue = {**self.issue, "description": description({**JOB_BLOCK, "question": "Should we hire our first engineer?",
                                                            "contextRefs": ["JOV-12"]})}
        linear.issues["JOV-12"] = {"identifier": "JOV-12", "title": "Capacity evidence", "priority": 2,
                                   "state": {"name": "Todo"}, "labels": {"nodes": []},
                                   "description": "Current customer demand does not exceed capacity."}
        hit = "[0.9] knowledge/external/yc/playbook/hiring-team -- Hiring and team growth"
        page = ("---\ntitle: Hiring and team growth\npublished_at: 2026-09-28\n"
                "source_url: https://www.ycombinator.com/library/4H-how-to-hire-your-first-engineer\n---\n"
                "# Hiring\n## Applicability\nUse before adding early headcount.\n## Source evidence")
        proposal = {**PROPOSAL, "precedentDisposition": "adopt",
                    "materialDifference": "No material difference; Jovie is pre-PMF with spare capacity.",
                    "newLearningNeeded": [],
                    "ranking": [{**item, "evidence": ["knowledge/external/yc/playbook/hiring-team", "JOV-12"]}
                                for item in PROPOSAL["ranking"]]}
        run = Runner(gbrain=[done(page), done("ok"), done("", 1)],
                     proposer_stub=claude_ok(proposal), grok=[done("logged in"), done(json.dumps(AGREE))])
        with tempfile.TemporaryDirectory() as tmp:
            record = reason.one_job(linear, issue, CONFIG, Path(tmp), run=run)
        prompt = run.calls[next(i for i, (args, _) in enumerate(run.calls) if args[0] == "proposer_stub")][1]["input"]
        self.assertIn("knowledge/external/yc/playbook/hiring-team", prompt)
        self.assertIn("what is materially different about Jovie's case?", prompt)
        self.assertEqual(record["decisionEvidence"]["inference"]["precedentDisposition"], "adopt")
        self.assertEqual(record["decisionEvidence"]["newLearning"], [])

    def test_failure_retries_once_then_cancels(self):
        linear = FakeLinear(jobs=[self.issue])
        with tempfile.TemporaryDirectory() as tmp:
            reason.one_job(linear, self.issue, CONFIG, Path(tmp), run=Runner(proposer_stub=done("", 1)))
            self.assertEqual(linear.moves[-1], ("i-9", "Todo"))
            reason.one_job(linear, self.issue, CONFIG, Path(tmp), run=Runner(proposer_stub=done("", 1)))
            self.assertEqual(reason.failure_count(Path(tmp), "JOV-9"), 2)
        self.assertEqual(linear.moves[-1], ("i-9", "Canceled"))
        self.assertEqual(result_block(linear.comments[-1][1])["confidence"], "failed")

    def test_expired_job_is_cancelled_without_model_calls(self):
        linear, run = FakeLinear(), Runner()
        issue = {**self.issue, "description": description({**JOB_BLOCK, "deadline": "2000-01-01T00:00:00Z"})}
        with tempfile.TemporaryDirectory() as tmp:
            reason.one_job(linear, issue, CONFIG, Path(tmp), run=run)
        self.assertEqual((linear.moves, run.calls), ([("i-9", "Canceled")], []))
        self.assertIn("deadline passed", result_block(linear.comments[-1][1])["reasons"])



class PublicationDrainTest(unittest.TestCase):
    lane = fixtures.DrainAndTickTest.lane
    setUp = fixtures.DrainAndTickTest.setUp

    def test_saved_publication_retries_with_models_unhealthy_and_model_budget_exhausted(self):
        issue = {"id": "i-1", "identifier": "JOV-1", "title": "research", "createdAt": "1",
                 "description": description({**JOB_BLOCK, "decisionType": "research", "contextRefs": []})}
        linear = FakeLinear(jobs=[issue])
        with tempfile.TemporaryDirectory() as tmp:
            host = SimpleNamespace(state=Path(tmp), linear_env=Path(tmp) / "env")
            reason.one_job(linear, issue, CONFIG, host.state,
                run=Runner(hyperagent=done(json.dumps({"text": "Complete preserved research memo"})), gbrain=done("ok")))
            budget = reason.budget_path(host.state).read_bytes()
            retry = Runner(gbrain=StoringGbrain())
            with patch.object(reason, "healthy", return_value=False), \
                    patch.object(reason, "execute", side_effect=AssertionError("must not repeat model work")):
                result = reason.drain(host, self.lane(linear), {**CONFIG, "maxJobsPerDay": 0,
                    "maxResearchPerDay": 0}, run=retry)
            self.assertEqual(reason.budget_path(host.state).read_bytes(), budget)
        self.assertEqual([entry["job"] for entry in result["done"]], ["JOV-1"])
        self.assertEqual(linear.moves[-1], ("i-1", "Done"))
        self.assertEqual(retry.made("hyperagent"), [])


    def test_blocked_publication_is_not_counted_as_done(self):
        issue = {"id": "i-1", "identifier": "JOV-1", "title": "research", "createdAt": "1",
                 "description": description({**JOB_BLOCK, "decisionType": "research", "contextRefs": []})}
        linear = FakeLinear(jobs=[issue])
        with tempfile.TemporaryDirectory() as tmp, patch.object(reason, "healthy", return_value=True):
            host = SimpleNamespace(state=Path(tmp), linear_env=Path(tmp) / "env")
            result = reason.drain(host, self.lane(linear), CONFIG,
                run=Runner(hyperagent=done(json.dumps({"text": "Produced but not published"})), gbrain=done("ok")))
        self.assertEqual(result["done"], [])
        self.assertEqual(result["status"], "publication-blocked")
        self.assertEqual(result["blocked"][0]["owner"], "reason-lane")
        self.assertTrue(result["blocked"][0]["nextAction"])


