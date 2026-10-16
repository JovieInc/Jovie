"""Remote origin transport must never become an execution or attribution shortcut."""
from __future__ import annotations

import io
import json
from pathlib import Path
import subprocess
import sys
import zipfile

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import shipping_origin as origin
import shipping_attribution as attribution


def payload(**overrides):
    return {"repository": "JovieInc/Jovie", "pr": 7, "headSha": "a" * 40,
            "method": "other-automation", "initiator": "workflow:screenshots.yml",
            "executionHost": "github-actions", "runId": "123", **overrides}


def run(workflow="screenshots.yml", **overrides):
    return {"id": 123, "path": f".github/workflows/{workflow}", "event": "workflow_dispatch",
            "head_branch": "main", "repository": {"full_name": "JovieInc/Jovie"}, **overrides}


def resolve(repository, pr, head):
    assert (repository, pr, head) == ("JovieInc/Jovie", 7, "a" * 40)
    return repository, {"number": pr, "head": {"sha": head}}


def archive(rows):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as zipped:
        for index, row in enumerate(rows):
            zipped.writestr(f"{index}.json", json.dumps(row))
    return out.getvalue()


@pytest.mark.parametrize("patch", [
    {"repository": "attacker/repo"}, {"repository": []}, {"pr": True}, {"pr": 0},
    {"headSha": "main"}, {"method": "symphony"}, {"method": []}, {"provider": {}},
    {"model": "x" * 201}, {"initiator": ""}, {"runId": "line\nbreak"},
    {"linearIssue": "JOV-0"}, {"command": "echo execution"}, {"merge": True},
    {"role": "finalizing"}, {"recordedAt": "2026-10-15T00:00:00Z"},
])
def test_malformed_remote_data_is_rejected(patch):
    with pytest.raises(ValueError, match="malformed-remote-payload"):
        origin.validate_payload(payload(**patch))


def test_emit_and_ingest_recheck_head_without_rewriting_existing_receipts(tmp_path):
    path = origin.emit(payload(), tmp_path / "out", resolve)
    ledger = tmp_path / "runs/ledger.jsonl"
    assert json.loads(path.read_text()) == payload()
    origin.ingest(payload(), run(), "JovieInc/Jovie", ledger, resolve)
    first = ledger.read_bytes()
    with pytest.raises(ValueError, match="duplicate-origin-receipt"):
        origin.ingest(payload(), run(), "JovieInc/Jovie", ledger, resolve)
    with pytest.raises(ValueError, match="conflicting-origin-receipt"):
        origin.ingest(payload(provider="another-provider"), run(), "JovieInc/Jovie", ledger, resolve)
    assert ledger.read_bytes() == first
    row = json.loads(first)
    assert row["evidenceUrl"] == "https://github.com/JovieInc/Jovie/actions/runs/123"
    assert row["schema"] == "jovie-shipping-origin/v1"


def test_stale_head_never_emits_or_appends(tmp_path):
    def stale(*_):
        raise ValueError("origin-receipt-head-mismatch")
    for operation in (lambda: origin.emit(payload(), tmp_path / "out", stale),
                      lambda: origin.ingest(payload(), run(), "JovieInc/Jovie", tmp_path / "ledger", stale)):
        with pytest.raises(ValueError, match="head-mismatch"):
            operation()
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("changed", [
    {"path": ".github/workflows/ci.yml"}, {"event": "pull_request"}, {"head_branch": "evil"},
    {"repository": {"full_name": "attacker/repo"}},
])
def test_untrusted_workflow_identity_never_reaches_ledger(tmp_path, changed):
    with pytest.raises(ValueError, match="untrusted-origin-run"):
        origin.ingest(payload(), run(**changed), "JovieInc/Jovie", tmp_path / "ledger", resolve)
    assert not (tmp_path / "ledger").exists()


def test_dependabot_certified_target_runs_can_name_a_non_main_source_branch(tmp_path):
    candidate = payload(method="dependabot", initiator="dependabot")
    trusted = run("dependabot-auto-merge.yml", event="pull_request_target", head_branch="dependabot/npm/pkg")
    origin.ingest(candidate, trusted, "JovieInc/Jovie", tmp_path / "ledger", resolve)
    assert json.loads((tmp_path / "ledger").read_text())["method"] == "dependabot"
    with pytest.raises(ValueError, match="origin-producer-mismatch"):
        origin.ingest(payload(), trusted, "JovieInc/Jovie", tmp_path / "ledger", resolve)


