"""Data-only origin transport. Trusted Actions artifacts feed the existing host tick."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import io
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import zipfile

# Shared receipt data lives with the host ledger; this transport has no lane authority.
sys.path.insert(0, str(Path(__file__).resolve().parent / "lanes"))
import shipping_attribution as attribution

ARTIFACT = "shipping-origin-v1"
REPOSITORIES = {project["repository"] for project in attribution.PROJECTS}
FIELDS = frozenset({"repository", "pr", "headSha", "method", "initiator", "provider", "model",
                    "executionHost", "runId", "linearIssue"})
HANDOFF_METHODS = attribution.METHODS - {"dependabot", "other-automation", "symphony", "unknown"}
# Producer identity comes from GitHub's run record, never from payload/PR prose.
WORKFLOWS = {
    "dependabot-auto-merge.yml": {"pull_request_target"},
    "dependabot-pin-sync.yml": {"workflow_run"},
    "desktop-release.yml": {"push", "workflow_dispatch", "workflow_run"},
    "nightly-testing-agent.yml": {"push", "schedule", "workflow_dispatch"},
    "production-controller.yml": {"workflow_dispatch", "workflow_run"},
    "screenshots.yml": {"push", "schedule", "workflow_dispatch", "workflow_run"},
    "sentry-autofix.yml": {"repository_dispatch"},
    "shipping-origin.yml": {"workflow_dispatch"},
    "shipping-slo.yml": {"schedule", "workflow_dispatch"},
    "test-coverage-audit.yml": {"push", "schedule", "workflow_dispatch"},
}


def decode_payload(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate-payload-key")
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=unique)


def validate_payload(payload):
    if not isinstance(payload, dict) or payload.keys() - FIELDS:
        raise ValueError("malformed-remote-payload")
    if (not isinstance(payload.get("repository"), str) or payload["repository"] not in REPOSITORIES
            or type(payload.get("pr")) is not int
            or payload["pr"] < 1 or not attribution.SHA.fullmatch(str(payload.get("headSha", "")))
            or not isinstance(payload.get("method"), str)
            or payload["method"] not in attribution.METHODS - {"symphony", "unknown"}):
        raise ValueError("malformed-remote-payload")
    for key in FIELDS - {"pr"}:
        value = payload.get(key)
        if value is None and key not in {"repository", "headSha", "method", "initiator"}:
            continue
        if (not isinstance(value, str) or not value.strip() or len(value) > 200
                or any(ord(char) < 32 for char in value)):
            raise ValueError("malformed-remote-payload")
    issue = payload.get("linearIssue")
    if issue is not None and not re.fullmatch(r"[A-Z][A-Z0-9]*-[1-9][0-9]*", issue):
        raise ValueError("malformed-remote-payload")


def receipt(payload, evidence_url):
    validate_payload(payload)
    return {**payload, "schema": attribution.ORIGIN_RECEIPT_SCHEMA, "role": "origin",
            "receiptId": f"origin:{payload['repository']}:{payload['pr']}:{payload['headSha']}",
            "recordedAt": attribution._iso(datetime.now(timezone.utc).timestamp()),
            "evidenceUrl": evidence_url}


def emit(payload, directory, resolve=attribution.resolve_origin_head):
    validate_payload(payload)
    repository, _ = resolve(payload["repository"], payload["pr"], payload["headSha"])
    payload = {**payload, "repository": repository}
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{repository.replace('/', '-')}-{payload['pr']}-{payload['headSha']}.json"
    # Immutable within this publication job, including retries.
    with path.open("x") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    return path


def trusted_payload(payload, run, repository):
    validate_payload(payload)
    workflow = str(run.get("path", "")).removeprefix(".github/workflows/")
    if (run.get("repository", {}).get("full_name") != repository
            or (run.get("head_branch") != "main" and run.get("event") != "pull_request_target")
            or run.get("event") not in WORKFLOWS.get(workflow, set())):
        raise ValueError("untrusted-origin-run")
    if workflow == "shipping-origin.yml":
        if (repository != "JovieInc/Jovie" or run.get("actor", {}).get("login") != "itstimwhite"
                or payload["method"] not in HANDOFF_METHODS or not payload.get("linearIssue")):
            raise ValueError("untrusted-origin-handoff")
    else:
        method = "dependabot" if workflow.startswith("dependabot-") else "other-automation"
        initiator = "dependabot" if method == "dependabot" else f"workflow:{workflow}"
        if (payload["repository"] != repository or payload["method"] != method
                or payload["initiator"] != initiator or payload.get("executionHost") != "github-actions"
                or payload.get("runId") != str(run["id"])):
            raise ValueError("origin-producer-mismatch")
    return workflow


def read_archive(data):
    if len(data) > 65536:
        raise ValueError("oversized-origin-artifact")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if not 1 <= len(entries) <= 10 or sum(item.file_size for item in entries) > 32768:
            raise ValueError("malformed-origin-artifact")
        # Read bytes only. Never extract a path, import code or execute artifact content.
        return [decode_payload(archive.read(item)) for item in entries]


def ingest(payload, run, repository, ledger, resolve=attribution.resolve_origin_head):
    trusted_payload(payload, run, repository)
    canonical, _ = resolve(payload["repository"], payload["pr"], payload["headSha"])
    evidence_url = f"https://github.com/{repository}/actions/runs/{run['id']}"
    row = receipt({**payload, "repository": canonical}, evidence_url)
    attribution.append_origin_receipt(ledger, row)
    return row["receiptId"]


def collect(state, **options):
    state = Path(state)
    state.mkdir(parents=True, exist_ok=True)
    with (state / "shipping-origin-ingest.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"accepted": [], "rejected": [], "errors": ["origin-ingest-busy"]}
        return _collect(state, **options)


def _collect(state, *, api=None, resolve=None, now=time.monotonic):
    """Bounded reads on the existing tick; failures are observable and retry next tick."""
    state = Path(state)
    deadline = now() + 45
    def github(endpoint, binary=False):
        remaining = deadline - now()
        if remaining <= 0:
            raise TimeoutError("origin-ingest-deadline")
        response = subprocess.run(["gh", "api", endpoint], capture_output=True, check=True,
                                  timeout=min(15, remaining))
        return response.stdout if binary else json.loads(response.stdout)
    api = api or github
    # Emit already waited for post-push convergence. This tick has a 45s budget,
    # so a receipt whose head has since moved is rejected on the first read.
    resolve = resolve or (lambda repo, pr, head: attribution.resolve_origin_head(
        repo, pr, head, fetch=api, attempts=1))
    result = {"accepted": [], "rejected": [], "errors": []}
    checkpoint = state / "shipping-origin-ingest.json"
    seen = json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
    for repository in sorted(REPOSITORIES):
        try:
            # Fixed artifact name filters out unrelated CI artifacts at the server.
            artifacts = []
            for page in range(1, 11):
                listing = api(f"repos/{repository}/actions/artifacts?name={ARTIFACT}&per_page=100&page={page}")
                artifacts.extend(listing["artifacts"])
                if len(artifacts) >= listing["total_count"]:
                    break
            else:
                result["errors"].append(f"{repository}:origin-artifact-page-truncated")
            for artifact in reversed(artifacts):
                key = f"{repository}:{artifact['id']}"
                if key in seen or artifact.get("expired"):
                    continue
                if artifact["size_in_bytes"] > 65536:
                    result["rejected"].append({"artifact": key, "reason": "oversized-origin-artifact"})
                    seen[key] = artifact["created_at"]
                    continue
                run = api(f"repos/{repository}/actions/runs/{artifact['workflow_run']['id']}")
                # An artifact is immutable once uploaded; a later unrelated job failure is irrelevant.
                data = api(f"repos/{repository}/actions/artifacts/{artifact['id']}/zip", True)
                try:
                    for payload in read_archive(data):
                        try:
                            result["accepted"].append(ingest(payload, run, repository,
                                                             state / "runs/ledger.jsonl", resolve))
                        except ValueError as error:
                            if str(error) != "duplicate-origin-receipt":
                                result["rejected"].append({"artifact": key, "reason": str(error)})
                    seen[key] = artifact["created_at"]
                except (ValueError, KeyError, TypeError, zipfile.BadZipFile) as error:
                    result["rejected"].append({"artifact": key, "reason": str(error)[:100]})
                    seen[key] = artifact["created_at"]
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
            result["errors"].append(f"{repository}:{type(error).__name__}:{error}"[:200])
    state.mkdir(parents=True, exist_ok=True)
    temporary = checkpoint.with_suffix(".tmp")
    temporary.write_text(json.dumps(seen))
    temporary.replace(checkpoint)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("emit", "emit-automation", "submit"):
        command = sub.add_parser(name)
        command.add_argument("--payload-file", type=Path)
        command.add_argument("--repository")
        command.add_argument("--pr")
        command.add_argument("--head-sha")
        command.add_argument("--method")
        command.add_argument("--initiator")
        command.add_argument("--provider")
        command.add_argument("--model")
        command.add_argument("--execution-host")
        command.add_argument("--run-id")
        command.add_argument("--linear-issue")
        command.add_argument("--output-directory", type=Path)
    args = parser.parse_args(argv)
    pr = args.pr
    repository = args.repository or os.environ.get("GITHUB_REPOSITORY")
    if pr and pr.startswith(f"https://github.com/{repository}/pull/"):
        pr = pr.rsplit("/", 1)[-1]
    payload = (decode_payload(args.payload_file.read_text()) if args.payload_file else {
        "repository": repository, "pr": int(pr) if pr else None, "headSha": args.head_sha,
        "method": args.method, "initiator": args.initiator, "provider": args.provider,
        "model": args.model, "executionHost": args.execution_host, "runId": args.run_id,
        "linearIssue": args.linear_issue})
    if args.command == "emit-automation":
        workflow = os.environ["GITHUB_WORKFLOW_REF"].split("@", 1)[0].rsplit("/", 1)[-1]
        if workflow not in WORKFLOWS or workflow == "shipping-origin.yml":
            raise ValueError("untrusted-origin-workflow")
        method = "dependabot" if workflow.startswith("dependabot-") else "other-automation"
        payload.update(method=method, initiator="dependabot" if method == "dependabot" else f"workflow:{workflow}",
                       executionHost="github-actions", runId=os.environ["GITHUB_RUN_ID"])
    validate_payload(payload)
    if args.command == "submit":
        if payload["method"] not in HANDOFF_METHODS or not payload.get("linearIssue"):
            raise ValueError("origin-handoff-requires-method-and-linear-issue")
        attribution.resolve_origin_head(payload["repository"], payload["pr"], payload["headSha"])
        subprocess.run(["gh", "workflow", "run", "shipping-origin.yml", "--repo", "JovieInc/Jovie",
                        "--ref", "main", "--field", "payload=" + json.dumps(payload)], check=True,
                       timeout=20)
    else:
        directory = args.output_directory or Path(os.environ["RUNNER_TEMP"]) / "shipping-origin"
        print(emit(payload, directory))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
