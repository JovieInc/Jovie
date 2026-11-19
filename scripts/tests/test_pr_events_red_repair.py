"""Red-repair admission and remediation-intake filing regression tests (2026-11-12, JOV-13077).

Red-repair admission (scripts/lanes/red_repair.py via pr_events) and Linear intake filing
(scripts/lanes/intake_linear.py via pr_events) — split from test_pr_events.py and
test_remediation.py (size budget). Run with:
    python3 -m pytest scripts/tests/test_pr_events_red_repair.py -v
"""
from __future__ import annotations

import concurrent.futures
import io
import subprocess
import sys
import tempfile
import threading
import unittest
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from scripts.tests.test_pr_events import NOW, Shell, events, fake_lane

import intake_linear  # noqa: E402  (Linear intake filing, JOV-13077; scripts/lanes is on sys.path via pr_events)


def iso_at(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class RedRepairTest(unittest.TestCase):
    """Tim 2026-11-12: a red required check on any same-repo PR to main queues repair now unless
    an active worker (fresh exact-head claim, or a commit inside the hour) holds the head. Red main
    and infra incidents queue none. 27 agent drafts sat red 6-48h on 2026-11-12 under the 3d rule."""
    RUN = {"event": "pull_request", "conclusion": "failure", "head_sha": "h1", "pull_requests": [{"number": 5}]}

    def gh(self, *, committed=NOW - 7200, claim_age=None, main="success", peers=(), check="Source Validation"):
        """One canned GitHub: the head rollup, Main Health runs, claim comments and the peer read."""
        failed = {"__typename": "CheckRun", "name": check, "conclusion": "FAILURE", "completedAt": iso_at(NOW - 300)}
        rollup = {"data": {"repository": {"pullRequest": {"commits": {"nodes": [{"commit": {
            "committedDate": iso_at(committed), "statusCheckRollup": {"contexts": {"nodes": [failed]}}}}]}}}}}
        peer_nodes = [{"number": n, "isCrossRepository": False, "commits": {"nodes": [{"commit": {
            "statusCheckRollup": {"contexts": {"nodes": [failed]}}}}]}} for n in peers]
        runs = {"workflow_runs": [{"event": "push", "conclusion": main, "head_sha": "m1",
                                   "created_at": iso_at(NOW - 600)}]}
        claim = "" if claim_age is None else f"🤖 lane claim kind=fix sha=h1 host=gem at={iso_at(NOW - claim_age)}"

        def api(args):
            text = " ".join(args)
            if args[2] == "graphql":
                return {"data": {"repository": {"pullRequests": {"nodes": peer_nodes}}}} if "orderBy" in text else rollup
            if "main-health.yml" in text:
                return runs
            if args[2] == "--paginate" and "/comments" in text:
                return claim
            return ""
        return api

    def relay(self, view=None, **gh):
        view = {"state": "OPEN", "isDraft": True, "baseRefName": "main", "headRefName": "feature/agent-wip",
                "headRefOid": "h1", "isCrossRepository": False, "mergeStateStatus": "BLOCKED", "labels": [], **(view or {})}
        shell = Shell({("gh", "pr", "view"): view, ("gh", "issue", "list"): [],
                       ("gh", "issue", "create"): "https://github.com/JovieInc/Jovie/issues/900",
                       ("gh", "api"): self.gh(**gh)})
        with patch.object(events.time, "time", return_value=NOW):
            added = events.relay("workflow_run", {"workflow_run": self.RUN}, shell, set())
        return added, shell

    def test_a_red_two_hour_old_draft_with_no_worker_is_repaired_now(self):
        added, shell = self.relay()
        self.assertEqual(added, [(5, "red")])
        self.assertEqual(len(shell.made("gh", "api", "-X", "POST")), 1)

    def test_a_fresh_claim_or_a_recent_commit_holds_the_head(self):
        for why, gh in (("claim 10 min old on the exact head", {"claim_age": 600}),
                        ("commit 10 min old", {"committed": NOW - 600})):
            added, shell = self.relay(**gh)
            self.assertEqual(added, [], why)
            self.assertEqual(shell.made("gh", "api", "-X", "POST"), [], why)
        expired, _ = self.relay(claim_age=events.CLAIM_TTL_S + 60)
        self.assertEqual(expired, [(5, "red")], "an expired claim is no worker")
        lane_push, _ = self.relay(view={"isDraft": False, "headRefName": "devin/jov-1-20260926t0900"},
                                  committed=NOW - 600)
        self.assertEqual(lane_push, [(5, "red")], "a lane's own red push is repaired, not waited on")
        stacked, _ = self.relay(view={"baseRefName": "feature/parent"})
        self.assertEqual(stacked, [], "a stacked draft stays with its stack")

    def test_nothing_is_labelled_while_main_is_red(self):
        for view in ({}, {"isDraft": False, "headRefName": "devin/jov-1-20260926t0900"}):
            added, shell = self.relay(view=view, main="failure")
            self.assertEqual(added, [])
            self.assertEqual(shell.made("gh", "api", "-X", "POST"), [])

    def test_an_infra_incident_files_one_linear_issue_and_repairs_nothing(self):
        linear = FakeIntakeLinear()
        with patch.object(intake_linear, "relay_linear_client", return_value=linear):
            added, shell = self.relay(peers=range(10, 15))  # 5 peers + this PR = 6 > INFRA_PEERS
        fingerprint = events.remediation.fingerprint(["infra-incident", "Source Validation"])
        self.assertEqual(added, [(linear.destination(fingerprint), events.remediation.INTAKE_LABEL)])
        self.assertEqual(shell.made("gh", "api", "-X", "POST"), [], "zero repairs")
        self.assertEqual(shell.made("gh", "issue", "create"), [], "no GitHub issue (JOV-13077)")
        self.assertEqual(len(linear.creates), 1)
        below, _ = self.relay(peers=range(10, 14))  # 4 peers + this PR = 5: not an incident
        self.assertEqual(below, [(5, "red")])
        red_repair = events.red_repair
        self.assertEqual(red_repair.incident_checks({"ci": {n: iso_at(NOW - 3600) for n in range(9)}}, NOW), {},
                         "failures older than the 30-minute window are not an incident")
        self.assertEqual(red_repair.incident_checks({"tently": {}, "ci": {n: iso_at(NOW) for n in range(6)}}, NOW),
                         {"ci": list(range(6))})

    def test_reconcile_backstop_honours_main_red_and_infra_incidents(self):
        def node(n):
            return {"number": n, "isDraft": True, "headRefName": f"feature/w{n}", "headRefOid": "h1",
                    "baseRefName": "main", "state": "OPEN", "mergeStateStatus": "BLOCKED", "isInMergeQueue": False,
                    "isCrossRepository": False, "createdAt": iso_at(NOW - 7200), "updatedAt": iso_at(NOW - 7200),
                    "labels": {"nodes": []},
                    "commits": {"nodes": [{"commit": {"committedDate": iso_at(NOW - 7200),
                                                      "statusCheckRollup": {"state": "FAILURE"}}}]}}

        def sweep(count, **gh):
            page = {"data": {"repository": {"pullRequests": {
                "pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": [node(n) for n in range(1, count + 1)]}}}}
            api = self.gh(**gh)
            linear = FakeIntakeLinear()
            shell = Shell({("gh", "issue", "list"): [], ("gh", "issue", "create"): "https://github.com/x/issues/901",
                           ("gh", "api"): lambda args: page if "states:OPEN,first:50" in " ".join(args) else api(args)})
            with tempfile.TemporaryDirectory() as tmp:
                record = events.reconcile(SimpleNamespace(state=Path(tmp)), fake_lane(shell), lambda: linear, NOW, force=True)
            return record, shell, linear

        record, shell, _ = sweep(2)
        self.assertEqual(sorted(record["labeled"]), [(1, "red"), (2, "red")], "the sweep is the hour's check-in")
        record, shell, _ = sweep(2, main="failure")
        self.assertEqual(record["labeled"], [])
        self.assertEqual(shell.made("gh", "api", "-X", "POST"), [])
        record, shell, linear = sweep(6)
        self.assertEqual(record["labeled"], [], "six PRs red on one check inside 30 min is one incident")
        # JOV-13077: the incident files one Linear intake, never a GitHub issue.
        self.assertEqual(len(linear.creates), 1)
        self.assertEqual(shell.made("gh", "issue", "create"), [])


class FakeIntakeLinear:
    """Linear GraphQL subset the intake filing path uses: teams, issue inventory, create,
    occurrence comments. Records every mutation for assertions."""

    def __init__(self, existing=()):
        self.rows = {row["id"]: {**row, "comments": list(row.get("comments") or [])} for row in existing}
        self.creates, self.comments, self.reads = [], [], []

    def destination(self, fingerprint: str) -> str:
        return intake_linear.intake_destination("team", fingerprint)

    def gql(self, query, variables):
        self.reads.append(query)
        if "teams(" in query:
            return {"teams": {"nodes": [{"id": "team", "states": {"nodes": [{"id": "todo", "name": "Todo"}]},
                    "labels": {"nodes": [{"id": name, "name": name} for name in events.remediation.intake_labels("ci")]}}]}}
        if "issueCreate(" in query:
            data = variables["i"]
            self.creates.append(dict(data))
            self.rows[data["id"]] = {"id": data["id"], "description": data["description"], "comments": []}
            return {"issueCreate": {"success": True, "issue": {"id": data["id"]}}}
        if "issues(" in query:
            rows = [{"id": row["id"], "description": row["description"],
                     "createdAt": row.get("createdAt", "2026-11-01T00:00:00Z")} for row in self.rows.values()]
            return {"issues": {"nodes": rows, "pageInfo": {"hasNextPage": False, "endCursor": None}}}
        if "comments(filter:" in query:
            issue = self.rows[variables["i"]]
            return {"issue": {"comments": {"nodes": [{"body": body} for body in issue["comments"]
                                                     if variables["m"] in body]}}}
        if "commentCreate(" in query:
            issue = self.rows[variables["i"]]
            issue["comments"].append(variables["b"])
            self.comments.append(variables["b"])
            return {"commentCreate": {"success": True}}
        raise AssertionError(query)


class IntakeLinearFilingTest(unittest.TestCase):
    """JOV-13077: remediation intake files Linear immediately, fingerprint-deduped, and never
    creates a GitHub issue; without a Linear client it defers visibly."""
    fingerprint = "feedbeef0001"

    def event(self, **overrides) -> dict:
        event = {"source": "deploy", "fingerprint": self.fingerprint, "ws": "release-deploy",
                 "subject": {"sha": "abc", "deployment": "preview"},
                 "evidence": {"url": "https://example.test/deploy/1", "excerpt": "preview failure"},
                 "first_seen": "2026-11-19T00:00:00Z"}
        event.update(overrides)
        return event

    def upsert(self, event, linear, shell=None, now=None):
        with patch.object(intake_linear, "relay_linear_client", return_value=linear):
            return intake_linear.upsert_intake(event, shell or Shell({}), now or NOW, linear=intake_linear._UNSET)

    def test_files_linear_immediately_without_a_github_issue(self):
        linear, shell = FakeIntakeLinear(), Shell({})
        issue_id = self.upsert(self.event(), linear, shell)
        self.assertEqual(issue_id, intake_linear.intake_destination("team", self.fingerprint))
        self.assertEqual(shell.made("gh", "issue", "create"), [])
        self.assertEqual(len(linear.creates), 1)
        self.assertIn(f"Fingerprint: `{self.fingerprint}`", linear.creates[0]["description"])
        self.assertIn("symphony-remediation-repository:JovieInc/Jovie", linear.creates[0]["description"])
        self.assertIn("Symphony remediation intake (deploy).", linear.creates[0]["description"])

    def test_recurrence_updates_one_issue_once_per_distinct_occurrence(self):
        linear = FakeIntakeLinear()
        self.assertEqual(self.upsert(self.event(), linear), intake_linear.intake_destination("team", self.fingerprint))
        # Same fingerprint, new evidence: one issue, one recurrence comment.
        self.assertEqual(self.upsert(self.event(evidence={"url": "https://example.test/deploy/2",
                                                          "excerpt": "preview failure again"}), linear),
                         intake_linear.intake_destination("team", self.fingerprint))
        self.assertEqual(len(linear.creates), 1)
        self.assertEqual(len(linear.comments), 1)
        # Identical evidence again: still one comment (deduped by the occurrence marker).
        self.assertEqual(self.upsert(self.event(evidence={"url": "https://example.test/deploy/2",
                                                          "excerpt": "preview failure again"}), linear),
                         intake_linear.intake_destination("team", self.fingerprint))
        self.assertEqual(len(linear.comments), 1)

    def test_without_a_linear_client_defers_visibly_and_never_uses_github(self):
        shell = Shell({})
        with patch.object(sys, "stderr", io.StringIO()) as stderr:
            self.assertIsNone(intake_linear.upsert_intake(self.event(), shell, NOW, linear=None))
        self.assertEqual(shell.made("gh", "issue", "create"), [])
        self.assertIn("intake deferred", stderr.getvalue())

    def test_unreachable_linear_defers_visibly_and_never_uses_github(self):
        class Down:
            def gql(self, query, variables):
                raise OSError("linear unavailable")
        shell = Shell({})
        with patch.object(sys, "stderr", io.StringIO()) as stderr:
            self.assertIsNone(intake_linear.upsert_intake(self.event(), Shell({}), NOW, linear=Down()))
        self.assertIsNone(intake_linear.upsert_intake(self.event(), shell, NOW, linear=Down()))
        self.assertEqual(shell.made("gh", "issue", "create"), [])
        self.assertIn("intake deferred", stderr.getvalue())

    def test_sentry_events_keep_their_normalized_shape(self):
        sentry = events.remediation.event_from_sentry({"issue_id": "S1", "message": "boom", "url": "https://s"})
        self.assertEqual((sentry["source"], sentry["ws"]), ("sentry", "reliability"))
        self.assertIsNone(events.remediation.event_from_sentry({}))


    def test_main_ci_failure_files_one_linear_intake_without_a_github_issue(self):
        """JOV-13077: intake files Linear immediately; no GitHub issue is ever created."""
        run = {"name": "CI", "event": "push", "conclusion": "failure", "head_branch": "main",
               "head_sha": "abc", "pull_requests": [], "html_url": "https://example.test/run/1",
               "updated_at": "2026-10-02T00:00:00Z"}
        payload = {"workflow_run": run}
        event = events.remediation.non_pr_event("workflow_run", payload)
        linear = FakeIntakeLinear()
        shell = Shell({})
        with patch.object(intake_linear, "relay_linear_client", return_value=linear):
            added = events.relay("workflow_run", payload, shell, set())
        self.assertEqual(added, [(intake_linear.intake_destination("team", event["fingerprint"]), "symphony-remediation")])
        self.assertEqual(shell.made("gh", "issue", "create"), [])
        self.assertEqual(shell.made("gh", "issue", "list"), [])
        self.assertEqual(len(linear.creates), 1)
        self.assertIn(event["fingerprint"], linear.creates[0]["description"])
        # A second failure of the same fingerprint updates the one Linear issue.
        with patch.object(intake_linear, "relay_linear_client", return_value=linear):
            again = events.relay("workflow_run", payload, shell, set())
        self.assertEqual(again, [(intake_linear.intake_destination("team", event["fingerprint"]), "symphony-remediation")])
        self.assertEqual(len(linear.creates), 1)
        self.assertEqual(len(linear.comments), 1)
    def test_relay_without_a_linear_client_defers_and_never_falls_back_to_github(self):
        """JOV-13077: no Linear client (hosted relay before the workflow half) defers visibly."""
        run = {"name": "CI", "event": "push", "conclusion": "failure", "head_branch": "main",
               "head_sha": "abc", "pull_requests": [], "html_url": "https://example.test/run/1",
               "updated_at": "2026-10-02T00:00:00Z"}
        shell = Shell({})
        with patch.object(intake_linear, "relay_linear_client", return_value=None), \
                patch.object(sys, "stderr", io.StringIO()) as stderr:
            added = events.relay("workflow_run", {"workflow_run": run}, shell, set())
        self.assertEqual(added, [])
        self.assertEqual(shell.made("gh", "issue", "create"), [])
        self.assertIn("intake deferred", stderr.getvalue())


class IntakeConversionTest(unittest.TestCase):
    fingerprint = 'a123b456c789d012'

    def linear(self, existing=(), pages=None, unknown=False, barrier=None):
        test = self
        class Linear:
            def __init__(self):
                self.rows = {row['id']: row for row in existing}
                self.creates, self.reads, self.lock = [], [], threading.Lock()
                self.unknown = unknown

            def gql(self, query, variables):
                if 'teams(' in query:
                    return {'teams': {'nodes': [{'id': 'team', 'states': {'nodes': [{'id': 'todo', 'name': 'Todo'}]},
                        'labels': {'nodes': [{'id': name, 'name': name} for name in
                            events.remediation.intake_labels('ci')]}}]}}
                if 'issueCreate(' in query:
                    if barrier:
                        barrier.wait(timeout=5)
                    with self.lock:
                        data = variables['i']
                        issue_id = data.get('id', str(uuid.uuid4()))
                        self.creates.append(dict(data))
                        if issue_id in self.rows:
                            raise RuntimeError('duplicate issue UUID')
                        self.rows[issue_id] = {'id': issue_id, 'description': data['description'],
                                              'createdAt': '2026-10-14T01:00:00Z'}
                        if self.unknown:
                            self.unknown = False
                            raise OSError('response lost after commit')
                        return {'issueCreate': {'success': True, 'issue': {'id': issue_id}}}
                if 'issues(' in query:
                    self.reads.append(variables)
                    if isinstance(pages, Exception):
                        raise pages
                    if pages is not None:
                        return pages[min(len(self.reads) - 1, len(pages) - 1)]
                    with self.lock:
                        rows = list(self.rows.values())
                    return {'issues': {'nodes': rows, 'pageInfo': {'hasNextPage': False, 'endCursor': None}}}
                test.fail(query)
        return Linear()

    def shell(self, number=10, comment_failure=False, comments=None, body=None):
        notes = [] if comments is None else comments
        body = body if body is not None else events.remediation.intake_body({'source': 'workflow_run',
            'fingerprint': self.fingerprint, 'ws': 'ci'})
        updated = datetime.fromtimestamp(NOW - 3601, timezone.utc).isoformat()
        def comment(args):
            if comment_failure:
                return (1, 'unavailable')
            notes.append({'body': args[-1]})
            return ''
        shell = Shell({('gh', 'issue', 'list'): [{'number': number, 'body': body, 'updatedAt': updated}],
            ('gh', 'api', '--paginate', '--slurp'): lambda args: [notes],
            ('gh', 'issue', 'comment'): comment})
        return shell

    def convert(self, linear, shell):
        return events.convert_intake(None, lambda: linear, shell, NOW)

    def test_two_ticks_and_failed_linkage_recover_one_authoritative_issue(self):
        for failed in (False, True):
            with self.subTest(comment_failure=failed):
                linear, shell = self.linear(), self.shell(comment_failure=failed)
                self.assertEqual(self.convert(linear, shell), [10])
                self.convert(linear, shell)
                self.assertEqual(len(linear.rows), 1)
                self.assertEqual(len(linear.creates), 1)
                expected_comments = 2 if failed else 1
                self.assertEqual(len(shell.made('gh', 'issue', 'comment')), expected_comments)
                # The GitHub intake issue closes once the Linear link is on record (JOV-13077).
                expected_closes = 0 if failed else 2  # tick two re-closes while the fixture still lists it
                self.assertEqual(len(shell.made('gh', 'issue', 'close')), expected_closes)

    def test_committed_unknown_create_is_recovered_without_a_second_mutation(self):
        linear, shell = self.linear(unknown=True), self.shell()
        self.assertEqual(self.convert(linear, shell), [10])
        self.assertEqual(len(linear.creates), 1)
        self.assertEqual(len(linear.rows), 1)
        self.assertEqual(len(linear.reads), 2)
        restarted = self.shell(number=11)
        self.assertEqual(self.convert(linear, restarted), [11])
        self.assertEqual(len(linear.creates), 1)

    def test_concurrent_converters_share_one_durable_destination(self):
        linear = self.linear(barrier=threading.Barrier(2))
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            tasks = [pool.submit(self.convert, linear, self.shell(number=number)) for number in (10, 11)]
            self.assertEqual([task.result(timeout=10) for task in tasks], [[10], [11]])
        self.assertEqual(len(linear.rows), 1)
        self.assertEqual({row['id'] for row in linear.creates}, set(linear.rows))
        self.assertEqual(uuid.UUID(linear.creates[0]['id']).version, 4)

    def test_complete_comment_inventory_recovers_legacy_linkage(self):
        body = events.remediation.intake_body({'source': 'intake', 'fingerprint': self.fingerprint})
        existing = {'id': str(uuid.uuid4()), 'description': body, 'createdAt': '2026-10-13T00:00:00Z'}
        shell = self.shell()
        shell.routes[('gh', 'api', '--paginate', '--slurp')] = [[], [{'body': f"<!-- linear-issue-id:{existing['id']} -->"}]]
        linear = self.linear(existing=[existing])
        self.assertIsNone(self.convert(linear, shell))
        self.assertFalse(linear.creates)
        self.assertFalse(shell.made('gh', 'issue', 'comment'))
        # Already converted on an earlier tick: the leftover GitHub issue still closes once.
        self.assertEqual(len(shell.made('gh', 'issue', 'close')), 1)

    def test_unbound_body_or_comment_marker_cannot_suppress_a_due_intake(self):
        for hint in ('Quoted explanation of linear-issue-id: syntax',
                     '<!-- linear-issue-id:not-an-id -->', f'<!-- linear-issue-id:{uuid.uuid4()} -->'):
            for location in ('body', 'comment'):
                with self.subTest(hint=hint, location=location):
                    shell = self.shell(comments=[{'body': hint}] if location == 'comment' else [])
                    if location == 'body':
                        shell.routes[('gh', 'issue', 'list')][0]['body'] += '\n' + hint
                    linear = self.linear()
                    self.assertEqual(self.convert(linear, shell), [10])
                    self.assertEqual(len(linear.creates), 1)
                    self.assertEqual(len(shell.made('gh', 'issue', 'comment')), 1)

    def test_unreadable_linkage_does_not_authorize_creation(self):
        for reply in ((1, '[[]]'), 'not-json', {}, [None], [[{'body': None}]]):
            with self.subTest(reply=reply):
                shell = self.shell()
                shell.routes[('gh', 'api', '--paginate', '--slurp')] = reply
                linear = self.linear()
                self.assertIsNone(self.convert(linear, shell))
                self.assertFalse(linear.creates)

    def test_authoritative_fingerprint_read_is_complete_and_reuses_oldest_canonical(self):
        body = events.remediation.intake_body({'source': 'intake', 'fingerprint': self.fingerprint})
        older = {'id': str(uuid.uuid4()), 'description': body, 'createdAt': '2026-10-13T00:00:00Z'}
        newer = {**older, 'id': str(uuid.uuid4()), 'createdAt': '2026-10-14T00:00:00Z'}
        linear = self.linear(pages=[{'issues': {'nodes': [newer], 'pageInfo': {'hasNextPage': True, 'endCursor': 'page1'}}},
            {'issues': {'nodes': [older], 'pageInfo': {'hasNextPage': False, 'endCursor': None}}}])
        shell = self.shell()
        self.assertEqual(self.convert(linear, shell), [10])
        self.assertFalse(linear.creates)
        self.assertIn(older['id'], shell.made('gh', 'issue', 'comment')[0][-1])
        self.assertEqual(linear.reads[1]['after'], 'page1')

    def test_unreadable_or_incomplete_authoritative_inventory_never_creates(self):
        for page in ({}, {'issues': None}, {'issues': {'nodes': None}},
            {'issues': {'nodes': [], 'pageInfo': {}}},
            {'issues': {'nodes': [], 'pageInfo': {'hasNextPage': True, 'endCursor': None}}},
            {'issues': {'nodes': [], 'pageInfo': {'hasNextPage': True, 'endCursor': 'repeat'}}},
            {'issues': {'nodes': [None], 'pageInfo': {'hasNextPage': False}}}, OSError('read unavailable')):
            with self.subTest(page=page):
                linear = self.linear(pages=page if isinstance(page, Exception) else [page])
                self.assertIsNone(self.convert(linear, self.shell()))
                self.assertFalse(linear.creates)

    def test_unknown_uncommitted_create_keeps_the_same_uuid_on_later_reconciliation(self):
        linear, shell = self.linear(), self.shell()
        gql = linear.gql
        attempts = []
        def lose_first(query, variables):
            if 'issueCreate(' in query:
                attempts.append(variables['i'].get('id'))
                if len(attempts) == 1:
                    raise OSError('unknown request outcome')
            return gql(query, variables)
        linear.gql = lose_first
        self.assertIsNone(self.convert(linear, shell))
        self.assertEqual(len(attempts), 1, 'no immediate mutation replay')
        self.assertEqual(self.convert(linear, shell), [10])
        self.assertEqual(attempts[0], attempts[1])
        self.assertIsNotNone(attempts[0])
        self.assertEqual(len(linear.rows), 1)

    def test_ambiguous_linkage_write_recovers_from_authoritative_issue(self):
        linear, shell = self.linear(), self.shell()
        def lost(args):
            raise subprocess.TimeoutExpired(args, 30)
        shell.routes[('gh', 'issue', 'comment')] = lost
        self.assertEqual(self.convert(linear, shell), [10])
        self.assertEqual(self.convert(linear, self.shell()), [10])
        self.assertEqual(len(linear.creates), 1)

    def test_foreign_or_embedded_fingerprint_cannot_bind_an_unrelated_issue(self):
        marker = events.remediation.intake_body({'source': 'intake', 'fingerprint': self.fingerprint})
        for description in ('Unrelated report quotes:\n' + marker,
                            marker + '\n<!-- symphony-remediation-repository:foreign/repo -->'):
            with self.subTest(description=description):
                row = {'id': str(uuid.uuid4()), 'description': description, 'createdAt': '2026-10-13T00:00:00Z'}
                linear = self.linear(existing=[row])
                self.assertEqual(self.convert(linear, self.shell()), [10])
                self.assertEqual(len(linear.creates), 1)
                self.assertNotEqual(linear.creates[0]['id'], row['id'])

    def test_rebound_destination_or_malformed_rows_fail_closed(self):
        seed = self.linear()
        self.convert(seed, self.shell())
        original = next(iter(seed.rows.values()))
        for row in ({**original, 'description': 'changed binding'},
                    {**original, 'createdAt': 'not-a-date'}, {**original, 'id': 'not-a-uuid'}):
            with self.subTest(row=row):
                linear = self.linear(existing=[row])
                self.assertIsNone(self.convert(linear, self.shell()))
                self.assertFalse(linear.creates)

    def test_missing_fingerprint_does_not_create_from_a_github_issue_number(self):
        linear = self.linear()
        self.assertIsNone(self.convert(linear, self.shell(body='unbound remediation')))
        self.assertFalse(linear.creates)