@pytest.mark.parametrize("method", sorted(origin.HANDOFF_METHODS))
def test_explicit_founder_and_independent_handoffs_keep_model_and_issue(method, tmp_path):
    selected = payload(method=method, initiator="tim", provider="selected-provider", model="selected-model",
                       executionHost="external", runId="external-session", linearIssue="JOV-8318")
    handoff = run("shipping-origin.yml", actor={"login": "itstimwhite"})
    origin.ingest(selected, handoff, "JovieInc/Jovie", tmp_path / "ledger", resolve)
    row = json.loads((tmp_path / "ledger").read_text())
    assert all(row[key] == value for key, value in selected.items())
    with pytest.raises(ValueError, match="untrusted-origin-handoff"):
        origin.ingest(selected, {**handoff, "actor": {"login": "untrusted"}},
                      "JovieInc/Jovie", tmp_path / "ledger", resolve)


def test_canonical_repository_pr_metadata_and_live_ref_must_agree():
    responses = {"repos/jovieinc/jovie": {"full_name": "JovieInc/Jovie"},
                 "repos/JovieInc/Jovie/pulls/7": {"number": 7, "state": "open",
                     "base": {"repo": {"full_name": "JovieInc/Jovie"}},
                     "head": {"sha": "a" * 40, "ref": "feature/work",
                              "repo": {"full_name": "JovieInc/Jovie"}}},
                 "repos/JovieInc/Jovie/git/ref/heads/feature%2Fwork": {"object": {"sha": "a" * 40}}}
    repository, _ = attribution.resolve_origin_head("jovieinc/jovie", 7, "a" * 40, fetch=responses.__getitem__)
    assert repository == "JovieInc/Jovie"
    responses["repos/JovieInc/Jovie/git/ref/heads/feature%2Fwork"]["object"]["sha"] = "b" * 40
    with pytest.raises(ValueError, match="head-mismatch"):
        attribution.resolve_origin_head("jovieinc/jovie", 7, "a" * 40, fetch=responses.__getitem__)


def test_archive_is_bounded_and_never_extracted():
    assert origin.read_archive(archive([payload()])) == [payload()]
    for rows in ([], [payload()] * 11, [payload(model="x" * 40000)]):
        with pytest.raises(ValueError):
            origin.read_archive(archive(rows))
    with pytest.raises(ValueError, match="oversized"):
        origin.read_archive(b"x" * 65537)


def test_tick_ingests_once_retries_transport_failure_and_preserves_rejections(tmp_path):
    reads = []
    def api(endpoint, binary=False):
        reads.append(endpoint)
        if "/LogYourBody/" in endpoint:
            raise subprocess.TimeoutExpired("gh", 1)
        if "artifacts?" in endpoint:
            return {"total_count": 1, "artifacts": [{"id": 1, "size_in_bytes": 100,
                    "workflow_run": {"id": 123}, "created_at": "2026-10-15T10:00:00Z"}]}
        if "/runs/" in endpoint:
            return run()
        assert binary
        return archive([payload(), payload(command="forbidden")])
    first = origin.collect(tmp_path, api=api, resolve=resolve)
    assert len(first["accepted"]) == len(first["rejected"]) == len(first["errors"]) == 1
    second = origin.collect(tmp_path, api=api, resolve=resolve)
    assert second["accepted"] == []
    assert sum("/zip" in endpoint for endpoint in reads) == 1
    assert len((tmp_path / "runs/ledger.jsonl").read_text().splitlines()) == 1


def test_automation_cli_selects_trusted_workflow_metadata(monkeypatch, tmp_path):
    monkeypatch.setenv("GITHUB_WORKFLOW_REF", "JovieInc/Jovie/.github/workflows/screenshots.yml@refs/heads/main")
    monkeypatch.setenv("GITHUB_REPOSITORY", "JovieInc/Jovie")
    monkeypatch.setenv("GITHUB_RUN_ID", "123")
    emitted = []
    monkeypatch.setattr(origin, "emit", lambda selected, directory: emitted.append(selected))
    origin.main(["emit-automation", "--pr", "https://github.com/JovieInc/Jovie/pull/7",
                 "--head-sha", "a" * 40, "--output-directory", str(tmp_path)])
    assert emitted == [payload(provider=None, model=None, linearIssue=None)]


def test_submit_dispatches_only_data_to_main_after_live_head_check(monkeypatch, tmp_path):
    selected = payload(method="independent-hyperagent", linearIssue="JOV-8318")
    source = tmp_path / "payload.json"
    source.write_text(json.dumps(selected))
    calls = []
    monkeypatch.setattr(attribution, "resolve_origin_head", resolve)
    monkeypatch.setattr(subprocess, "run", lambda args, **_: calls.append(args))
    origin.main(["submit", "--payload-file", str(source)])
    assert calls[0][:8] == ["gh", "workflow", "run", "shipping-origin.yml", "--repo", "JovieInc/Jovie", "--ref", "main"]
    assert json.loads(calls[0][-1].removeprefix("payload=")) == selected


def test_uninstrumented_project_counts_are_unknown_not_zero():
    report = attribution.project_report({"channel": "other", "repository": "owner/repo", "instrumented": False},
                                       {"complete": True, "prs": []}, {"complete": True}, 10)
    assert report["mergeCount"] is None and report["coverage"] is None
    assert report["attributionEvidenceComplete"] is False


