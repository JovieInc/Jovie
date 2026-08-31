"""
Regression tests for scripts/lib/gh-retry.sh.

The merge-queue enroll job calls drain-pr-queue.sh, which must survive
transient GitHub GraphQL 504s instead of failing the workflow.

Run with:
    python -m pytest scripts/tests/test_gh_retry.py -v
"""
from __future__ import annotations

import base64
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
    expected = expected_gh or fake_gh
    authorization = "test-fixture" if backend == "test-label-fixture" else "merge-queue-autoenroll"
    env_prefix = (
        f'PATH="{tmp_path}:$PATH" '
        f'DRAIN_EXPECT_GH="{expected}" '
        f'DRAIN_MUTATION_AUTHORIZATION={authorization} '
        'GH_MUTATION_TOKEN=test-fixture-writer-token '
        f'MERGE_QUEUE_BACKEND={backend} '
    )
    if extra_env:
        env_prefix += f"{extra_env} "
    return f'{env_prefix}bash "{_DRAIN_SCRIPT}"'


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


def _production_unbound_hold_receipt(
    *, closure_status: str = "healthy", intake_allowed: bool = True
) -> dict[str, object]:
    return {
        "schema": "jovie-fleet-gate/v1",
        "state": "AMBER",
        "promotionMode": "hold-intake",
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
            "newIntakeAllowed": intake_allowed,
            "semantics": "preserve-cohort-and-continue-isolated-implementation",
        },
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
              list-state) echo '{{"16068":{{"headRefOid":"{head}","queued":false,"isInMergeQueue":false,"mergeQueueEntry":null}}}}' ;;
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
    labels: list[str] | None = None,
    front_churn: str = "forbid",
    allow_enroll: bool = False,
) -> dict[str, Path]:
    logs = {
        "api": tmp_path / "api-calls",
        "post": tmp_path / "status-posts",
        "front_churn": tmp_path / "front-churn",
        "enroll": tmp_path / "enroll",
        "dequeue": tmp_path / "dequeue",
        "jobs": tmp_path / "jobs-scans",
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
    if queued:
        entry_state = queue_entry_state or "AWAITING_CHECKS"
        list_state = (
            f'{{"{pr}":{{"headRefOid":"{head}","queued":true,'
            f'"isInMergeQueue":true,'
            f'"mergeQueueEntry":{{"state":"{entry_state}","position":1}}}}}}'
        )
    else:
        list_state = (
            f'{{"{pr}":{{"headRefOid":"{head}","queued":false,'
            f'"isInMergeQueue":false,"mergeQueueEntry":null}}}}'
        )
    if allow_enroll:
        enroll_case = (
            f'enroll) printf \'%s\\n\' "${{3:-}}" >>\'{logs["enroll"]}\'; '
            f'echo \'{{"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}",'
            f'"mergeQueueEntry":{{"id":"MQE_{pr}","state":"AWAITING_CHECKS","position":1}}}}}}\' ;;'
        )
    else:
        enroll_case = (
            f'enroll) printf \'%s\\n\' "${{3:-}}" >>\'{logs["enroll"]}\'; '
            'echo "null-creator fixture must not enroll" >&2; exit 91 ;;'
        )
    if front_churn == "allow":
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
              list-state) echo '{list_state}' ;;
              explain-selector) cat >/dev/null; echo '{{"observed":true,"queued":{queued_json},"eligible":true,"reason":"eligible"}}' ;;
              prove-receipt) echo '{{"ok":false,"state":{{"queued":false}},"explanation":{{"reason":"not-queued"}}}}' ;;
              {enroll_case}
              dequeue) printf 'dequeue\\n' >>'{logs["dequeue"]}'; echo '{{"state":{{"queued":false}}}}' ;;
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
              if [[ "$2" == *"/actions/workflows/ci.yml/runs"* ]]; then echo '[]'; exit 0; fi
              if [[ "$2" == *"/commits/{head}/status"* ]]; then cat '{status_file}'; exit 0; fi
              if [[ "$2" == "users/jovie-bot%5Bbot%5D" ]]; then cat '{identity_file}'; exit 0; fi
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


