"""
Regression tests for scripts/lib/gh-retry.sh.

The merge-queue enroll job calls drain-pr-queue.sh, which must survive
transient GitHub GraphQL 504s instead of failing the workflow.

Run with:
    python -m pytest scripts/tests/test_gh_retry.py -v
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import shutil
import stat
import subprocess
import textwrap
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
_GH_RETRY = _REPO_ROOT / "scripts" / "lib" / "gh-retry.sh"
_DRAIN_SCRIPT = _REPO_ROOT / "scripts" / "drain-pr-queue.sh"
_WATCHDOG_SCRIPT = _REPO_ROOT / "scripts" / "merge-queue-watchdog.sh"


def _run_bash(script: str, *, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged = os.environ.copy()
    if env:
        merged.update(env)
    return subprocess.run(
        ["bash", "-c", script],
        cwd=_REPO_ROOT,
        env=merged,
        text=True,
        capture_output=True,
        check=False,
    )


def _drain_command(
    tmp_path: Path,
    *,
    extra_env: str = "",
    expected_gh: Path | None = None,
    backend: str = "test-label-fixture",
) -> str:
    fake_gh = tmp_path / "gh"
    assert fake_gh.is_file(), f"test must create isolated gh fixture first: {fake_gh}"
    gh_path = tmp_path
    if backend == "native":
        # Model the real Actions producer separately from each test's fleet API.
        # All native tests execute the production guard; no bypass flag exists.
        gh_path = tmp_path / "producer-api"
        gh_path.mkdir(exist_ok=True)
        producer_gh = gh_path / "gh"
        producer_gh.write_text(textwrap.dedent(f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            if [[ "${{1:-}}" == api && "${{2:-}}" == *"/statuses?per_page=100" ]]; then
              # Older fixtures describe the combined status representation;
              # expose its statuses as the real paginated plural API shape.
              fixture_statuses=$('{fake_gh}' "$@") || exit $?
              jq 'if type == "object" and has("statuses") then [.statuses] else . end' <<<"$fixture_statuses"
              exit 0
            fi
            if [[ "${{1:-}}" == api && "${{2:-}}" == "repos/JovieInc/Jovie/actions/runs/${{GITHUB_RUN_ID:-}}" ]]; then
              count=0
              [[ ! -f "{tmp_path}/producer-reads" ]] || count=$(<"{tmp_path}/producer-reads")
              echo "$((count + 1))" >"{tmp_path}/producer-reads"
              [[ ! -f "{tmp_path}/producer-api-failure" ]] || exit 1
              if [[ -f "{tmp_path}/producer-malformed" ]]; then echo 'not-json'; exit 0; fi
              overrides='{{}}'
              [[ ! -f "{tmp_path}/producer-overrides.json" ]] || overrides=$(<"{tmp_path}/producer-overrides.json")
              if [[ "$count" -gt 0 && -f "{tmp_path}/producer-after-enroll.json" ]]; then
                overrides=$(<"{tmp_path}/producer-after-enroll.json")
              fi
              # Preserve historical receipt fixtures that share the current
              # run ID, instead of replacing their source-head provenance.
              fixture_run=$('{fake_gh}' "$@" 2>/dev/null) || fixture_run='{{}}'
              jq -e 'type == "object"' <<<"$fixture_run" >/dev/null 2>&1 || fixture_run='{{}}'
              jq -n --argjson id "$GITHUB_RUN_ID" --argjson attempt "${{GITHUB_RUN_ATTEMPT:-1}}" --argjson fixture_run "$fixture_run" --argjson overrides "$overrides" '
                {{id:$id,run_attempt:$attempt,name:"Merge Queue Auto-Enroll",path:".github/workflows/merge-queue-autoenroll.yml",
                html_url:("https://github.com/JovieInc/Jovie/actions/runs/" + ($id|tostring)),
                repository:{{full_name:"JovieInc/Jovie"}},head_repository:{{full_name:"JovieInc/Jovie"}},
                head_sha:"{'a' * 40}",head_branch:"main",event:"workflow_run",status:"in_progress",conclusion:null,
                created_at:"2026-01-01T00:00:00Z",updated_at:"2026-09-19T14:00:00Z"}} + $fixture_run + $overrides'
              exit 0
            fi
            exec "{fake_gh}" "$@"
            """), encoding="utf-8")
        producer_gh.chmod(producer_gh.stat().st_mode | stat.S_IXUSR)
    expected = expected_gh or (gh_path / "gh")
    authorization = "test-fixture" if backend == "test-label-fixture" else "merge-queue-autoenroll"
    env_prefix = (
        f'PATH="{gh_path}:{tmp_path}:$PATH" '
        'GITHUB_RUN_ID=77 GITHUB_RUN_ATTEMPT=1 '
        f'DRAIN_EXPECT_GH="{expected}" '
        f'DRAIN_MUTATION_AUTHORIZATION={authorization} '
        'GH_MUTATION_TOKEN=test-fixture-writer-token '
        f'FLEET_POLICY_MAIN_SHA={"a" * 40} '
        'DRAIN_PRODUCTION_CHECKPOINT_STATE=verified '
        f'MERGE_QUEUE_BACKEND={backend} '
    )
    if extra_env:
        env_prefix += f"{extra_env} "
    return f'{env_prefix}bash "{_DRAIN_SCRIPT}"'


def _run_same_token_rest_fixture(
    tmp_path: Path, *, rest_mode: str, post_hold: bool = False, producer_env: str = ""
) -> tuple[subprocess.CompletedProcess[str], dict[str, Path], str, str]:
    """Run an exact native admission against controlled REST/GraphQL reads."""
    head = "b" * 40
    base = "c" * 40
    rest_calls = tmp_path / "rest-calls"
    view_calls = tmp_path / "view-calls"
    enroll_calls = tmp_path / "enroll-calls"
    dequeue_calls = tmp_path / "dequeue-calls"
    for path in (rest_calls, view_calls, enroll_calls, dequeue_calls):
        path.write_text("0", encoding="utf-8")

    fake_node = tmp_path / "node"
    fake_node.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            case "${{2:-}}" in
              preflight) exit 0 ;;
              prove-admission) [[ -n "${{5:-}}" && "${{5}}" != "null" ]] ;;
              list-state) echo '{{"101":{{"headRefOid":"{head}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":false}}}}' ;;
              enroll)
                count=$(<"{enroll_calls}")
                echo "$((count + 1))" >"{enroll_calls}"
                echo '{{"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_1","enqueuedAt":"2026-08-15T12:00:00Z","state":"AWAITING_CHECKS","position":1}}}}}}'
                ;;
              dequeue)
                count=$(<"{dequeue_calls}")
                echo "$((count + 1))" >"{dequeue_calls}"
                echo '{{"state":{{"queued":false}}}}'
                ;;
              max-queue-depth) echo 16 ;;
              unmergeable-eject) echo '{{"action":"keep","reason":"not-queued"}}' ;;
              unmergeable-reenqueue) echo '{{"action":"allow","reason":"no-eject-receipt"}}' ;;
              changelog-collision) echo '{{"action":"allow","reason":"candidate-omits-changelog"}}' ;;
              admission) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","stampPath":false}}' ;;
              changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
              changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
              explain-selector) echo '{{"observed":true,"queued":false,"eligible":false,"reason":"mergeable=UNKNOWN"}}' ;;
              prove-receipt) echo '{{"ok":false,"explanation":{{"reason":"not-queued"}},"state":{{"queued":false}}}}' ;;
              --classify-queue) echo '[]' ;;
              *) echo "unexpected node args: $*" >&2; exit 2 ;;
            esac
            """
        ),
        encoding="utf-8",
    )
    fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)

    fake_gh = tmp_path / "gh"
    fake_gh.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            if [[ "$1 $2" == "pr checks" ]]; then
              echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
              exit 0
            fi
            if [[ "$1 $2" == "pr view" ]]; then
              count=$(<"{view_calls}")
              echo "$((count + 1))" >"{view_calls}"
              labels='[]'
              if [[ "{str(post_hold).lower()}" == "true" && "$count" -ge 1 ]]; then
                labels='[{{"name":"hold"}}]'
              fi
              printf '%s\\n' '{{"state":"OPEN","isDraft":false,"mergeable":"UNKNOWN","labels":'"$labels"',"headRefOid":"{head}","baseRefName":"main","baseRefOid":"{base}","body":""}}'
              exit 0
            fi
            if [[ "$1" == "api" && "$2" == "user" ]]; then
              echo '{{"login":"github-actions[bot]","type":"Bot","id":418}}'
              exit 0
            fi
            if [[ "$1" == "api" && "$2" == "repos/JovieInc/Jovie/pulls/101" ]]; then
              count=$(<"{rest_calls}")
              next=$((count + 1))
              echo "$next" >"{rest_calls}"
              rest_state=open
              rest_draft=false
              rest_head={head}
              rest_base={base}
              rest_labels='[]'
              rest_mergeable=true
              rest_merge_state=clean
              if [[ "{str(post_hold).lower()}" == "true" && "$next" -ge 3 ]]; then
                rest_labels='[{{"name":"hold"}}]'
              fi
              case "{rest_mode}:$next" in
                head-mismatch:*) rest_head={'d' * 40} ;;
                base-mismatch:*) rest_base={'e' * 40} ;;
                labels-mismatch:*) rest_labels='[{{"name":"hold"}}]' ;;
                draft-mismatch:*) rest_draft=true ;;
                state-mismatch:*) rest_state=closed ;;
                false:*) rest_mergeable=false; rest_merge_state=dirty ;;
                null:*) rest_mergeable=null; rest_merge_state=unknown ;;
                read-failure:*) exit 1 ;;
                flip:1) rest_mergeable=true ;;
                flip:*) rest_mergeable=false; rest_merge_state=dirty ;;
              esac
              printf '%s\\n' '{{"number":101,"state":"'"$rest_state"'","draft":'"$rest_draft"',"mergeable":'"$rest_mergeable"',"mergeable_state":"'"$rest_merge_state"'","head":{{"sha":"'"$rest_head"'","ref":"codex/rest-fallback"}},"base":{{"sha":"'"$rest_base"'","ref":"main"}},"labels":'"$rest_labels"'}}'
              exit 0
            fi
            if [[ "$1" == "api" && " $* " == *" -X POST "* && " $* " == *"/statuses/{head} "* ]]; then
              echo "$*" >>"{tmp_path}/receipt-writes"
              exit 0
            fi
            if [[ "$1" == "api" && "$2" == *"/commits/{head}/status"* ]]; then
              echo '{{"statuses":[]}}'
              exit 0
            fi
            if [[ "$1" == "api" && "$2" == *"/actions/workflows/ci.yml/runs"* ]]; then
              echo '[]'
              exit 0
            fi
            if [[ "$1" == "api" && "$2" == *"/commits/{head}"* ]]; then
              echo '2026-08-29T20:00:00Z'
              exit 0
            fi
            if [[ "$1" == "api" ]]; then exit 1; fi
            echo "unexpected gh args: $*" >&2
            exit 2
            """
        ),
        encoding="utf-8",
    )
    fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

    result = _run_bash(
        _drain_command(
            tmp_path,
            backend="native",
            extra_env=(
                f"DRAIN_ADMISSION_PR=101 DRAIN_ADMISSION_HEAD={head} "
                "DRAIN_MERGEABLE_RECHECK_ATTEMPTS=3 "
                "DRAIN_MERGEABLE_RECHECK_SECONDS=0 "
                "GITHUB_RUN_ID=42 GITHUB_SERVER_URL=https://github.com "
                f"{producer_env}"
            ),
        )
    )
    return result, {
        "rest": rest_calls,
        "view": view_calls,
        "enroll": enroll_calls,
        "dequeue": dequeue_calls,
    }, head, base


def _summer_closure_admission(
    *, intake_allowed: bool = True, status: str | None = None
) -> dict[str, object]:
    return {
        "allowed": intake_allowed,
        "authority": "Summer",
        "status": status or ("healthy" if intake_allowed else "red"),
        "newIssueIntakeAllowed": intake_allowed,
        "newImplementationAllowed": intake_allowed,
        "fallbackPrGenerationAllowed": intake_allowed,
        "promotionContinues": True,
        "remediationContinues": True,
    }


def _hold_intake_evidence() -> dict[str, object]:
    return {
        "reasons": [{"code": "production-deployment-unbound"}],
        "reviewAdmission": {
            "allowed": True, "required": True, "authority": "Gem",
            "scope": "exact-main-head", "headSha": "a" * 40,
            "reviewer": "Gem", "reason": "fresh-exact-head-independent-review",
            "reviewId": "test-exact-main-review",
            "observedAt": datetime.now(timezone.utc).isoformat(),
        },
    }


def _production_unbound_hold_receipt(
    *, closure_status: str = "healthy", intake_allowed: bool = True
) -> dict[str, object]:
    return {
        "schema": "jovie-fleet-gate/v1",
        "state": "AMBER",
        "promotionMode": "hold-intake",
        **_hold_intake_evidence(),
        "observedAt": datetime.now(timezone.utc).isoformat(),
        "closureAdmission": _summer_closure_admission(
            intake_allowed=intake_allowed, status=closure_status
        ),
        "signals": {
            "main": {"status": "green", "sha": "a" * 40},
            "production": {"status": "green", "deployedSha": "b" * 40},
            "controller": {"status": "green"},
            "queue": {
                "status": "known",
                "eligiblePrs": 1,
                "greenReadyPrs": 1,
                "target": 15,
            },
            "integrity": {"status": "clear"},
        },
        "promotionAdmission": {"allowed": False},
        "isolatedPromotionAdmission": {"allowed": False, "deploymentsAllowed": False},
        "productionUnboundRepairAdmission": {
            "allowed": True,
            "condition": "production-deployment-unbound",
            "mainSha": "a" * 40,
            "deployedSha": "b" * 40,
            "maxConcurrent": 1,
            "deploymentsAllowed": False,
        },
        "alreadyAdmittedCohort": {
            "preserve": True,
            "newIntakeAllowed": intake_allowed,
            "semantics": "preserve-cohort-and-continue-isolated-implementation",
        },
    }


def _controller_repair_receipt() -> dict[str, object]:
    return {
        "schema": "jovie-fleet-gate/v1",
        "state": "AMBER",
        "promotionMode": "controller-repair-only",
        "observedAt": datetime.now(timezone.utc).isoformat(),
        "signals": {
            "main": {"status": "green", "sha": "a" * 40},
            "production": {"status": "green", "deployedSha": "b" * 40},
            "controller": {"status": "failed"},
            "queue": {"status": "known", "eligiblePrs": 2, "greenReadyPrs": 2, "target": 15},
            "integrity": {"status": "clear"},
        },
        "reasons": [
            {"code": "controller-failure", "layer": "controller", "severity": "warning"},
        ],
        "promotionAdmission": {"allowed": False},
        "isolatedPromotionAdmission": {
            "allowed": False,
            "deploymentsAllowed": False,
        },
        "productionUnboundRepairAdmission": {"allowed": False},
        "controllerRepairAdmission": {
            "allowed": True,
            "condition": "controller-failure",
            "mainSha": "a" * 40,
            "deployedSha": "b" * 40,
            "scope": "github-approved-exact-repository-pr-head-main-path-set",
            "maxConcurrent": 1,
            "deploymentsAllowed": False,
            "runtimeActivationAllowed": False,
        },
        "alreadyAdmittedCohort": {"preserve": True, "newIntakeAllowed": False},
    }


def _write_native_receipt_fakes(
    tmp_path: Path,
    *,
    head: str,
    mergeable: str,
    is_draft: bool,
    selector: dict[str, object],
    receipt: dict[str, object],
    changelog_collision: dict[str, object] | None = None,
) -> None:
    changelog_collision_result = changelog_collision or {
        "action": "allow",
        "reason": "candidate-omits-changelog",
    }
    fake_node = tmp_path / "node"
    fake_node.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            case "${{2:-}}" in
              preflight) exit 0 ;;
              list-state) echo '{{"16068":{{"headRefOid":"{head}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":false,"isInMergeQueue":false,"mergeQueueEntry":null}}}}' ;;
              explain-selector)
                cat >/dev/null
                printf '%s\\n' '{json.dumps(selector)}'
                ;;
              prove-receipt)
                printf '%s\\n' '{json.dumps(receipt)}'
                ;;
              enroll) echo "enroll should not run for this receipt fixture" >&2; exit 2 ;;
              dequeue) echo '{{"state":{{"queued":false}}}}' ;;
              max-queue-depth) echo 16 ;;
              unmergeable-eject) echo '{{"action":"keep","reason":"not-queued"}}' ;;
              unmergeable-reenqueue) echo '{{"action":"allow","reason":"no-eject-receipt"}}' ;;
              changelog-collision) printf '%s\\n' '{json.dumps(changelog_collision_result)}' ;;
              changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
              changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
              --classify-queue) echo '[]' ;;
              *) echo "unexpected node args: $*" >&2; exit 2 ;;
            esac
            """
        ),
        encoding="utf-8",
    )
    fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
    draft_json = "true" if is_draft else "false"
    fake_gh = tmp_path / "gh"
    fake_gh.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            if [[ "$1 $2" == "pr list" ]]; then
              echo '[{{"n":16068,"t":"Exact-head receipt","draft":false,"m":"{mergeable}","ms":"CLEAN","head":"codex/receipt","headOid":"{head}","base":"main","body":"","L":[],"fail":[]}}]'
              exit 0
            fi
            if [[ "$1 $2" == "pr checks" ]]; then
              echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
              exit 0
            fi
            if [[ "$1 $2" == "pr view" ]]; then
              if [[ -n "${{NATIVE_RECEIPT_TEST_TRACE:-}}" && "$*" == *"--json state,isDraft,mergeable,labels,headRefOid,baseRefName,baseRefOid,body"* ]]; then
                printf 'read\\n' >>"$NATIVE_RECEIPT_TEST_TRACE"
              fi
              echo '{{"state":"OPEN","isDraft":{draft_json},"mergeable":"{mergeable}","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
              exit 0
            fi
            if [[ "$1" == "api" && "$2" == *"/commits/{head}/status"* ]]; then
              echo '{{"statuses":[]}}'
              exit 0
            fi
            if [[ "$1" == "api" ]]; then
              exit 1
            fi
            echo "unexpected gh args: $*" >&2
            exit 2
            """
        ),
        encoding="utf-8",
    )
    fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)


def _install_native_receipt_test_trace(tmp_path: Path) -> Path:
    trace = tmp_path / "native-receipt-test-trace"
    trace.write_text("", encoding="utf-8")
    fake_sleep = tmp_path / "sleep"
    fake_sleep.write_text(
        textwrap.dedent(
            """\
            #!/usr/bin/env bash
            set -euo pipefail
            printf 'sleep %s\\n' "$*" >>"${NATIVE_RECEIPT_TEST_TRACE:?}"
            """
        ),
        encoding="utf-8",
    )
    fake_sleep.chmod(fake_sleep.stat().st_mode | stat.S_IXUSR)
    return trace


def _assert_native_receipt_recheck_trace(
    result: subprocess.CompletedProcess[str], trace: Path, head: str
) -> None:
    expected_events: list[str] = []
    for attempt in range(1, 7):
        expected_events.append("read")
        if attempt < 6:
            expected_events.append("sleep 2")
    assert trace.read_text(encoding="utf-8").splitlines() == expected_events
    rechecks = [
        line.strip()
        for line in result.stdout.splitlines()
        if "bounded live reread" in line
    ]
    assert rechecks == [
        f"~ mergeable=UNKNOWN for #16068 at {head}; bounded live reread {attempt}/6"
        for attempt in range(1, 6)
    ]


_TRUSTED_BOT_AVATAR = "https://avatars.githubusercontent.com/in/2934433?v=4"
_TRUSTED_WORKFLOW_NAME = "Merge Queue Auto-Enroll"
_TRUSTED_WORKFLOW_PATH = ".github/workflows/merge-queue-autoenroll.yml"


def _null_creator_status(
    *,
    head: str,
    context: str,
    state: str,
    description: str,
    avatar_url: str = _TRUSTED_BOT_AVATAR,
) -> dict[str, object]:
    return {
        "url": f"https://api.github.com/repos/JovieInc/Jovie/statuses/{head}",
        "avatar_url": avatar_url,
        "context": context,
        "state": state,
        "description": description,
        "creator": None,
        "target_url": "https://github.com/JovieInc/Jovie/actions/runs/77",
        "updated_at": "2026-08-28T14:20:00Z",
    }


def _trusted_autoenroll_run(
    *,
    head: str,
    workflow_name: str = _TRUSTED_WORKFLOW_NAME,
    workflow_path: str = _TRUSTED_WORKFLOW_PATH,
    repository: str = "JovieInc/Jovie",
    run_head: str | None = None,
) -> dict[str, object]:
    return {
        "id": 77,
        "name": workflow_name,
        "path": workflow_path,
        "head_sha": run_head or head,
        "html_url": "https://github.com/JovieInc/Jovie/actions/runs/77",
        "repository": {"full_name": repository},
        "head_repository": {"full_name": repository},
        "workflow_id": 299216194,
        "event": "workflow_run", "head_branch": "main", "status": "in_progress", "conclusion": None,
        "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-09-19T14:00:00Z",
        "run_attempt": 1,
    }


def _write_null_creator_receipt_drain(
    tmp_path: Path,
    *,
    pr: int,
    head: str,
    title: str,
    status: dict[str, object],
    run: dict[str, object],
    avatar_url: str = _TRUSTED_BOT_AVATAR,
    queued: bool = False,
    queue_entry_state: str | None = None,
    queue_position: int = 1,
    labels: list[str] | None = None,
    front_churn: str = "forbid",
    allow_enroll: bool = False,
    merge_group_runs: list[dict[str, object]] | None = None,
    merge_group_pages: list[dict[str, object]] | None = None,
    merge_group_api_fails: bool = False,
    merge_group_raw: str | None = None,
    timeline_events: list[dict[str, object]] | None = None,
    timeline_events_after: list[dict[str, object]] | None = None,
    timeline_fails: bool = False,
) -> dict[str, Path]:
    logs = {
        "api": tmp_path / "api-calls",
        "post": tmp_path / "status-posts",
        "front_churn": tmp_path / "front-churn",
        "enroll": tmp_path / "enroll",
        "dequeue": tmp_path / "dequeue",
        "dequeue_args": tmp_path / "dequeue-args",
        "jobs": tmp_path / "jobs-scans",
        "timeline": tmp_path / "timeline-calls",
        "group_runs": tmp_path / "group-runs-calls",
    }
    for path in logs.values():
        path.write_text("", encoding="utf-8")
    status_file = tmp_path / "combined-status.json"
    status_file.write_text(
        json.dumps({"statuses": [status]}, separators=(",", ":")),
        encoding="utf-8",
    )
    run_file = tmp_path / "workflow-run.json"
    run_file.write_text(json.dumps(run, separators=(",", ":")), encoding="utf-8")
    identity_file = tmp_path / "bot-identity.json"
    identity_file.write_text(
        json.dumps(
            {
                "login": "jovie-bot[bot]",
                "type": "Bot",
                "avatar_url": avatar_url,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    label_names = labels or (["merge-queue"] if queued else [])
    label_json = json.dumps(label_names)
    view_labels = json.dumps([{"name": name} for name in label_names])
    queued_json = "true" if queued else "false"
    merge_group_runs_json = json.dumps(
        merge_group_runs or [], separators=(",", ":")
    )
    default_group_page = {
        "total_count": len(merge_group_runs or []),
        "workflow_runs": merge_group_runs or [],
    }
    merge_group_pages_json = merge_group_raw if merge_group_raw is not None else json.dumps(
        merge_group_pages or [default_group_page], separators=(",", ":")
    )
    merge_group_fail_json = "true" if merge_group_api_fails else "false"
    # `gh api --paginate --slurp` wraps endpoint pages in an outer array.
    timeline_json = json.dumps([timeline_events or []], separators=(",", ":"))
    confirmation_events = timeline_events if timeline_events_after is None else timeline_events_after
    timeline_confirmation_json = json.dumps([confirmation_events or []], separators=(",", ":"))
    timeline_confirmation_enabled = "true" if timeline_events_after is not None else "false"
    timeline_case = (
        'echo "timeline read forced to fail" >&2; exit 95'
        if timeline_fails
        else f"if [[ '{timeline_confirmation_enabled}' == true ]] && [[ $(wc -l < '{logs['timeline']}') -gt 1 ]]; then echo '{timeline_confirmation_json}'; else echo '{timeline_json}'; fi; exit 0"
    )
    if queued:
        entry_state = queue_entry_state or "AWAITING_CHECKS"
        queue_add_events = [
            event.get("created_at", "")
            for event in (timeline_events or [])
            if event.get("event") == "added_to_merge_queue"
        ]
        queue_enqueued_at = max(queue_add_events, default="2026-08-28T14:20:00Z")
        list_state = (
            f'{{"{pr}":{{"headRefOid":"{head}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":true,'
            f'"isInMergeQueue":true,'
            f'"mergeQueueEntry":{{"id":"MQE_{pr}","enqueuedAt":"{queue_enqueued_at}","state":"{entry_state}","position":{queue_position}}}}}}}'
        )
    else:
        list_state = (
            f'{{"{pr}":{{"headRefOid":"{head}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":false,'
            f'"isInMergeQueue":false,"mergeQueueEntry":null}}}}'
        )
    if allow_enroll:
        enroll_case = (
            f'enroll) printf \'%s\\n\' "${{3:-}}" >>\'{logs["enroll"]}\'; '
            f'echo \'{{"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}",'
            f'"mergeQueueEntry":{{"id":"MQE_{pr}","enqueuedAt":"2026-08-28T14:20:00Z","state":"AWAITING_CHECKS","position":1}}}}}}\' ;;'
        )
    else:
        enroll_case = (
            f'enroll) printf \'%s\\n\' "${{3:-}}" >>\'{logs["enroll"]}\'; '
            'echo "null-creator fixture must not enroll" >&2; exit 91 ;;'
        )
    if front_churn == "active":
        front_churn_case = (
            f'front-churn) printf \'front-churn\\n\' >>\'{logs["front_churn"]}\'; '
            'echo \'{"action":"allow","reason":"newer attempt still active","evidence":{"activeRunId":88}}\' ;;'
        )
    elif front_churn == "allow":
        front_churn_case = (
            f'front-churn) printf \'front-churn\\n\' >>\'{logs["front_churn"]}\'; '
            "echo '{\"action\":\"allow\",\"reason\":\"no classified failure\"}' ;;"
        )
    else:
        front_churn_case = (
            f'front-churn) printf \'front-churn\\n\' >>\'{logs["front_churn"]}\'; '
            'echo "Actions history must not be required after a trusted creator:null receipt" >&2; exit 92 ;;'
        )
    fake_node = tmp_path / "node"
    fake_node.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            case "${{2:-}}" in
              preflight) exit 0 ;;
              prove-admission) [[ -n "${{5:-}}" && "${{5}}" != "null" ]] ;;
              list-state) echo '{list_state}' ;;
              explain-selector) cat >/dev/null; echo '{{"observed":true,"queued":{queued_json},"eligible":true,"reason":"eligible"}}' ;;
              prove-receipt) echo '{{"ok":false,"state":{{"queued":false}},"explanation":{{"reason":"not-queued"}}}}' ;;
              {enroll_case}
              dequeue|dequeue-ineligible) printf 'dequeue\\n' >>'{logs["dequeue"]}'; printf '%s\\n' "$*" >>'{logs["dequeue_args"]}'; echo '{{"state":{{"queued":false}}}}' ;;
              max-queue-depth) echo 16 ;;
              {front_churn_case}
              unmergeable-eject) echo '{{"action":"keep","reason":"not-queued"}}' ;;
              unmergeable-reenqueue)
                if [[ "${{UNMERGEABLE_REENQUEUE_JSON:-}}" == *'"ejectReceiptHeadSha":"{head}"'* ]]; then
                  echo '{{"action":"block","reason":"unchanged-head-eject-receipt"}}'
                else
                  echo '{{"action":"allow","reason":"no-eject-receipt"}}'
                fi
                ;;
              changelog-collision) echo '{{"action":"allow","reason":"candidate-omits-changelog"}}' ;;
              changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
              changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
              --classify-queue) echo '[]' ;;
              *) echo "unexpected node args: $*" >&2; exit 93 ;;
            esac
            """
        ),
        encoding="utf-8",
    )
    fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
    fake_gh = tmp_path / "gh"
    fake_gh.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            if [[ "$1 $2" == "pr list" ]]; then
              echo '[{{"n":{pr},"t":"{title}","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/null-creator","headOid":"{head}","base":"main","body":"","L":{label_json},"fail":[]}}]'
              exit 0
            fi
            if [[ "$1 $2" == "pr checks" ]]; then
              echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
              exit 0
            fi
            if [[ "$1 $2" == "pr view" ]]; then
              echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":{view_labels},"headRefOid":"{head}","baseRefName":"main","body":""}}'
              exit 0
            fi
            if [[ "$1" == "api" ]]; then
              printf '%s\\n' "$2" >>'{logs["api"]}'
              if [[ "$2" == *"/git/ref/heads/main"* ]]; then echo '{"9" * 40}'; exit 0; fi
              if [[ "$2" == *"/actions/workflows/ci.yml/runs"* ]]; then
                if [[ " $* " == *" created="* ]]; then
                  printf '%s\\n' "$*" >>'{logs["group_runs"]}'
                  [[ '{merge_group_fail_json}' == false ]] || {{ echo "merge-group inventory forced to fail" >&2; exit 95; }}
                  echo '{merge_group_pages_json}'
                  exit 0
                fi
                echo '{merge_group_runs_json}'
                exit 0
              fi
              if [[ "$2" == *"/issues/{pr}/timeline"* ]]; then
                printf '%s\\n' "$2" >>'{logs["timeline"]}'
                {timeline_case}
              fi
              if [[ "$2" == *"/commits/{head}/status"* ]]; then cat '{status_file}'; exit 0; fi
              if [[ "$2" == "users/jovie-bot%5Bbot%5D" ]]; then cat '{identity_file}'; exit 0; fi
              if [[ "$2" == "repos/JovieInc/Jovie/actions/runs/76" ]]; then
                if [[ -f '{tmp_path}/prior-run.json' ]]; then cat '{tmp_path}/prior-run.json';
                else jq '.id = 76 | .html_url = "https://github.com/JovieInc/Jovie/actions/runs/76"' '{run_file}'; fi
                exit 0
              fi
              if [[ "$2" == "repos/JovieInc/Jovie/actions/runs/77" ]]; then cat '{run_file}'; exit 0; fi
              if [[ "$2" == *"/actions/runs/"*"/jobs"* ]]; then printf '%s\\n' "$2" >>'{logs["jobs"]}'; echo '[]'; exit 0; fi
              if [[ "$2" == *"/commits/{head}" && "$2" != *"/status"* ]]; then echo '2026-08-28T13:00:00Z'; exit 0; fi
              if [[ " $* " == *" -X POST "* && " $* " == *"/statuses/{head} "* ]]; then
                printf '%s\\n' "$*" >>'{logs["post"]}'
                exit 0
              fi
              echo "unexpected gh api: $*" >&2
              exit 94
            fi
            echo "unexpected gh args: $*" >&2
            exit 94
            """
        ),
        encoding="utf-8",
    )
    fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)
    return logs