def test_ingested_origins_are_verified_in_both_projects_without_promoting_review_roles(tmp_path):
    projects = {}
    rows = []
    for project in attribution.PROJECTS:
        repo = project["repository"]
        selected = payload(repository=repo, method="founder-operated-chatgpt", initiator="tim", linearIssue="JOV-8318")
        origin.ingest(selected, run("shipping-origin.yml", actor={"login": "itstimwhite"}), "JovieInc/Jovie",
                      tmp_path / "ledger", lambda repo, *_: (repo, {}))
        projects[repo] = {"complete": True, "window": {"since": 1, "until": 86400},
                         "prs": [{"number": 7, "headRefOid": "a" * 40}]}
        rows.extend([{"schema": "jovie-lane-run/v1", "repository": repo, "pr": 7, "kind": kind,
                      "provider": "codex", "runId": kind, "headSha": "a" * 40}
                     for kind in ("adopt", "fix-red", "ready-green")])
    ledger = attribution.read_ledger(tmp_path / "ledger")
    ledger["rows"].extend(rows)
    report = attribution.company_report(projects, ledger, 86401)
    assert report["complete"] is True
    for project in report["projects"]:
        assert project["freshness"]["status"] == "fresh"
        assert project["coverage"] == {"numerator": 1, "denominator": 1, "percent": 100.0}
        assert {row["role"] for row in project["pullRequests"][0]["contributions"]} == {"review", "remediation", "finalizing"}


def test_duplicate_json_keys_are_rejected():
    with pytest.raises(ValueError, match="duplicate-payload-key"):
        origin.decode_payload('{"method":"grokbot","method":"dependabot"}')


def test_ingest_failures_are_visible_without_erasing_merge_counts():
    report = attribution.project_report(attribution.PROJECTS[0],
        {"complete": True, "prs": [{"number": 7, "headRefOid": "a" * 40}]},
        {"complete": True, "rows": [], "remoteIngest": {"errors": ["github-unavailable"]}}, 10)
    assert report["mergeCount"] == 1
    assert report["attributionEvidenceComplete"] is False
    assert report["remoteIngest"]["errors"] == ["github-unavailable"]


def test_record_origin_cli_rechecks_before_append(monkeypatch, tmp_path):
    arguments = ["record-origin", "--ledger", str(tmp_path / "ledger"),
                 "--repository", "JovieInc/Jovie", "--pr", "7", "--head-sha", "a" * 40,
                 "--method", "founder-operated-codex", "--initiator", "tim", "--linear-issue", "JOV-8318"]
    def stale(*_):
        raise ValueError("origin-receipt-head-mismatch")
    monkeypatch.setattr(attribution, "resolve_origin_head", stale)
    with pytest.raises(ValueError, match="head-mismatch"):
        attribution.main(arguments)
    assert not (tmp_path / "ledger").exists()
    monkeypatch.setattr(attribution, "resolve_origin_head", resolve)
    assert attribution.main(arguments) == 0
    assert json.loads((tmp_path / "ledger").read_text())["linearIssue"] == "JOV-8318"


@pytest.mark.parametrize("workflow", sorted(origin.WORKFLOWS.keys() - {"shipping-origin.yml"}))
def test_every_automation_producer_ingests_as_verified(workflow, tmp_path):
    method = "dependabot" if workflow.startswith("dependabot-") else "other-automation"
    selected = payload(method=method, initiator="dependabot" if method == "dependabot" else f"workflow:{workflow}")
    origin.ingest(selected, run(workflow, event=sorted(origin.WORKFLOWS[workflow])[0]),
                  "JovieInc/Jovie", tmp_path / "ledger", resolve)
    row = attribution.attribute_pr({"number": 7, "headRefOid": "a" * 40},
                                  attribution.read_ledger(tmp_path / "ledger")["rows"], "JovieInc/Jovie")
    assert (row["origin"]["method"], row["origin"]["confidence"]) == (method, "verified")


def test_pagination_does_not_lose_origin_artifacts_after_the_first_hundred(tmp_path):
    pages = []
    def api(endpoint, binary=False):
        if "/LogYourBody/" in endpoint:
            return {"total_count": 0, "artifacts": []}
        if "artifacts?" in endpoint:
            pages.append(endpoint)
            items = ([{"id": n, "expired": True} for n in range(100)] if "&page=1" in endpoint else
                     [{"id": 101, "size_in_bytes": 100, "workflow_run": {"id": 123}, "created_at": "now"}])
            return {"total_count": 101, "artifacts": items}
        return archive([payload()]) if binary else run()
    result = origin.collect(tmp_path, api=api, resolve=resolve)
    assert len(pages) == 2
    assert len(result["accepted"]) == 1 and result["errors"] == []