class TestNullCreatorQueueReceiptProvenance:
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
                context="jovie-queue-reentry/v1",
                state="success",
                description="Native queue admission recorded at exact head",
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
        assert "+jovie-queue-reentry/v1" not in result.stdout
        assert f"=jovie-queue-reentry/v1 on #1001 at {head} (already recorded)" in result.stdout

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
                  list-state) echo '{{"16068":{{"headRefOid":"{head}","queued":false,"isInMergeQueue":false,"mergeQueueEntry":null}}}}' ;;
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
                  list-state) echo '{{"16070":{{"headRefOid":"{new_head}","queued":false,"isInMergeQueue":false,"mergeQueueEntry":null}}}}' ;;
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
                  list-state) echo '{{"16069":{{"headRefOid":"{head}","queued":false,"isInMergeQueue":false,"mergeQueueEntry":null}}}}' ;;
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
                  list-state) echo '{{"16071":{{"headRefOid":"{head}","queued":true,"isInMergeQueue":true,"mergeQueueEntry":{{"state":"AWAITING_CHECKS","position":1}}}}}}' ;;
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

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=f"DRAIN_ADMISSION_PR=16068 DRAIN_ADMISSION_HEAD={head}",
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "delayed native receipt at " + head in result.stdout
        assert "state QUEUED, position 1" in result.stdout
        assert "queue-noop" not in result.stderr

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

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=f"DRAIN_ADMISSION_PR=16068 DRAIN_ADMISSION_HEAD={head}",
            )
        )

        assert result.returncode == 3, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert (
            "queue-noop: selector: exact admission #16068 at "
            + head
            + " (mergeable=UNKNOWN)"
            in result.stderr
        )

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
        assert "held-by=queue-deferred" in result.stderr
        assert "delayed native receipt" not in result.stdout


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
                  list-state) echo '{{"101":{{"headRefOid":"{head}","queued":false}}}}' ;;
                  enroll) echo '{{"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_1","state":"AWAITING_CHECKS","position":1}}}}}}' ;;
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

    @pytest.mark.parametrize(
        ("enroll_mode", "dequeue_mode", "expected_returncode", "expected_dequeues"),
        [
            ("failure", "success", 1, "1"),
            ("malformed", "success", 1, "1"),
            ("failure", "failure", 1, "1"),
            ("valid", "success", 0, "0"),
        ],
    )
    def test_native_enrollment_requires_receipt_and_compensates_once(
        self,
        tmp_path: Path,
        enroll_mode: str,
        dequeue_mode: str,
        expected_returncode: int,
        expected_dequeues: str,
    ) -> None:
        head = "a" * 40
        dequeue_calls = tmp_path / "dequeue-calls"
        dequeue_calls.write_text("0", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                command_name="${{2:-}}"
                case "$command_name" in
                  preflight) exit 0 ;;
                  list-state) echo '{{"101":{{"headRefOid":"{head}","queued":false}}}}' ;;
                  enroll)
                    if [[ "${{FAKE_ENROLL_MODE:?}}" == "failure" ]]; then
                      exit 1
                    fi
                    if [[ "${{FAKE_ENROLL_MODE:?}}" == "valid" ]]; then
                      echo '{{"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_1","state":"AWAITING_CHECKS","position":3}}}}}}'
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
                  echo '[{{"n":101,"t":"Receipt regression","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/receipt","headOid":"{head}","base":"main","body":"","L":[],"fail":[]}}]'
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
                if [[ "$1" == "api" ]]; then
                  if [[ " $* " == *"/commits/{head}/status "* ]]; then
                    echo '{{"statuses":[]}}'
                    exit 0
                  fi
                  if [[ " $* " == *"/statuses/{head} "* ]]; then
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
        else:
            assert "native enrollment" in result.stderr
        if dequeue_mode == "failure":
            assert "CRITICAL: could not compensate unproven" in result.stderr

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
                  list-state)
                    echo '{{"1001":{{"headRefOid":"{heads["1001"]}","queued":false}},"1002":{{"headRefOid":"{heads["1002"]}","queued":false}},"1003":{{"headRefOid":"{heads["1003"]}","queued":false}}}}'
                    ;;
                  enroll)
                    echo "${{3:?}}" >>"{enrolled}"
                    head_var="${{4:?}}"
                    echo "{{\\"state\\":{{\\"state\\":\\"OPEN\\",\\"isDraft\\":false,\\"headRefOid\\":\\"$head_var\\",\\"mergeQueueEntry\\":{{\\"id\\":\\"MQE_${{3}}\\",\\"state\\":\\"AWAITING_CHECKS\\",\\"position\\":1}}}}}}"
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
                    echo "{{\\"statuses\\":[{{\\"context\\":\\"jovie-queue-reentry/v1\\",\\"state\\":\\"success\\",\\"description\\":\\"Native queue admission recorded at exact head\\",\\"creator\\":{{\\"type\\":\\"Bot\\"}},\\"target_url\\":\\"https://github.com/JovieInc/Jovie/actions/runs/77\\",\\"updated_at\\":\\"2026-08-15T12:00:00Z\\"}}]}}"
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

    def test_enqueued_continuation_recovers_next_eligible_head_without_duplicate_mutations(
        self, tmp_path: Path
    ) -> None:
        """Each native enqueued event advances one bounded missed-admission cohort."""
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
                  printf '{{"1001":{{"headRefOid":"{heads["1001"]}","queued":%s,"isInMergeQueue":%s,"mergeQueueEntry":%s}},"1002":{{"headRefOid":"{heads["1002"]}","queued":%s,"isInMergeQueue":%s,"mergeQueueEntry":%s}},"1003":{{"headRefOid":"{heads["1003"]}","queued":%s,"isInMergeQueue":%s,"mergeQueueEntry":%s}},"1004":{{"headRefOid":"{heads["1004"]}","queued":%s,"isInMergeQueue":%s,"mergeQueueEntry":%s}},"1005":{{"headRefOid":"{heads["1005"]}","queued":%s,"isInMergeQueue":%s,"mergeQueueEntry":%s}}}}\\n' \
                    "$(queued_json 1001)" "$(queued_json 1001)" "$(queue_entry_json 1001)" \
                    "$(queued_json 1002)" "$(queued_json 1002)" "$(queue_entry_json 1002)" \
                    "$(queued_json 1003)" "$(queued_json 1003)" "$(queue_entry_json 1003)" \
                    "$(queued_json 1004)" "$(queued_json 1004)" "$(queue_entry_json 1004)" \
                    "$(queued_json 1005)" "$(queued_json 1005)" "$(queue_entry_json 1005)"
                }}
                case "${{2:-}}" in
                  preflight) exit 0 ;;
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
                    echo "{{\\"state\\":{{\\"state\\":\\"OPEN\\",\\"isDraft\\":false,\\"headRefOid\\":\\"$head_var\\",\\"mergeQueueEntry\\":{{\\"id\\":\\"MQE_$number\\",\\"state\\":\\"AWAITING_CHECKS\\",\\"position\\":1}}}}}}"
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
                  case "$3" in
                    1001) head="{heads["1001"]}"; labels='[{{"name":"merge-queue"}}]' ;;
                    1002) head="{heads["1002"]}"; labels='[{{"name":"merge-queue"}}]' ;;
                    1003) head="{heads["1003"]}"; labels='[{{"name":"merge-queue"}},{{"name":"needs-conflict-resolution"}}]' ;;
                    1004) head="{heads["1004"]}"; labels='[{{"name":"merge-queue"}}]' ;;
                    1005) head="{heads["1005"]}"; labels='[{{"name":"merge-queue"}}]' ;;
                    *) echo "unexpected PR view: $*" >&2; exit 2 ;;
                  esac
                  echo "{{\\"state\\":\\"OPEN\\",\\"isDraft\\":false,\\"mergeable\\":\\"MERGEABLE\\",\\"labels\\":$labels,\\"headRefOid\\":\\"$head\\",\\"baseRefName\\":\\"main\\",\\"body\\":\\"\\"}}"
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

        first = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=1001 DRAIN_ADMISSION_HEAD={heads['1001']} "
                    "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=2 "
                    "GITHUB_RUN_ID=78 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert first.returncode == 0, f"stdout={first.stdout}\\nstderr={first.stderr}"
        assert "bounded exact-head native admission" in first.stdout
        assert "exact missed admission at " + heads["1002"] in first.stdout
        assert "reached total exact admission cap (2)" in first.stdout
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
                  list-state) echo '{{"1001":{{"headRefOid":"{snapshot_head}","queued":false}}}}' ;;
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

    def test_missed_admission_recovery_rejects_an_unbounded_cap_before_gh(
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
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=3"
                ),
            )
        )

        assert result.returncode == 2
        assert "must be an integer from 1 through 2" in result.stderr
        assert not called.exists(), "drain invoked gh before bounded-cap preflight"

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

    @pytest.mark.parametrize("closure_status", ["healthy", "grace"])
    def test_hold_intake_accepts_canonical_closure_statuses(
        self, tmp_path: Path, closure_status: str
    ) -> None:
        queued_head = "8" * 40
        intake_allowed = closure_status == "healthy"
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
            ("grace", True),
            ("red", True),
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
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"enroll","bucket":"fail","state":"FAILURE","workflow":"Merge Queue Auto-Enroll"}}]'
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

    def test_hold_intake_missed_admission_never_recovers_no_auto_tombstone(
        self, tmp_path: Path
    ) -> None:
        """Run 32542714770 re-admitted PR #16263 after a live no-auto tombstone
        because the missed-admission selector omitted the no-auto family.
        """
        tombstone_head = "528ab46cd724ca78cb72ee5168dd3b2851045b6d"
        clean_head = "564bcf770f353f0c8a9e6c1d2b3a4e5f67890123"
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "hold-intake",
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
        assert "exact missed admission at " + tombstone_head not in result.stdout
        assert "would +merge-queue on #16263" not in result.stdout
        assert "would -queue-deferred on #16263" not in result.stdout
        assert "exact missed admission at " + clean_head in result.stdout
        assert "would -queue-deferred on #16187" in result.stdout
        assert "[dry-run] would +merge-queue on #16187" in result.stdout
        assert "{no-auto}" in result.stdout

    def test_label_event_does_not_enroll_a_no_auto_tombstone(
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
        assert "would +merge-queue on #16263" not in result.stdout
        assert "{no-auto}" in result.stdout

    def test_queued_no_auto_tombstone_is_dequeued_once(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{"n":16263,"t":"Queued no-auto","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/jov-16263","headOid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","base":"main","L":["no-auto","merge-queue"],"fail":[]}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo "pr checks should not run for a no-auto tombstone" >&2
                  exit 2
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
        assert "=== DEQUEUE (hard gates" in result.stdout
        assert "[dry-run] would -merge-queue on #16263" in result.stdout
        assert "would +merge-queue on #16263" not in result.stdout
        assert "{no-auto,merge-queue}" in result.stdout

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
        assert (
            'NO_AUTO_HOLD_JQ=\'. == "no-auto" or . == "no-auto-merge" or . == "no-automerge"\''
            in content
        )
        assert content.count("$NO_AUTO_HOLD_JQ") >= 20
        missed = content.split("bounded exact-head native admission", 1)[1].split(
            "A completed Production Controller", 1
        )[0]
        assert "$NO_AUTO_HOLD_JQ" in missed
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
                  [[ "$3" == "101" || "$3" == "104" ]]
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
        assert "[dry-run] would -merge-queue on #789" in result.stdout
        assert "[dry-run] would -merge-queue on #102" in result.stdout
        assert "[dry-run] would -merge-queue on #103" in result.stdout
        assert "[dry-run] would +merge-queue on #101" in result.stdout
        assert "[dry-run] would +merge-queue on #456" not in result.stdout
        assert "[dry-run] would +merge-queue on #789" not in result.stdout
        assert "[dry-run] would +merge-queue on #102" not in result.stdout
        assert "[dry-run] would +merge-queue on #103" not in result.stdout
        assert "[dry-run] would +merge-queue on #104" not in result.stdout
        assert "=== SURFACE (human decision; not touched) ===" in result.stdout
        assert "#456" in result.stdout
        assert "#789" in result.stdout

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
# Queue-deferred release (JOV-5054): mechanical `jovie-queue-deferral/v1`
# provenance plus untyped ready holds may be lifted under a fresh GREEN
# fleet receipt. Human-policy holds (taste, net-new, outbound) stay held.
# The scanner covers every queue-deferred PR, not only agent branches.
# ---------------------------------------------------------------------------

_RELEASE_SCRIPT = _REPO_ROOT / "scripts" / "release-queue-deferred.sh"
_RELEASE_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "queue-deferred-release.yml"
_FLEET_GATE_REFRESH_WORKFLOW = (
    _REPO_ROOT / ".github" / "workflows" / "fleet-gate-refresh.yml"
)


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
    deferred_minutes: int = 120,
    pr: int = 900,
    author: str = "itstimwhite",
    reason: str = "symphony-birth-hold",
    source: str = "symphony",
) -> None:
    deferred = datetime.now(timezone.utc) - timedelta(minutes=deferred_minutes)
    receipt = {
        "schema": "jovie-queue-deferral/v1",
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
    def test_workflow_is_event_driven_with_no_cron(self) -> None:
        workflow = _RELEASE_WORKFLOW.read_text(encoding="utf-8")
        fleet_gate_refresh = _FLEET_GATE_REFRESH_WORKFLOW.read_text(encoding="utf-8")
        assert "schedule:" not in workflow
        assert "workflow_run:" in workflow
        # CI and Production Controller are direct upstream semantic inputs.
        # Marker Recovery dispatches a fresh Fleet Gate event after durable
        # bytes so downstream release remains inside the workflow_run cap.
        assert (
            "workflows: [CI, Production Controller]"
            in fleet_gate_refresh
        )
        assert "Production Marker Recovery]" not in fleet_gate_refresh
        assert "Queue-Deferred Release]" not in fleet_gate_refresh
        assert "workflows: ['Fleet Gate Refresh']" in workflow
        assert "workflows: ['CI', 'Production Controller', 'Fleet Gate Refresh']" not in workflow
        assert "pull_request:" in fleet_gate_refresh
        assert "branches: [main]" in fleet_gate_refresh
        assert "github.event.workflow_run.conclusion != 'cancelled'" in fleet_gate_refresh
        assert "github.event.pull_request.merged != true" in fleet_gate_refresh
        # The trigger allowlist owns workflow identity. Job admission must not
        # compare `workflow_run.name`: custom `run-name` values include dynamic
        # SHAs and caused successful Production Controller wakes to skip.
        assert "github.event.workflow_run.name" not in workflow
        assert "github.event.workflow_run.event == 'pull_request'" in workflow
        assert "github.event.workflow_run.event != 'pull_request'" in workflow
        assert "github.event.workflow_run.conclusion == 'success'" in workflow
        assert "github.event.workflow_run.conclusion != 'cancelled'" in workflow
        assert "pull-requests: write" in workflow
        assert "READY_GH_TOKEN" not in workflow
        assert "bash scripts/release-queue-deferred.sh" in workflow
        assert "ATTEMPT_COOLDOWN_MINUTES: 5" in workflow
        assert 'RELEASE_RETRY_FILE="$retry_file"' in workflow
        assert 'sleep "$retry_seconds"' in workflow
        assert "for pass in 1 2" in workflow
        # Mutations must fire real PR events that wake the autoenroll
        # controller; a GITHUB_TOKEN mutation would not cascade.
        assert "steps.app-token.outputs.token" in workflow

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

    def test_untyped_hold_with_taste_stays_held(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            labels=["queue-deferred", "needs:taste"],
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "human-policy-hold:needs:taste" in result.stdout
        assert "would remove" not in result.stdout

    def test_untyped_hold_with_net_new_stays_held(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            labels=["queue-deferred", "net-new"],
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "human-policy-hold:net-new" in result.stdout
        assert "would remove" not in result.stdout

    def test_untyped_hold_with_outbound_stays_held(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            labels=["queue-deferred", "outbound"],
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "human-policy-hold:outbound" in result.stdout
        assert "would remove" not in result.stdout

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
