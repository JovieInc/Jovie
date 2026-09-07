#!/usr/bin/env python3
"""Accept merged provider work into capacity evidence without depending on admission.

Fallback lease receipts are candidates only. A row becomes useful completion
evidence after the exact PR head is merged and every current required status
context is successful. The same accepted row feeds the existing proof-v2
projector and provider-local adaptive capacity state.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from datetime import datetime, timedelta, timezone
from typing import Any

import gem_gate_contract as contract
import provider_capacity
import symphony_capacity_evidence as projector
import symphony_proof_context as trust

ISSUE = re.compile(r"(?:JOV|LYB)-[1-9][0-9]*")
REPOSITORY = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")
GITHUB_ACTIONS_APP = (15368, "github-actions")
TRUSTED_STATUS_CREATORS = {("Bot", "jovie-bot"), ("Bot", "jovie-bot[bot]")}


def _canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def _digest(value: object) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_private(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(f".{path.name}.tmp.{os.getpid()}")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(_canonical(value) + b"\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def _restore_private_bytes(path: Path, prior: bytes | None) -> None:
    """Restore an exact pre-transaction file image while its writer lock is held."""
    if prior is None:
        path.unlink(missing_ok=True)
        return
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(f".{path.name}.rollback.{os.getpid()}")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(prior)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def validate_lease(value: object, path: Path) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("schema") != "symphony-fallback-lease/v1":
        raise ValueError("completion lease malformed")
    required = ("identifier", "issueRevision", "bundleRevision", "unit", "provider", "model",
                "repository", "executorPath", "executorSha256", "executorProfile", "profile",
                "authStatePath", "authStateSha256", "authPoolIdentity", "leaseIdentity")
    if any(not isinstance(value.get(key), str) or not value[key] for key in required):
        raise ValueError("completion lease incomplete")
    if (not ISSUE.fullmatch(value["identifier"])
        or not REPOSITORY.fullmatch(value["repository"])
        or value["repository"] != ("JovieInc/Jovie" if value["identifier"].startswith("JOV-") else "JovieInc/LogYourBody")
        or not contract.V2_PROVIDER_ID.fullmatch(value["provider"])
        or not contract.V2_MODEL_ID.fullmatch(value["model"])
        or not contract.V2_SHA256.fullmatch(value["bundleRevision"])
        or not contract.V2_SHA256.fullmatch(value["executorSha256"])
        or not contract.V2_SHA256.fullmatch(value["executorProfile"])
        or not contract.V2_SHA256.fullmatch(value["authStateSha256"])
        or not contract.V2_SHA256.fullmatch(value["authPoolIdentity"])
        or not contract.V2_SHA256.fullmatch(value["profile"])
        or not contract.V2_SHA256.fullmatch(value["leaseIdentity"])):
        raise ValueError("completion lease binding invalid")
    executable = Path(value["executorPath"])
    auth_state = Path(value["authStatePath"])
    if (executable.is_symlink() or not executable.is_file() or not os.access(executable, os.X_OK)
        or trust.digest(executable) != value["executorSha256"]
        or trust.executor_identity(value["provider"], value["model"], executable) != value["executorProfile"]
        or auth_state.is_symlink() or not auth_state.is_file()
        or trust.digest(auth_state) != value["authStateSha256"]
        or trust.provider_pool_identity(value["provider"], value["model"], executable, auth_state) != value["profile"]
        or value["authPoolIdentity"] != value["profile"]
        or executable.name == "hermes"):
        raise ValueError("completion identity changed or forbidden")
    return {**value, "receiptSha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def validate_result(value: object, path: Path, receipt_dir: Path) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("schema") != "symphony-fallback-result/v1":
        raise ValueError("completion result malformed")
    strings = ("identifier", "issueRevision", "repository", "provider", "model", "modelId",
               "executorPath", "executorSha256", "executorProfile", "profile", "selectedModel",
               "selectedProfile", "authStatePath", "authStateSha256", "authPoolIdentity", "leaseIdentity",
               "leaseReceiptSha256", "executionBaseHead", "executionFinalHead", "headSha",
               "observedAt", "resultId")
    if any(not isinstance(value.get(key), str) or not value[key] for key in strings):
        raise ValueError("completion result incomplete")
    if (type(value.get("prNumber")) is not int or value["prNumber"] < 1
        or value.get("executorRc") != 0
        or not contract.V2_SOURCE_REVISION.fullmatch(value["headSha"])
        or not contract.V2_SOURCE_REVISION.fullmatch(value["executionBaseHead"])
        or value["executionFinalHead"] != value["headSha"]
        or value["executionBaseHead"] == value["headSha"]
        or not contract.V2_SHA256.fullmatch(value["leaseReceiptSha256"])
        or not contract.V2_SHA256.fullmatch(value["resultId"])
        or contract.v2_parse_time(value["observedAt"]) is None):
        raise ValueError("completion result binding invalid")
    payload = {key: item for key, item in value.items() if key != "resultId"}
    if _digest(payload) != value["resultId"]:
        raise ValueError("completion result digest invalid")
    lease_path = receipt_dir / f"{value['identifier']}.json"
    lease = validate_lease(trust.private_json(lease_path), lease_path)
    matching = ("identifier", "issueRevision", "repository", "provider", "modelId",
                "executorPath", "executorSha256", "authStatePath", "authStateSha256", "leaseIdentity")
    executable = Path(value["executorPath"])
    auth_state = Path(value["authStatePath"])
    if (any(value[key] != lease[key] for key in matching)
        or value["selectedModel"] != lease["model"] or value["selectedProfile"] != lease["profile"]
        or value["leaseReceiptSha256"] != lease["receiptSha256"]
        or value["executorProfile"] != trust.executor_identity(value["provider"], value["model"], executable)
        or value["profile"] != trust.provider_pool_identity(value["provider"], value["model"], executable, auth_state)
        or value["authPoolIdentity"] != value["profile"]):
        raise ValueError("completion result does not match held lease")
    return {**lease, "model": value["model"], "profile": value["profile"],
            "executorProfile": value["executorProfile"], "authPoolIdentity": value["authPoolIdentity"],
            "result": value}


def _required_contexts(rules: object) -> dict[str, int | None]:
    if not isinstance(rules, list):
        raise ValueError("repository rules unavailable")
    contexts: dict[str, int | None] = {}
    for rule in rules:
        if not isinstance(rule, dict) or rule.get("type") != "required_status_checks":
            continue
        checks = (rule.get("parameters") or {}).get("required_status_checks")
        if not isinstance(checks, list):
            raise ValueError("required status rules malformed")
        for check in checks:
            context_name = check.get("context") if isinstance(check, dict) else None
            if not isinstance(context_name, str) or not context_name:
                raise ValueError("required status context malformed")
            integration = check.get("integration_id")
            if integration is not None and (type(integration) is not int or integration < 1):
                raise ValueError("required status integration malformed")
            if context_name in contexts and contexts[context_name] != integration:
                raise ValueError("required status context integration conflicts")
            contexts[context_name] = integration
    if not contexts:
        raise ValueError("required status contexts missing")
    return contexts


def validate_github_outcome(pr: object, rules: object, *, expected_issue: str,
                            expected_head: str, expected_pr: int,
                            now: datetime | None = None) -> dict[str, Any]:
    if not isinstance(pr, dict) or pr.get("state") != "MERGED":
        raise ValueError("pull request is not merged")
    head = pr.get("headRefOid")
    number = pr.get("number")
    merged_at = contract.v2_parse_time(pr.get("mergedAt"))
    title_body = f"{pr.get('title', '')}\n{pr.get('body', '')}"
    now = now or datetime.now(timezone.utc)
    issue_match = re.search(rf"(?<![A-Z0-9-]){re.escape(expected_issue)}(?![A-Z0-9-])", title_body)
    if (number != expected_pr or head != expected_head or not isinstance(head, str)
        or not contract.V2_SOURCE_REVISION.fullmatch(head) or merged_at is None
        or not timedelta(0) <= now - merged_at <= contract.V2_CAPACITY_MAX_AGE
        or issue_match is None):
        raise ValueError("pull request source binding invalid")
    required = _required_contexts(rules)
    results: dict[str, list[dict[str, Any]]] = {}
    for row in pr.get("statusCheckRollup") or []:
        if not isinstance(row, dict):
            continue
        if row.get("__typename") == "CheckRun":
            name, conclusion = row.get("name"), row.get("conclusion")
            app = row.get("app")
            integration = app.get("databaseId") if isinstance(app, dict) else None
            app_slug = app.get("slug") if isinstance(app, dict) else None
            workflow = row.get("workflowName")
            if not isinstance(conclusion, str) or row.get("status", "COMPLETED") != "COMPLETED":
                conclusion = "NONTERMINAL"
            issuer = ("app", integration, app_slug)
        elif row.get("__typename") == "StatusContext":
            name, conclusion = row.get("context"), row.get("state")
            workflow = None
            creator = row.get("creator")
            issuer = ("status", creator.get("__typename"), creator.get("login")) \
                if isinstance(creator, dict) else ("status", None, None)
        else:
            continue
        if isinstance(name, str) and isinstance(conclusion, str):
            results.setdefault(name, []).append({
                "conclusion": conclusion.upper(), "workflow": workflow, "issuer": issuer,
            })
    accepted: dict[str, str] = {}
    ci_bound = False
    for name, integration in sorted(required.items()):
        named = results.get(name, [])
        if integration is not None:
            trusted = lambda row: (row["issuer"][0] == "app"
                                   and row["issuer"][1] == integration
                                   and isinstance(row["issuer"][2], str)
                                   and bool(row["issuer"][2]))
        else:
            trusted = lambda row: ((row["issuer"][0] == "app"
                                    and row["issuer"][1:] == GITHUB_ACTIONS_APP)
                                   or (row["issuer"][0] == "status"
                                       and row["issuer"][1:] in TRUSTED_STATUS_CREATORS))
        if (not named or any(not trusted(row) for row in named)
            or any(row["conclusion"] != "SUCCESS" for row in named)):
            raise ValueError("required exact-head CI outcome is not successful")
        ci_bound = ci_bound or any(row["workflow"] == "CI" for row in named)
        for row in named:
            kind, first, second = row["issuer"]
            identity = (f"{name}@app:{first}:{second}" if kind == "app"
                        else f"{name}@status:{first}:{second}")
            accepted[identity] = "SUCCESS"
    if not ci_bound:
        raise ValueError("required exact-head CI outcome is not successful")
    return {
        "conclusion": "SUCCESS",
        "requiredChecks": accepted,
        "requiredChecksSha256": _digest(accepted),
        "mergedAt": merged_at.isoformat().replace("+00:00", "Z"),
        "headSha": head,
        "pr": number,
    }


def github_outcome(repository: str, pr_number: int, *, runner=subprocess.run) -> tuple[dict[str, Any], dict[str, Any]]:
    owner, name = repository.split("/", 1)
    graph = """query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){number state merged headRefOid mergedAt title body commits(last:1){nodes{commit{oid statusCheckRollup{contexts(first:100,after:$cursor){nodes{__typename ... on CheckRun{name status conclusion checkSuite{app{databaseId slug} workflowRun{workflow{name}}}} ... on StatusContext{context state creator{__typename login}}} pageInfo{hasNextPage endCursor}}}}}}}}}"""
    cursor = None
    pr: dict[str, Any] | None = None
    checks: list[dict[str, Any]] = []
    while True:
        query = ["gh", "api", "graphql", "-f", f"query={graph}", "-f", f"owner={owner}",
                 "-f", f"name={name}", "-F", f"number={pr_number}"]
        if cursor is not None:
            query.extend(("-f", f"cursor={cursor}"))
        result = runner(query, capture_output=True, text=True, timeout=30, check=False)
        if result.returncode != 0:
            raise ValueError("pull request inventory unavailable")
        payload = json.loads(result.stdout)
        if not isinstance(payload, dict) or payload.get("errors"):
            raise ValueError("pull request inventory unavailable")
        page_pr = (((payload.get("data") or {}).get("repository") or {}).get("pullRequest")
                   if isinstance(payload, dict) else None)
        commits = ((page_pr.get("commits") or {}).get("nodes")
                   if isinstance(page_pr, dict) else None)
        if not isinstance(page_pr, dict) or not isinstance(commits, list) or len(commits) != 1:
            raise ValueError("pull request exact-head checks unavailable")
        commit = commits[0].get("commit") if isinstance(commits[0], dict) else None
        rollup = commit.get("statusCheckRollup") if isinstance(commit, dict) else None
        contexts = rollup.get("contexts") if isinstance(rollup, dict) else None
        nodes = contexts.get("nodes") if isinstance(contexts, dict) else None
        page_info = contexts.get("pageInfo") if isinstance(contexts, dict) else None
        if (not isinstance(nodes, list) or not isinstance(page_info, dict)
            or commit.get("oid") != page_pr.get("headRefOid")):
            raise ValueError("pull request exact-head checks unavailable")
        for row in nodes:
            if not isinstance(row, dict):
                continue
            suite = row.get("checkSuite")
            workflow_run = suite.get("workflowRun") if isinstance(suite, dict) else None
            workflow = workflow_run.get("workflow") if isinstance(workflow_run, dict) else None
            checks.append({**row, "app": suite.get("app") if isinstance(suite, dict) else None,
                           "workflowName": workflow.get("name") if isinstance(workflow, dict) else None})
        pr = page_pr
        if page_info.get("hasNextPage") is not True:
            break
        cursor = page_info.get("endCursor")
        if not isinstance(cursor, str) or not cursor:
            raise ValueError("pull request exact-head checks unavailable")
    assert pr is not None
    pr = {**pr, "state": "MERGED" if pr.get("merged") is True else pr.get("state"),
          "statusCheckRollup": checks}
    rules_result = runner(["gh", "api", f"repos/{repository}/rules/branches/main"], capture_output=True,
                          text=True, timeout=30, check=False)
    if rules_result.returncode != 0:
        raise ValueError("repository rules unavailable")
    return pr, json.loads(rules_result.stdout)


def refresh_context(context_path: Path, receipts: list[tuple[Path, dict[str, Any]]], *,
                    source_root: Path, binary: Path, workflow: Path, attestation_dir: Path,
                    service_attestation: Path, now: datetime) -> dict[str, Any]:
    service = _read_json(service_attestation)
    revision = subprocess.run(["/usr/bin/git", "-C", str(source_root), "rev-parse", "HEAD"],
                              capture_output=True, text=True, timeout=5, check=True).stdout.strip()
    if (not isinstance(service, dict) or service.get("schema") != "gem-service-attestation/v1"
        or service.get("active") is not True or service.get("healthy") is not True
        or service.get("sourceRevision") != revision
        or any((service.get(name) or {}).get("matches") is not True
               for name in ("workflow", "unit", "policy", "gate", "closureHealth"))):
        raise ValueError("official service attestation invalid")
    prior = None
    try:
        prior = trust.load_context(now, context_path)
        if prior["attestationDir"].resolve() != attestation_dir.resolve():
            prior = None
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        prior = None
    accounts = [row for row in (prior or {}).get("accounts", [])
                if row.get("identityType", "codex-account") == "codex-account"]
    seen = set()
    for _, receipt in receipts:
        seat = (receipt["provider"], receipt["profile"])
        if seat in seen:
            continue
        seen.add(seat)
        accounts.append({
            "provider": receipt["provider"], "profile": receipt["profile"], "model": receipt["model"],
            "agentProfile": "coder", "identityType": "provider-executor",
            "executorPath": receipt["executorPath"], "executorSha256": receipt["executorSha256"],
            "authStatePath": receipt["authStatePath"], "authStateSha256": receipt["authStateSha256"],
            "authPoolIdentity": receipt["authPoolIdentity"],
        })
    if not accounts:
        raise ValueError("no trusted completion identities")
    runtime = {
        "schema": contract.V2_RUNTIME_IDENTITY_SCHEMA,
        "service": contract.V2_OFFICIAL_RUNTIME_SERVICE,
        "sourceRevision": revision,
        "binarySha256": trust.digest(binary),
        "workflowSha256": trust.digest(workflow),
        "contractSha256": trust.digest(Path(contract.__file__)),
    }
    value = {"runtime": runtime, "sourceRoot": str(source_root.resolve()), "binaryPath": str(binary.resolve()),
             "workflowPath": str(workflow.resolve()), "observedAt": now.isoformat(), "accounts": accounts,
             "attestationDir": str(attestation_dir.resolve())}
    if prior and prior.get("codexPath") is not None:
        value.update(codexPath=str(prior["codexPath"]), codexSha256=prior["codexSha256"])
    attestation_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(attestation_dir, 0o700)
    _write_private(context_path, value)
    return value


def build_proof(lease: dict[str, Any], outcome: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    seat = next((row for row in context["accounts"] if row["provider"] == lease["provider"]
                 and row["profile"] == lease["profile"] and row["model"] == lease["model"]), None)
    if seat is None:
        raise ValueError("completion identity is not enrolled")
    source = {"repository": lease["repository"], "pr": outcome["pr"], "headSha": outcome["headSha"]}
    lease_binding = {"schema": lease["schema"], "issueRevision": lease["issueRevision"],
                     "receiptSha256": lease["receiptSha256"], "leaseIdentity": lease["leaseIdentity"]}
    ci = {key: outcome[key] for key in ("conclusion", "requiredChecks", "requiredChecksSha256")}
    payload = {"issue": lease["identifier"], "source": source, "ci": ci, "lease": lease_binding}
    completion_id = _digest(payload)
    raw = _canonical(payload)
    return {
        "schema": contract.V2_PROOF_SCHEMA, "producer": contract.V2_ACCEPTED_COMPLETION_SOURCE,
        "agentProfile": "coder", "probeId": completion_id, "attested": True,
        "runtime": context["runtime"], "contractSha256": context["runtime"]["contractSha256"],
        "runtimeGeneration": context["runtimeGeneration"], "executorSha256": lease["executorSha256"],
        "accountStateSha256": seat["accountStateSha256"], "provider": lease["provider"],
        "profile": lease["profile"], "model": lease["model"], "rc": 0, "useful": True,
        "completedAt": outcome["mergedAt"], "outputDigest": hashlib.sha256(raw).hexdigest(),
        "outputBytes": len(raw), "outputTokens": 0, **payload,
    }


def _proof_persistence_state(proof: dict[str, Any], *, attestation_dir: Path,
                             ledger: Path) -> tuple[str, bool, Path]:
    target = attestation_dir / f"{proof['probeId']}.json"
    if target.exists():
        if _read_json(target) != proof:
            raise ValueError("completion replay conflicts with attestation")
        result = "replayed"
    else:
        result = "accepted"
    rows = projector._read_jsonl(ledger)
    matches = [row for row in rows if isinstance(row, dict) and row.get("probeId") == proof["probeId"]]
    if any(row != proof for row in matches):
        raise ValueError("completion replay conflicts with ledger")
    source = proof.get("source")
    source_key = (source.get("repository"), source.get("pr"), source.get("headSha"))
    existing = [row for row in rows if isinstance(row, dict)]
    if attestation_dir.exists():
        for path in attestation_dir.glob("*.json"):
            row = trust.private_json(path)
            if isinstance(row, dict):
                existing.append(row)
    for row in existing:
        row_source = row.get("source")
        if (row.get("producer") == contract.V2_ACCEPTED_COMPLETION_SOURCE
            and isinstance(row_source, dict)
            and (row_source.get("repository"), row_source.get("pr"), row_source.get("headSha")) == source_key
            and row.get("probeId") != proof["probeId"]):
            raise ValueError("completion source replay conflicts")
    return result, bool(matches), target


def _persist_proof_locked(proof: dict[str, Any], *, attestation_dir: Path, ledger: Path) -> str:
    result, ledger_has_proof, target = _proof_persistence_state(
        proof, attestation_dir=attestation_dir, ledger=ledger,
    )
    if result == "accepted":
        _write_private(target, proof)
    if not ledger_has_proof:
        with ledger.open("ab") as stream:
            stream.write(_canonical(proof) + b"\n")
            stream.flush()
            os.fsync(stream.fileno())
    return result


def persist_proof(proof: dict[str, Any], *, attestation_dir: Path, ledger: Path) -> str:
    ledger.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock_path = ledger.with_name(ledger.name + ".lock")
    with lock_path.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return _persist_proof_locked(proof, attestation_dir=attestation_dir, ledger=ledger)


def _commit_completion_locked(proof: dict[str, Any], *, provider: str,
                              observed_at: str, verified_identity_capacity: int,
                              provider_path: Path, attestation_dir: Path,
                              ledger: Path) -> str:
    """Commit provider and global evidence together or restore their exact prior bytes."""
    _, _, target = _proof_persistence_state(
        proof, attestation_dir=attestation_dir, ledger=ledger,
    )
    provider_path.parent.mkdir(parents=True, exist_ok=True)
    provider_lock_path = provider_path.with_name(f"{provider_path.name}.lock")
    with provider_lock_path.open("a+") as provider_lock:
        fcntl.flock(provider_lock, fcntl.LOCK_EX)
        provider_prior = provider_path.read_bytes() if provider_path.exists() else None
        ledger_prior = ledger.read_bytes() if ledger.exists() else None
        target_prior = target.read_bytes() if target.exists() else None
        before = provider_capacity.read_state(provider_path, observed_at)
        after = provider_capacity.apply_observation(
            before, provider=provider, kind="useful_completion",
            event_id=proof["probeId"], observed_at=observed_at,
            verified_identity_capacity=verified_identity_capacity,
        )
        try:
            provider_capacity.write_state(provider_path, after)
            return _persist_proof_locked(
                proof, attestation_dir=attestation_dir, ledger=ledger,
            )
        except BaseException:
            # Do not let either local provider admission or global projection
            # observe a completion that the other side could not commit.
            _restore_private_bytes(provider_path, provider_prior)
            _restore_private_bytes(ledger, ledger_prior)
            _restore_private_bytes(target, target_prior)
            raise


def reconcile(args: argparse.Namespace, *, github=github_outcome, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    receipts = []
    rejected: dict[str, int] = {}
    for path in sorted(args.result_dir.glob("*.json")):
        try:
            receipts.append((path, validate_result(trust.private_json(path), path, args.receipt_dir)))
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            name = type(error).__name__
            rejected[name] = rejected.get(name, 0) + 1
    refresh_context(args.context, receipts, source_root=args.source_root, binary=args.binary,
                    workflow=args.workflow, attestation_dir=args.attestation_dir,
                    service_attestation=args.service_attestation, now=now)
    context = trust.load_context(now, args.context)
    candidates = []
    for path, lease in receipts:
        try:
            result = lease["result"]
            pr, rules = github(lease["repository"], result["prNumber"])
            outcome = validate_github_outcome(
                pr, rules, expected_issue=lease["identifier"], expected_head=result["headSha"],
                expected_pr=result["prNumber"], now=now,
            )
            proof = build_proof(lease, outcome, context)
            candidates.append((contract.v2_parse_time(proof["completedAt"]), lease, outcome, proof))
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, json.JSONDecodeError) as error:
            name = type(error).__name__
            rejected[name] = rejected.get(name, 0) + 1
    results = []
    args.ledger.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    proof_lock_path = args.ledger.with_name(args.ledger.name + ".lock")
    with proof_lock_path.open("a+") as proof_lock:
        fcntl.flock(proof_lock, fcntl.LOCK_EX)
        context = trust.load_context(now, args.context)
        validation = trust.validation_args(context)
        prior_proofs, _ = contract.v2_accepted_useful_turn_proofs(
            projector._read_jsonl(args.ledger), now,
            expected_runtime=validation["expected_runtime"],
            expected_contract_sha=validation["expected_contract_sha"],
            attestations=validation["attestations"],
        )
        accepted_pools: dict[str, set[str]] = {}
        for prior in prior_proofs:
            accepted_pools.setdefault(prior["provider"], set()).add(prior["profile"])
        for _, lease, outcome, proof in sorted(candidates, key=lambda row: (row[0], row[3]["probeId"])):
            try:
                # Discover every deterministic replay/conflict before provider
                # admission changes. Publication remains after capacity accepts.
                _proof_persistence_state(
                    proof, attestation_dir=args.attestation_dir, ledger=args.ledger,
                )
                pools = accepted_pools.setdefault(lease["provider"], set())
                prospective_pools = pools | {lease["profile"]}
                state = _commit_completion_locked(
                    proof, provider=lease["provider"], observed_at=proof["completedAt"],
                    verified_identity_capacity=len(prospective_pools),
                    provider_path=args.provider_capacity,
                    attestation_dir=args.attestation_dir, ledger=args.ledger,
                )
                accepted_pools[lease["provider"]] = prospective_pools
                results.append({"issue": lease["identifier"], "pr": outcome["pr"], "state": state,
                                "completionId": proof["probeId"]})
            except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, json.JSONDecodeError) as error:
                name = type(error).__name__
                rejected[name] = rejected.get(name, 0) + 1
        context = trust.load_context(now, args.context)
        receipt = projector.build_receipt(projector._read_jsonl(args.ledger), {}, now, context=context)
        projector._write_atomic(args.capacity, receipt)
    return {"accepted": results, "rejected": rejected, "target": receipt["target"], "approved": receipt["approved"]}


def parser() -> argparse.ArgumentParser:
    home = Path.home()
    gem = Path(os.environ.get("GEM_WORKSPACE", home / "gem-workspace"))
    p = argparse.ArgumentParser()
    p.add_argument("--receipt-dir", type=Path, default=home / ".local/state/symphony-fallback/receipts")
    p.add_argument("--result-dir", type=Path, default=home / ".local/state/symphony-fallback/receipts/completions")
    p.add_argument("--source-root", type=Path, default=home / "Jovie")
    p.add_argument("--binary", type=Path, default=home / ".local/bin/symphony")
    p.add_argument("--workflow", type=Path, default=home / ".config/symphony/WORKFLOW.md")
    p.add_argument("--service-attestation", type=Path, default=gem / "state/gem-service-attestation.json")
    p.add_argument("--context", type=Path, default=gem / "state/proof-context.json")
    p.add_argument("--attestation-dir", type=Path, default=gem / "state/completion-attestations")
    p.add_argument("--ledger", type=Path, default=gem / "state/useful-turn-proofs.jsonl")
    p.add_argument("--capacity", type=Path, default=gem / "state/concurrency.json")
    p.add_argument("--provider-capacity", type=Path, default=home / ".local/state/symphony-fallback/provider-capacity.json")
    return p


def main() -> int:
    try:
        print(json.dumps(reconcile(parser().parse_args()), sort_keys=True))
        return 0
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, json.JSONDecodeError) as error:
        print(f"accepted completion reconciliation failed: {type(error).__name__}", file=__import__("sys").stderr)
        return 78


if __name__ == "__main__":
    raise SystemExit(main())