def _write_release_wave_drain_fixture(
    tmp_path: Path, *, native: bool = False
) -> dict[str, Path]:
    """Write a small fake-GitHub queue with healthy, held, and clean PRs."""
    logs = {
        "enroll": tmp_path / "release-wave-enroll",
        "dequeue": tmp_path / "release-wave-dequeue",
    }
    for path in logs.values():
        path.write_text("", encoding="utf-8")
    held_removed = tmp_path / "held-removed"
    clean_enrolled = tmp_path / "clean-enrolled"
    heads = {101: "a" * 40, 102: "b" * 40, 103: "c" * 40, 104: "d" * 40}
    prs = [
        {
            "n": 101,
            "t": "Already admitted healthy PR",
            "draft": False,
            "m": "MERGEABLE",
            "ms": "CLEAN",
            "head": "codex/healthy",
            "headOid": heads[101],
            "base": "main",
            "body": "",
            "L": ["merge-queue"],
            "fail": [],
        },
        {
            "n": 102,
            "t": "Held queued PR",
            "draft": False,
            "m": "MERGEABLE",
            "ms": "CLEAN",
            "head": "codex/held",
            "headOid": heads[102],
            "base": "main",
            "body": "",
            "L": ["merge-queue", "hold"],
            "fail": [],
        },
        {
            "n": 103,
            "t": "Clean admission candidate",
            "draft": False,
            "m": "MERGEABLE",
            "ms": "CLEAN",
            "head": "codex/clean",
            "headOid": heads[103],
            "base": "main",
            "body": "",
            "L": [],
            "fail": [],
        },
        {
            "n": 104,
            "t": "Clean recovery candidate",
            "draft": False,
            "m": "MERGEABLE",
            "ms": "CLEAN",
            "head": "codex/recovery",
            "headOid": heads[104],
            "base": "main",
            "body": "",
            "L": [],
            "fail": [],
        },
    ]
    prs_json = json.dumps(prs, separators=(",", ":"))
    labels_by_pr = {
        101: '[{"name":"merge-queue"}]',
        102: '[{"name":"hold"}]',
        103: '[{"name":"merge-queue"}]',
        104: "[]",
    }
    fake_gh = tmp_path / "gh"
    fake_gh.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            if [[ "$1 $2" == "pr list" ]]; then
              printf '%s\\n' '{prs_json}'
              exit 0
            fi
            if [[ "$1 $2" == "pr checks" ]]; then
              echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
              exit 0
            fi
            if [[ "$1 $2" == "pr edit" ]]; then
              n="$3"
              if [[ " $* " == *" --remove-label merge-queue "* ]]; then
                printf 'dequeue %s\\n' "$n" >>'{logs["dequeue"]}'
                if [[ "$n" == "102" ]]; then touch '{held_removed}'; fi
                exit 0
              fi
              if [[ " $* " == *" --add-label merge-queue "* ]]; then
                printf 'enroll %s\\n' "$n" >>'{logs["enroll"]}'
                if [[ "$n" == "103" ]]; then touch '{clean_enrolled}'; fi
                exit 0
              fi
              echo "unexpected pr edit: $*" >&2
              exit 2
            fi
            if [[ "{str(native).lower()}" == "true" && "$1 $2" == "pr view" && " $* " == *" --json files "* ]]; then
              printf '%s\\n' '[]'
              exit 0
            fi
            if [[ "$1 $2" == "pr view" ]]; then
              n="$3"
              case "$n" in
                101) head='{heads[101]}'; base='main'; labels='{labels_by_pr[101]}' ;;
                102) head='{heads[102]}'; base='main'; labels='{labels_by_pr[102]}' ;;
                103) head='{heads[103]}'; base='main'; labels='[]'; [[ -f '{clean_enrolled}' ]] && labels='{labels_by_pr[103]}' ;;
                104) head='{heads[104]}'; base='main'; labels='{labels_by_pr[104]}' ;;
                *) echo "unexpected pr view: $*" >&2; exit 2 ;;
              esac
              printf '%s\\n' '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":'"$labels"',"headRefOid":"'"$head"'","baseRefName":"'"$base"'","baseRefOid":"'"$base"'","body":""}}'
              exit 0
            fi
            if [[ "{str(native).lower()}" == "true" && "$1" == "api" ]]; then
              if [[ "$2" == *"/git/ref/heads/main"* ]]; then
                printf '%s\\n' '{"a" * 40}'
                exit 0
              fi
              if [[ "$2" == *"/actions/workflows/ci.yml/runs"* ]]; then
                printf '%s\\n' '[]'
                exit 0
              fi
              if [[ "$2" == *"/commits/"*"/status"* ]]; then
                printf '%s\\n' '{{"statuses":[]}}'
                exit 0
              fi
              if [[ "$2" == *"/commits/"* ]]; then
                printf '%s\\n' '{{"commit":{{"committer":{{"date":"2026-08-01T00:00:00Z"}}}}}}'
                exit 0
              fi
              echo "unexpected native api args: $*" >&2
              exit 2
            fi
            echo "unexpected gh args: $*" >&2
            exit 2
            """
        ),
        encoding="utf-8",
    )
    fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)
    if native:
        native_state = {
            str(pr["n"]): {
                "number": pr["n"],
                "title": pr["t"],
                "isDraft": pr["draft"],
                "mergeable": pr["m"],
                "mergeStateStatus": pr["ms"],
                "headRefName": pr["head"],
                "headRefOid": pr["headOid"],
                "baseRefName": pr["base"],
                "baseRefOid": "a" * 40,
                "body": pr["body"],
                "labels": {"nodes": [{"name": label} for label in pr["L"]]},
                "queued": pr["n"] in (101, 102),
                "isInMergeQueue": pr["n"] in (101, 102),
                "mergeQueueEntry": (
                    {
                        "id": f"MQE_{pr['n']}",
                        "state": "QUEUED",
                        "position": 1 if pr["n"] == 101 else 2,
                        "enqueuedAt": "2026-09-14T19:00:00Z",
                    }
                    if pr["n"] in (101, 102)
                    else None
                ),
            }
            for pr in prs
        }
        native_state_json = json.dumps(native_state, separators=(",", ":"))
        native_receipt = json.dumps(
            {
                "state": {
                    "state": "OPEN",
                    "isDraft": False,
                    "headRefOid": heads[103],
                    "isInMergeQueue": True,
                    "mergeQueueEntry": {
                        "id": "MQE_103",
                        "state": "QUEUED",
                        "position": 3,
                        "enqueuedAt": "2026-09-14T19:00:00Z",
                    },
                }
            },
            separators=(",", ":"),
        )
        native_ok = json.dumps({"ok": True}, separators=(",", ":"))
        native_dequeue = json.dumps(
            {
                "backend": "native",
                "changed": True,
                "state": {"isInMergeQueue": False, "mergeQueueEntry": None},
            },
            separators=(",", ":"),
        )
        real_node = shutil.which("node")
        assert real_node, "native release-wave fixture requires the real node executable"
        native_node = tmp_path / "node"
        native_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "${{1:-}}" == "-e" ]]; then
                  exec '{real_node}' "$@"
                fi
                case "${{2:-}}" in
                  preflight) printf '%s\\n' '{native_ok}' ;;
                  list-state) printf '%s\\n' '{native_state_json}' ;;
                  max-queue-depth) printf '%s\\n' '16' ;;
                  --classify-queue) printf '%s\\n' '[]' ;;
                  unmergeable-eject) printf '%s\\n' '{{"action":"keep","reason":"not-queued"}}' ;;
                  changelog-drain) printf '%s\\n' '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
                  changelog-inventory) printf '%s\\n' '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
                  front-churn) printf '%s\\n' '{{"action":"allow","reason":"no classified failure"}}' ;;
                  explain-selector) printf '%s\\n' '{{"observed":true,"queued":false,"eligible":false,"reason":"release-wave-hold"}}' ;;
                  unmergeable-reenqueue) printf '%s\\n' '{{"action":"allow","reason":"no-eject-receipt"}}' ;;
                  enroll)
                    printf 'enroll %s\\n' "${{3:-}}" >>'{logs["enroll"]}'
                    printf '%s\\n' '{native_receipt}'
                    ;;
                  dequeue|dequeue-ineligible)
                    printf 'dequeue %s\\n' "${{3:-}}" >>'{logs["dequeue"]}'
                    if [[ "${{3:-}}" == "102" ]]; then touch '{held_removed}'; fi
                    printf '%s\\n' '{native_dequeue}'
                    ;;
                  prove-admission|prove-receipt) printf '%s\\n' '{{"ok":false}}' ;;
                  *) echo "unexpected native node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        native_node.chmod(native_node.stat().st_mode | stat.S_IXUSR)
    logs["held_removed"] = held_removed
    logs["clean_enrolled"] = clean_enrolled
    return logs


class TestNullCreatorQueueReceiptProvenance:
    def test_product_failure_tombstone_never_dequeues_queue_follower(
        self, tmp_path: Path
    ) -> None:
        head = "8" * 40
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=17013,
            head=head,
            title="Follower with stale failure receipt",
            status=_null_creator_status(
                head=head,
                context="jovie-queue-product-failure/v1",
                state="success",
                description="blocked:merge-group-product-failure",
            ),
            run=_trusted_autoenroll_run(head=head),
            queued=True,
            queue_position=2,
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert logs["front_churn"].read_text(encoding="utf-8") == ""
        assert logs["dequeue"].read_text(encoding="utf-8") == ""

    def test_newer_active_group_protects_head_before_failure_tombstone(
        self, tmp_path: Path
    ) -> None:
        head = "8" * 40
        base = "9" * 40
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=17013,
            head=head,
            title="Active exact-main carrier",
            status=_null_creator_status(
                head=head,
                context="jovie-queue-product-failure/v1",
                state="success",
                description="blocked:merge-group-product-failure",
            ),
            run=_trusted_autoenroll_run(head=head),
            queued=True,
            front_churn="active",
            merge_group_runs=[
                {
                    "id": 88,
                    "headBranch": f"gh-readonly-queue/main/pr-17013-{base}",
                    "status": "in_progress",
                    "conclusion": None,
                    "headSha": "7" * 40,
                    "createdAt": "2026-09-02T11:13:03Z",
                    "updatedAt": "2026-09-02T11:15:46Z",
                }
            ],
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert logs["front_churn"].read_text(encoding="utf-8") == "front-churn\n"
        assert logs["dequeue"].read_text(encoding="utf-8") == ""
        assert "durable classified/repeated" not in result.stdout

    def test_trusted_product_failure_creator_null_skips_scan_post_dequeue_and_enroll(
        self, tmp_path: Path
    ) -> None:
        head = "8" * 40
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=16068,
            head=head,
            title="Trusted product-failure creator null",
            status=_null_creator_status(
                head=head,
                context="jovie-queue-product-failure/v1",
                state="success",
                description="blocked:merge-group-product-failure",
            ),
            run=_trusted_autoenroll_run(head=head),
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=16068 DRAIN_ADMISSION_HEAD={head} "
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "product-failure-tombstone" in result.stdout
        assert "+jovie-queue-product-failure/v1" not in result.stdout
        assert logs["front_churn"].read_text(encoding="utf-8") == ""
        assert logs["jobs"].read_text(encoding="utf-8") == ""
        assert logs["post"].read_text(encoding="utf-8") == ""
        assert logs["enroll"].read_text(encoding="utf-8") == ""
        assert logs["dequeue"].read_text(encoding="utf-8") == ""
        assert "Actions history must not be required" not in result.stderr
        assert "null-creator fixture must not enroll" not in result.stderr

    def test_second_pass_over_trusted_product_failure_receipt_makes_zero_writes(
        self, tmp_path: Path
    ) -> None:
        head = "8" * 40
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=16068,
            head=head,
            title="Second-pass product-failure creator null",
            status=_null_creator_status(
                head=head,
                context="jovie-queue-product-failure/v1",
                state="success",
                description="blocked:merge-group-product-failure",
            ),
            run=_trusted_autoenroll_run(head=head),
        )
        command = _drain_command(
            tmp_path,
            backend="native",
            extra_env=(
                f"DRAIN_ADMISSION_PR=16068 DRAIN_ADMISSION_HEAD={head} "
                "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                "GITHUB_API_URL=https://api.github.com"
            ),
        )

        first = _run_bash(command)
        second = _run_bash(command)

        assert first.returncode == 0, f"stdout={first.stdout}\nstderr={first.stderr}"
        assert second.returncode == 0, f"stdout={second.stdout}\nstderr={second.stderr}"
        assert logs["post"].read_text(encoding="utf-8") == ""
        assert "+jovie-queue-product-failure/v1" not in first.stdout
        assert "+jovie-queue-product-failure/v1" not in second.stdout

    @pytest.mark.parametrize(
        ("mutation", "label"),
        [
            (
                lambda head: {
                    "status": _null_creator_status(
                        head=head,
                        context="jovie-queue-product-failure/v1",
                        state="success",
                        description="blocked:merge-group-product-failure",
                        avatar_url="https://avatars.githubusercontent.com/u/1?v=4",
                    ),
                    "run": _trusted_autoenroll_run(head=head),
                    "avatar_url": _TRUSTED_BOT_AVATAR,
                },
                "avatar",
            ),
            (
                lambda head: {
                    "status": _null_creator_status(
                        head=head,
                        context="jovie-queue-product-failure/v1",
                        state="success",
                        description="blocked:merge-group-product-failure",
                    ),
                    "run": _trusted_autoenroll_run(
                        head=head, workflow_name="Unrelated Workflow"
                    ),
                },
                "run",
            ),
            (
                lambda head: {
                    "status": _null_creator_status(
                        head=head,
                        context="jovie-queue-product-failure/v1",
                        state="success",
                        description="blocked:merge-group-product-failure",
                    ),
                    "run": _trusted_autoenroll_run(
                        head=head,
                        workflow_path=".github/workflows/ci.yml",
                    ),
                },
                "path",
            ),
            (
                lambda head: {
                    "status": _null_creator_status(
                        head=head,
                        context="jovie-queue-product-failure/v1",
                        state="success",
                        description="blocked:merge-group-product-failure",
                    ),
                    "run": _trusted_autoenroll_run(
                        head=head, repository="JovieInc/NotJovie"
                    ),
                },
                "repository",
            ),
            (
                lambda head: {
                    "status": _null_creator_status(
                        head=head,
                        context="jovie-queue-product-failure/v1",
                        state="success",
                        description="blocked:merge-group-product-failure",
                    ),
                    "run": _trusted_autoenroll_run(head=head, run_head="e" * 40),
                },
                "head",
            ),
        ],
    )
    def test_untrusted_product_failure_creator_null_fails_closed(
        self,
        tmp_path: Path,
        mutation,
        label: str,
    ) -> None:
        head = "8" * 40
        fixture = mutation(head)
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=16068,
            head=head,
            title=f"Untrusted product-failure {label}",
            status=fixture["status"],
            run=fixture["run"],
            avatar_url=fixture.get("avatar_url", _TRUSTED_BOT_AVATAR),
            front_churn="allow",
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRY_RUN=1 DRAIN_ADMISSION_PR=16068 DRAIN_ADMISSION_HEAD={head} "
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "product-failure-tombstone" not in result.stdout
        assert logs["front_churn"].read_text(encoding="utf-8") == "front-churn\n"
        assert "+jovie-queue-product-failure/v1" not in result.stdout

    def test_trusted_queue_reentry_creator_null_recovers_without_duplicate_status(
        self, tmp_path: Path
    ) -> None:
        head = "a" * 40
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=1001,
            head=head,
            title="Trusted queue-reentry creator null",
            status=_null_creator_status(
                head=head,
                context="jovie-queue-admission/v2",
                state="success",
                description=f"checkpoint=verified;main={'a' * 40};pr=1001",
            ),
            run=_trusted_autoenroll_run(head=head),
            front_churn="allow",
            allow_enroll=True,
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_RECONCILE_QUEUE_REENTRY=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=2 "
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "exact native re-entry at " + head in result.stdout
        assert logs["enroll"].read_text(encoding="utf-8").splitlines() == ["1001"]
        assert logs["post"].read_text(encoding="utf-8") == ""
        assert "+jovie-queue-admission/v2" not in result.stdout
        assert f"=jovie-queue-admission/v2 on #1001 at {head} (already recorded)" in result.stdout

    def test_reentry_writes_fresh_receipt_for_the_latest_admission_run(
        self, tmp_path: Path
    ) -> None:
        head = "a" * 40
        prior = _null_creator_status(
            head=head,
            context="jovie-queue-admission/v2",
            state="success",
            description=f"checkpoint=verified;main={'a' * 40};pr=1001",
        )
        prior["creator"] = {"login": "jovie-bot[bot]", "type": "Bot"}
        prior["target_url"] = "https://github.com/JovieInc/Jovie/actions/runs/76"
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=1001,
            head=head,
            title="Fresh canonical reentry receipt",
            status=prior,
            run=_trusted_autoenroll_run(head=head),
            front_churn="allow",
            allow_enroll=True,
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_RECONCILE_QUEUE_REENTRY=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=1 "
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert logs["enroll"].read_text(encoding="utf-8").splitlines() == ["1001"]
        posted = logs["post"].read_text(encoding="utf-8")
        assert "context=jovie-queue-admission/v2" in posted
        assert f"description=checkpoint=source-qualified;main={'a' * 40};pr=1001" in posted
        assert "target_url=https://github.com/JovieInc/Jovie/actions/runs/77" in posted

    def test_wrong_workflow_receipt_is_replaced_by_canonical_admission_without_dequeue(self, tmp_path: Path) -> None:
        head = "a" * 40
        prior = _null_creator_status(
            head=head, context="jovie-queue-admission/v2", state="success",
            description=f"checkpoint=source-qualified;main={head};pr=1001",
        )
        prior["creator"] = {"login": "jovie-bot[bot]", "type": "Bot"}
        prior["target_url"] = "https://github.com/JovieInc/Jovie/actions/runs/76"
        prior_run = _trusted_autoenroll_run(head=head)
        prior_run.update(id=76, name="Queue-Deferred Release", path=".github/workflows/queue-deferred-release.yml", html_url=prior["target_url"])
        (tmp_path / "prior-run.json").write_text(json.dumps(prior_run))
        logs = _write_null_creator_receipt_drain(
            tmp_path, pr=1001, head=head, title="Canonical recovery", status=prior,
            run=_trusted_autoenroll_run(head=head), queued=True, queue_entry_state="QUEUED",
            front_churn="allow", allow_enroll=True, labels=[],
        )
        result = _run_bash(_drain_command(
            tmp_path, backend="native",
            extra_env="DRAIN_PROMOTION_MODE=normal DRAIN_RECONCILE_MISSED_ADMISSION=1",
        ))
        assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
        # JOV-6444 churn fix: an invalid receipt is never dequeue evidence. The
        # queued member stays queued; recovery only re-stamps when enrollment fires.
        assert logs["dequeue"].read_text().splitlines() == []
        assert logs["enroll"].read_text().splitlines() == []
        assert "canonical dequeue" not in result.stdout
        posted = logs["post"].read_text()
        assert "context=jovie-queue-admission/v2" not in posted

    def test_reentry_rejects_a_receipt_written_by_another_bot(
        self, tmp_path: Path
    ) -> None:
        head = "a" * 40
        forged = _null_creator_status(
            head=head,
            context="jovie-queue-admission/v2",
            state="success",
            description=f"checkpoint=verified;main={'a' * 40};pr=1001",
        )
        forged["creator"] = {"login": "cursor[bot]", "type": "Bot"}
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=1001,
            head=head,
            title="Forged queue receipt",
            status=forged,
            run=_trusted_autoenroll_run(head=head),
            front_churn="allow",
            allow_enroll=True,
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_RECONCILE_QUEUE_REENTRY=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=1 "
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert logs["enroll"].read_text(encoding="utf-8") == ""
        assert logs["post"].read_text(encoding="utf-8") == ""

    def test_trusted_unmergeable_eject_creator_null_blocks_enroll_without_rewrite(
        self, tmp_path: Path
    ) -> None:
        head = "b" * 40
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=16072,
            head=head,
            title="Trusted unmergeable creator null",
            status=_null_creator_status(
                head=head,
                context="jovie-native-unmergeable/v1",
                state="success",
                description="ejected:changelog-collision",
            ),
            run=_trusted_autoenroll_run(head=head),
            front_churn="allow",
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=16072 DRAIN_ADMISSION_HEAD={head} "
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 3, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "unmergeable-tombstone" in result.stdout
        assert (
            "queue-noop: classified-skip: exact admission #16072 at "
            + head
            + " (unmergeable-tombstone; native admission refused, hard gate preserved)"
            in result.stderr
        )
        assert logs["enroll"].read_text(encoding="utf-8") == ""
        assert logs["post"].read_text(encoding="utf-8") == ""
        assert logs["dequeue"].read_text(encoding="utf-8") == ""
        assert "+jovie-native-unmergeable/v1" not in result.stdout
        assert "null-creator fixture must not enroll" not in result.stderr


class TestStarvedGroupDequeue:
    @staticmethod
    def _neutral_status(head: str) -> dict[str, object]:
        return _null_creator_status(
            head=head,
            context="ci/pr-ready",
            state="success",
            description="pass",
        )

    @staticmethod
    def _queued_iso(minutes_ago: int) -> str:
        return (
            datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

    def test_starved_awaiting_checks_entry_is_dequeued(self, tmp_path: Path) -> None:
        head = "8" * 40
        queued_at = self._queued_iso(47)
        lookalike_run = self._group_run(164201, self._queued_iso(35))
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=16420,
            head=head,
            title="Starved merge group front",
            status=self._neutral_status(head),
            run=_trusted_autoenroll_run(head=head),
            queued=True,
            front_churn="allow",
            merge_group_runs=[lookalike_run],
            timeline_events=[{"event": "added_to_merge_queue", "created_at": queued_at}],
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert logs["timeline"].read_text(encoding="utf-8") != ""
        assert logs["dequeue"].read_text(encoding="utf-8") == "dequeue\n"
        assert "dequeue-ineligible 16420 " + head in logs["dequeue_args"].read_text(encoding="utf-8")
        assert "starved-group" in result.stdout
        assert "complete merge-group inventory and no matching run" in result.stdout

    @staticmethod
    def _group_run(pr: int, created_at: str, *, status: str = "in_progress") -> dict[str, object]:
        return {
            "id": 88,
            "head_branch": f"gh-readonly-queue/main/pr-{pr}-{'9' * 40}",
            "status": status,
            "conclusion": "success" if status == "completed" else None,
            "head_sha": "7" * 40,
            "created_at": created_at,
            "updated_at": created_at,
        }

    def test_existing_in_flight_group_ci_run_leaves_entry_queued(self, tmp_path: Path) -> None:
        head = "8" * 40
        queued_at = self._queued_iso(47)
        run_created_at = self._queued_iso(35)
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=16420,
            head=head,
            title="Group with a live CI run",
            status=self._neutral_status(head),
            run=_trusted_autoenroll_run(head=head),
            queued=True,
            front_churn="active",
            merge_group_runs=[self._group_run(16420, run_created_at)],
            timeline_events=[{"event": "added_to_merge_queue", "created_at": queued_at}],
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "exact merge-group branch has CI run evidence" in result.stdout
        assert logs["timeline"].read_text(encoding="utf-8").count("timeline") == 1
        scoped_query = logs["group_runs"].read_text(encoding="utf-8")
        assert "event=merge_group" in scoped_query
        assert f"created={queued_at}.." in scoped_query
        assert logs["dequeue"].read_text(encoding="utf-8") == ""

    def test_matching_run_on_second_page_after_100_runs_leaves_entry_queued(self, tmp_path: Path) -> None:
        head = "8" * 40
        queued_at = self._queued_iso(47)
        created_at = self._queued_iso(35)
        other_runs = [
            self._group_run(17000 + index, created_at, status="completed")
            for index in range(100)
        ]
        matching_run = self._group_run(16420, created_at)
        runs = other_runs + [matching_run]
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=16420,
            head=head,
            title="Group after a busy run window",
            status=self._neutral_status(head),
            run=_trusted_autoenroll_run(head=head),
            queued=True,
            front_churn="allow",
            merge_group_pages=[
                {"total_count": 101, "workflow_runs": runs[:100]},
                {"total_count": 101, "workflow_runs": runs[100:]},
            ],
            timeline_events=[{"event": "added_to_merge_queue", "created_at": queued_at}],
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "exact merge-group branch has CI run evidence" in result.stdout
        assert logs["group_runs"].read_text(encoding="utf-8") != ""
        assert logs["dequeue"].read_text(encoding="utf-8") == ""

    @pytest.mark.parametrize("case", ["api-failure", "api-cap", "incomplete-page", "malformed", "unknown-status"])
    def test_unknown_or_incomplete_run_inventory_never_dequeues(self, tmp_path: Path, case: str) -> None:
        head = "8" * 40
        queued_at = self._queued_iso(47)
        created_at = self._queued_iso(35)
        run = self._group_run(17001, created_at, status="completed")
        inventory: dict[str, object] = {}
        if case == "api-failure":
            inventory["merge_group_api_fails"] = True
        elif case == "api-cap":
            inventory["merge_group_pages"] = [{"total_count": 1000, "workflow_runs": [run]}]
        elif case == "incomplete-page":
            inventory["merge_group_pages"] = [{"total_count": 2, "workflow_runs": [run]}]
        elif case == "unknown-status":
            inventory["merge_group_pages"] = [
                {"total_count": 1, "workflow_runs": [self._group_run(17001, created_at, status="waiting")]}
            ]
        else:
            inventory["merge_group_raw"] = "{\"total_count\":0}"
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=16420,
            head=head,
            title="Unknown run inventory",
            status=self._neutral_status(head),
            run=_trusted_autoenroll_run(head=head),
            queued=True,
            front_churn="allow",
            timeline_events=[{"event": "added_to_merge_queue", "created_at": queued_at}],
            **inventory,
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "leaving queued" in result.stdout
        assert logs["group_runs"].read_text(encoding="utf-8") != ""
        assert logs["dequeue"].read_text(encoding="utf-8") == ""

    def test_replacement_queue_entry_during_inventory_is_left_queued(self, tmp_path: Path) -> None:
        head = "8" * 40
        queued_at = self._queued_iso(47)
        replacement_at = self._queued_iso(1)
        events = [{"event": "added_to_merge_queue", "created_at": queued_at}]
        replacement_events = events + [
            {"event": "added_to_merge_queue", "created_at": replacement_at}
        ]
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=16420,
            head=head,
            title="Queue entry replaced during inventory",
            status=self._neutral_status(head),
            run=_trusted_autoenroll_run(head=head),
            queued=True,
            front_churn="allow",
            timeline_events=events,
            timeline_events_after=replacement_events,
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "queue entry changed during run inventory" in result.stdout
        assert logs["timeline"].read_text(encoding="utf-8").count("timeline") == 2
        assert logs["dequeue"].read_text(encoding="utf-8") == ""

    def test_fresh_entry_below_threshold_is_left_alone(self, tmp_path: Path) -> None:
        head = "8" * 40
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=16420,
            head=head,
            title="Recently queued entry",
            status=self._neutral_status(head),
            run=_trusted_autoenroll_run(head=head),
            queued=True,
            front_churn="allow",
            timeline_events=[
                {
                    "event": "added_to_merge_queue",
                    "created_at": self._queued_iso(5),
                }
            ],
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert logs["timeline"].read_text(encoding="utf-8") != ""
        assert logs["dequeue"].read_text(encoding="utf-8") == ""
        assert "✗ starved-group" not in result.stdout

    def test_timeline_read_failure_never_dequeues(self, tmp_path: Path) -> None:
        head = "8" * 40
        logs = _write_null_creator_receipt_drain(
            tmp_path,
            pr=16420,
            head=head,
            title="Unreadable timeline entry",
            status=self._neutral_status(head),
            run=_trusted_autoenroll_run(head=head),
            queued=True,
            front_churn="allow",
            timeline_fails=True,
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert logs["timeline"].read_text(encoding="utf-8") != ""
        assert logs["dequeue"].read_text(encoding="utf-8") == ""
        assert "timeline read failed; leaving queued" in result.stdout


class TestExactHeadQueueReceipt:
    def test_pre_land_changelog_exact_target_fails_without_native_receipt(
        self, tmp_path: Path
    ) -> None:
        head = "6" * 40
        _write_native_receipt_fakes(
            tmp_path,
            head=head,
            mergeable="MERGEABLE",
            is_draft=False,
            selector={
                "observed": True,
                "queued": False,
                "eligible": True,
                "reason": "eligible",
            },
            receipt={
                "ok": False,
                "attempts": 2,
                "state": {
                    "isInMergeQueue": False,
                    "queued": False,
                    "headRefOid": head,
                    "mergeQueueEntry": None,
                    "autoMergeRequest": None,
                },
                "explanation": {
                    "ok": False,
                    "reason": "isInMergeQueue=false mergeQueueEntry=null",
                },
            },
            changelog_collision={
                "action": "skip",
                "reason": "pre-land-changelog",
            },
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=f"DRAIN_ADMISSION_PR=16068 DRAIN_ADMISSION_HEAD={head}",
            )
        )

        assert result.returncode == 3, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert (
            "pre-land CHANGELOG.md edit is prohibited (pre-land-changelog) for #16068"
            in result.stdout
        )
        assert (
            "queue-noop: classified-skip: exact admission #16068 at "
            + head
            + " (pre-land-changelog; native admission refused, hard gate preserved)"
            in result.stderr
        )
        assert "enroll should not run" not in result.stderr

    def test_durable_product_failure_receipt_blocks_when_actions_history_aged_out(
        self, tmp_path: Path
    ) -> None:
        head = "8" * 40
        main = "9" * 40
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state) echo '{{"16068":{{"headRefOid":"{head}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":false,"isInMergeQueue":false,"mergeQueueEntry":null}}}}' ;;
                  explain-selector) cat >/dev/null; echo '{{"observed":true,"queued":false,"eligible":true,"reason":"eligible"}}' ;;
                  prove-receipt) echo '{{"ok":false,"state":{{"queued":false}},"explanation":{{"reason":"not-queued"}}}}' ;;
                  enroll) echo "durable product-failure receipt must block enroll" >&2; exit 91 ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  front-churn) echo "Actions history must not be required after a durable receipt" >&2; exit 92 ;;
                  unmergeable-eject) echo '{{"action":"keep","reason":"not-queued"}}' ;;
                  unmergeable-reenqueue) echo '{{"action":"allow","reason":"no-eject-receipt"}}' ;;
                  changelog-collision) echo '{{"action":"allow","reason":"candidate-omits-changelog"}}' ;;
                  changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
                  changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 93 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":16068,"t":"Durable product failure","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/product-failure","headOid":"{head}","base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/git/ref/heads/main"* ]]; then
                  echo '{main}'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/actions/workflows/ci.yml/runs"* ]]; then
                  echo '[]'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/commits/{head}/status"* ]]; then
                  echo '{{"statuses":[{{"context":"jovie-queue-product-failure/v1","state":"success","description":"blocked:merge-group-product-failure","creator":{{"type":"Bot"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","updated_at":"2026-08-28T14:20:00Z"}}]}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 94
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=f"DRAIN_ADMISSION_PR=16068 DRAIN_ADMISSION_HEAD={head}",
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "product-failure-tombstone" in result.stdout
        assert "durable product-failure receipt must block enroll" not in result.stderr
        assert "Actions history must not be required" not in result.stderr

    def test_new_source_head_does_not_inherit_old_product_failure_tombstone(
        self, tmp_path: Path
    ) -> None:
        old_head = "7" * 40
        new_head = "8" * 40
        main = "9" * 40
        api_calls = tmp_path / "api-calls"
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state) echo '{{"16070":{{"headRefOid":"{new_head}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":false,"isInMergeQueue":false,"mergeQueueEntry":null}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  front-churn) echo '{{"action":"allow","reason":"new head has no failed attempt","evidence":null}}' ;;
                  unmergeable-eject) echo '{{"action":"keep","reason":"not-queued"}}' ;;
                  unmergeable-reenqueue) echo '{{"action":"allow","reason":"no-eject-receipt"}}' ;;
                  changelog-collision) echo '{{"action":"allow","reason":"candidate-omits-changelog"}}' ;;
                  changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
                  changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 93 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":16070,"t":"Moved product-failure head","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/moved-product-failure","headOid":"{new_head}","base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{new_head}","baseRefName":"main","body":"","files":[]}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  printf '%s\n' "$2" >>'{api_calls}'
                  if [[ "$2" == *"/git/ref/heads/main"* ]]; then echo '{main}'; exit 0; fi
                  if [[ "$2" == *"/actions/workflows/ci.yml/runs"* ]]; then echo '[]'; exit 0; fi
                  if [[ "$2" == *"/commits/{new_head}/status"* ]]; then echo '{{"statuses":[]}}'; exit 0; fi
                  if [[ "$2" == *"/commits/{old_head}/status"* ]]; then
                    echo '{{"statuses":[{{"context":"jovie-queue-product-failure/v1","state":"success","description":"blocked:merge-group-product-failure","creator":{{"type":"Bot"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77"}}]}}'
                    exit 0
                  fi
                  if [[ "$2" == *"/commits/{new_head}"* ]]; then echo '2026-08-28T14:30:00Z'; exit 0; fi
                fi
                echo "unexpected gh args: $*" >&2
                exit 94
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRY_RUN=1 DRAIN_ADMISSION_PR=16070 DRAIN_ADMISSION_HEAD={new_head}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would enroll #16070 via native" in result.stdout
        calls = api_calls.read_text(encoding="utf-8")
        assert f"/commits/{new_head}/status" in calls
        assert f"/commits/{old_head}/status" not in calls

    def test_classified_product_failure_persists_exact_head_tombstone_before_return(
        self, tmp_path: Path
    ) -> None:
        head = "a" * 40
        main = "b" * 40
        post_args = tmp_path / "product-failure-status-post"
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state) echo '{{"16069":{{"headRefOid":"{head}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":false,"isInMergeQueue":false,"mergeQueueEntry":null}}}}' ;;
                  explain-selector) cat >/dev/null; echo '{{"observed":true,"queued":false,"eligible":true,"reason":"eligible"}}' ;;
                  prove-receipt) echo '{{"ok":false,"state":{{"queued":false}},"explanation":{{"reason":"not-queued"}}}}' ;;
                  enroll) echo "classified product failure must not enroll" >&2; exit 91 ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  front-churn) echo '{{"action":"block","reason":"unchanged head failed product checks","evidence":{{"failureClass":"repeated-product-check"}}}}' ;;
                  unmergeable-eject) echo '{{"action":"keep","reason":"not-queued"}}' ;;
                  unmergeable-reenqueue) echo '{{"action":"allow","reason":"no-eject-receipt"}}' ;;
                  changelog-collision) echo '{{"action":"allow","reason":"candidate-omits-changelog"}}' ;;
                  changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
                  changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 93 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":16069,"t":"Fresh classified product failure","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/classified-product-failure","headOid":"{head}","base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/git/ref/heads/main"* ]]; then
                  echo '{main}'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/actions/workflows/ci.yml/runs"* ]]; then
                  echo '[]'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/commits/{head}" && "$2" != *"/status"* ]]; then
                  echo '2026-08-28T13:00:00Z'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/commits/{head}/status"* ]]; then
                  echo '{{"statuses":[]}}'
                  exit 0
                fi
                if [[ "$1" == "api" && " $* " == *" -X POST "* && " $* " == *"/statuses/{head} "* ]]; then
                  printf '%s\n' "$*" >'{post_args}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 94
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=16069 DRAIN_ADMISSION_HEAD={head} "
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "+jovie-queue-product-failure/v1" in result.stdout
        posted = post_args.read_text(encoding="utf-8")
        assert f"repos/JovieInc/Jovie/statuses/{head}" in posted
        assert "context=jovie-queue-product-failure/v1" in posted
        assert "description=blocked:merge-group-product-failure" in posted
        assert "classified product failure must not enroll" not in result.stderr

    def test_queued_product_failure_records_tombstone_before_dequeue(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        main = "d" * 40
        mutation_order = tmp_path / "mutation-order"
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state) echo '{{"16071":{{"headRefOid":"{head}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":true,"isInMergeQueue":true,"mergeQueueEntry":{{"state":"AWAITING_CHECKS","position":1}}}}}}' ;;
                  dequeue) printf 'dequeue\n' >>'{mutation_order}'; echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  front-churn) echo '{{"action":"block","reason":"unchanged head failed product checks","evidence":{{"failureClass":"deterministic-product-check"}}}}' ;;
                  unmergeable-eject) echo '{{"action":"keep","reason":"not-unmergeable"}}' ;;
                  changelog-collision) echo '{{"action":"allow","reason":"candidate-omits-changelog"}}' ;;
                  changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
                  changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 93 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":16071,"t":"Queued product failure","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/queued-product-failure","headOid":"{head}","base":"main","body":"","L":["merge-queue"],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[{{"name":"merge-queue"}}],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/git/ref/heads/main"* ]]; then echo '{main}'; exit 0; fi
                if [[ "$1" == "api" && "$2" == *"/actions/workflows/ci.yml/runs"* ]]; then echo '[]'; exit 0; fi
                if [[ "$1" == "api" && "$2" == *"/commits/{head}/status"* ]]; then echo '{{"statuses":[]}}'; exit 0; fi
                if [[ "$1" == "api" && "$2" == *"/commits/{head}" && "$2" != *"/status"* ]]; then echo '2026-08-28T13:00:00Z'; exit 0; fi
                if [[ "$1" == "api" && " $* " == *" -X POST "* && " $* " == *"/statuses/{head} "* ]]; then
                  printf 'status\n' >>'{mutation_order}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 94
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env="GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com",
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert mutation_order.read_text(encoding="utf-8").splitlines() == [
            "status",
            "dequeue",
        ]
        assert "+jovie-queue-product-failure/v1" in result.stdout

    def test_delayed_native_receipt_reconciles_without_enrolling(self, tmp_path: Path) -> None:
        head = "6" * 40
        _write_native_receipt_fakes(
            tmp_path,
            head=head,
            mergeable="UNKNOWN",
            is_draft=False,
            selector={
                "observed": True,
                "queued": False,
                "eligible": False,
                "reason": "mergeable=UNKNOWN",
            },
            receipt={
                "ok": True,
                "attempts": 3,
                "state": {
                    "isInMergeQueue": True,
                    "queued": True,
                    "headRefOid": head,
                    "mergeQueueEntry": {
                        "id": "MQE_1",
                        "state": "QUEUED",
                        "position": 1,
                    },
                },
                "explanation": {"ok": True, "reason": "queued"},
            },
        )
        recheck_trace = _install_native_receipt_test_trace(tmp_path)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=16068 DRAIN_ADMISSION_HEAD={head} "
                    "DRAIN_MERGEABLE_RECHECK_ATTEMPTS=6 "
                    "DRAIN_MERGEABLE_RECHECK_SECONDS=2 "
                    f"NATIVE_RECEIPT_TEST_TRACE={recheck_trace}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "delayed native receipt at " + head in result.stdout
        assert "state QUEUED, position 1" in result.stdout
        assert "queue-noop" not in result.stderr
        _assert_native_receipt_recheck_trace(result, recheck_trace, head)

    def test_selector_noop_fails_with_the_exact_reason(self, tmp_path: Path) -> None:
        head = "6" * 40
        _write_native_receipt_fakes(
            tmp_path,
            head=head,
            mergeable="UNKNOWN",
            is_draft=False,
            selector={
                "observed": True,
                "queued": False,
                "eligible": False,
                "reason": "mergeable=UNKNOWN",
            },
            receipt={
                "ok": False,
                "attempts": 2,
                "state": {
                    "isInMergeQueue": False,
                    "queued": False,
                    "headRefOid": head,
                    "mergeQueueEntry": None,
                    "autoMergeRequest": None,
                },
                "explanation": {
                    "ok": False,
                    "reason": "isInMergeQueue=false mergeQueueEntry=null",
                },
            },
        )
        recheck_trace = _install_native_receipt_test_trace(tmp_path)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=16068 DRAIN_ADMISSION_HEAD={head} "
                    "DRAIN_MERGEABLE_RECHECK_ATTEMPTS=6 "
                    "DRAIN_MERGEABLE_RECHECK_SECONDS=2 "
                    f"NATIVE_RECEIPT_TEST_TRACE={recheck_trace}"
                ),
            )
        )

        assert result.returncode == 3, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert (
            "queue-noop: selector: exact admission #16068 at "
            + head
            + " (mergeable=UNKNOWN)"
            in result.stderr
        )
        _assert_native_receipt_recheck_trace(result, recheck_trace, head)

    def test_missing_receipt_does_not_treat_auto_merge_as_membership(
        self, tmp_path: Path
    ) -> None:
        head = "6" * 40
        _write_native_receipt_fakes(
            tmp_path,
            head=head,
            mergeable="MERGEABLE",
            is_draft=True,
            selector={
                "observed": True,
                "queued": False,
                "eligible": True,
                "reason": "eligible",
            },
            receipt={
                "ok": False,
                "attempts": 2,
                "state": {
                    "isInMergeQueue": False,
                    "queued": False,
                    "headRefOid": head,
                    "mergeQueueEntry": None,
                    "autoMergeRequest": {"enabledAt": "2026-08-17T01:28:00Z"},
                },
                "explanation": {
                    "ok": False,
                    "reason": (
                        "isInMergeQueue=false mergeQueueEntry=null "
                        "autoMergeRequest=present (auto-merge intent is not membership)"
                    ),
                },
            },
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=f"DRAIN_ADMISSION_PR=16068 DRAIN_ADMISSION_HEAD={head}",
            )
        )

        assert result.returncode == 3, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert (
            "queue-noop: missing receipt: exact admission #16068 at " + head
            in result.stderr
        )
        assert "auto-merge intent is not membership" in result.stderr

    def test_delayed_receipt_fails_when_a_hard_hold_is_live(self, tmp_path: Path) -> None:
        head = "6" * 40
        _write_native_receipt_fakes(
            tmp_path,
            head=head,
            mergeable="UNKNOWN",
            is_draft=False,
            selector={
                "observed": True,
                "queued": False,
                "eligible": True,
                "reason": "eligible",
            },
            receipt={
                "ok": False,
                "attempts": 1,
                "state": {
                    "isInMergeQueue": True,
                    "queued": True,
                    "headRefOid": head,
                    "labels": {"nodes": [{"name": "queue-deferred"}]},
                    "mergeQueueEntry": {
                        "id": "MQE_1",
                        "state": "QUEUED",
                        "position": 1,
                    },
                },
                "explanation": {"ok": False, "reason": "held-by=queue-deferred"},
            },
        )
        recheck_trace = _install_native_receipt_test_trace(tmp_path)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=16068 DRAIN_ADMISSION_HEAD={head} "
                    "DRAIN_MERGEABLE_RECHECK_ATTEMPTS=6 "
                    "DRAIN_MERGEABLE_RECHECK_SECONDS=2 "
                    f"NATIVE_RECEIPT_TEST_TRACE={recheck_trace}"
                ),
            )
        )

        assert result.returncode == 3, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert (
            "queue-noop: missing receipt: exact admission #16068 at " + head
            in result.stderr
        )
        assert "held-by=queue-deferred" in result.stderr
        assert "delayed native receipt" not in result.stdout
        _assert_native_receipt_recheck_trace(result, recheck_trace, head)


class TestGhRetryHelper:
    def test_retries_transient_504_then_succeeds(self, tmp_path: Path) -> None:
        counter = tmp_path / "calls"
        counter.write_text("0", encoding="utf-8")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                count_file="${GH_RETRY_TEST_COUNTER:?}"
                count=$(<"$count_file")
                count=$((count + 1))
                echo "$count" >"$count_file"
                if [[ "$count" -lt 3 ]]; then
                  echo "HTTP 504: We couldn't respond to your request in time." >&2
                  exit 1
                fi
                echo '["ok"]'
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        script = textwrap.dedent(
            f"""\
            set -euo pipefail
            source "{_GH_RETRY}"
            export PATH="{tmp_path}:$PATH"
            export GH_RETRY_ATTEMPTS=5
            export GH_RETRY_BASE_DELAY=0
            export GH_RETRY_TEST_COUNTER="{counter}"
            out=$(gh_retry api graphql -f query='{{viewer{{login}}}}')
            test "$out" = '["ok"]'
            """
        )
        result = _run_bash(script)
        assert result.returncode == 0, result.stderr
        assert "gh-retry" in result.stderr
        assert counter.read_text(encoding="utf-8").strip() == "3"

    @pytest.mark.parametrize(
        "transient_error",
        [
            "stream error: stream ID 1; CANCEL; received from peer",
            "unexpected end of JSON input",
        ],
    )
    def test_retries_github_transport_truncation_then_succeeds(
        self, tmp_path: Path, transient_error: str
    ) -> None:
        counter = tmp_path / "calls"
        counter.write_text("0", encoding="utf-8")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                count_file="${GH_RETRY_TEST_COUNTER:?}"
                count=$(<"$count_file")
                count=$((count + 1))
                echo "$count" >"$count_file"
                if [[ "$count" -lt 2 ]]; then
                  echo "${GH_RETRY_TEST_ERROR:?}" >&2
                  exit 1
                fi
                echo '["ok"]'
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        script = textwrap.dedent(
            f"""\
            set -euo pipefail
            source "{_GH_RETRY}"
            export PATH="{tmp_path}:$PATH"
            export GH_RETRY_ATTEMPTS=3
            export GH_RETRY_BASE_DELAY=0
            export GH_RETRY_TEST_COUNTER="{counter}"
            export GH_RETRY_TEST_ERROR="{transient_error}"
            out=$(gh_retry pr list --json statusCheckRollup)
            test "$out" = '["ok"]'
            """
        )
        result = _run_bash(script)
        assert result.returncode == 0, result.stderr
        assert "gh-retry" in result.stderr
        assert counter.read_text(encoding="utf-8").strip() == "2"

    def test_does_not_retry_permanent_errors(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                echo "HTTP 401: Bad credentials" >&2
                exit 1
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        stderr_file = tmp_path / "stderr.txt"

        script = textwrap.dedent(
            f"""\
            set -euo pipefail
            source "{_GH_RETRY}"
            export PATH="{tmp_path}:$PATH"
            export GH_RETRY_ATTEMPTS=5
            export GH_RETRY_BASE_DELAY=0
            if gh_retry api user 2>"{stderr_file}"; then
              exit 2
            fi
            grep -q "HTTP 401" "{stderr_file}"
            test "$(wc -l <"{stderr_file}" | tr -d ' ')" = "1"
            """
        )
        result = _run_bash(script)
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"

    def test_does_not_retry_exhausted_installation_quota(
        self, tmp_path: Path
    ) -> None:
        counter = tmp_path / "calls"
        counter.write_text("0", encoding="utf-8")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                count_file="${GH_RETRY_TEST_COUNTER:?}"
                count=$(<"$count_file")
                echo "$((count + 1))" >"$count_file"
                echo "GraphQL: API rate limit already exceeded for installation ID 112037986." >&2
                exit 1
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        stderr_file = tmp_path / "stderr.txt"

        script = textwrap.dedent(
            f"""\
            set -euo pipefail
            source "{_GH_RETRY}"
            export PATH="{tmp_path}:$PATH"
            export GH_RETRY_ATTEMPTS=8
            export GH_RETRY_BASE_DELAY=0
            export GH_RETRY_TEST_COUNTER="{counter}"
            if gh_retry api graphql 2>"{stderr_file}"; then
              exit 2
            fi
            grep -q "rate limit already exceeded for installation ID" "{stderr_file}"
            test "$(wc -l <"{stderr_file}" | tr -d ' ')" = "1"
            """
        )
        result = _run_bash(script)
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert counter.read_text(encoding="utf-8").strip() == "1"


class TestReleaseWaveAdmissionHold:
    def test_active_release_wave_native_backend_keeps_healthy_entry_and_dequeues_hold(
        self, tmp_path: Path
    ) -> None:
        logs = _write_release_wave_drain_fixture(tmp_path, native=True)
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "MERGE_QUEUE_NATIVE_AUTHORIZATION=merge-queue-autoenroll "
                    "DRAIN_RELEASE_WAVE_HOLD=1 "
                    "DRAIN_RELEASE_WAVE_REASON=controller-wave-draining "
                    f"DRAIN_RELEASE_WAVE_EXPIRES_AT={expires_at} "
                    "DRAIN_RELEASE_WAVE_RUN_ID=123 "
                    "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                    "DRAIN_MAX_SECONDS=30 DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS=1"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "new native enrollment/re-entry is deferred" in result.stdout
        assert "queue depth: 2/16 (0 slots)" in result.stdout
        assert logs["enroll"].read_text(encoding="utf-8") == ""
        assert logs["dequeue"].read_text(encoding="utf-8") == "dequeue 102\n"
        assert "dequeue 101" not in logs["dequeue"].read_text(encoding="utf-8")
        assert logs["held_removed"].exists()
        assert not logs["clean_enrolled"].exists()

    def test_active_release_wave_holds_new_work_but_keeps_safety_dequeue(
        self, tmp_path: Path
    ) -> None:
        logs = _write_release_wave_drain_fixture(tmp_path)
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRAIN_RELEASE_WAVE_HOLD=1 "
                    "DRAIN_RELEASE_WAVE_REASON=controller-wave-draining "
                    f"DRAIN_RELEASE_WAVE_EXPIRES_AT={expires_at} "
                    "DRAIN_RELEASE_WAVE_RUN_ID=123 "
                    "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                    "DRAIN_MAX_SECONDS=30 DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS=1"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "new native enrollment/re-entry is deferred" in result.stdout
        assert "queue depth: 2/16 (0 slots)" in result.stdout
        assert logs["enroll"].read_text(encoding="utf-8") == ""
        assert logs["dequeue"].read_text(encoding="utf-8") == "dequeue 102\n"
        assert "dequeue 101" not in logs["dequeue"].read_text(encoding="utf-8")
        assert logs["held_removed"].exists()
        assert not logs["clean_enrolled"].exists()
        assert "#101" in result.stdout

    def test_expired_release_wave_resumes_exact_target_enrollment(
        self, tmp_path: Path
    ) -> None:
        logs = _write_release_wave_drain_fixture(tmp_path)
        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRAIN_RELEASE_WAVE_HOLD=1 "
                    "DRAIN_RELEASE_WAVE_REASON=controller-wave-active "
                    "DRAIN_RELEASE_WAVE_EXPIRES_AT=2000-01-01T00:00:00Z "
                    "DRAIN_RELEASE_WAVE_RUN_ID=123 "
                    "DRAIN_ADMISSION_PR=103 "
                    f"DRAIN_ADMISSION_HEAD={'c' * 40} "
                    "DRAIN_MAX_SECONDS=30 DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS=1"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "Release-wave admission hold expired" in result.stdout
        assert logs["enroll"].read_text(encoding="utf-8") == "enroll 103\n"
        assert logs["clean_enrolled"].exists()
        assert logs["dequeue"].read_text(encoding="utf-8") == "dequeue 102\n"
        assert "dequeue 101" not in logs["dequeue"].read_text(encoding="utf-8")


class TestDrainPrQueueWiring:
    def test_exact_admission_rereads_transient_unknown_mergeability(
        self, tmp_path: Path
    ) -> None:
        head = "a" * 40
        view_calls = tmp_path / "view-calls"
        view_calls.write_text("0", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  prove-admission) [[ -n "${{5:-}}" && "${{5}}" != "null" ]] ;;
                  list-state) echo '{{"101":{{"headRefOid":"{head}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":false}}}}' ;;
                  enroll) echo '{{"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_1","enqueuedAt":"2026-08-15T12:00:00Z","state":"AWAITING_CHECKS","position":1}}}}}}' ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  unmergeable-eject) echo '{{"action":"keep","reason":"not-queued"}}' ;;
                  unmergeable-reenqueue) echo '{{"action":"allow","reason":"no-eject-receipt"}}' ;;
                  changelog-collision) echo '{{"action":"allow","reason":"candidate-omits-changelog"}}' ;;
                  changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
                  changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":101,"t":"Transient mergeability","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/transient","headOid":"{head}","base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  count=$(<"{view_calls}")
                  count=$((count + 1))
                  echo "$count" >"{view_calls}"
                  mergeable=MERGEABLE
                  [[ "$count" -eq 1 ]] && mergeable=UNKNOWN
                  printf '%s\n' '{{"state":"OPEN","isDraft":false,"mergeable":"'"$mergeable"'","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" && " $* " == *" -X POST "* && " $* " == *"/statuses/{head} "* ]]; then
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/commits/{head}/status"* ]]; then
                  echo '{{"statuses":[]}}'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/actions/workflows/ci.yml/runs"* ]]; then
                  echo '[]'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/commits/{head}"* ]]; then
                  echo '2026-08-29T20:00:00Z'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then exit 1; fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=101 DRAIN_ADMISSION_HEAD={head} "
                    "DRAIN_MERGEABLE_RECHECK_ATTEMPTS=3 "
                    "DRAIN_MERGEABLE_RECHECK_SECONDS=0 "
                    "GITHUB_RUN_ID=42 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "mergeable=UNKNOWN for #101" in result.stdout
        assert "+native-queue on #101" in result.stdout
        assert int(view_calls.read_text(encoding="utf-8")) >= 2

    def test_exact_admission_uses_same_token_rest_mergeability_fallback(self, tmp_path: Path) -> None:
        head = "b" * 40
        base = "c" * 40
        rest_calls = tmp_path / "rest-calls"
        rest_calls.write_text("0", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  prove-admission) [[ -n "${{5:-}}" && "${{5}}" != "null" ]] ;;
                  list-state) echo '{{"101":{{"headRefOid":"{head}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":false}}}}' ;;
                  enroll) echo '{{"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_1","enqueuedAt":"2026-08-15T12:00:00Z","state":"AWAITING_CHECKS","position":1}}}}}}' ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  unmergeable-eject) echo '{{"action":"keep","reason":"not-queued"}}' ;;
                  unmergeable-reenqueue) echo '{{"action":"allow","reason":"no-eject-receipt"}}' ;;
                  changelog-collision) echo '{{"action":"allow","reason":"candidate-omits-changelog"}}' ;;
                  admission) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","stampPath":false}}' ;;
                  changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
                  changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
                  explain-selector) echo '{{"observed":true,"queued":false,"eligible":false,"reason":"mergeable=UNKNOWN"}}' ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  printf '%s\\n' '{{"state":"OPEN","isDraft":false,"mergeable":"UNKNOWN","labels":[],"headRefOid":"{head}","baseRefName":"main","baseRefOid":"{base}","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == "user" ]]; then
                  echo '{{"login":"github-actions[bot]","type":"Bot","id":418}}'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == "repos/JovieInc/Jovie/pulls/101" ]]; then
                  count=$(<"{rest_calls}")
                  echo "$((count + 1))" >"{rest_calls}"
                  echo '{{"number":101,"state":"open","draft":false,"mergeable":true,"mergeable_state":"clean","head":{{"sha":"{head}","ref":"codex/rest-fallback"}},"base":{{"sha":"{base}","ref":"main"}},"labels":[]}}'
                  exit 0
                fi
                if [[ "$1" == "api" && " $* " == *" -X POST "* && " $* " == *"/statuses/{head} "* ]]; then
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/commits/{head}/status"* ]]; then
                  echo '{{"statuses":[]}}'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/actions/workflows/ci.yml/runs"* ]]; then
                  echo '[]'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/commits/{head}"* ]]; then
                  echo '2026-08-29T20:00:00Z'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then exit 1; fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=101 DRAIN_ADMISSION_HEAD={head} "
                    "DRAIN_MERGEABLE_RECHECK_ATTEMPTS=3 "
                    "DRAIN_MERGEABLE_RECHECK_SECONDS=0 "
                    "GITHUB_RUN_ID=42 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert 'raw_mergeable_type":"string"' in result.stderr
        assert "api=rest" in result.stderr
        assert "actor=github-actions[bot]/Bot/418" in result.stderr
        assert "same-token REST mergeability fallback" in result.stderr
        assert "+native-queue on #101" in result.stdout
        assert int(rest_calls.read_text(encoding="utf-8")) == 3

    @pytest.mark.parametrize(
        ("rest_mode", "expected_rest_calls"),
        [
            ("head-mismatch", 1),
            ("base-mismatch", 1),
            ("labels-mismatch", 1),
            ("draft-mismatch", 1),
            ("state-mismatch", 1),
            ("false", 1),
            ("null", 1),
            ("read-failure", 1),
            ("flip", 2),
        ],
    )
    def test_same_token_rest_fallback_rejects_unstable_or_mismatched_evidence(
        self, tmp_path: Path, rest_mode: str, expected_rest_calls: int
    ) -> None:
        result, paths, _, _ = _run_same_token_rest_fixture(
            tmp_path, rest_mode=rest_mode
        )

        assert result.returncode == 3, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "queue-noop" in result.stderr
        assert "same-token REST mergeability fallback" not in result.stderr
        assert "+native-queue on #101" not in result.stdout
        assert int(paths["rest"].read_text(encoding="utf-8")) == expected_rest_calls
        assert int(paths["enroll"].read_text(encoding="utf-8")) == 0
        assert int(paths["dequeue"].read_text(encoding="utf-8")) == 0
        if rest_mode == "null":
            assert 'raw_mergeable":null' in result.stderr
        if rest_mode == "read-failure":
            assert "transport=failed" in result.stderr

    def test_post_enrollment_hold_is_not_masked_by_rest_fallback(
        self, tmp_path: Path
    ) -> None:
        result, paths, _, _ = _run_same_token_rest_fixture(
            tmp_path, rest_mode="valid", post_hold=True
        )

        assert result.returncode == 3, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "same-token REST mergeability fallback" in result.stderr
        assert "eligibility changed during native enrollment" in result.stdout
        assert "-native-queue on #101" in result.stdout
        assert int(paths["rest"].read_text(encoding="utf-8")) == 3
        assert int(paths["enroll"].read_text(encoding="utf-8")) == 1
        assert int(paths["dequeue"].read_text(encoding="utf-8")) == 1

    @pytest.mark.parametrize(
        (
            "enroll_mode",
            "dequeue_mode",
            "checkpoint_state",
            "expected_returncode",
            "expected_dequeues",
        ),
        [
            ("failure", "success", "verified", 1, "1"),
            ("malformed", "success", "verified", 1, "1"),
            ("failure", "failure", "verified", 1, "1"),
            ("valid", "success", "verified", 0, "0"),
            ("valid", "success", "unavailable", 0, "0"),
            ("valid", "success", "none", 0, "0"),
            ("source-failure", "success", "none", 3, "0"),
            ("pending", "success", "none", 0, "0"),
            ("pending", "success", "verified", 0, "0"),
            ("malformed-pending", "success", "verified", 1, "1"),
        ],
    )
    def test_native_enrollment_requires_receipt_and_compensates_once(
        self,
        tmp_path: Path,
        enroll_mode: str,
        dequeue_mode: str,
        checkpoint_state: str,
        expected_returncode: int,
        expected_dequeues: str,
    ) -> None:
        real_node = shutil.which("node")
        assert real_node is not None
        head = "a" * 40
        dequeue_calls = tmp_path / "dequeue-calls"
        dequeue_calls.write_text("0", encoding="utf-8")
        status_posts = tmp_path / "status-posts"
        status_posts.write_text("", encoding="utf-8")
        enroll_calls = tmp_path / "enroll-calls"
        enroll_calls.write_text("", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                command_name="${{2:-}}"
                case "$command_name" in
                  preflight) exit 0 ;;
                  prove-admission) [[ -n "${{5:-}}" && "${{5}}" != "null" ]] ;;
                  list-state) echo '{{"101":{{"headRefOid":"{head}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":false}}}}' ;;
                  enroll)
                    echo enroll >>"{enroll_calls}"
                    if [[ "${{FAKE_ENROLL_MODE:?}}" == "failure" ]]; then
                      exit 1
                    fi
                    if [[ "${{FAKE_ENROLL_MODE:?}}" == "valid" ]]; then
                      echo '{{"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_1","enqueuedAt":"2026-08-15T12:00:00Z","state":"AWAITING_CHECKS","position":3}}}}}}'
                      exit 0
                    fi
                    if [[ "${{FAKE_ENROLL_MODE:?}}" == "pending" ]]; then
                      echo '{{"disposition":"auto-merge-pending","state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","isInMergeQueue":false,"mergeQueueEntry":null,"autoMergeRequest":{{"enabledAt":"2026-09-08T16:00:00Z"}}}}}}'
                      exit 0
                    fi
                    if [[ "${{FAKE_ENROLL_MODE:?}}" == "malformed-pending" ]]; then
                      echo '{{"disposition":"auto-merge-pending","state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","isInMergeQueue":false,"mergeQueueEntry":null,"autoMergeRequest":null}}}}'
                      exit 0
                    fi
                    echo '{{"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":null}}}}'
                    ;;
                  dequeue)
                    count=$(<"${{FAKE_DEQUEUE_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_DEQUEUE_CALLS:?}}"
                    if [[ "${{FAKE_DEQUEUE_MODE:?}}" == "failure" ]]; then
                      exit 1
                    fi
                    echo '{{"state":{{"queued":false}}}}'
                    ;;
                  max-queue-depth) echo 16 ;;
                  unmergeable-eject) echo '{{"action":"keep","reason":"not-queued"}}' ;;
                  unmergeable-reenqueue) echo '{{"action":"allow","reason":"no-eject-receipt"}}' ;;
                  changelog-collision) echo '{{"action":"allow","reason":"candidate-omits-changelog"}}' ;;
                  changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
                  changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
                  --classify-queue) "{real_node}" "$@" ;;
                  explain-selector) "{real_node}" "$@" ;;
                  prove-receipt) echo '{{"ok":false,"explanation":{{"reason":"not-queued"}},"state":{{"queued":false}}}}' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":101,"t":"Receipt regression","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/receipt","headOid":"{head}","base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  if [[ "${{FAKE_ENROLL_MODE:?}}" == "source-failure" ]]; then
                    echo '[{{"name":"PR Ready","bucket":"fail","state":"FAILURE"}}]'
                    exit 0
                  fi
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ "$2" == *"/commits/{head}/statuses?per_page=100" ]]; then
                    echo '[[]]'
                    exit 0
                  fi
                  if [[ " $* " == *"/commits/{head}/status "* ]]; then
                    echo '{{"statuses":[]}}'
                    exit 0
                  fi
                  if [[ " $* " == *"/statuses/{head} "* ]]; then
                    printf '%s\n' "$*" >>'{status_posts}'
                    exit 0
                  fi
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=101 DRAIN_ADMISSION_HEAD={head} "
                    f"FAKE_ENROLL_MODE={enroll_mode} FAKE_DEQUEUE_MODE={dequeue_mode} "
                    f"FAKE_DEQUEUE_CALLS={dequeue_calls} "
                    f"DRAIN_PRODUCTION_CHECKPOINT_STATE={checkpoint_state} "
                    "GITHUB_RUN_ID=42 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == expected_returncode, (
            f"stdout={result.stdout}\nstderr={result.stderr}"
        )
        assert dequeue_calls.read_text(encoding="utf-8").strip() == expected_dequeues
        if enroll_mode == "valid":
            assert "+native-queue on #101" in result.stdout
            assert "state AWAITING_CHECKS, position 3" in result.stdout
        elif enroll_mode == "pending":
            assert "+auto-merge intent on #101" in result.stdout
            assert "+native-queue on #101" not in result.stdout
            assert status_posts.read_text(encoding="utf-8") == ""
        elif enroll_mode == "source-failure":
            assert enroll_calls.read_text(encoding="utf-8") == ""
            assert status_posts.read_text(encoding="utf-8") == ""
            assert "+native-queue" not in result.stdout
        else:
            assert "native enrollment" in result.stderr
        if dequeue_mode == "failure":
            assert "CRITICAL: could not compensate unproven" in result.stderr
        if enroll_mode == "valid":
            posted = status_posts.read_text(encoding="utf-8")
            assert "context=jovie-queue-admission/v2" in posted
            assert f"description=checkpoint=source-qualified;main={'a' * 40};pr=101" in posted

    def test_composite_ci_reentry_recovers_only_bounded_exact_bot_receipts(
        self, tmp_path: Path
    ) -> None:
        """Synthetic merge-group events may recover only prior native members."""
        heads = {"1001": "a" * 40, "1002": "b" * 40, "1003": "c" * 40}
        enrolled = tmp_path / "enrolled"
        enrolled.write_text("", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  prove-admission) [[ -n "${{5:-}}" && "${{5}}" != "null" ]] ;;
                  list-state)
                    echo '{{"1001":{{"headRefOid":"{heads["1001"]}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":false}},"1002":{{"headRefOid":"{heads["1002"]}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":false}},"1003":{{"headRefOid":"{heads["1003"]}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":false}}}}'
                    ;;
                  enroll)
                    echo "${{3:?}}" >>"{enrolled}"
                    head_var="${{4:?}}"
                    echo "{{\\"state\\":{{\\"state\\":\\"OPEN\\",\\"isDraft\\":false,\\"headRefOid\\":\\"$head_var\\",\\"mergeQueueEntry\\":{{\\"id\\":\\"MQE_${{3}}\\",\\"enqueuedAt\\":\\"2026-08-15T12:00:00Z\\",\\"state\\":\\"AWAITING_CHECKS\\",\\"position\\":1}}}}}}"
                    ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  unmergeable-eject) echo '{{"action":"keep","reason":"not-queued"}}' ;;
                  unmergeable-reenqueue) echo '{{"action":"allow","reason":"no-eject-receipt"}}' ;;
                  changelog-collision) echo '{{"action":"allow","reason":"candidate-omits-changelog"}}' ;;
                  changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
                  changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{{"n":1001,"t":"First exact receipt","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/one","headOid":"{heads["1001"]}","base":"main","body":"","L":[],"fail":[]}},{{"n":1002,"t":"Second exact receipt","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/two","headOid":"{heads["1002"]}","base":"main","body":"","L":[],"fail":[]}},{{"n":1003,"t":"Third exact receipt","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/three","headOid":"{heads["1003"]}","base":"main","body":"","L":[],"fail":[]}}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  case "$3" in
                    1001) head="{heads["1001"]}" ;;
                    1002) head="{heads["1002"]}" ;;
                    1003) head="{heads["1003"]}" ;;
                    *) echo "unexpected PR view: $*" >&2; exit 2 ;;
                  esac
                  echo "{{\\"state\\":\\"OPEN\\",\\"isDraft\\":false,\\"mergeable\\":\\"MERGEABLE\\",\\"labels\\":[],\\"headRefOid\\":\\"$head\\",\\"baseRefName\\":\\"main\\",\\"body\\":\\"\\"}}"
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ "$2" == *"/commits/"*"/status"* ]]; then
                    head="${{2#*/commits/}}"; head="${{head%%/status*}}"
                    case "$head" in
                      {heads["1001"]}) pr=1001 ;;
                      {heads["1002"]}) pr=1002 ;;
                      {heads["1003"]}) pr=1003 ;;
                      *) echo "unexpected receipt head: $head" >&2; exit 2 ;;
                    esac
                    echo "{{\\"statuses\\":[{{\\"context\\":\\"jovie-queue-admission/v2\\",\\"state\\":\\"success\\",\\"description\\":\\"checkpoint=verified;main={'a' * 40};pr=$pr\\",\\"creator\\":{{\\"type\\":\\"Bot\\",\\"login\\":\\"jovie-bot[bot]\\"}},\\"target_url\\":\\"https://github.com/JovieInc/Jovie/actions/runs/77\\",\\"updated_at\\":\\"2026-08-15T12:00:00Z\\"}}]}}"
                    exit 0
                  fi
                  # Merge-group churn is unknown in this isolated receipt test;
                  # the guard must never block or mutate on that missing data.
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_RECONCILE_QUEUE_REENTRY=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=2 "
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "bounded exact-head native admission" in result.stdout
        assert "exact native re-entry at " + heads["1001"] in result.stdout
        assert "exact native re-entry at " + heads["1002"] in result.stdout
        assert heads["1003"] not in result.stdout
        assert enrolled.read_text(encoding="utf-8").splitlines() == ["1001", "1002"]

    @pytest.mark.parametrize("released_hold", [False, True])
    def test_enqueued_continuation_recovers_next_eligible_head_without_duplicate_mutations(
        self, tmp_path: Path, released_hold: bool
    ) -> None:
        """Native events and released-hold clock wakes recover bounded exact heads."""
        heads = {
            "1001": "d" * 40,
            "1002": "e" * 40,
            "1003": "f" * 40,
            "1004": "a" * 40,
            "1005": "b" * 40,
        }
        real_node = shutil.which("node")
        assert real_node is not None
        enrolled = tmp_path / "enrolled"
        enrolled.write_text("", encoding="utf-8")
        conflict_label_calls = tmp_path / "conflict-label-calls"
        conflict_label_calls.write_text("", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "${{1:-}}" == "-e" ]]; then
                  exec "{real_node}" "$@"
                fi
                queued_json() {{
                  if grep -qx -- "$1" "{enrolled}"; then
                    printf true
                  else
                    printf false
                  fi
                }}
                queue_entry_json() {{
                  if grep -qx -- "$1" "{enrolled}"; then
                    printf '{{"id":"MQE_%s","state":"AWAITING_CHECKS","position":1}}' "$1"
                  else
                    printf null
                  fi
                }}
                queue_state() {{
                  printf '{{"1001":{{"headRefOid":"{heads["1001"]}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":%s,"isInMergeQueue":%s,"mergeQueueEntry":%s}},"1002":{{"headRefOid":"{heads["1002"]}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":%s,"isInMergeQueue":%s,"mergeQueueEntry":%s}},"1003":{{"headRefOid":"{heads["1003"]}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[{{"name":"needs-conflict-resolution"}}]}},"queued":%s,"isInMergeQueue":%s,"mergeQueueEntry":%s}},"1004":{{"headRefOid":"{heads["1004"]}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":%s,"isInMergeQueue":%s,"mergeQueueEntry":%s}},"1005":{{"headRefOid":"{heads["1005"]}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":%s,"isInMergeQueue":%s,"mergeQueueEntry":%s}}}}\\n' \
                    "$(queued_json 1001)" "$(queued_json 1001)" "$(queue_entry_json 1001)" \
                    "$(queued_json 1002)" "$(queued_json 1002)" "$(queue_entry_json 1002)" \
                    "$(queued_json 1003)" "$(queued_json 1003)" "$(queue_entry_json 1003)" \
                    "$(queued_json 1004)" "$(queued_json 1004)" "$(queue_entry_json 1004)" \
                    "$(queued_json 1005)" "$(queued_json 1005)" "$(queue_entry_json 1005)"
                }}
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  prove-admission) [[ -n "${{5:-}}" && "${{5}}" != "null" ]] ;;
                  list-state) queue_state ;;
                  explain-selector)
                    cat >/dev/null
                    number="${{3:?}}"
                    if grep -qx -- "$number" "{enrolled}"; then
                      echo '{{"observed":true,"queued":true,"eligible":false,"reason":"already-queued"}}'
                    else
                      echo '{{"observed":true,"queued":false,"eligible":true,"reason":"eligible"}}'
                    fi
                    ;;
                  prove-receipt) echo '{{"ok":false,"state":{{"queued":false}},"explanation":{{"reason":"not-queued"}}}}' ;;
                  enroll)
                    number="${{3:?}}"
                    head_var="${{4:?}}"
                    if grep -qx -- "$number" "{enrolled}"; then
                      echo "duplicate native enrollment for #$number" >&2
                      exit 91
                    fi
                    echo "$number" >>"{enrolled}"
                    echo "{{\\"state\\":{{\\"state\\":\\"OPEN\\",\\"isDraft\\":false,\\"headRefOid\\":\\"$head_var\\",\\"mergeQueueEntry\\":{{\\"id\\":\\"MQE_$number\\",\\"enqueuedAt\\":\\"2026-08-15T12:00:00Z\\",\\"state\\":\\"AWAITING_CHECKS\\",\\"position\\":1}}}}}}"
                    ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  unmergeable-eject) echo '{{"action":"keep","reason":"not-queued"}}' ;;
                  unmergeable-reenqueue) echo '{{"action":"allow","reason":"no-eject-receipt"}}' ;;
                  changelog-collision) echo '{{"action":"allow","reason":"candidate-omits-changelog"}}' ;;
                  changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
                  changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
                  --classify-queue) exec "{real_node}" "$@" ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{{"n":1001,"t":"Exact event target","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/event","headOid":"{heads["1001"]}","base":"main","body":"","L":["merge-queue"],"fail":[]}},{{"n":1002,"t":"Missed exact event","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/missed","headOid":"{heads["1002"]}","base":"main","body":"","L":["merge-queue"],"fail":[]}},{{"n":1003,"t":"Already-labelled conflict","draft":false,"m":"CONFLICTING","ms":"DIRTY","head":"codex/conflict","headOid":"{heads["1003"]}","base":"main","body":"","L":["merge-queue","needs-conflict-resolution"],"fail":[]}},{{"n":1004,"t":"Terminal red","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/red","headOid":"{heads["1004"]}","base":"main","body":"","L":["merge-queue"],"fail":["PR Ready"]}},{{"n":1005,"t":"Deferred by total cap","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/deferred","headOid":"{heads["1005"]}","base":"main","body":"","L":["merge-queue"],"fail":[]}}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  case "$3" in
                    1004) echo '[{{"name":"PR Ready","bucket":"fail","state":"FAILURE"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]' ;;
                    *) echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]' ;;
                  esac
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  mergeable=MERGEABLE
                  case "$3" in
                    1001) head="{heads["1001"]}"; labels='[{{"name":"merge-queue"}}]' ;;
                    1002) head="{heads["1002"]}"; labels='[{{"name":"merge-queue"}}]' ;;
                    1003) head="{heads["1003"]}"; labels='[{{"name":"merge-queue"}},{{"name":"needs-conflict-resolution"}}]'; mergeable=CONFLICTING ;;
                    1004) head="{heads["1004"]}"; labels='[{{"name":"merge-queue"}}]' ;;
                    1005) head="{heads["1005"]}"; labels='[{{"name":"merge-queue"}}]' ;;
                    *) echo "unexpected PR view: $*" >&2; exit 2 ;;
                  esac
                  echo "{{\\"state\\":\\"OPEN\\",\\"isDraft\\":false,\\"mergeable\\":\\"$mergeable\\",\\"labels\\":$labels,\\"headRefOid\\":\\"$head\\",\\"baseRefName\\":\\"main\\",\\"body\\":\\"\\"}}"
                  exit 0
                fi
                if [[ "$1 $2" == "pr edit" ]]; then
                  printf '%s\\n' "$*" >>"{conflict_label_calls}"
                  exit 97
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ "$2" == *"/commits/"*"/status"* ]]; then
                    echo '{{"statuses":[]}}'
                    exit 0
                  fi
                  if [[ " $* " == *" -X POST "* && " $* " == *"/statuses/"* ]]; then
                    exit 0
                  fi
                  # Merge-group churn is unknown in this isolated admission test.
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        admission_env = f"DRAIN_ADMISSION_PR=1001 DRAIN_ADMISSION_HEAD={heads['1001']} "
        if released_hold:
            expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )
            held = _run_bash(
                _drain_command(
                    tmp_path,
                    backend="native",
                    extra_env=(
                        "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                        "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=2 "
                        "DRAIN_RELEASE_WAVE_HOLD=1 "
                        "DRAIN_RELEASE_WAVE_REASON=controller-wave-active "
                        f"DRAIN_RELEASE_WAVE_EXPIRES_AT={expires_at} "
                        "DRAIN_RELEASE_WAVE_RUN_ID=123 "
                    ),
                )
            )
            assert held.returncode == 0, f"stdout={held.stdout}\nstderr={held.stderr}"
            assert "new native enrollment/re-entry is deferred" in held.stdout
            assert enrolled.read_text(encoding="utf-8") == ""
            # The later clock wake has no PR payload and no auto-merge intent.
            # It must recover fresh eligible heads after expiry, not bypass it.
            admission_env = (
                "DRAIN_RELEASE_WAVE_HOLD=1 "
                "DRAIN_RELEASE_WAVE_REASON=controller-wave-active "
                "DRAIN_RELEASE_WAVE_EXPIRES_AT=2000-01-01T00:00:00Z "
                "DRAIN_RELEASE_WAVE_RUN_ID=123 "
            )

        first = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    admission_env
                    + "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=2 "
                    "GITHUB_RUN_ID=78 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert first.returncode == 0, f"stdout={first.stdout}\\nstderr={first.stderr}"
        assert "bounded exact-head native admission" in first.stdout
        assert "exact missed admission at " + heads["1002"] in first.stdout
        assert "reached total exact admission cap (2)" in first.stdout
        if released_hold:
            assert "Release-wave admission hold expired" in first.stdout
            assert "exact missed admission at " + heads["1001"] in first.stdout
        else:
            assert "exact missed admission at " + heads["1001"] not in first.stdout
        assert "exact missed admission at " + heads["1003"] not in first.stdout
        assert "exact missed admission at " + heads["1004"] not in first.stdout
        assert "exact missed admission at " + heads["1005"] not in first.stdout
        assert "#1004" in first.stdout
        assert "PR Ready" in first.stdout
        assert enrolled.read_text(encoding="utf-8").splitlines() == ["1001", "1002"]
        assert conflict_label_calls.read_text(encoding="utf-8") == ""

        second = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=1002 DRAIN_ADMISSION_HEAD={heads['1002']} "
                    "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=2 "
                    "GITHUB_RUN_ID=79 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert second.returncode == 0, (
            f"stdout={second.stdout}\\nstderr={second.stderr}"
        )
        assert "exact missed admission at " + heads["1005"] in second.stdout
        assert "exact missed admission at " + heads["1003"] not in second.stdout
        assert "exact missed admission at " + heads["1004"] not in second.stdout
        assert enrolled.read_text(encoding="utf-8").splitlines() == [
            "1001",
            "1002",
            "1005",
        ]
        assert enrolled.read_text(encoding="utf-8").splitlines().count("1002") == 1
        assert conflict_label_calls.read_text(encoding="utf-8") == ""

        third = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=1005 DRAIN_ADMISSION_HEAD={heads['1005']} "
                    "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=2 "
                    "GITHUB_RUN_ID=80 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert third.returncode == 0, f"stdout={third.stdout}\\nstderr={third.stderr}"
        assert "exact missed admission at " not in third.stdout
        assert enrolled.read_text(encoding="utf-8").splitlines() == [
            "1001",
            "1002",
            "1005",
        ]
        assert conflict_label_calls.read_text(encoding="utf-8") == ""

    def test_missed_admission_recovery_refuses_a_head_that_moved(
        self, tmp_path: Path
    ) -> None:
        """A green snapshot cannot authorize the PR's newer untested head."""
        snapshot_head = "1" * 40
        live_head = "2" * 40
        enrolled = tmp_path / "enrolled"
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state) echo '{{"1001":{{"headRefOid":"{snapshot_head}","isDraft":false,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","baseRefName":"main","labels":{{"nodes":[]}},"queued":false}}}}' ;;
                  enroll) touch "{enrolled}"; exit 99 ;;
                  max-queue-depth) echo 16 ;;
                  unmergeable-eject) echo '{{"action":"keep","reason":"not-queued"}}' ;;
                  unmergeable-reenqueue) echo '{{"action":"allow","reason":"no-eject-receipt"}}' ;;
                  changelog-collision) echo '{{"action":"allow","reason":"candidate-omits-changelog"}}' ;;
                  changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
                  changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":1001,"t":"Head moved","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/moved","headOid":"{snapshot_head}","base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{live_head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then exit 1; fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env="DRAIN_RECONCILE_MISSED_ADMISSION=1",
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "event admission scope no longer matches #1001" in result.stdout
        assert not enrolled.exists(), "recovery mutated the newer PR head"

    def test_missed_admission_recovery_rejects_a_non_integer_cap_before_gh(
        self, tmp_path: Path
    ) -> None:
        called = tmp_path / "called"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            f"#!/usr/bin/env bash\\ntouch '{called}'\\nexit 99\\n",
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=abc"
                ),
            )
        )

        assert result.returncode == 2
        assert "must be a non-negative integer" in result.stderr
        assert not called.exists(), "drain invoked gh before cap preflight"

    def test_constrained_mode_refuses_missing_receipt_before_calling_gh(
        self, tmp_path: Path
    ) -> None:
        called = tmp_path / "called"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            f"#!/usr/bin/env bash\ntouch '{called}'\nexit 99\n",
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env="DRY_RUN=1 DRAIN_PROMOTION_MODE=isolated-only",
            )
        )

        assert result.returncode == 2
        assert "fresh typed fleet receipt" in result.stderr
        assert not called.exists(), "drain invoked gh before receipt preflight"

    def test_controller_repair_attestation_rejects_scope_review_and_expired_replay(
        self,
    ) -> None:
        now = datetime.now(timezone.utc)
        paths = ["scripts/drain-pr-queue.sh"]
        paths_hash = hashlib.sha256(
            json.dumps(paths, separators=(",", ":")).encode()
        ).hexdigest()
        attestation = {
            "schema": "jovie-controller-repair-attestation/v1",
            "kind": "controller-runtime-repair",
            "condition": "controller-failure",
            "repository": "JovieInc/Jovie",
            "pr": 904,
            "head": "f" * 40,
            "mainSha": "a" * 40,
            "reviewAuthority": "github-approved-collaborator",
            "reviewId": "github-review-17219",
            "reviewedHead": "f" * 40,
            "changedPathsSha256": paths_hash,
            "issuedAt": now.isoformat(),
            "expiresAt": (now + timedelta(minutes=10)).isoformat(),
            "deploymentsAllowed": False,
            "runtimeActivationAllowed": False,
        }

        def matches(candidate: dict[str, object]) -> subprocess.CompletedProcess[str]:
            body = (
                "<!-- jovie-controller-repair-attestation/v1 -->\n```json\n"
                + json.dumps(candidate)
                + "\n```\n"
            )
            return subprocess.run(
                [
                    "node",
                    "scripts/lib/controller-repair-attestation.mjs",
                    "matches",
                    "--repository",
                    "JovieInc/Jovie",
                    "--pr",
                    "904",
                    "--head",
                    "f" * 40,
                    "--main-sha",
                    "a" * 40,
                    "--changed-paths-sha256",
                    paths_hash,
                    "--review-id",
                    "github-review-17219",
                    "--minimum-valid-for-ms",
                    "120000",
                ],
                cwd=_REPO_ROOT,
                input=body,
                text=True,
                capture_output=True,
                check=False,
            )

        assert matches(attestation).returncode == 0
        for changed in (
            {**attestation, "head": "e" * 40, "reviewedHead": "e" * 40},
            {**attestation, "mainSha": "b" * 40},
            {**attestation, "changedPathsSha256": "0" * 64},
            {**attestation, "reviewedHead": "e" * 40},
            {**attestation, "reviewId": "github-review-99999"},
            {**attestation, "unexpectedScope": True},
            {
                **attestation,
                "expiresAt": (now + timedelta(seconds=30)).isoformat(),
            },
            {
                **attestation,
                "issuedAt": (now - timedelta(minutes=20)).isoformat(),
                "expiresAt": (now - timedelta(minutes=10)).isoformat(),
            },
        ):
            assert matches(changed).returncode == 3

    @pytest.mark.parametrize(
        (
            "reviewer",
            "association",
            "live_hold",
            "live_head_changed",
            "live_main_sha",
            "expected_enroll",
            "expected_returncode",
        ),
        [
            ("trusted-reviewer", "MEMBER", False, False, "a" * 40, True, 0),
            ("trusted-reviewer-revoked", "MEMBER", False, False, "a" * 40, False, 0),
            ("trusted-reviewer-reapproved", "MEMBER", False, False, "a" * 40, True, 0),
            (
                "trusted-reviewer-comment-preserved",
                "MEMBER",
                False,
                False,
                "a" * 40,
                True,
                0,
            ),
            ("trusted-reviewer-dismissed", "MEMBER", False, False, "a" * 40, False, 0),
            ("jovie-bot[bot]", "NONE", False, False, "a" * 40, False, 0),
            ("itstimwhite", "OWNER", False, False, "a" * 40, False, 0),
            ("trusted-reviewer", "MEMBER", True, False, "a" * 40, False, 0),
            ("trusted-reviewer", "MEMBER", False, True, "a" * 40, False, 0),
            ("trusted-reviewer", "MEMBER", False, False, "b" * 40, False, 0),
            ("trusted-reviewer", "MEMBER", False, False, "", False, 1),
        ],
    )
    def test_controller_repair_mode_admits_only_trusted_exact_candidate(
        self,
        tmp_path: Path,
        reviewer: str,
        association: str,
        live_hold: bool,
        live_head_changed: bool,
        live_main_sha: str,
        expected_enroll: bool,
        expected_returncode: int,
    ) -> None:
        head = "f" * 40
        live_head = "d" * 40 if live_head_changed else head
        live_labels = '[{"name":"hold"}]' if live_hold else "[]"
        paths = ["scripts/drain-pr-queue.sh"]
        paths_hash = hashlib.sha256(
            json.dumps(paths, separators=(",", ":")).encode()
        ).hexdigest()
        now = datetime.now(timezone.utc)
        attestation = {
            "schema": "jovie-controller-repair-attestation/v1",
            "kind": "controller-runtime-repair",
            "condition": "controller-failure",
            "repository": "JovieInc/Jovie",
            "pr": 904,
            "head": head,
            "mainSha": "a" * 40,
            "reviewAuthority": "github-approved-collaborator",
            "reviewId": "github-review-17219",
            "reviewedHead": head,
            "changedPathsSha256": paths_hash,
            "issuedAt": now.isoformat(),
            "expiresAt": (now + timedelta(minutes=10)).isoformat(),
            "deploymentsAllowed": False,
            "runtimeActivationAllowed": False,
        }
        def attestation_body(review_id: int) -> str:
            candidate = {
                **attestation,
                "reviewId": f"github-review-{review_id}",
            }
            return (
                "<!-- jovie-controller-repair-attestation/v1 -->\n```json\n"
                + json.dumps(candidate)
                + "\n```"
            )

        body = attestation_body(17219)
        encoded_receipt = base64.b64encode(
            json.dumps(_controller_repair_receipt()).encode()
        ).decode()
        review_records = [
            {
                "id": 17219,
                "state": "APPROVED",
                "commit_id": head,
                "submitted_at": "2026-09-05T09:00:00Z",
                "author_association": association,
                "user": {"login": reviewer},
                "body": body,
            }
        ]
        review_transitions = {
            "trusted-reviewer-revoked": ("CHANGES_REQUESTED",),
            "trusted-reviewer-reapproved": ("CHANGES_REQUESTED", "APPROVED"),
            "trusted-reviewer-comment-preserved": ("COMMENTED", "PENDING"),
            "trusted-reviewer-dismissed": ("DISMISSED",),
        }.get(reviewer, ())
        for offset, state in enumerate(review_transitions, start=1):
            review_id = 17219 + offset
            review_records.append(
                {
                    "id": review_id,
                    "state": state,
                    "commit_id": head,
                    "submitted_at": f"2026-09-05T09:{offset:02d}:00Z",
                    "author_association": association,
                    "user": {"login": reviewer},
                    "body": (
                        attestation_body(review_id)
                        if state == "APPROVED"
                        else f"{state} follow-up review."
                    ),
                }
            )
        encoded_reviews = base64.b64encode(
            json.dumps([review_records]).encode()
        ).decode()
        main_ref_response = f"echo '{live_main_sha}'; exit 0" if live_main_sha else "exit 1"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":904,"t":"Controller repair","draft":false,"m":"MERGEABLE","head":"codex/controller-repair","headOid":"{head}","base":"main","body":"","L":[],"fail":[],"q":false}},{{"n":905,"t":"Ordinary queued PR","draft":false,"m":"MERGEABLE","head":"codex/product","headOid":"{'e' * 40}","base":"main","body":"","L":["merge-queue"],"fail":[],"q":true}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" && " $* " == *" --json files "* ]]; then
                  echo '["scripts/drain-pr-queue.sh"]'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/pulls/904/reviews" ]]; then
                  printf '%s' '{encoded_reviews}' | base64 --decode
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/pulls/904" ]]; then
                  echo '{{"user":{{"login":"itstimwhite"}}}}'
                  exit 0
                fi
                if [[ "$1" == "api" && " $* " == *" repos/JovieInc/Jovie/git/ref/heads/main "* ]]; then
                  {main_ref_response}
                fi
                if [[ "$1" == "api" ]]; then exit 1; fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":{live_labels},"headRefOid":"{live_head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=controller-repair-only "
                    "DRAIN_RECONCILE_QUEUE_REENTRY=1 "
                    "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=9 "
                    "GITHUB_RUN_ID=77 GITHUB_RUN_ATTEMPT=1 "
                    "DRAIN_ADMISSION_PR=904 "
                    f"DRAIN_ADMISSION_HEAD={head} "
                    f"DRAIN_FLEET_GATE_B64={encoded_receipt}"
                ),
            )
        )

        assert result.returncode == expected_returncode, result.stderr
        assert ("[dry-run] would +merge-queue on #904" in result.stdout) is expected_enroll
        assert "would +merge-queue on #905" not in result.stdout
        assert "would -merge-queue on #905" in result.stdout
        assert "=== RECOVER (bounded exact-head native admission) ===" not in result.stdout
        if reviewer in {
            "jovie-bot[bot]",
            "itstimwhite",
            "trusted-reviewer-revoked",
            "trusted-reviewer-dismissed",
        }:
            assert (
                "authenticated exact-scope controller repair approval is absent or stale"
                in result.stdout
            )
        if live_hold:
            assert "eligibility changed; refusing enrollment for #904" in result.stdout
        if live_head_changed:
            assert "event admission scope no longer matches #904" in result.stdout
        if live_main_sha and live_main_sha != "a" * 40:
            assert "main moved from attested" in result.stdout
        if not live_main_sha:
            assert "current main SHA is unavailable" in result.stderr

    def test_controller_repair_native_cli_enrolls_and_writes_durable_receipts(
        self, tmp_path: Path
    ) -> None:
        head = "f" * 40
        main = "a" * 40
        paths = ["scripts/drain-pr-queue.sh"]
        paths_hash = hashlib.sha256(
            json.dumps(paths, separators=(",", ":")).encode()
        ).hexdigest()
        now = datetime.now(timezone.utc)
        attestation = {
            "schema": "jovie-controller-repair-attestation/v1",
            "kind": "controller-runtime-repair",
            "condition": "controller-failure",
            "repository": "JovieInc/Jovie",
            "pr": 904,
            "head": head,
            "mainSha": main,
            "reviewAuthority": "github-approved-collaborator",
            "reviewId": "github-review-17219",
            "reviewedHead": head,
            "changedPathsSha256": paths_hash,
            "issuedAt": now.isoformat(),
            "expiresAt": (now + timedelta(minutes=10)).isoformat(),
            "deploymentsAllowed": False,
            "runtimeActivationAllowed": False,
        }
        body = base64.b64encode(
            (
                "<!-- jovie-controller-repair-attestation/v1 -->\n```json\n"
                + json.dumps(attestation)
                + "\n```"
            ).encode()
        ).decode()
        receipt = _controller_repair_receipt()
        encoded_receipt = base64.b64encode(json.dumps(receipt).encode()).decode()
        state_file = tmp_path / "queued"
        state_file.write_text("0", encoding="utf-8")
        status_log = tmp_path / "statuses"
        status_log.write_text("", encoding="utf-8")
        main_calls = tmp_path / "main-calls"
        main_calls.write_text("0", encoding="utf-8")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                state_file='{state_file}'
                status_log='{status_log}'
                main_calls='{main_calls}'
                head='{head}'
                main='{main}'
                pr_node='PR_kwDO_native_904'
                queued=$(<"$state_file")
                state_json() {{
                  if [[ "$queued" == 1 ]]; then
                    entry='{{"id":"MQE_904","state":"QUEUED","position":1,"enqueuedAt":"2026-09-05T00:00:00Z"}}'
                    auto='{{"enabledAt":"2026-09-05T00:00:00Z"}}'
                  else
                    entry=null; auto=null
                  fi
                  jq -nc --arg id "$pr_node" --arg head "$head" --argjson q "$queued" \
                    --argjson entry "$entry" --argjson auto "$auto" \
                    '{{id:$id,number:904,state:"OPEN",isDraft:false,headRefOid:$head,headRefName:"codex/controller-repair",baseRefName:"main",mergeable:"MERGEABLE",mergeStateStatus:"CLEAN",labels:{{nodes:[]}},isInMergeQueue:($q == 1),mergeQueueEntry:$entry,autoMergeRequest:$auto}}'
                }}
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":904,"t":"Controller repair","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/controller-repair","headOid":"{head}","base":"main","body":"","L":[],"fail":[],"q":false}}]'; exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'; exit 0
                fi
                if [[ "$1 $2" == "pr view" && " $* " == *" --json files "* ]]; then echo '["scripts/drain-pr-queue.sh"]'; exit 0; fi
                if [[ "$1 $2" == "pr view" ]]; then echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'; exit 0; fi
                if [[ "$1" == api && "$2" == *"/pulls/904/reviews"* ]]; then
                  review_body=$(printf '%s' '{body}' | base64 --decode)
                  jq -nc --arg body "$review_body" --arg head "$head" '[[{{id:17219,state:"APPROVED",commit_id:$head,author_association:"MEMBER",user:{{login:"trusted-reviewer"}},body:$body}}]]'; exit 0
                fi
                if [[ "$1" == api && "$2" == *"/pulls/904" ]]; then echo '{{"user":{{"login":"itstimwhite"}}}}'; exit 0; fi
                if [[ "$1" == api && "$2" == *"/git/ref/heads/main"* ]]; then
                  calls=$(<"$main_calls"); calls=$((calls + 1)); echo "$calls" >"$main_calls"
                  if [[ "${{TEST_MAIN_DRIFT_AFTER_ENROLL:-0}}" == 1 && "$calls" -gt 2 ]]; then printf '%040d\n' 0; else echo "$main"; fi
                  exit 0
                fi
                if [[ "$1" == api && "$2" == *"/commits/{head}/status"* ]]; then
                  if grep -q 'context=jovie-controller-repair-queue/v1' "$status_log"; then
                    echo '{{"statuses":[{{"context":"jovie-controller-repair-queue/v1","state":"success","description":"Authenticated controller repair PR #904 at exact head","target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","creator":{{"login":"jovie-bot[bot]"}}}}]}}'
                  else echo '{{"statuses":[]}}'; fi
                  exit 0
                fi
                if [[ "$1" == api && " $* " == *" -X POST "* && "$*" == *"/statuses/{head}"* ]]; then echo "$*" >>"$status_log"; echo '{{}}'; exit 0; fi
                if [[ "$1" == api && "$2" == *"/commits/{head}"* ]]; then echo '2026-09-05T00:00:00Z'; exit 0; fi
                if [[ "$1" == api && "$2" == *"/actions/workflows/ci.yml/runs"* ]]; then echo '[]'; exit 0; fi
                if [[ "$1" == api && "$2" == "repos/JovieInc/Jovie" ]]; then echo '{{"default_branch":"main","allow_auto_merge":true,"allow_squash_merge":true}}'; exit 0; fi
                if [[ "$1" == api && "$2" == *"/rulesets/10512119"* ]]; then echo '{{"id":10512119,"enforcement":"active","target":"branch","conditions":{{"ref_name":{{"include":["refs/heads/main"],"exclude":[]}}}},"bypass_actors":[],"rules":[{{"type":"required_status_checks","parameters":{{"strict_required_status_checks_policy":false,"required_status_checks":[{{"context":"PR Ready"}},{{"context":"Migration Guard"}},{{"context":"Fork PR Gate"}},{{"context":"PR Size Guard"}}]}}}},{{"type":"merge_queue","parameters":{{"check_response_timeout_minutes":20,"grouping_strategy":"ALLGREEN","max_entries_to_build":1,"max_entries_to_merge":5,"merge_method":"SQUASH","min_entries_to_merge":5,"min_entries_to_merge_wait_minutes":10}}}}]}}'; exit 0; fi
                if [[ "$1" == api && "$*" == *"/contents/.github/workflows/ci.yml"* ]]; then printf 'name: CI\non:\n  pull_request:\n    branches: [main]\n  merge_group:\n    types: [checks_requested]\n'; exit 0; fi
                if [[ "$1 $2" == "api graphql" ]]; then
                  args="$*"
                  if [[ "$args" == *"MergeQueueNativeMutationActor"* ]]; then echo '{{"data":{{"viewer":{{"login":"jovie-bot[bot]"}}}}}}'; exit 0; fi
                  if [[ "$args" == *"enablePullRequestAutoMerge"* ]]; then echo 1 >"$state_file"; echo '{{"data":{{"enablePullRequestAutoMerge":{{}}}}}}'; exit 0; fi
                  if [[ "$args" == *"dequeuePullRequest"* ]]; then echo 0 >"$state_file"; echo '{{"data":{{"dequeuePullRequest":{{"mergeQueueEntry":null}}}}}}'; exit 0; fi
                  if [[ "$args" == *"disablePullRequestAutoMerge"* ]]; then echo '{{"data":{{"disablePullRequestAutoMerge":{{}}}}}}'; exit 0; fi
                  if [[ "$args" == *"MergeQueuePullRequestState"* ]]; then state=$(state_json); jq -nc --argjson state "$state" '{{data:{{repository:{{pullRequest:$state}}}}}}'; exit 0; fi
                  if [[ "$args" == *"MergeQueueCanonicalMembership"* ]]; then
                    if [[ "$queued" != 1 ]]; then echo '{{"data":{{"repository":{{"pullRequest":{{"id":"PR_kwDO_native_904","number":904,"state":"OPEN","isDraft":false,"headRefOid":"'"$head"'","headRefName":"codex/controller-repair","baseRefName":"main","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","labels":{{"nodes":[]}},"isInMergeQueue":false,"mergeQueueEntry":null,"autoMergeRequest":null,"timelineItems":{{"nodes":[],"pageInfo":{{"hasNextPage":false}}}}}}}}}}}}'; exit 0; fi
                    jq -nc --arg id "$pr_node" --arg head "$head" '{{data:{{repository:{{pullRequest:{{id:$id,number:904,state:"OPEN",isDraft:false,headRefOid:$head,headRefName:"codex/controller-repair",baseRefName:"main",mergeable:"MERGEABLE",mergeStateStatus:"CLEAN",labels:{{nodes:[]}},isInMergeQueue:true,mergeQueueEntry:{{id:"MQE_904",state:"QUEUED",position:1,enqueuedAt:"2026-09-05T00:00:00Z",enqueuer:{{__typename:"Bot",login:"jovie-bot"}}}},autoMergeRequest:{{enabledAt:"2026-09-05T00:00:00Z"}},timelineItems:{{nodes:[{{__typename:"AddedToMergeQueueEvent",id:"MQE_EVT_904",createdAt:"2026-09-05T00:00:00Z",actor:{{__typename:"Bot",login:"jovie-bot"}},enqueuer:{{login:"jovie-bot[bot]"}}}}],pageInfo:{{hasNextPage:false}}}}}}}}}}}}'; exit 0
                  fi
                  if [[ "$args" == *"MergeQueueOpenPullRequestStates"* ]]; then state=$(state_json); jq -nc --argjson state "$state" '{{data:{{repository:{{pullRequests:{{nodes:[$state],pageInfo:{{hasNextPage:false}}}}}}}}}}'; exit 0; fi
                  if [[ "$args" == *"MergeQueueBranchProtection"* ]]; then echo '{{"data":{{"repository":{{"ref":{{"name":"main","branchProtectionRule":null}}}}}}}}'; exit 0; fi
                  if [[ "$args" == *"MergeQueueLiveConfiguration"* ]]; then echo '{{"data":{{"repository":{{"mergeQueue":{{"configuration":{{"checkResponseTimeout":1200,"maximumEntriesToBuild":1,"maximumEntriesToMerge":5,"mergeMethod":"SQUASH","minimumEntriesToMerge":5,"minimumEntriesToMergeWaitTime":10}}}}}}}}}}'; exit 0; fi
                fi
                echo "unexpected gh args: $*" >&2; exit 2
                """
            ).lstrip(),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRY_RUN=0 GITHUB_RUN_ID=77 GITHUB_RUN_ATTEMPT=1 "
                    "MERGE_QUEUE_NATIVE_AUTHORIZATION=merge-queue-autoenroll "
                    "DRAIN_PROMOTION_MODE=controller-repair-only "
                    "DRAIN_ADMISSION_PR=904 "
                    f"DRAIN_ADMISSION_HEAD={head} "
                    f"DRAIN_FLEET_GATE_B64={encoded_receipt}"
                ),
            )
        )
        assert result.returncode == 0, result.stderr
        assert state_file.read_text(encoding="utf-8").strip() == "1"
        statuses = status_log.read_text(encoding="utf-8")
        assert "context=jovie-controller-repair-queue/v1" in statuses
        assert "context=jovie-queue-admission/v2" in statuses

        retained = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRY_RUN=0 GITHUB_RUN_ID=79 GITHUB_RUN_ATTEMPT=1 "
                    "MERGE_QUEUE_NATIVE_AUTHORIZATION=merge-queue-autoenroll "
                    "DRAIN_PROMOTION_MODE=controller-repair-only "
                    "DRAIN_ADMISSION_PR=904 "
                    f"DRAIN_ADMISSION_HEAD={head} "
                    f"DRAIN_FLEET_GATE_B64={encoded_receipt}"
                ),
            )
        )
        assert retained.returncode == 0, retained.stderr
        assert "preserving exact controller repair PR #904 (WIP 1)" in retained.stdout
        assert "queue depth: 1/16 (0 slots)" in retained.stdout
        assert state_file.read_text(encoding="utf-8").strip() == "1"

        state_file.write_text("0", encoding="utf-8")
        status_log.write_text("", encoding="utf-8")
        main_calls.write_text("0", encoding="utf-8")
        raced = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRY_RUN=0 TEST_MAIN_DRIFT_AFTER_ENROLL=1 "
                    "GITHUB_RUN_ID=78 GITHUB_RUN_ATTEMPT=1 "
                    "MERGE_QUEUE_NATIVE_AUTHORIZATION=merge-queue-autoenroll "
                    "DRAIN_PROMOTION_MODE=controller-repair-only "
                    "DRAIN_ADMISSION_PR=904 "
                    f"DRAIN_ADMISSION_HEAD={head} "
                    f"DRAIN_FLEET_GATE_B64={encoded_receipt}"
                ),
            )
        )
        assert raced.returncode != 0
        assert state_file.read_text(encoding="utf-8").strip() == "0"
        assert "controller repair evidence changed" in raced.stdout

    def test_blocked_receipt_dry_run_preserves_clean_queued_pr(
        self, tmp_path: Path
    ) -> None:
        queued_head = "9" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "blocked",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "signals": {
                "main": {"status": "unknown"},
                "production": {"status": "unknown"},
                "controller": {"status": "unknown"},
                "queue": {"status": "unknown"},
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": False,
                "condition": None,
                "mainSha": None,
                "deployedSha": None,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": False,
                "newIntakeAllowed": False,
                "semantics": "dequeue-until-exact-production-recovers",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":909,"t":"Ordinary queued PR","draft":false,"m":"MERGEABLE","head":"codex/jov-909","headOid":"{queued_head}","base":"main","L":["merge-queue"],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=blocked "
                    f"DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "fleet promotion constraint" not in result.stdout
        assert "would record jovie-fleet-queue-hold/v1" not in result.stdout
        assert "[dry-run] would -merge-queue on #909" not in result.stdout
        assert "queue depth: 1/" in result.stdout
        assert "(0 slots)" in result.stdout
        assert "would +merge-queue" not in result.stdout

    @pytest.mark.parametrize(
        ("closure_status", "intake_allowed"),
        [
            ("healthy", True),
            ("grace", False),
            ("grace", True),
            ("red", True),
        ],
    )
    def test_hold_intake_accepts_canonical_closure_statuses(
        self, tmp_path: Path, closure_status: str, intake_allowed: bool
    ) -> None:
        queued_head = "8" * 40
        receipt = _production_unbound_hold_receipt(
            closure_status=closure_status,
            intake_allowed=intake_allowed,
        )
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":901,"t":"Already admitted green PR","draft":false,"m":"MERGEABLE","head":"codex/jov-901","headOid":"{queued_head}","base":"main","L":["merge-queue"],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    f"DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "fleet promotion constraint" not in result.stdout
        assert "would -merge-queue on #901" not in result.stdout
        assert "would dequeue #901" not in result.stdout
        assert "would +merge-queue" not in result.stdout
        assert "queue depth: 1/" in result.stdout
        if intake_allowed:
            assert "(15 slots)" in result.stdout

    @pytest.mark.parametrize(
        ("closure_status", "intake_allowed"),
        [
            ("green", True),
            ("healthy", False),
        ],
    )
    def test_hold_intake_rejects_retired_or_contradictory_closure_receipts(
        self,
        tmp_path: Path,
        closure_status: str,
        intake_allowed: bool,
    ) -> None:
        called = tmp_path / "called"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            f"#!/usr/bin/env bash\ntouch '{called}'\nexit 99\n",
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)
        receipt = _production_unbound_hold_receipt(
            closure_status=closure_status,
            intake_allowed=intake_allowed,
        )
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    f"DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 2
        assert (
            "Fleet receipt does not authorize promotion mode hold-intake"
            in result.stderr
        )
        assert not called.exists(), "drain invoked gh before receipt preflight"

    @pytest.mark.parametrize(
        "body",
        [
            "Ordinary source-green PR",
            (
                "<!-- production-unbound-repair:production-deployment-unbound:"
                + "a" * 40
                + " -->"
            ),
            (
                "<!-- jovie-production-unbound-repair-attestation/v1 -->\n"
                "```json\n"
                + json.dumps(
                    {
                        "schema": "jovie-production-unbound-repair-attestation/v1",
                        "kind": "production-release-repair",
                        "condition": "production-deployment-unbound",
                        "pr": 904,
                        "head": "f" * 40,
                        "mainSha": "a" * 40,
                        "deploymentsAllowed": False,
                    }
                )
                + "\n```"
            ),
            (
                "<!-- jovie-production-unbound-repair-attestation/v1 -->\n"
                "```json\n"
                + json.dumps(
                    {
                        "schema": "jovie-production-unbound-repair-attestation/v1",
                        "kind": "production-release-repair",
                        "condition": "production-deployment-unbound",
                        "pr": 904,
                        "head": "e" * 40,
                        "mainSha": "a" * 40,
                        "deploymentsAllowed": False,
                    }
                )
                + "\n```"
            ),
        ],
    )
    def test_hold_intake_enrolls_clean_unrelated_prs(
        self, tmp_path: Path, body: str
    ) -> None:
        head = "f" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "hold-intake",
            **_hold_intake_evidence(),
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "closureAdmission": _summer_closure_admission(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": True,
                "condition": "production-deployment-unbound",
                "mainSha": "a" * 40,
                "deployedSha": "b" * 40,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "preserve-cohort-and-continue-isolated-implementation",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        body_json = json.dumps(body)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":904,"t":"Candidate","body":{body_json},"draft":false,"m":"MERGEABLE","head":"codex/jov-904","headOid":"{head}","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":{body_json}}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    "DRAIN_ADMISSION_PR=904 "
                    f"DRAIN_ADMISSION_HEAD={head} DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would +merge-queue on #904" in result.stdout
        assert "would record jovie-fleet-queue-hold/v1 on #904" not in result.stdout

    def test_hold_intake_enrolls_exact_admission_despite_queue_deferred(
        self, tmp_path: Path
    ) -> None:
        """Live #16211 was CI-green under hold-intake but autoenroll no-op'd
        because grok-ship-one had added queue-deferred (hard gate).
        """
        head = "a138997d50393a3f609e47c13fc6327bc22a8892"
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "hold-intake",
            **_hold_intake_evidence(),
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "closureAdmission": _summer_closure_admission(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": True,
                "condition": "production-deployment-unbound",
                "mainSha": "a" * 40,
                "deployedSha": "b" * 40,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "preserve-cohort-and-continue-isolated-implementation",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":16211,"t":"Grok remount","draft":false,"m":"MERGEABLE","head":"grok/JOV-4894-fix","headOid":"{head}","base":"main","L":["queue-deferred"],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"enroll","bucket":"fail","state":"FAILURE","workflow":"Merge Queue Auto-Enroll","workflowDatabaseId":299216194,"appSlug":"github-actions"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[{{"name":"queue-deferred"}}],"headRefOid":"{head}","baseRefName":"main","body":"Fixes JOV-4894"}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    "DRAIN_ADMISSION_PR=16211 "
                    f"DRAIN_ADMISSION_HEAD={head} DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "would -queue-deferred on #16211" in result.stdout
        assert "[dry-run] would +merge-queue on #16211" in result.stdout

    def test_hold_intake_missed_admission_recovers_queue_deferred_clean_head(
        self, tmp_path: Path
    ) -> None:
        """Live #16187 stayed CLEAN+queue-deferred off merge-queue because
        main-push missed-admission recovery filtered queue-deferred even
        though hold-intake exact admission already strips that label.
        """
        head = "564bcf770f353f0c8a9e6c1d2b3a4e5f67890123"
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "hold-intake",
            **_hold_intake_evidence(),
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "closureAdmission": _summer_closure_admission(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": True,
                "condition": "production-deployment-unbound",
                "mainSha": "a" * 40,
                "deployedSha": "b" * 40,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "preserve-cohort-and-continue-isolated-implementation",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":16186,"t":"Human hold","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/human","headOid":"{"c" * 40}","base":"main","L":["needs-human"],"fail":[],"q":false}},{{"n":16187,"t":"Grok CLEAN deferred","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"grok/JOV-5041-fix","headOid":"{head}","base":"main","L":["queue-deferred","big-pr"],"fail":[],"q":false}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[{{"name":"queue-deferred"}},{{"name":"big-pr"}}],"headRefOid":"{head}","baseRefName":"main","body":"Fixes JOV-5041"}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                    f"DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "exact missed admission at " + head in result.stdout
        assert "would -queue-deferred on #16187" in result.stdout
        assert "[dry-run] would +merge-queue on #16187" in result.stdout
        assert "would +merge-queue on #16186" not in result.stdout

    def test_hold_intake_missed_admission_ignores_legacy_no_auto_label(
        self, tmp_path: Path
    ) -> None:
        """Legacy no-auto labels cannot suppress exact-head machine admission."""
        tombstone_head = "528ab46cd724ca78cb72ee5168dd3b2851045b6d"
        clean_head = "564bcf770f353f0c8a9e6c1d2b3a4e5f67890123"
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "hold-intake",
            **_hold_intake_evidence(),
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "closureAdmission": _summer_closure_admission(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": True,
                "condition": "production-deployment-unbound",
                "mainSha": "a" * 40,
                "deployedSha": "b" * 40,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "preserve-cohort-and-continue-isolated-implementation",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":16263,"t":"No-auto tombstone","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/jov-16263","headOid":"{tombstone_head}","base":"main","L":["no-auto"],"fail":[],"q":false}},{{"n":16187,"t":"Grok CLEAN deferred","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"grok/JOV-5041-fix","headOid":"{clean_head}","base":"main","L":["queue-deferred"],"fail":[],"q":false}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  if [[ "$3" == "16263" ]]; then
                    echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[{{"name":"no-auto"}}],"headRefOid":"{tombstone_head}","baseRefName":"main","body":"Fixes JOV-5276"}}'
                    exit 0
                  fi
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[{{"name":"queue-deferred"}}],"headRefOid":"{clean_head}","baseRefName":"main","body":"Fixes JOV-5041"}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                    f"DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "exact missed admission at " + tombstone_head in result.stdout
        assert "[dry-run] would +merge-queue on #16263" in result.stdout
        assert "would -queue-deferred on #16263" not in result.stdout
        assert "exact missed admission at " + clean_head in result.stdout
        assert "would -queue-deferred on #16187" in result.stdout
        assert "[dry-run] would +merge-queue on #16187" in result.stdout

    def test_label_event_enrolls_despite_legacy_no_auto_label(
        self, tmp_path: Path
    ) -> None:
        head = "528ab46cd724ca78cb72ee5168dd3b2851045b6d"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":16263,"t":"No-auto tombstone","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/jov-16263","headOid":"{head}","base":"main","L":["no-auto"],"fail":[],"q":false}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[{{"name":"no-auto"}}],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    f"DRY_RUN=1 DRAIN_ADMISSION_PR=16263 DRAIN_ADMISSION_HEAD={head}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would +merge-queue on #16263" in result.stdout

    def test_queued_legacy_no_auto_label_is_left_in_queue(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{"n":16263,"t":"Queued no-auto","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/jov-16263","headOid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","base":"main","L":["no-auto","merge-queue"],"fail":[],"q":true}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{"name":"PR Ready","bucket":"pass","state":"SUCCESS"},{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"},{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"},{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(_drain_command(tmp_path, extra_env="DRY_RUN=1"))

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would -merge-queue on #16263" not in result.stdout
        assert "would +merge-queue on #16263" not in result.stdout

    def test_positive_mergeable_reread_clears_stale_conflict_label_without_dequeue(
        self, tmp_path: Path
    ) -> None:
        head = "e4ddf77efb91c80665f10dece11836130c1a286a"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":16898,"t":"Active exact merge group","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"tim/jov-5800-fix","headOid":"{head}","base":"main","body":"","L":["merge-queue","needs-conflict-resolution"],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"headRefOid":"{head}","mergeable":"MERGEABLE","labels":[{{"name":"merge-queue"}},{{"name":"needs-conflict-resolution"}}]}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then exit 1; fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(_drain_command(tmp_path, extra_env="DRY_RUN=1"))

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would -needs-conflict-resolution on #16898" in result.stdout
        assert "[dry-run] would -merge-queue on #16898" not in result.stdout
        assert "needs-conflict-resolution" not in result.stdout.split(
            "=== SURFACE", maxsplit=1
        )[-1]

    @pytest.mark.parametrize("remove_succeeds", [True, False])
    def test_live_stale_conflict_label_reconciliation_preserves_exact_outcome(
        self, tmp_path: Path, remove_succeeds: bool
    ) -> None:
        head = "e4ddf77efb91c80665f10dece11836130c1a286a"
        calls = tmp_path / "gh-calls.log"
        fake_gh = tmp_path / "gh"
        remove_result = "exit 0" if remove_succeeds else 'echo "permission denied" >&2; exit 1'
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                echo "$*" >> "${{FAKE_GH_LOG:?}}"
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":16898,"t":"Active exact merge group","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"tim/jov-5800-fix","headOid":"{head}","base":"main","body":"","L":["merge-queue","needs-conflict-resolution"],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"headRefOid":"{head}","mergeable":"MERGEABLE","labels":[{{"name":"merge-queue"}},{{"name":"needs-conflict-resolution"}}]}}'
                  exit 0
                fi
                if [[ "$1 $2" == "pr edit" && " $* " == *" --remove-label needs-conflict-resolution "* ]]; then
                  {remove_result}
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=f"FAKE_GH_LOG={calls} GH_RETRY_ATTEMPTS=1",
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        log = calls.read_text(encoding="utf-8")
        assert (
            "pr edit 16898 -R JovieInc/Jovie --remove-label needs-conflict-resolution"
            in log
        )
        assert "--remove-label merge-queue" not in log
        assert "--add-label merge-queue" not in log
        if remove_succeeds:
            assert "-needs-conflict-resolution on #16898" in result.stdout
            assert "remains active on #16898" not in result.stdout
        else:
            assert "failed to remove needs-conflict-resolution on #16898" in result.stdout
            assert "needs-conflict-resolution remains active on #16898" in result.stdout
            assert "preserving current queue state until retry" in result.stdout

    def test_draft_only_enrolls_clean_unrelated_pr(self, tmp_path: Path) -> None:
        head = "c" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "draft-only",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "signals": {
                "main": {"status": "red", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": False,
                "condition": None,
                "mainSha": None,
                "deployedSha": None,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": False,
                "newIntakeAllowed": False,
                "semantics": "draft-only",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":907,"t":"Clean unrelated","draft":false,"m":"MERGEABLE","head":"codex/jov-907","headOid":"{head}","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":"ordinary PR"}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=draft-only "
                    "DRAIN_ADMISSION_PR=907 "
                    f"DRAIN_ADMISSION_HEAD={head} DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would +merge-queue on #907" in result.stdout
        assert "fleet promotion constraint" not in result.stdout
        assert "would record jovie-fleet-queue-hold/v1" not in result.stdout

    def test_stale_pending_fleet_hold_expires_to_terminal_reason(
        self, tmp_path: Path
    ) -> None:
        head = "d" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "isolated-only",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "red"},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": True,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": False,
                "condition": None,
                "mainSha": None,
                "deployedSha": None,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": False,
                "newIntakeAllowed": True,
                "semantics": "isolated-only",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        stale = (datetime.now(timezone.utc) - timedelta(minutes=20)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":908,"t":"Stale held clean PR","draft":false,"m":"MERGEABLE","head":"codex/jov-908","headOid":"{head}","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1" == "api" && " $* " == *"/commits/{head}/status "* ]]; then
                  echo '{{"statuses":[{{"context":"jovie-fleet-queue-hold/v1","state":"pending","creator":{{"type":"Bot"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","updated_at":"{stale}"}}]}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=isolated-only "
                    f"DRAIN_FLEET_GATE_B64={encoded} "
                    "FLEET_HOLD_TTL_SECONDS=60 GITHUB_RUN_ID=77 "
                    "GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "terminal fleet-queue-hold" in result.stdout
        assert "would close jovie-fleet-queue-hold/v1 on #908 -> success" in result.stdout
        assert "expired" in result.stdout

    @pytest.mark.parametrize(
        ("workflow_name", "run_head_matches", "expect_close"),
        [
            ("Merge Queue Auto-Enroll", True, True),
            ("Unrelated Workflow", True, False),
            ("Merge Queue Auto-Enroll", False, False),
        ],
    )
    def test_null_creator_fleet_hold_requires_exact_app_and_run_provenance(
        self,
        tmp_path: Path,
        workflow_name: str,
        run_head_matches: bool,
        expect_close: bool,
    ) -> None:
        head = "f" * 40
        run_head = head if run_head_matches else "e" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "isolated-only",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "red"},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": True,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": False,
                "condition": None,
                "mainSha": None,
                "deployedSha": None,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": False,
                "newIntakeAllowed": True,
                "semantics": "isolated-only",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        stale = (datetime.now(timezone.utc) - timedelta(minutes=20)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        avatar_url = "https://avatars.githubusercontent.com/in/2934433?v=4"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":911,"t":"Null creator held PR","draft":false,"m":"MERGEABLE","head":"codex/jov-911","headOid":"{head}","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1" == "api" && " $* " == *"/commits/{head}/status "* ]]; then
                  echo '{{"statuses":[{{"url":"https://api.github.com/repos/JovieInc/Jovie/statuses/{head}","avatar_url":"{avatar_url}","context":"jovie-fleet-queue-hold/v1","state":"pending","creator":null,"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","updated_at":"{stale}"}}]}}'
                  exit 0
                fi
                if [[ "$1 $2" == "api users/jovie-bot%5Bbot%5D" ]]; then
                  echo '{{"login":"jovie-bot[bot]","type":"Bot","avatar_url":"{avatar_url}"}}'
                  exit 0
                fi
                if [[ "$1 $2" == "api repos/JovieInc/Jovie/actions/runs/77" ]]; then
                  echo '{{"id":77,"name":"{workflow_name}","path":".github/workflows/merge-queue-autoenroll.yml","head_sha":"{run_head}","html_url":"https://github.com/JovieInc/Jovie/actions/runs/77","repository":{{"full_name":"JovieInc/Jovie"}},"head_repository":{{"full_name":"JovieInc/Jovie"}},"workflow_id":299216194,"run_attempt":1}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=isolated-only "
                    f"DRAIN_FLEET_GATE_B64={encoded} "
                    "FLEET_HOLD_TTL_SECONDS=60 GITHUB_RUN_ID=77 "
                    "GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        close_message = "would close jovie-fleet-queue-hold/v1 on #911 -> success"
        if expect_close:
            assert close_message in result.stdout
            assert "expired" in result.stdout
        else:
            assert close_message not in result.stdout

    def test_hold_intake_closes_fresh_pending_hold_without_waiting_for_ttl(
        self, tmp_path: Path
    ) -> None:
        head = "e" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "hold-intake",
            **_hold_intake_evidence(),
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "closureAdmission": _summer_closure_admission(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": True,
                "condition": "production-deployment-unbound",
                "mainSha": "a" * 40,
                "deployedSha": "b" * 40,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "preserve-cohort-and-continue-isolated-implementation",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fresh = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":910,"t":"Fresh held clean PR","draft":false,"m":"MERGEABLE","head":"codex/jov-910","headOid":"{head}","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":"ordinary PR"}}'
                  exit 0
                fi
                if [[ "$1" == "api" && " $* " == *"/commits/{head}/status "* ]]; then
                  echo '{{"statuses":[{{"context":"jovie-fleet-queue-hold/v1","state":"pending","creator":{{"type":"Bot"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","updated_at":"{fresh}"}}]}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    "DRAIN_ADMISSION_PR=910 "
                    f"DRAIN_ADMISSION_HEAD={head} DRAIN_FLEET_GATE_B64={encoded} "
                    "FLEET_HOLD_TTL_SECONDS=3600 GITHUB_RUN_ID=77 "
                    "GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "would close jovie-fleet-queue-hold/v1 on #910 -> success" in result.stdout
        assert "waiting-lane" in result.stdout
        assert "[dry-run] would +merge-queue on #910" in result.stdout

    def test_hold_intake_dequeues_deterministic_failing_member_and_keeps_green_sibling(
        self, tmp_path: Path
    ) -> None:
        green_head = "c" * 40
        fail_head = "d" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "hold-intake",
            **_hold_intake_evidence(),
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "closureAdmission": _summer_closure_admission(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 2,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": True,
                "condition": "production-deployment-unbound",
                "mainSha": "a" * 40,
                "deployedSha": "b" * 40,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "preserve-cohort-and-continue-isolated-implementation",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":901,"t":"Green sibling","draft":false,"m":"MERGEABLE","head":"codex/jov-901","headOid":"{green_head}","base":"main","L":["merge-queue"],"fail":[]}},{{"n":902,"t":"Deterministic fail","draft":false,"m":"MERGEABLE","head":"codex/jov-902","headOid":"{fail_head}","base":"main","L":["merge-queue"],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  if [[ "$*" == *"902"* ]]; then
                    echo '[{{"name":"PR Ready","bucket":"fail","state":"FAILURE"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                    exit 0
                  fi
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    f"DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "would -merge-queue on #902" in result.stdout
        assert "would -merge-queue on #901" not in result.stdout
        assert "fleet promotion constraint" not in result.stdout

    def test_production_recovery_reenrolls_only_a_previously_exact_held_head(
        self, tmp_path: Path
    ) -> None:
        """A hold-intake CI candidate resumes automatically after production binds."""
        head = "a" * 40
        state = tmp_path / "state"
        state.write_text("unqueued", encoding="utf-8")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                phase_file={state}
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":905,"t":"Exact held candidate","body":"ordinary PR","draft":false,"m":"MERGEABLE","head":"codex/jov-905","headOid":"{head}","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  if [[ "$(cat "$phase_file")" == "queued" ]]; then labels='[{{"name":"merge-queue"}}]'; else labels='[]'; fi
                  printf '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":%s,"headRefOid":"{head}","baseRefName":"main","body":"ordinary PR"}}\\n' "$labels"
                  exit 0
                fi
                if [[ "$1 $2" == "pr edit" ]]; then
                  printf queued >"$phase_file"
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ " $* " == *"/commits/{head}/status "* ]]; then
                    echo '{{"statuses":[{{"context":"jovie-fleet-queue-hold/v1","state":"pending","creator":{{"type":"Bot"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","updated_at":"2026-08-15T12:00:00Z"}}]}}'
                    exit 0
                  fi
                  if [[ " $* " == *"/statuses/{head} "* ]]; then exit 0; fi
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRAIN_RECOVER_FLEET_HOLDS=1 "
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "exact fleet recovery at " + head in result.stdout
        assert "+merge-queue on #905" in result.stdout
        assert "-jovie-fleet-queue-hold/v1 on #905" in result.stdout
        assert state.read_text(encoding="utf-8").strip() == "queued"

    def test_hold_intake_does_not_dequeue_transient_unknown_mergeable(
        self, tmp_path: Path
    ) -> None:
        queued_head = "e" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "hold-intake",
            **_hold_intake_evidence(),
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "closureAdmission": _summer_closure_admission(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": True,
                "condition": "production-deployment-unbound",
                "mainSha": "a" * 40,
                "deployedSha": "b" * 40,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "preserve-cohort-and-continue-isolated-implementation",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":903,"t":"Transient unknown mergeable","draft":false,"m":"UNKNOWN","head":"codex/jov-903","headOid":"{queued_head}","base":"main","L":["merge-queue"],"fail":[]}}]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    f"DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "would -merge-queue on #903" not in result.stdout
        assert "fleet promotion constraint" not in result.stdout
        assert "queue depth: 1/" in result.stdout

    def test_live_drain_refuses_before_calling_gh_when_fixture_path_mismatches(
        self, tmp_path: Path
    ) -> None:
        called = tmp_path / "called"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            f"#!/usr/bin/env bash\ntouch '{called}'\nexit 99\n",
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                expected_gh=Path("/definitely/not/the/fixture"),
            )
        )

        assert result.returncode == 2
        assert "Refusing drain" in result.stderr
        assert not called.exists(), "drain invoked gh before isolation preflight"

    def test_live_mutation_tests_centralize_exact_fake_gh_preflight(self) -> None:
        source = Path(__file__).read_text(encoding="utf-8")
        helper_launches = [
            line.strip()
            for line in source.splitlines()
            if line.strip().startswith("return f'{env_prefix}bash")
        ]
        assert helper_launches == [
            "return f'{env_prefix}bash \"{_DRAIN_SCRIPT}\"'",
            "return f'{env_prefix}bash \"{_RELEASE_SCRIPT}\"'",
        ]
        assert 'DRAIN_EXPECT_GH="{fake_gh}"' in source
        assert "DRAIN_MUTATION_AUTHORIZATION=test-fixture" in source

    def test_drain_script_avoids_bulk_status_rollup_and_uses_per_pr_checks(self) -> None:
        content = _DRAIN_SCRIPT.read_text(encoding="utf-8")
        assert 'source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"' in content
        assert 'gh_retry pr list' in content
        assert "--limit 200" in content
        assert "statusCheckRollup" not in content
        assert "gh pr checks" in content
        assert "--json name,bucket,state,workflow,description,startedAt,completedAt" in content
        assert "--remove-label" in content
        assert "DRAIN_MUTATION_AUTHORIZATION" in content
        assert "tim-approved" not in content
        assert "approved:taste" not in content
        assert "NO_AUTO_HOLD_JQ" not in content
        assert '. == "no-auto"' not in content
        assert 'MACHINE_HOLD_JQ=\'. == "hold" or . == "gated" or . == "incident"\'' in content
        missed = content.split("bounded exact-head native admission", 1)[1].split(
            "A completed Production Controller", 1
        )[0]
        assert "$MACHINE_HOLD_JQ" in missed
        assert 'index("queue-deferred")' in missed
        assert 'index("no-auto")' not in missed

    def test_red_required_checks_block_enqueue(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{"n":123,"t":"Red CI PR","draft":false,"m":"MERGEABLE","head":"codex/jov-123-red","base":"main","L":[],"fail":[]}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{"name":"Typecheck","bucket":"fail","state":"FAILURE"}]'
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(
            _drain_command(tmp_path, extra_env="DRY_RUN=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would +merge-queue on #123" not in result.stdout
        assert "=== BLOCKED (red checks" in result.stdout
        assert "#123" in result.stdout
        assert "Typecheck" in result.stdout

    def test_hard_gated_prs_dequeue_and_do_not_enqueue(self, tmp_path: Path) -> None:
        admitted_head = "a" * 40
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{{"n":456,"t":"Taste approved PR","draft":false,"m":"MERGEABLE","head":"codex/jov-456-taste","base":"main","L":["needs-human","approved:taste"],"fail":[]}},{{"n":789,"t":"Human gated PR","draft":false,"m":"MERGEABLE","head":"codex/jov-789-human","base":"main","L":["needs-human","merge-queue"],"fail":[]}},{{"n":102,"t":"Deferred PR","draft":false,"m":"MERGEABLE","head":"codex/jov-102-deferred","base":"main","L":["queue-deferred","merge-queue"],"fail":[]}},{{"n":103,"t":"Draft PR","draft":true,"m":"MERGEABLE","head":"codex/jov-103-draft","base":"main","L":["merge-queue"],"fail":[]}},{{"n":101,"t":"Target clean PR","draft":false,"m":"MERGEABLE","head":"codex/jov-101-clean","base":"main","L":[],"fail":[]}},{{"n":104,"t":"Unrelated clean PR","draft":false,"m":"MERGEABLE","head":"codex/jov-104-clean","base":"main","L":[],"fail":[]}}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  [[ "$3" == "101" || "$3" == "104" || "$3" == "456" || "$3" == "789" ]]
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  [[ "$3" == "101" ]]
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{admitted_head}","baseRefName":"main"}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_ADMISSION_PR=101 "
                    f"DRAIN_ADMISSION_HEAD={admitted_head}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "=== DEQUEUE (hard gates" in result.stdout
        assert "[dry-run] would -merge-queue on #102" in result.stdout
        assert "[dry-run] would -merge-queue on #103" in result.stdout
        assert "[dry-run] would +merge-queue on #101" in result.stdout
        assert "[dry-run] would -merge-queue on #789" not in result.stdout
        assert "[dry-run] would +merge-queue on #102" not in result.stdout
        assert "[dry-run] would +merge-queue on #103" not in result.stdout
        assert "[dry-run] would +merge-queue on #104" not in result.stdout
        assert "=== SURFACE (drafts and queue-deferred; not closed) ===" in result.stdout
        assert "#102" in result.stdout
        assert "#103" in result.stdout

    def test_maintenance_only_run_cannot_admit_a_clean_pr(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{"n":105,"t":"Clean PR","draft":false,"m":"MERGEABLE","head":"codex/jov-105-clean","L":[],"fail":[]}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(_drain_command(tmp_path, extra_env="DRY_RUN=1"))

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "admission scope: maintenance-only" in result.stdout
        assert "would +merge-queue" not in result.stdout

    def test_exact_head_mismatch_refuses_targeted_admission(self, tmp_path: Path) -> None:
        live_head = "a" * 40
        event_head = "b" * 40
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":106,"t":"Head moved","draft":false,"m":"MERGEABLE","head":"codex/jov-106-moved","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{live_head}","baseRefName":"main"}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_ADMISSION_PR=106 "
                    f"DRAIN_ADMISSION_HEAD={event_head}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "event admission scope no longer matches #106" in result.stdout
        assert "would +merge-queue" not in result.stdout

    def test_main_push_preserves_queue_deferred_without_typed_provenance(
        self, tmp_path: Path
    ) -> None:
        """Main maintenance cannot infer that an explicit hold is temporary."""
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{"n":700,"t":"Repair hold","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/repair-hold","base":"main","L":["queue-deferred"],"fail":[]}]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env="DRY_RUN=1 DRAIN_RECONCILE_QUEUE_DEFERRED=1",
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "RECONCILE (disabled; preserving queue-deferred holds)" in result.stdout
        assert "no typed pressure-deferral provenance" in result.stdout
        assert "would -queue-deferred" not in result.stdout
        assert "#700" in result.stdout
        assert "{queue-deferred}" in result.stdout


# ---------------------------------------------------------------------------
# Missing-CI recovery (2026-09-03): a non-draft main PR whose required source
# checks never registered any check-run on its exact head never turns green
# and never enrolls. The drain re-fires source CI with a bounded, age-gated,
# per-head-idempotent close+reopen.
# ---------------------------------------------------------------------------

_MISSING_CI_MARKER = "<!-- bot-comment:missing-ci-recovery -->"


def _missing_ci_pr(
    number: int,
    head: str,
    *,
    draft: bool = False,
    labels: list[str] | None = None,
) -> dict[str, object]:
    return {
        "n": number,
        "t": f"Missing CI PR {number}",
        "draft": draft,
        "m": "MERGEABLE",
        "ms": "BLOCKED",
        "head": f"codex/missing-ci-{number}",
        "headOid": head,
        "base": "main",
        "body": "",
        "L": labels or [],
        "fail": [],
    }


def _write_missing_ci_fixture(
    tmp_path: Path,
    *,
    prs: list[dict[str, object]],
    checks_by_pr: dict[int, str],
    comments_json: str = "[[]]",
    committed: str = "2026-09-01T00:00:00Z",
) -> Path:
    mutations = tmp_path / "mutations"
    mutations.write_text("", encoding="utf-8")
    comments_file = tmp_path / "comments.json"
    comments_file.write_text(comments_json, encoding="utf-8")
    checks_cases = "\n".join(
        f'            if [[ "$3" == "{number}" ]]; then echo \'{checks}\'; exit 0; fi'
        for number, checks in checks_by_pr.items()
    )
    fake_gh = tmp_path / "gh"
    fake_gh.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            if [[ "$1 $2" == "pr list" ]]; then
              echo '{json.dumps(prs)}'
              exit 0
            fi
            if [[ "$1 $2" == "pr checks" ]]; then
{checks_cases}
              echo "unexpected pr checks: $*" >&2
              exit 2
            fi
            if [[ "$1" == "api" ]]; then
              if [[ "$2" == *"/issues/"*"/comments"* ]]; then
                cat '{comments_file}'
                exit 0
              fi
              if [[ "$2" == *"/commits/"* ]]; then
                echo '{committed}'
                exit 0
              fi
              echo "unexpected gh api: $*" >&2
              exit 2
            fi
            if [[ "$1 $2" == "pr comment" || "$1 $2" == "pr close" || "$1 $2" == "pr reopen" ]]; then
              printf '%s %s\\n' "$2" "$3" >>'{mutations}'
              exit 0
            fi
            echo "unexpected gh args: $*" >&2
            exit 2
            """
        ),
        encoding="utf-8",
    )
    fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return mutations


class TestMissingCiRecovery:
    def test_missing_ci_head_is_closed_and_reopened_with_marker_comment(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        mutations = _write_missing_ci_fixture(
            tmp_path,
            prs=[_missing_ci_pr(201, head)],
            checks_by_pr={201: "[]"},
        )

        result = _run_bash(
            _drain_command(tmp_path, extra_env="DRAIN_RECOVER_MISSING_CI=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "=== RECOVER (missing source CI → bounded close+reopen) ===" in result.stdout
        assert f"closed+reopened to re-trigger source CI at {head}" in result.stdout
        assert mutations.read_text(encoding="utf-8").splitlines() == [
            "comment 201",
            "close 201",
            "reopen 201",
        ]

    def test_prior_marker_comment_on_the_same_head_blocks_a_second_attempt(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        comments = json.dumps(
            [
                [
                    {
                        "user": {"login": "jovie-bot[bot]"},
                        "body": f"{_MISSING_CI_MARKER}\nrecovery for head {head}",
                    }
                ]
            ]
        )
        mutations = _write_missing_ci_fixture(
            tmp_path,
            prs=[_missing_ci_pr(201, head)],
            checks_by_pr={201: "[]"},
            comments_json=comments,
        )

        result = _run_bash(
            _drain_command(tmp_path, extra_env="DRAIN_RECOVER_MISSING_CI=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert f"close+reopen already attempted at {head}" in result.stdout
        assert mutations.read_text(encoding="utf-8") == ""

    def test_moved_head_is_remediated_despite_prior_attempt_on_old_head(
        self, tmp_path: Path
    ) -> None:
        old_head = "b" * 40
        new_head = "c" * 40
        comments = json.dumps(
            [
                [
                    {
                        "user": {"login": "jovie-bot[bot]"},
                        "body": f"{_MISSING_CI_MARKER}\nrecovery for head {old_head}",
                    }
                ]
            ]
        )
        mutations = _write_missing_ci_fixture(
            tmp_path,
            prs=[_missing_ci_pr(201, new_head)],
            checks_by_pr={201: "[]"},
            comments_json=comments,
        )

        result = _run_bash(
            _drain_command(tmp_path, extra_env="DRAIN_RECOVER_MISSING_CI=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "close 201" in mutations.read_text(encoding="utf-8")

    def test_young_head_is_never_interrupted(self, tmp_path: Path) -> None:
        head = "c" * 40
        committed = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        mutations = _write_missing_ci_fixture(
            tmp_path,
            prs=[_missing_ci_pr(201, head)],
            checks_by_pr={201: "[]"},
            committed=committed,
        )

        result = _run_bash(
            _drain_command(tmp_path, extra_env="DRAIN_RECOVER_MISSING_CI=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "younger than 120m" in result.stdout
        assert mutations.read_text(encoding="utf-8") == ""

    def test_terminal_failures_are_not_remediated_as_missing_ci(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        mutations = _write_missing_ci_fixture(
            tmp_path,
            prs=[_missing_ci_pr(201, head)],
            checks_by_pr={
                201: '[{"name":"PR Ready","bucket":"fail","state":"FAILURE"}]'
            },
        )

        result = _run_bash(
            _drain_command(tmp_path, extra_env="DRAIN_RECOVER_MISSING_CI=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "=== BLOCKED (red checks" in result.stdout
        assert mutations.read_text(encoding="utf-8") == ""

    def test_recovery_is_capped_per_run(self, tmp_path: Path) -> None:
        prs = [
            _missing_ci_pr(201, "c" * 40),
            _missing_ci_pr(202, "d" * 40),
            _missing_ci_pr(203, "e" * 40),
        ]
        mutations = _write_missing_ci_fixture(
            tmp_path,
            prs=prs,
            checks_by_pr={201: "[]", 202: "[]", 203: "[]"},
        )

        result = _run_bash(
            _drain_command(tmp_path, extra_env="DRAIN_RECOVER_MISSING_CI=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "reached missing-CI recovery cap (2)" in result.stdout
        lines = mutations.read_text(encoding="utf-8").splitlines()
        assert "close 201" in lines
        assert "close 202" in lines
        assert "close 203" not in lines
        assert "comment 203" not in lines

    def test_drafts_and_machine_hold_labels_are_never_remediated(
        self, tmp_path: Path
    ) -> None:
        prs = [
            _missing_ci_pr(201, "c" * 40, draft=True),
            _missing_ci_pr(202, "d" * 40, labels=["queue-deferred"]),
            _missing_ci_pr(203, "e" * 40, labels=["no-auto"]),
        ]
        mutations = _write_missing_ci_fixture(
            tmp_path,
            prs=prs,
            checks_by_pr={202: "[]", 203: "[]"},
        )

        result = _run_bash(
            _drain_command(tmp_path, extra_env="DRAIN_RECOVER_MISSING_CI=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        lines = mutations.read_text(encoding="utf-8").splitlines()
        assert "close 203" in lines
        assert "reopen 203" in lines
        assert "close 201" not in lines
        assert "close 202" not in lines

    def test_recovery_is_disabled_by_default(self, tmp_path: Path) -> None:
        mutations = _write_missing_ci_fixture(
            tmp_path,
            prs=[_missing_ci_pr(201, "c" * 40)],
            checks_by_pr={201: "[]"},
        )

        result = _run_bash(_drain_command(tmp_path))

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "=== RECOVER (missing source CI" not in result.stdout
        assert mutations.read_text(encoding="utf-8") == ""

    def test_dry_run_reports_without_mutating(self, tmp_path: Path) -> None:
        head = "c" * 40
        mutations = _write_missing_ci_fixture(
            tmp_path,
            prs=[_missing_ci_pr(201, head)],
            checks_by_pr={201: "[]"},
        )

        result = _run_bash(
            _drain_command(
                tmp_path, extra_env="DRY_RUN=1 DRAIN_RECOVER_MISSING_CI=1"
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "[dry-run] would comment + close/reopen" in result.stdout
        assert mutations.read_text(encoding="utf-8") == ""

    def test_recovery_cap_rejects_unbounded_value_before_gh(
        self, tmp_path: Path
    ) -> None:
        called = tmp_path / "called"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            f"#!/usr/bin/env bash\ntouch '{called}'\nexit 99\n",
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRAIN_RECOVER_MISSING_CI=1 DRAIN_MISSING_CI_MAX_PER_RUN=3"
                ),
            )
        )

        assert result.returncode == 2
        assert (
            "DRAIN_MISSING_CI_MAX_PER_RUN must be an integer from 1 through 2"
            in result.stderr
        )
        assert not called.exists(), "drain invoked gh before bounded-cap preflight"


# ---------------------------------------------------------------------------
# Queue-deferred release (JOV-5054): mechanical `jovie-queue-deferral/v1`
# provenance plus untyped ready holds may be lifted under a fresh GREEN
# fleet receipt. Human-policy holds (taste, net-new, outbound) stay held.
# The scanner covers every queue-deferred PR, not only agent branches.
# ---------------------------------------------------------------------------

_RELEASE_SCRIPT = _REPO_ROOT / "scripts" / "release-queue-deferred.sh"


def _release_command(tmp_path: Path, *, extra_env: str = "") -> str:
    fake_gh = tmp_path / "gh"
    assert fake_gh.is_file(), f"test must create isolated gh fixture first: {fake_gh}"
    env_prefix = (
        f'PATH="{tmp_path}:$PATH" '
        f'FAKE_GH_LOG="{tmp_path}/gh-calls.log" '
        f'FAKE_GH_STATE="{tmp_path}/state" '
    )
    if extra_env:
        env_prefix += f"{extra_env} "
    return f'{env_prefix}bash "{_RELEASE_SCRIPT}"'


def _fleet_receipt(tmp_path: Path, *, state: str = "GREEN", age_minutes: int = 0) -> Path:
    observed = datetime.now(timezone.utc) - timedelta(minutes=age_minutes)
    receipt = tmp_path / f"fleet-{state.lower()}-{age_minutes}.json"
    receipt.write_text(
        json.dumps(
            {
                "schema": "jovie-fleet-gate/v1",
                "observedAt": observed.isoformat(),
                "state": state,
                "promotionAdmission": {"allowed": state == "GREEN"},
            }
        ),
        encoding="utf-8",
    )
    return receipt


def _receipt_comment_body(
    tmp_path: Path,
    *,
    head: str,
    repository: str = "JovieInc/Jovie",
    deferred_minutes: int = 120,
    pr: int = 900,
    author: str = "itstimwhite",
    reason: str = "symphony-birth-hold",
    source: str = "symphony",
) -> None:
    deferred = datetime.now(timezone.utc) - timedelta(minutes=deferred_minutes)
    receipt = {
        "schema": "jovie-queue-deferral/v1",
        "repository": repository,
        "pr": pr,
        "head": head,
        "reason": reason,
        "source": source,
        "deferredAt": deferred.isoformat(),
    }
    body = (
        "<!-- bot-comment:queue-deferral -->\n"
        "## Queue Deferral Receipt\n\n"
        "```json\n"
        + json.dumps(receipt, indent=2)
        + "\n```\n"
    )
    # `gh api --paginate --slurp` wraps endpoint pages in an outer array.
    (tmp_path / "comments-900.json").write_text(
        json.dumps([[{"user": {"login": author}, "body": body}]]),
        encoding="utf-8",
    )


_FAKE_GH_PREAMBLE = """\
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "${FAKE_GH_LOG:?}"
mkdir -p "${FAKE_GH_STATE:?}"
"""

_FAKE_GH_API_UNTYPED = """\
if [[ "$1" == "api" ]]; then
  # Attempt-marker lookup and untyped deferral lookup: no marker comments.
  exit 0
fi
"""

_FAKE_GH_GREEN_CHECKS = """\
if [[ "$1 $2" == "pr checks" ]]; then
  echo '[{"name":"PR Ready","bucket":"pass","state":"SUCCESS"},{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"},{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"},{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}]'
  exit 0
fi
"""


def _write_fake_gh(tmp_path: Path, body: str) -> None:
    fake_gh = tmp_path / "gh"
    fake_gh.write_text(body, encoding="utf-8")
    fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _run_single_candidate_release(
    tmp_path: Path,
    *,
    head: str,
    base: str = "main",
    draft: bool = False,
    branch: str = "symphony/JOV-900-fix",
    labels: list[str] | None = None,
    fleet_state: str = "GREEN",
    fleet_age_minutes: int = 0,
) -> subprocess.CompletedProcess[str]:
    labels_json = json.dumps(labels or ["queue-deferred"])
    receipt = _fleet_receipt(
        tmp_path, state=fleet_state, age_minutes=fleet_age_minutes
    )
    _write_fake_gh(
        tmp_path,
        textwrap.dedent(
            f"""\
            {_FAKE_GH_PREAMBLE}
            if [[ "$1 $2" == "pr list" ]]; then
              echo '[{{"n":900,"t":"Deferred PR","draft":{str(draft).lower()},"m":"MERGEABLE","head":"{branch}","oid":"{head}","owner":"JovieInc","updated":"2026-08-13T00:00:00Z","L":{labels_json}}}]'
              exit 0
            fi
            if [[ "$1" == "api" ]]; then
              if [[ "$*" != *"queue-deferral-release"* && -f "${{FAKE_GH_STATE}}/../comments-900.json" ]]; then
                cat "${{FAKE_GH_STATE}}/../comments-900.json"
              fi
              exit 0
            fi
            if [[ "$1 $2" == "pr view" ]]; then
              echo '{{"draft":{str(draft).lower()},"head":"{head}","branch":"{branch}","headOwner":"JovieInc","base":"{base}","labels":{labels_json},"mergeable":"MERGEABLE","state":"OPEN"}}'
              exit 0
            fi
            {_FAKE_GH_GREEN_CHECKS}
            echo "unexpected gh args: $*" >&2
            exit 2
            """
        ),
    )
    return _run_bash(
        _release_command(
            tmp_path,
            extra_env=(
                "RELEASE_MODE=release DRY_RUN=1 ATTEMPT_COOLDOWN_MINUTES=0 "
                f'FLEET_RECEIPT_FILE="{receipt}"'
            ),
        )
    )


class TestReleaseQueueDeferred:
    def test_report_lists_age_and_typed_reason_with_alarm(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head, deferred_minutes=120)
        stale_update = (
            datetime.now(timezone.utc) - timedelta(hours=3)
        ).isoformat()
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{{"n":900,"t":"Symphony draft","draft":true,"m":"MERGEABLE","head":"symphony/JOV-900-fix","oid":"{head}","owner":"JovieInc","updated":"{stale_update}","L":["queue-deferred"]}},{{"n":901,"t":"Repair hold","draft":true,"m":"MERGEABLE","head":"codex/JOV-901-fix","oid":"{"d" * 40}","owner":"JovieInc","updated":"{stale_update}","L":["queue-deferred"]}}]
JSON
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ "$*" == *"issues/900/"* && "$*" != *"queue-deferral-release"* ]]; then
                    cat "${{FAKE_GH_STATE}}/../comments-900.json"
                  fi
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(tmp_path, extra_env="RELEASE_MODE=report")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "#900" in result.stdout
        assert "symphony-birth-hold" in result.stdout
        assert "#901" in result.stdout
        assert "untyped-ready-hold" in result.stdout
        assert "untyped-hold-manual-release-required" not in result.stdout
        assert "::warning::queue-deferred #900" in result.stdout
        assert "::warning::queue-deferred #901" in result.stdout

    def test_release_disabled_under_amber(self, tmp_path: Path) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head)
        receipt = _fleet_receipt(tmp_path, state="AMBER")
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":900,"t":"Symphony draft","draft":true,"m":"MERGEABLE","head":"symphony/JOV-900-fix","oid":"{head}","owner":"JovieInc","updated":"2026-08-13T00:00:00Z","L":["queue-deferred"]}}]'
                  exit 0
                fi
                {_FAKE_GH_API_UNTYPED}
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(
                tmp_path,
                extra_env=f'RELEASE_MODE=release FLEET_RECEIPT_FILE="{receipt}"',
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "fleet-gate-not-releasable:AMBER" in result.stdout
        log = (tmp_path / "gh-calls.log").read_text(encoding="utf-8")
        assert "pr edit" not in log
        assert "pr ready" not in log

    def test_release_disabled_with_stale_fleet_receipt(self, tmp_path: Path) -> None:
        receipt = _fleet_receipt(tmp_path, state="GREEN", age_minutes=30)
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[]'
                  exit 0
                fi
                {_FAKE_GH_API_UNTYPED}
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(
                tmp_path,
                extra_env=f'RELEASE_MODE=release FLEET_RECEIPT_FILE="{receipt}"',
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "fleet-receipt-stale" in result.stdout

    def test_scanner_includes_non_agent_queue_deferred_prs(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        stale_update = (
            datetime.now(timezone.utc) - timedelta(hours=3)
        ).isoformat()
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{{"n":15849,"t":"Non-agent ready PR","draft":false,"m":"MERGEABLE","head":"cursor/fix-shell-restore","oid":"{head}","owner":"JovieInc","updated":"{stale_update}","L":["queue-deferred"]}},{{"n":901,"t":"Human feat branch","draft":false,"m":"MERGEABLE","head":"feat/onboarding","oid":"{"d" * 40}","owner":"JovieInc","updated":"{stale_update}","L":["queue-deferred"]}}]
JSON
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(tmp_path, extra_env="RELEASE_MODE=report")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "scanning open queue-deferred PRs" in result.stdout
        assert "#15849" in result.stdout
        assert "#901" in result.stdout
        assert "untyped-ready-hold" in result.stdout

    def test_untyped_hold_on_ready_green_pr_is_released_under_green_fleet(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            branch="cursor/fix-shell-restore",
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "untyped hold" in result.stdout
        assert "releasing only after fresh controller admission" in result.stdout
        assert "never released automatically" not in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_untyped_draft_hold_cannot_be_released(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(tmp_path, head=head, draft=True)

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "live state no longer matches the releasable snapshot" in result.stdout
        assert "would remove" not in result.stdout

    def test_untyped_hold_with_retired_taste_label_is_released(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            labels=["queue-deferred", "needs:taste"],
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "human-policy-hold" not in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_untyped_hold_with_net_new_label_is_released(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            labels=["queue-deferred", "net-new"],
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "human-policy-hold" not in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_untyped_hold_with_outbound_label_is_released(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            labels=["queue-deferred", "outbound"],
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "human-policy-hold" not in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_untyped_hold_stays_held_when_fleet_is_red(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            fleet_state="RED",
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "fleet-gate-not-releasable:RED" in result.stdout
        assert "would remove" not in result.stdout

    def test_untyped_hold_stays_held_when_production_receipt_is_stale(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            fleet_state="GREEN",
            fleet_age_minutes=30,
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "fleet-receipt-stale" in result.stdout
        assert "would remove" not in result.stdout

    def test_recent_attempt_requests_bounded_in_run_retry(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head)
        receipt = _fleet_receipt(tmp_path, state="GREEN")
        retry_file = tmp_path / "retry-after-seconds"
        attempted = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":900,"t":"Symphony draft","draft":true,"m":"MERGEABLE","head":"symphony/JOV-900-fix","oid":"{head}","owner":"JovieInc","updated":"2026-08-13T00:00:00Z","L":["queue-deferred"]}}]'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ "$*" == *"queue-deferral-release"* ]]; then
                    echo '{attempted}'
                  else
                    cat "${{FAKE_GH_STATE}}/../comments-900.json"
                  fi
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(
                tmp_path,
                extra_env=(
                    "RELEASE_MODE=release ATTEMPT_COOLDOWN_MINUTES=5 "
                    f'RELEASE_RETRY_FILE="{retry_file}" '
                    f'FLEET_RECEIPT_FILE="{receipt}"'
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "retry requested in 180s" in result.stdout
        assert retry_file.read_text(encoding="utf-8").strip() == "180"
        log = (tmp_path / "gh-calls.log").read_text(encoding="utf-8")
        assert "pr view" not in log
        assert "pr edit" not in log
        assert "pr ready" not in log

    def test_untrusted_comment_is_ignored_and_ready_untyped_hold_releases(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head, author="random-contributor")
        result = _run_single_candidate_release(tmp_path, head=head)

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "untyped hold" in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_receipt_for_another_pr_is_treated_as_untyped_ready_hold(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head, pr=901)
        result = _run_single_candidate_release(tmp_path, head=head)

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "deferral-receipt-pr-mismatch (receipt=#901, live=#900)" in result.stdout
        assert "treating as untyped ready hold" in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_receipt_for_another_repository_stays_held(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head, repository="JovieInc/LogYourBody")
        result = _run_single_candidate_release(tmp_path, head=head)

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert (
            "deferral-receipt-repository-mismatch (receipt=JovieInc/LogYourBody, live=JovieInc/Jovie)"
            in result.stdout
        )
        assert "untyped-hold-manual-release-required" in result.stdout
        assert "would remove" not in result.stdout

    def test_head_stale_mechanical_receipt_is_released_against_live_head(
        self, tmp_path: Path
    ) -> None:
        live_head = "e" * 40
        _receipt_comment_body(tmp_path, head="f" * 40)
        result = _run_single_candidate_release(tmp_path, head=live_head)

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "deferral-receipt-head-stale" in result.stdout
        assert "evaluating live head" in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_queue_pressure_receipt_stays_held_while_live_pressure_is_high(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(
            tmp_path,
            head=head,
            reason="queue-pressure",
            source="agent-pipeline",
        )
        receipt = _fleet_receipt(tmp_path, state="GREEN")
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" && "$*" == *"number,title"* ]]; then
                  echo '[{{"n":900,"t":"Pressure hold","draft":true,"m":"MERGEABLE","head":"symphony/JOV-900-fix","oid":"{head}","owner":"JovieInc","updated":"2026-08-13T00:00:00Z","L":["queue-deferred"]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"number":901,"isDraft":false,"mergeStateStatus":"CLEAN","labels":[]}}]'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ "$*" != *"queue-deferral-release"* ]]; then
                    cat "${{FAKE_GH_STATE}}/../comments-900.json"
                  fi
                  exit 0
                fi
                {_FAKE_GH_GREEN_CHECKS}
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(
                tmp_path,
                extra_env=(
                    "RELEASE_MODE=release DRY_RUN=1 ATTEMPT_COOLDOWN_MINUTES=0 "
                    "QUEUE_READY_THRESHOLD=1 "
                    f'FLEET_RECEIPT_FILE="{receipt}"'
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "queue pressure remains high (1 ready, threshold 1)" in result.stdout
        assert "would remove" not in result.stdout

    def test_non_main_live_target_cannot_be_released(self, tmp_path: Path) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head)
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            base="symphony/JOV-899-stack",
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "live state no longer matches the releasable snapshot" in result.stdout
        assert "would remove" not in result.stdout

    def test_draft_hold_cannot_be_released_by_non_human_controller(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head)
        result = _run_single_candidate_release(tmp_path, head=head, draft=True)

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "live state no longer matches the releasable snapshot" in result.stdout
        assert "would remove" not in result.stdout
        log = (tmp_path / "gh-calls.log").read_text(encoding="utf-8")
        assert "pr ready" not in log

    def test_green_receipt_releases_ready_typed_birth_hold(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head)
        receipt = _fleet_receipt(tmp_path, state="GREEN")
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":900,"t":"Symphony PR","draft":false,"m":"MERGEABLE","head":"symphony/JOV-900-fix","oid":"{head}","owner":"JovieInc","updated":"2026-08-13T00:00:00Z","L":["queue-deferred"]}}]'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ "$*" != *"queue-deferral-release"* && "$*" != *"-X PATCH"* ]]; then
                    cat "${{FAKE_GH_STATE}}/../comments-900.json"
                  fi
                  exit 0
                fi
                {_FAKE_GH_GREEN_CHECKS}
                if [[ "$1 $2" == "pr view" ]]; then
                  if [[ -f "${{FAKE_GH_STATE}}/label_removed" ]]; then
                    echo '{{"draft":false,"head":"{head}","branch":"symphony/JOV-900-fix","headOwner":"JovieInc","base":"main","labels":[],"mergeable":"MERGEABLE","state":"OPEN"}}'
                  else
                    echo '{{"draft":false,"head":"{head}","branch":"symphony/JOV-900-fix","headOwner":"JovieInc","base":"main","labels":["queue-deferred"],"mergeable":"MERGEABLE","state":"OPEN"}}'
                  fi
                  exit 0
                fi
                if [[ "$1 $2" == "pr edit" ]]; then
                  touch "${{FAKE_GH_STATE}}/label_removed"
                  exit 0
                fi
                if [[ "$1 $2" == "pr comment" ]]; then
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(
                tmp_path,
                extra_env=(
                    "RELEASE_MODE=release ATTEMPT_COOLDOWN_MINUTES=0 "
                    f'FLEET_RECEIPT_FILE="{receipt}"'
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "✓ removed `queue-deferred` from #900" in result.stdout
        log = (tmp_path / "gh-calls.log").read_text(encoding="utf-8")
        assert "--remove-label queue-deferred" in log
        assert "pr ready" not in log
        assert "--add-label queue-deferred" not in log, "no compensating restore expected"


class TestNativeAdmissionReceiptReconciliation:
    @staticmethod
    def _write_fixture(
        tmp_path: Path,
        *,
        receipt_main: str | None,
        checkpoint: str = "verified",
        receipt_creator: str | None = "jovie-bot[bot]",
        older_receipt_creator: str | None = None,
        receipt_at: str | None,
        enqueued_at: str | None = "2026-09-07T12:00:00Z",
        dequeue_response: str = '{"skipped":false,"state":{"queued":false}}',
    ) -> tuple[str, Path]:
        head = "c" * 40
        receipt_main = receipt_main or head
        dequeue_log = tmp_path / "dequeued"
        dequeue_log.write_text("", encoding="utf-8")
        node_calls = tmp_path / "node-calls"
        node_calls.write_text("", encoding="utf-8")
        queue_timestamp = (
            f',"enqueuedAt":"{enqueued_at}"' if enqueued_at is not None else ""
        )
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                echo "${{2:-}}" >>"{node_calls}"
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state)
                    echo '{{"1001":{{"id":"PR_1001","number":1001,"state":"OPEN","isDraft":false,"title":"Receipt reconciliation","body":"","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","headRefName":"codex/receipt","headRefOid":"{head}","baseRefName":"main","labels":{{"nodes":[]}},"isInMergeQueue":true,"mergeQueueEntry":{{"id":"MQE_1001","state":"QUEUED","position":1{queue_timestamp}}},"autoMergeRequest":null,"queued":true,"backend":"native"}}}}'
                    ;;
                  dequeue-ineligible)
                    echo "${{3:?}}" >>"{dequeue_log}"
                    echo '{dequeue_response}'
                    ;;
                  max-queue-depth) echo 16 ;;
                  unmergeable-eject) echo '{{"action":"keep","reason":"not-unmergeable"}}' ;;
                  unmergeable-reenqueue) echo '{{"action":"allow","reason":"no-eject-receipt"}}' ;;
                  changelog-collision) echo '{{"action":"allow","reason":"candidate-omits-changelog"}}' ;;
                  changelog-inventory) echo '{{"schema":"jovie-pre-land-changelog/v1","ok":true,"reason":"explicit","prs":[],"count":0}}' ;;
                  changelog-drain) echo '{{"action":"keep","reason":"omits-changelog","reenqueue":false}}' ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        status_json = (
            '{"statuses":[]}'
            if receipt_at is None
            else f'{{"statuses":[{{"context":"jovie-queue-admission/v2","state":"success","description":"checkpoint={checkpoint};main={receipt_main};pr=1001","creator":{{"type":"Bot","login":"{receipt_creator}"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","updated_at":"{receipt_at}"}}]}}'
        )
        plural_statuses = json.loads(status_json)["statuses"]
        if plural_statuses and receipt_creator is None:
            plural_statuses[0]["creator"] = None
            plural_statuses[0]["avatar_url"] = _TRUSTED_BOT_AVATAR
            plural_statuses[0]["url"] = f"https://api.github.com/repos/JovieInc/Jovie/statuses/{head}"
        if older_receipt_creator is not None:
            plural_statuses[0]["id"] = 2
            older = json.loads(json.dumps(plural_statuses[0]))
            older["id"] = 1
            older["creator"]["login"] = older_receipt_creator
            plural_statuses.append(older)
        plural_status_json = json.dumps([[], plural_statuses])
        combined_status = json.loads(status_json)
        for receipt in combined_status["statuses"]:
            receipt["creator"] = None
        combined_status_json = json.dumps(combined_status)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == "users/jovie-bot%5Bbot%5D" ]]; then
                  [[ ! -f "{tmp_path}/identity-api-failure" ]] || exit 1
                  if [[ -f "{tmp_path}/identity-malformed" ]]; then echo '{{}}'; exit 0; fi
                  echo '{{"login":"jovie-bot[bot]","type":"Bot","avatar_url":"{_TRUSTED_BOT_AVATAR}"}}'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/commits/{head}/statuses?per_page=100" ]]; then
                  [[ " $* " == *" --paginate --slurp "* ]] || exit 2
                  [[ ! -f "{tmp_path}/statuses-api-failure" ]] || exit 1
                  if [[ -f "{tmp_path}/statuses-malformed" ]]; then echo '{{}}'; exit 0; fi
                  echo '{plural_status_json}'
                  exit 0
                fi
                if [[ "$1" == "api" && "$2" == *"/commits/{head}/status" ]]; then
                  echo '{combined_status_json}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then exit 1; fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)
        return head, dequeue_log

    @pytest.mark.parametrize(
        ("receipt_main", "receipt_at", "receipt_creator"),
        [
            ("a" * 40, "2026-09-07T12:00:02Z", "jovie-bot[bot]"),
            ("a" * 40, "2026-09-07T11:59:59Z", "jovie-bot[bot]"),
            ("b" * 40, "2026-09-07T12:00:02Z", "jovie-bot[bot]"),
            ("a" * 40, None, "jovie-bot[bot]"),
            ("a" * 40, "2026-09-07T12:00:02Z", "untrusted-bot[bot]"),
            (None, None, None),
        ],
    )
    def test_queued_members_are_never_dequeued_for_missing_or_stale_receipts(
        self,
        tmp_path: Path,
        receipt_main: str | None,
        receipt_at: str | None,
        receipt_creator: str | None,
    ) -> None:
        """JOV-6444 churn fix: the drain must not dequeue a queued member
        because its admission receipt is stale, unprovable, or absent.
        GitHub's queue membership stands; only the safety dequeue passes
        (hard gates, UNMERGEABLE, conflicts) evict members."""
        _, dequeue_log = self._write_fixture(
            tmp_path,
            receipt_main=receipt_main or "a" * 40,
            receipt_at=receipt_at,
            receipt_creator=receipt_creator,
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_PROMOTION_MODE=normal "
                    "DRAIN_RECONCILE_ADMISSION_RECEIPTS=1 "
                    "DRAIN_RECONCILE_MISSED_ADMISSION=0"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert dequeue_log.read_text(encoding="utf-8") == ""
        assert "canonical dequeue" not in result.stdout
        assert "unproven native admission" not in result.stderr

    def test_dequeue_never_fires_on_admission_receipt_evidence(self, tmp_path: Path) -> None:
        """Pin the removal: no drain pass may consume admission-receipt
        evidence as dequeue authority, even when the flag is set."""
        drain = _DRAIN_SCRIPT.read_text(encoding="utf-8")
        assert "DRAIN_RECONCILE_ADMISSION_RECEIPTS" not in drain
        assert "canonical dequeue" not in drain
        assert "unproven native admission" not in drain
        _, dequeue_log = self._write_fixture(
            tmp_path,
            receipt_main="a" * 40,
            receipt_at="2026-09-07T12:00:02Z",
        )
        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_PROMOTION_MODE=normal "
                    "DRAIN_RECONCILE_ADMISSION_RECEIPTS=1 "
                    "DRAIN_RECONCILE_MISSED_ADMISSION=0"
                ),
            )
        )
        # The removed pass must stay inert even if the env var is still set.
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert dequeue_log.read_text(encoding="utf-8") == ""

    @pytest.mark.parametrize("checkpoint", ["source-qualified", "verified", "controller-repair"])
    def test_typed_receipt_survives_main_advance_during_unrelated_deployment(
        self, tmp_path: Path, checkpoint: str
    ) -> None:
        _, dequeue_log = self._write_fixture(
            tmp_path, receipt_main="b" * 40,
            receipt_at="2026-09-07T12:00:02Z", checkpoint=checkpoint,
        )
        result = _run_bash(_drain_command(
            tmp_path, backend="native",
            extra_env="DRAIN_PROMOTION_MODE=normal DRAIN_RECONCILE_MISSED_ADMISSION=0 DRAIN_PRODUCTION_CHECKPOINT_STATE=none",
        ))
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert dequeue_log.read_text(encoding="utf-8") == ""

    @pytest.mark.parametrize("receipt_creator", ["jovie-bot[bot]", "untrusted-bot[bot]"])
    def test_plural_status_preserves_membership_regardless_of_receipt_author(
        self, tmp_path: Path, receipt_creator: str
    ) -> None:
        # Receipt authorship is enrollment evidence, never dequeue authority:
        # an unprovable or foreign-authored receipt must not evict a queued
        # member (JOV-6444 churn fix).
        _, dequeue_log = self._write_fixture(
            tmp_path, receipt_main="a" * 40,
            receipt_at="2026-09-07T12:00:02Z", receipt_creator=receipt_creator,
            older_receipt_creator=(
                "untrusted-bot[bot]" if receipt_creator == "jovie-bot[bot]"
                else "jovie-bot[bot]"
            ),
        )
        result = _run_bash(_drain_command(
            tmp_path, backend="native",
            extra_env="DRAIN_PROMOTION_MODE=normal DRAIN_RECONCILE_MISSED_ADMISSION=0",
        ))
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert dequeue_log.read_text(encoding="utf-8") == ""

    @pytest.mark.parametrize("overrides", [
        {"name": "Queue-Deferred Release", "path": ".github/workflows/queue-deferred-release.yml"},
        {"name": "Claude Code", "path": ".github/workflows/claude.yml"},
        {"name": "Delivery Control Receipts", "path": ".github/workflows/delivery-control-receipts.yml"},
        {"status": "completed", "conclusion": "cancelled", "updated_at": "2026-09-07T12:00:01Z"},
        {"status": "queued"},
        {"created_at": "2026-09-07T12:00:01Z"},
        {"repository": {"full_name": "other/repository"}},
        {"event": "schedule"},
    ])
    def test_untrusted_receipt_producer_preserves_membership(self, tmp_path: Path, overrides: dict) -> None:
        _, dequeue_log = self._write_fixture(
            tmp_path, receipt_main="a" * 40, receipt_at="2026-09-07T12:00:02Z",
        )
        (tmp_path / "producer-overrides.json").write_text(json.dumps(overrides))
        result = _run_bash(_drain_command(
            tmp_path, backend="native",
            extra_env="DRAIN_PROMOTION_MODE=normal DRAIN_RECONCILE_MISSED_ADMISSION=0",
        ))
        assert result.returncode == 0, result.stderr
        assert dequeue_log.read_text() == ""

    @pytest.mark.parametrize("conclusion", ["success", "cancelled", "failure"])
    def test_membership_survives_producer_completion_state(self, tmp_path: Path, conclusion: str) -> None:
        _, dequeue_log = self._write_fixture(
            tmp_path, receipt_main="b" * 40, receipt_at="2026-09-07T12:00:02Z",
        )
        (tmp_path / "producer-overrides.json").write_text(json.dumps({
            "status": "completed", "conclusion": conclusion, "updated_at": "2026-09-07T12:00:03Z",
        }))
        result = _run_bash(_drain_command(
            tmp_path, backend="native",
            extra_env="DRAIN_PROMOTION_MODE=normal DRAIN_RECONCILE_MISSED_ADMISSION=0",
        ))
        assert result.returncode == 0, result.stderr
        assert dequeue_log.read_text() == ""

    @pytest.mark.parametrize("failure_marker", ["producer-api-failure", "producer-malformed", "statuses-api-failure", "statuses-malformed"])
    def test_reconciler_preserves_membership_when_producer_evidence_is_unavailable(self, tmp_path: Path, failure_marker: str) -> None:
        _, dequeue_log = self._write_fixture(
            tmp_path, receipt_main="a" * 40, receipt_at="2026-09-07T12:00:02Z",
        )
        (tmp_path / failure_marker).touch()
        result = _run_bash(_drain_command(
            tmp_path, backend="native",
            extra_env="DRAIN_PROMOTION_MODE=normal DRAIN_RECONCILE_MISSED_ADMISSION=0",
        ))
        # JOV-6444 churn fix: receipt-evidence outages no longer abort the drain
        # or evict the member; membership is preserved unconditionally.
        assert result.returncode == 0, result.stderr
        assert dequeue_log.read_text() == ""
        assert "enroll" not in (tmp_path / "node-calls").read_text().splitlines()

    @pytest.mark.parametrize("failure_marker", ["identity-api-failure", "identity-malformed", "producer-api-failure", "producer-malformed", "producer-missing-workflow-id"])
    def test_null_creator_identity_api_failure_preserves_membership(self, tmp_path: Path, failure_marker: str) -> None:
        _, dequeue_log = self._write_fixture(
            tmp_path, receipt_main="a" * 40, receipt_at="2026-09-07T12:00:02Z", receipt_creator=None,
        )
        if failure_marker == "producer-missing-workflow-id":
            (tmp_path / "producer-overrides.json").write_text(json.dumps({"workflow_id": None}))
        else:
            (tmp_path / failure_marker).touch()
        result = _run_bash(_drain_command(
            tmp_path, backend="native",
            extra_env="DRAIN_PROMOTION_MODE=normal DRAIN_RECONCILE_MISSED_ADMISSION=0",
        ))
        assert result.returncode == 0, result.stderr
        assert dequeue_log.read_text() == ""

    @pytest.mark.parametrize("receipt_creator", ["jovie-bot[bot]", None])
    @pytest.mark.parametrize("overrides", [
        {"name": None}, {"path": None}, {"head_sha": None},
        {"repository": {}}, {"run_attempt": None}, {"conclusion": {}},
        {"created_at": None}, {"updated_at": None},
        {"created_at": "not-a-date"}, {"updated_at": "not-a-date"},
    ])
    def test_partial_producer_object_preserves_membership(self, tmp_path: Path, overrides: dict, receipt_creator: str | None) -> None:
        _, dequeue_log = self._write_fixture(
            tmp_path, receipt_main="a" * 40, receipt_at="2026-09-07T12:00:02Z", receipt_creator=receipt_creator,
        )
        (tmp_path / "producer-overrides.json").write_text(json.dumps(overrides))
        result = _run_bash(_drain_command(
            tmp_path, backend="native",
            extra_env="DRAIN_PROMOTION_MODE=normal DRAIN_RECONCILE_MISSED_ADMISSION=0",
        ))
        assert result.returncode == 0, result.stderr
        assert dequeue_log.read_text() == ""

    def test_stale_receipt_never_triggers_dequeue_or_enroll(self, tmp_path: Path) -> None:
        _, dequeue_log = self._write_fixture(
            tmp_path,
            receipt_main="a" * 40,
            receipt_at="2026-09-07T11:59:59Z",
            dequeue_response=(
                '{"skipped":true,"reason":"queue-entry-changed",'
                '"state":{"queued":true}}'
            ),
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_PROMOTION_MODE=normal "
                    "DRAIN_RECONCILE_MISSED_ADMISSION=0"
                ),
            )
        )

        # JOV-6444 churn fix: a stale receipt is not dequeue evidence. The
        # drain neither evicts the member nor re-enrolls it behind its back.
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert dequeue_log.read_text(encoding="utf-8") == ""
        node_commands = (tmp_path / "node-calls").read_text(encoding="utf-8").splitlines()
        assert "enroll" not in node_commands
        assert "record-reentry" not in node_commands

    def test_missing_enqueue_timestamp_preserves_queued_membership(self, tmp_path: Path) -> None:
        _, dequeue_log = self._write_fixture(
            tmp_path,
            receipt_main="a" * 40,
            receipt_at="2026-09-07T12:00:02Z",
            enqueued_at=None,
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env="DRAIN_PROMOTION_MODE=normal",
            )
        )

        # JOV-6444 churn fix: a missing enqueue timestamp is an observation gap,
        # never an eviction trigger. No admission mutation fires.
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert dequeue_log.read_text(encoding="utf-8") == ""


class TestCanonicalAdmissionProducer:
    @pytest.mark.parametrize("producer_env", [
        "GITHUB_RUN_ID=", "GITHUB_RUN_ID=invalid", "GITHUB_RUN_ATTEMPT=",
        "GITHUB_RUN_ATTEMPT=0", "GITHUB_SERVER_URL=https://untrusted.example",
    ])
    def test_missing_identity_stops_before_api_and_queue(self, tmp_path: Path, producer_env: str) -> None:
        result, paths, _, _ = _run_same_token_rest_fixture(tmp_path, rest_mode="true", producer_env=producer_env)
        assert "exact workflow run and attempt" in result.stderr
        assert paths["enroll"].read_text().strip() == "0"
        assert not (tmp_path / "producer-reads").exists()
        assert not (tmp_path / "receipt-writes").exists()

    @pytest.mark.parametrize("overrides", [
        {"name": "Queue-Deferred Release", "path": ".github/workflows/queue-deferred-release.yml"},
        {"name": "Claude Code", "path": ".github/workflows/claude.yml"},
        {"name": "Delivery Control Receipts", "path": ".github/workflows/delivery-control-receipts.yml"},
        {"status": "completed", "conclusion": "cancelled"},
        {"status": "completed", "conclusion": "success"},
        {"status": "queued"},
        {"name": "Wrong workflow"},
        {"path": ".github/workflows/other.yml"},
        {"head_branch": ""},
        {"conclusion": "success"},
        {"id": 123},
        {"run_attempt": 2},
        {"repository": {"full_name": "other/repository"}},
        {"head_repository": {"full_name": "other/repository"}},
        {"html_url": "https://github.com/JovieInc/Jovie/actions/runs/123"},
        {"head_sha": "missing"},
        {"head_branch": "untrusted"},
        {"event": "schedule"},
    ])
    def test_untrusted_producer_never_enrolls_or_stamps(self, tmp_path: Path, overrides: dict) -> None:
        (tmp_path / "producer-overrides.json").write_text(json.dumps(overrides))
        result, paths, _, _ = _run_same_token_rest_fixture(tmp_path, rest_mode="true")
        assert "inactive or noncanonical workflow producer" in result.stderr
        assert paths["enroll"].read_text().strip() == "0"
        assert paths["dequeue"].read_text().strip() == "0"
        assert not (tmp_path / "receipt-writes").exists()

    def test_api_failure_never_enrolls_or_stamps(self, tmp_path: Path) -> None:
        (tmp_path / "producer-api-failure").touch()
        result, paths, _, _ = _run_same_token_rest_fixture(tmp_path, rest_mode="true")
        assert "producer identity is unavailable" in result.stderr
        assert paths["enroll"].read_text().strip() == "0"
        assert not (tmp_path / "receipt-writes").exists()

    def test_malformed_response_never_enrolls_or_stamps(self, tmp_path: Path) -> None:
        (tmp_path / "producer-malformed").touch()
        result, paths, _, _ = _run_same_token_rest_fixture(tmp_path, rest_mode="true")
        assert "inactive or noncanonical workflow producer" in result.stderr
        assert paths["enroll"].read_text().strip() == "0"
        assert not (tmp_path / "receipt-writes").exists()

    def test_producer_ending_after_enroll_is_compensated_without_receipt(self, tmp_path: Path) -> None:
        (tmp_path / "producer-after-enroll.json").write_text(json.dumps({"status": "completed", "conclusion": "cancelled"}))
        result, paths, _, _ = _run_same_token_rest_fixture(tmp_path, rest_mode="true")
        assert paths["enroll"].read_text().strip() == "1"
        assert paths["dequeue"].read_text().strip() == "1"
        assert "inactive or noncanonical workflow producer" in result.stderr
        assert not (tmp_path / "receipt-writes").exists()

    @pytest.mark.parametrize("event,branch", [("workflow_run", "main"), ("pull_request", "codex/source")])
    def test_active_canonical_producer_enrolls_and_stamps(self, tmp_path: Path, event: str, branch: str) -> None:
        (tmp_path / "producer-overrides.json").write_text(json.dumps({"event": event, "head_branch": branch}))
        result, paths, head, _ = _run_same_token_rest_fixture(tmp_path, rest_mode="true")
        assert result.returncode == 0, result.stderr
        assert paths["enroll"].read_text().strip() == "1"
        assert paths["dequeue"].read_text().strip() == "0"
        receipt = (tmp_path / "receipt-writes").read_text()
        assert "context=jovie-queue-admission/v2" in receipt
        assert f"statuses/{head}" in receipt
        assert "target_url=https://github.com/JovieInc/Jovie/actions/runs/42" in receipt
        assert (tmp_path / "producer-reads").read_text().strip() == "2"


@pytest.mark.parametrize(
    ("primary_result", "compensation_ok", "queued_count", "expected_code", "expected_enrolls"),
    [
        ("success", True, 0, 0, ["101", "102"]),
        ("failure", True, 0, 1, ["101", "102"]),
        ("failure", False, 0, 1, ["101"]),
        ("source-red", True, 0, 3, ["102"]),
        ("success", True, 15, 0, ["101"]),
        ("source-red", True, 16, 3, []),
    ],
)
def test_exact_target_failure_isolation_recovers_independent_heads(
    tmp_path: Path, primary_result: str, compensation_ok: bool, queued_count: int,
    expected_code: int, expected_enrolls: list[str],
) -> None:
    """Use truthful target-only reads; retain failure after safe fleet recovery."""
    heads = {"101": "b" * 40, "102": "c" * 40, "103": "d" * 40}
    calls = tmp_path / "calls.jsonl"
    real_node = shutil.which("node")
    assert real_node
    states = {
        number: {
            "number": int(number), "headRefOid": head,
            "headRefName": "release/2026-09-19" if number == "102" else "codex/fixture",
            "state": "OPEN", "isDraft": False, "mergeable": "MERGEABLE",
            "mergeStateStatus": "CLEAN", "baseRefName": "main",
            "labels": {"nodes": [{"name": "hold"}] if number == "103" else []},
            "queued": False, "isInMergeQueue": False, "mergeQueueEntry": None,
        }
        for number, head in heads.items()
    }
    for index in range(queued_count):
        number = str(200 + index)
        states[number] = dict(states["101"], number=int(number), queued=True, isInMergeQueue=True,
                              mergeQueueEntry={"id": "MQE_" + number, "state": "QUEUED", "position": index + 1})
    fixture = tmp_path / "fixture.json"
    fixture.write_text(json.dumps({
        "heads": heads, "states": states, "result": primary_result,
        "compensation_ok": compensation_ok,
    }), encoding="utf-8")
    prefix = f'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
fixture = json.loads(Path({str(fixture)!r}).read_text())
args = sys.argv[1:]
with open({str(calls)!r}, "a") as out:
    out.write(json.dumps([Path(sys.argv[0]).name, *args]) + "\\n")
def emit(value):
    print(json.dumps(value))
    sys.exit(0)
'''
    node = tmp_path / "node"
    node.write_text(prefix + f'''
command = args[1]
if command == "preflight": sys.exit(0)
if command == "list-state":
    emit({{args[2]: fixture["states"][args[2]]}} if len(args) > 2 else fixture["states"])
if command == "max-queue-depth": emit(16)
if command == "enroll":
    number = args[2]
    if number == "101" and fixture["result"] == "failure": sys.exit(1)
    state = dict(fixture["states"][number])
    state["mergeQueueEntry"] = {{"id": "MQE_" + number, "enqueuedAt": "2026-08-15T12:00:00Z", "state": "QUEUED", "position": 1}}
    state["isInMergeQueue"] = state["queued"] = True
    emit({{"state": state}})
if command == "dequeue":
    if not fixture["compensation_ok"]: sys.exit(1)
    emit({{"state": {{"queued": False}}}})
if command == "prove-admission": sys.exit(0)
if command == "prove-receipt": emit({{"ok": False, "state": {{"queued": False}}, "explanation": {{"reason": "not-queued"}}}})
if command in ("explain-selector", "--classify-queue", "admission", "changelog-collision"):
    os.execv({real_node!r}, [{real_node!r}, *args])
if command == "changelog-inventory": emit({{"prs": [], "count": 0, "reason": "explicit"}})
if command == "changelog-drain": emit({{"action": "keep", "reason": "omits-changelog"}})
if command in ("changelog-collision", "unmergeable-reenqueue"): emit({{"action": "allow"}})
if command == "unmergeable-eject": emit({{"action": "keep", "reason": "not-queued"}})
raise SystemExit("unexpected node args: " + repr(args))
''', encoding="utf-8")
    node.chmod(0o755)
    gh = tmp_path / "gh"
    gh.write_text(prefix + '''
if args[:2] == ["pr", "checks"]:
    emit([{"name": name, "bucket": "fail" if name == "PR Ready" and args[2] == "101" and fixture["result"] == "source-red" else "pass", "state": "FAILURE" if name == "PR Ready" and args[2] == "101" and fixture["result"] == "source-red" else "SUCCESS"} for name in ["PR Ready", "Migration Guard", "Fork PR Gate", "PR Size Guard"]])
if args[:2] == ["pr", "view"]:
    if "files" in args: emit(["CHANGELOG.md"] if args[2] == "102" else [])
    state = dict(fixture["states"][args[2]])
    state["labels"] = state["labels"]["nodes"]
    emit(state)
if args[0] == "api":
    if "/statuses?per_page=100" in args[1]: emit([[]])
    if "/status" in args[1] and "/commits/" in args[1]: emit({"statuses": []})
    if any("/statuses/" in arg for arg in args): emit({})
    sys.exit(1)
raise SystemExit("unexpected gh args: " + repr(args))
''', encoding="utf-8")
    gh.chmod(0o755)
    result = _run_bash(_drain_command(
        tmp_path, backend="native",
        extra_env=f"DRAIN_ADMISSION_PR=101 DRAIN_ADMISSION_HEAD={heads['101']} DRAIN_RECONCILE_MISSED_ADMISSION=1 DRAIN_QUEUE_REENTRY_MAX_PER_RUN=2",
    ))
    assert result.returncode == expected_code, result.stdout + result.stderr
    events = [json.loads(line) for line in calls.read_text().splitlines()]
    enrolls = [event[3] for event in events if event[0] == "node" and event[2] == "enroll"]
    assert enrolls == expected_enrolls
    inventories = [event[3:] for event in events if event[0] == "node" and event[2] == "list-state"]
    assert inventories[0] == ["101"]
    if compensation_ok:
        assert [] in inventories, "exact-target reads cannot contain missed fleet candidates"
        assert ("+native-queue on #102" in result.stdout) == ("102" in expected_enrolls)
    else:
        assert "=== RECOVER (bounded exact-head native admission) ===" not in result.stdout, "unknown mutation effects must abort recovery"
    status_posts = [arg for event in events if event[0] == "gh" and event[1] == "api" for arg in event[2:] if "/statuses/" in arg]
    assert any(heads["102"] in endpoint for endpoint in status_posts) == ("102" in expected_enrolls)
    if primary_result != "success":
        assert not any(heads["101"] in endpoint for endpoint in status_posts)
