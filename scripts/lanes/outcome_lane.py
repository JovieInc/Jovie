#!/usr/bin/env python3
"""The `outcome` lane: verify Validating issues that owe an `outcome` receipt, and record it.

The validation lifecycle (scripts/lib/linear-sync-on-merge.mjs) keeps an issue in Validating
while its manifest requires an `outcome` receipt and none is current. Nothing wrote those
receipts except sentry observations, so 198 issues sat on "outcome: no current receipt"
(2026-10-21). This lane closes that loop with a real check, not a text-only judgment:

  1. Candidates: Validating JOV issues whose newest lifecycle comment lists
     `- outcome: no current receipt` and already names a verified production generation
     (the deployment receipt passed). The dispatch tick starts a detached drain; the
     lifecycle comment is the event, the tick is the backstop.
  2. Verify: a Codex run (existing subscription accounts, no new spend) on a detached
     checkout of the verified production SHA reads the issue's acceptance section and merged
     PRs and checks every item against that code and production (https://jov.ie), read-only.
     It writes `outcome-verdict.json`: one entry per acceptance item with pass / fail /
     needs-authority and concrete evidence.
  3. Record: this module, not the model, decides. Pass only when every item passed with
     evidence; otherwise fail, naming the failed items (the lifecycle routes it to Rework) and
     any item that needs a human or outside party (outbound, spend, taste, credentials). The
     itemized verdict is commented on the issue; the receipt is recorded with the repository's
     own `linear-sync-on-merge.mjs receipt` from that checkout, as the Jovie Lanes Linear app.

  outcome_lane.py drain          # verify queued issues (the dispatch tick starts this)
  outcome_lane.py run JOV-123    # verify one issue now (operator use)
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import lifecycle  # noqa: E402
import outcome_escalation as esc  # noqa: E402
import pathlib as _pl, sys as _sys  # noqa: E402
_sys.path[:0] = [p for p in [str(_pl.Path(__file__).resolve().parent)] if p not in _sys.path]  # sibling module of the release
from atomic_state import atomic_write_text  # noqa: E402

VERDICT_SCHEMA = "jovie.outcome-verdict/v1"
VERDICT_FILE = "outcome-verdict.json"
COMMENT_MARKER = "<!-- outcome-verification:v1 -->"
LIFECYCLE_MARKER = "<!-- validation-lifecycle:v1"
MANIFEST_RE = re.compile(r"<!-- validation-manifest:v1\s*\n(\{.*?\})\s*\n-->", re.S)
VERIFIED_RE = re.compile(r"^Verified production generation: ([0-9a-f]{40})\.?\s*$", re.M)
OUTCOME_OWED_RE = re.compile(r"^- outcome: no current receipt\b", re.M)
ITEM_STATUSES = frozenset({"pass", "fail", "needs-authority", "unverifiable"})
# A taste decision is covered by the founder-taste receipt (default-accepted at its deadline), so a
# needs-authority item about taste is residual, not a failed acceptance item.
TASTE_RE = re.compile(r"\b(taste|founder|design decision|design approval)\b", re.I)
NOTE_LIMIT = 1900  # validation-lifecycle MAX_NOTE_LENGTH is 2000
PER_DAY = int(os.environ.get("LANES_OUTCOME_PER_DAY", "30") or 0)
PER_DRAIN = 3
RETRY_S = 24 * 3600
VERIFY_TIMEOUT_S = 2400
PREPARE_TIMEOUT_S = 600
STATE_FILE = "outcome-lane.json"
CANDIDATES_QUERY = """query($after:String){issues(first:50,after:$after,
 filter:{team:{key:{eq:"JOV"}},state:{name:{eq:"Validating"}}},orderBy:updatedAt){
 pageInfo{hasNextPage endCursor}
 nodes{id identifier title url description comments(last:30){nodes{id body createdAt parent{id} user{name}}}}}}"""


def now_iso(epoch: float | None = None) -> str:
    return datetime.fromtimestamp(time.time() if epoch is None else epoch, timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ")


def enabled() -> bool:
    return os.environ.get("LANES_OUTCOME_LANE", "on").strip().lower() not in {"off", "0", "false"} and PER_DAY > 0


def lifecycle_ask(issue: dict) -> dict | None:
    """The newest lifecycle comment's open outcome ask, or None when outcome is not owed now."""
    comments = sorted(((issue.get("comments") or {}).get("nodes") or []),
                      key=lambda node: node.get("createdAt") or "")
    latest = next((node for node in reversed(comments) if LIFECYCLE_MARKER in (node.get("body") or "")), None)
    if latest is None:
        return None
    body = latest["body"]
    verified = VERIFIED_RE.search(body)
    manifest_match = MANIFEST_RE.search(body)
    if not verified or not OUTCOME_OWED_RE.search(body) or not manifest_match:
        return None
    try:
        manifest = json.loads(manifest_match.group(1))
    except ValueError:
        return None
    if not isinstance(manifest, dict) or manifest.get("issue") != issue.get("identifier"):
        return None
    digest = re.search(r"<!-- validation-lifecycle:v1 ([0-9a-f]+) -->", body)
    return {"sha": verified.group(1), "manifest": manifest, "at": latest.get("createdAt"),
            "digest": digest.group(1) if digest else latest.get("createdAt")}


def read_state(state: Path) -> dict:
    try:
        data = json.loads((state / STATE_FILE).read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def write_state(state: Path, data: dict) -> None:
    path = state / STATE_FILE
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, sort_keys=True))
    os.replace(tmp, path)


def due(record: dict | None, ask: dict, now: float) -> bool:
    """One verification per lifecycle ask; a failed attempt (no receipt) retries after a day."""
    if not record:
        return True
    if record.get("digest") != ask["digest"] or record.get("sha") != ask["sha"]:
        return True
    return record.get("result") not in {"recorded"} and now - float(record.get("at") or 0) >= RETRY_S


def spent_today(state: dict, now: float) -> int:
    day = now_iso(now)[:10]
    return sum(1 for row in state.values() if isinstance(row, dict) and str(row.get("day")) == day)


def candidates(linear, state: Path, now: float, limit: int = 200) -> list[tuple[dict, dict]]:
    found, after, seen = [], None, 0
    records = read_state(state)
    while seen < limit:
        page = linear.gql(CANDIDATES_QUERY, {"after": after})["issues"]
        for issue in page["nodes"]:
            seen += 1
            ask = lifecycle_ask(issue)
            if ask and due(records.get(issue["identifier"]), ask, now):
                found.append((issue, ask))
        if not page["pageInfo"]["hasNextPage"]:
            break
        after = page["pageInfo"]["endCursor"]
    return found


def prompt(issue: dict, ask: dict, env_note: str | None = None) -> str:
    pulls = ask["manifest"].get("mergedPulls") or [ask["manifest"].get("bindingPull")]
    return f"""You are verifying the acceptance criteria of Linear issue {issue['identifier']} for an
`outcome` validation receipt. Your working directory is a checkout of the verified production
commit {ask['sha']}. Production deploys every ~30 minutes, so the live build is usually a later
commit that contains it.

Issue title: {issue['title']}
Merged pull requests: {', '.join(p for p in pulls if p)}

Issue description (find the acceptance / verification section; if there is none, the
acceptance criteria are the concrete claims the issue makes about the fixed behavior):
-----
{(issue.get('description') or '')[:12000]}
-----

Environment: Node 24 is first on PATH and dependencies are {env_note or 'installed (pnpm install --frozen-lockfile); run changed-path tests with pnpm --filter <pkg> exec vitest run <files>'}.

Rules:
- READ ONLY. Never push, comment, label, merge, deploy, open PRs, change Linear, send messages
  to people or spend money. You may read the code here, run `git`, read-only `gh` (pr view,
  run view, api GET), `curl`/fetch against https://jov.ie and run existing tests that need no
  network installs.
- Check every acceptance item against this commit and production. Evidence must be concrete:
  file:line in this commit, a URL plus the observed text/status, a CI run URL and its result,
  or a test command plus its result. "Looks implemented" is not evidence.
- Binding to the build: https://jov.ie/api/version returns the 7-character buildId being served. The
  change is live when the requested SHA is an ancestor of that build (`git fetch origin main`, then
  `git merge-base --is-ancestor <sha> $(git rev-parse <buildId>)`). Do not require the ids to be equal.
- Tests: a successful required CI check on the binding merge commit, or on any later main commit that
  contains it, counts as those tests having run (cite the run URL); otherwise run them yourself.
- `unverifiable` is never a shrug. Before using it, try to get the capability: (1) use tools you can run
  yourself: Playwright (chromium is installed; `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright`), screenshots
  read with your image tool, HTTP/API reads, logs and telemetry you can query; (2) if a missing signal could
  be emitted cheaply through an existing metrics path, say which signal, or why it is not cheap; then
  mark the item `unverifiable` and the lane will itself (3) re-try the URLs in its own browser with a vision
  read, ask an agent that has the capability (mesh or the lanes escalation surface), and (4) get an adversarial
  review from a different model for judgement items. For each such item add `"kind": "observable|judgement"`,
  `"capability": "signed-in-browser|device|telemetry|third-party-console|process-record|taste|other"`, `"urls": [...]`
  and `"attempts": [{{"step": "telemetry", "result": "<signal added/queued, or why not cheap>"}}]`. An item
  without a telemetry attempt is rejected as a failure. Items that stay unverifiable are routed as capability
  gaps with an owner. `fail` is only for contradicting evidence or behavior shown missing.
- An item that only a human or an outside party can confirm (taste/design approval, an
  outbound message, a purchase or spend, credentials, a third-party console, a physical
  device) is `needs-authority`; name that authority in `evidence`.
- An item you cannot prove from here after those steps is `unverifiable`; one the evidence contradicts is `fail`, with what you checked.

Write exactly one file, `{VERDICT_FILE}`, in the working directory:
{{"schema": "{VERDICT_SCHEMA}", "issue": "{issue['identifier']}", "sha": "{ask['sha']}",
  "items": [{{"criterion": "<acceptance item, short>", "status": "pass|fail|needs-authority|unverifiable",
             "evidence": "<concrete proof or what failed>", "kind": "observable|judgement", "capability": "<see above>",
             "urls": ["<pages you tried>"], "attempts": [{{"step": "telemetry", "result": "<...>"}}]}}],
  "summary": "<one sentence>"}}
"""


def judge(verdict, issue: str, sha: str) -> dict:
    """Deterministic decision from the model's itemized verdict; any doubt is a fail."""
    if not isinstance(verdict, dict) or verdict.get("schema") != VERDICT_SCHEMA:
        return {"status": "fail", "reason": "verdict-unreadable", "items": []}
    if verdict.get("issue") != issue or verdict.get("sha") != sha:
        return {"status": "fail", "reason": "verdict-target-mismatch", "items": []}
    items = verdict.get("items")
    if not isinstance(items, list) or not items:
        return {"status": "fail", "reason": "no-acceptance-items", "items": []}
    clean = []
    for item in items[:40]:
        if not isinstance(item, dict):
            return {"status": "fail", "reason": "verdict-item-malformed", "items": clean}
        status = str(item.get("status") or "")
        evidence = str(item.get("evidence") or "").strip()
        criterion = str(item.get("criterion") or "").strip()
        if status not in ITEM_STATUSES or not criterion:
            return {"status": "fail", "reason": "verdict-item-malformed", "items": clean}
        if status == "pass" and len(evidence) < 12:
            status, evidence = "fail", f"no concrete evidence given ({evidence or 'empty'})"
        row = {"criterion": criterion[:300], "status": status, "evidence": evidence[:600]}
        for key in ("kind", "capability", "urls", "attempts"):
            if item.get(key):
                row[key] = item[key]
        if status == "unverifiable":
            missing = esc.missing_steps(row)
            if missing:  # no shrugs: the capability must be pursued before an item is left unverifiable
                row["status"] = "fail"
                row["evidence"] = (f"unverifiable without escalation (not attempted: {', '.join(missing)}): " + evidence)[:600]
        clean.append(row)
    failed = [item for item in clean if item["status"] == "fail"
              or (item["status"] == "needs-authority" and not TASTE_RE.search(item["criterion"] + " " + item["evidence"]))]
    residual = [item for item in clean if item["status"] in ("unverifiable", "needs-authority") and item not in failed]
    passed = [item for item in clean if item["status"] == "pass"]
    if failed:
        return {"status": "fail", "reason": "items-not-verified", "items": clean}
    # Evidence a machine cannot obtain from here (auth-gated pages, replaying process steps, taste) is
    # residual, not a failure: a merged change must not bounce to Rework for what no repair can add.
    # The receipt still needs a strict majority of items proven.
    if len(passed) > len(residual):
        return {"status": "pass", "reason": "all-items-verified" if not residual else "verified-with-residual",
                "items": clean}
    return {"status": "fail", "reason": "too-little-verified", "items": clean}


def receipt_note(decision: dict) -> str:
    if decision["status"] == "pass":
        residual = [item for item in decision["items"] if item["status"] != "pass"]
        lines = [f"All {len(decision['items'])} acceptance items verified by the outcome lane."] if not residual else [
            f"{len(decision['items']) - len(residual)} of {len(decision['items'])} acceptance items verified by the "
            f"outcome lane; {len(residual)} could not be observed from the lane and are residual:"]
        lines += [f"- residual ({item['status']}): {item['criterion']}: {item['evidence'][:200]}" for item in residual]
    else:
        lines = [f"Not verified ({decision['reason']}):"]
        for item in decision["items"]:
            if item["status"] != "pass":
                tag = "needs authority" if item["status"] == "needs-authority" else "failed"
                lines.append(f"- {tag}: {item['criterion']}: {item['evidence']}")
    note = "\n".join(lines)
    return note if len(note) <= NOTE_LIMIT else note[: NOTE_LIMIT - 30] + "\n(itemized in the comment)"


def verdict_comment(issue: str, sha: str, decision: dict, run_id: str) -> str:
    def evidence(item):
        tried = "".join(f" Tried {a['step']}: {a['result']}." for a in item.get("attempts") or [] if isinstance(a, dict))
        return (item["evidence"] + tried).replace("|", "/")
    rows = "\n".join(f"| {item['status']} | {item['criterion'].replace('|', '/')} | {evidence(item)} |"
                     for item in decision["items"])
    return (f"{COMMENT_MARKER}\nOutcome lane verification of {issue} on verified production `{sha[:12]}`: "
            f"**{decision['status']}** ({decision['reason']}).\n\n| Result | Acceptance item | Evidence |\n"
            f"| --- | --- | --- |\n{rows or '| fail | (no items) | the verifier produced no itemized verdict |'}\n\n"
            f"Run `{run_id}` on lanes host. Read-only verification; the receipt below is recorded by the lane.")


def node24_path() -> str:
    """Directory of the newest installed Node 24 (the repo requires >=24.21 <25; the host default is 22,
    which made every `run the tests` acceptance item fail with `vitest not found`)."""
    root = Path.home() / ".nvm" / "versions" / "node"
    versions = []
    for child in root.glob("v24.*"):
        parts = child.name[1:].split(".")
        if len(parts) == 3 and all(part.isdigit() for part in parts):
            versions.append((tuple(int(part) for part in parts), child))
    return str(max(versions)[1] / "bin") if versions else ""


def prepare_tree(tree: Path, run=lifecycle.run) -> str | None:
    """Install dependencies (frozen lockfile, hard-linked from the shared store, ~25s) so the verifier can
    execute changed-path tests. Returns None on success, else a short reason for the prompt."""
    bin_dir = node24_path()
    if not bin_dir:
        return "no Node 24 installed on the lanes host"
    env = {key: os.environ[key] for key in ("HOME", "LANG") if key in os.environ}
    env["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
    try:
        done = run(["pnpm", "install", "--frozen-lockfile", "--ignore-scripts", "--prefer-offline"], cwd=str(tree),
                   env=env, capture_output=True, text=True, timeout=PREPARE_TIMEOUT_S)
    except (OSError, subprocess.SubprocessError) as error:
        return f"pnpm install failed to run: {type(error).__name__}"
    if done.returncode:
        return "pnpm install exited " + str(done.returncode) + ": " + (done.stderr or done.stdout or "")[-160:].strip()
    return None


def checkout(repo: Path, root: Path, sha: str, run=lifecycle.run) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{sha[:12]}-{int(time.time())}"
    run(["git", "-C", str(repo), "fetch", "-q", "origin", sha], capture_output=True, timeout=300)
    added = run(["git", "-C", str(repo), "worktree", "add", "-q", "--detach", str(path), sha],
                capture_output=True, text=True, timeout=600)
    if added.returncode:
        raise RuntimeError("outcome-checkout-failed")
    return path


def drop_checkout(repo: Path, path: Path, run=lifecycle.run) -> None:
    run(["git", "-C", str(repo), "worktree", "remove", "--force", str(path)], capture_output=True, timeout=600)
    shutil.rmtree(path, ignore_errors=True)


def app_authorization(state: Path) -> str | None:
    """Bearer header value for the Jovie Lanes Linear app (the receipt script sends it raw)."""
    import linear_app_token
    app = linear_app_token.credentials(linear_app_token.default_path())
    if not app:
        return None
    try:
        return "Bearer " + linear_app_token.token(*app, state)
    except linear_app_token.TokenUnavailable:
        return None


def record_receipt(tree: Path, issue: str, sha: str, decision: dict, evidence: str, manifest: dict,
                   authorization: str, run=lifecycle.run) -> bool:
    args = ["node", str(tree / "scripts/lib/linear-sync-on-merge.mjs"), "receipt", "--issue", issue,
            "--kind", "outcome", "--status", decision["status"], "--sha", sha, "--evidence", evidence,
            "--note", receipt_note(decision)]
    if manifest.get("receiptNotBefore"):
        args += ["--episode-started-at", str(manifest["receiptNotBefore"])]
    env = {key: os.environ[key] for key in ("PATH", "HOME", "LANG") if key in os.environ}
    env["LINEAR_API_KEY"] = authorization
    done = run(args, cwd=str(tree), env=env, capture_output=True, text=True, timeout=120)
    return done.returncode == 0


def verify(host, lane, linear, issue: dict, ask: dict, run=lifecycle.run) -> dict:
    """One issue: checkout, model verification, deterministic decision, comment, receipt."""
    run_id = f"{now_iso().replace(':', '').replace('-', '')}-{issue['identifier']}-outcome"
    tree = checkout(host.repo, host.state / "outcome-worktrees", ask["sha"], run=run)
    try:
        prompt_file = host.state / "runs" / f"{run_id}.prompt.md"
        prompt_file.parent.mkdir(parents=True, exist_ok=True)
        started = time.time()
        failure = prepare_tree(tree, run=run)
        prompt_file.write_text(prompt(issue, ask, None if failure is None else
                                      f"NOT installed ({failure}); you cannot run tests, so rely on CI evidence"))
        env = dict(os.environ)
        env["PATH"] = node24_path() + os.pathsep + env.get("PATH", "")
        done = run([sys.executable, str(HERE / "codex_lane.py"), "run", "--prompt-file", str(prompt_file),
                    "--cwd", str(tree), "--reasoning-effort", "high"],
                   capture_output=True, text=True, timeout=VERIFY_TIMEOUT_S, env=env)
        try:
            verdict = json.loads((tree / VERDICT_FILE).read_text())
        except (OSError, ValueError):
            verdict = None
        if verdict is None:
            # No verdict is a verifier malfunction, not evidence about the issue: no receipt
            # (a fail would route it to Rework), retried on the next day's drain.
            return {"result": "verifier-failed", "returncode": done.returncode, "runId": run_id,
                    "durationS": round(time.time() - started)}
        if isinstance(verdict, dict) and isinstance(verdict.get("items"), list):
            work = host.state / "runs" / f"{run_id}.escalation"
            codex_cmd = [sys.executable, str(HERE / "codex_lane.py"), "run"]
            verdict["items"] = esc.escalate(
                [i for i in verdict["items"] if isinstance(i, dict)], tree=tree, out_dir=work, run=run, env=env,
                codex_cmd=codex_cmd, linear=linear, issue=issue, mesh_send=getattr(host, "mesh_send", None), sha=ask["sha"])
        decision = judge(verdict, issue["identifier"], ask["sha"])
        gaps = esc.route_gaps(host.state, linear, issue, decision["items"], time.time(), sha=ask["sha"],
                              episode=ask["manifest"].get("receiptNotBefore"))
        authorization = app_authorization(host.state)
        if authorization is None:
            return {"result": "linear-app-unavailable", "decision": decision["status"], "runId": run_id}
        linear.comment(issue["id"], verdict_comment(issue["identifier"], ask["sha"], decision, run_id))
        evidence = f"{issue.get('url') or issue['identifier']} (outcome lane run {run_id})"
        ok = record_receipt(tree, issue["identifier"], ask["sha"], decision, evidence, ask["manifest"],
                            authorization, run=run)
        return {"result": "recorded" if ok else "receipt-failed", "decision": decision["status"],
                "reason": decision["reason"], "items": len(decision["items"]), "gaps": len(gaps), "runId": run_id,
                "durationS": round(time.time() - started)}
    finally:
        drop_checkout(host.repo, tree, run=run)


def ledger(state: Path, issue: str, ask: dict, result: dict) -> None:
    """Stage receipt: `outcome owed` (the lifecycle comment) to `receipt written` (now), read
    by stage_events as shipping:outcome-receipt for p50/p95."""
    row = {"schema": "jovie-lane-run/v1", "kind": "outcome-verify", "provider": "codex",
           "runId": result.get("runId") or f"outcome-{issue}-{int(time.time())}", "issue": issue,
           "startedAt": ask.get("at"), "endedAt": now_iso(), "verdict": result.get("result"),
           "decision": result.get("decision"), "sha": ask.get("sha")}
    try:
        (state / "runs").mkdir(parents=True, exist_ok=True)
        with open(state / "runs" / "ledger.jsonl", "a") as out:
            out.write(json.dumps(row) + "\n")
    except OSError:
        pass  # measurement never blocks a recorded receipt


def help_followups(host, linear, now: float, run=lifecycle.run) -> list[dict]:
    """Re-evaluate items from replies to earlier help requests; a contradiction on an issue still in Validating
    records a failing outcome receipt (the lifecycle routes it to Rework); Done work only gets the comment."""
    out = []
    try:
        for res in esc.followup_replies(host.state, linear, now):
            out.append({"issue": res["issue"], "verdict": res["verdict"]})
            if res["verdict"] == "contradicted" and res["state"] == "Validating" and res.get("sha"):
                authorization = app_authorization(host.state)
                if authorization:
                    decision = {"status": "fail", "reason": "help-reply-contradicts",
                                "items": [{"criterion": res["gap"]["criterion"], "status": "fail",
                                           "evidence": res["gap"]["resolved"]["result"][:500]}]}
                    tree = checkout(host.repo, host.state / "outcome-worktrees", res["sha"], run=run)
                    try:  # the host clone can predate the receipt CLI; use a checkout of the verified sha
                        record_receipt(tree, res["issue"], res["sha"], decision,
                                       f"{res['issue']} (agent help reply {res['gap']['helpCorr']})",
                                       {"receiptNotBefore": res.get("episode")}, authorization, run=run)
                    finally:
                        drop_checkout(host.repo, tree, run=run)
    except lane_errors() as error:  # a Linear hiccup never blocks the drain
        out.append({"error": type(error).__name__})
    return out


def lane_errors():
    return (OSError, ValueError, RuntimeError, KeyError)


def drain(host, lane, run=lifecycle.run, now: float | None = None) -> dict:
    """At most PER_DRAIN issues per drain and PER_DAY per UTC day, one at a time per host."""
    if not enabled():
        return {"status": "disabled"}
    lock = lane.Locked(host.state / "outcome.lock", blocking=False)
    if not lock.held:
        return {"status": "busy"}
    done = []
    try:
        linear = lane.Linear(host.linear_env)
        now = time.time() if now is None else now
        help_followups(host, linear, now)
        for issue, ask in candidates(linear, host.state, now):
            if len(done) >= PER_DRAIN or lifecycle.draining(host.state):
                break
            records = read_state(host.state)
            if spent_today(records, now) >= PER_DAY:
                return {"status": "budget-exhausted", "done": done}
            entered = time.time()
            records[issue["identifier"]] = {"digest": ask["digest"], "sha": ask["sha"], "at": entered,
                                            "day": now_iso(entered)[:10], "result": "started",
                                            "enteredAt": ask["at"]}
            write_state(host.state, records)  # persist before work: a crash never re-runs in a loop
            try:
                result = verify(host, lane, linear, issue, ask, run=run)
            except Exception as error:  # one issue never stops the drain
                result = {"result": "error", "error": type(error).__name__}
            records = read_state(host.state)
            records[issue["identifier"]].update(result, exitedAt=now_iso())
            write_state(host.state, records)
            ledger(host.state, issue["identifier"], ask, result)
            done.append({"issue": issue["identifier"], **result})
        return {"status": "idle" if not done else "drained", "done": done}
    except lane.LinearRateLimited as error:
        return {"status": "linear-rate-limited", "resetAt": error.reset_at, "done": done}
    finally:
        lock.release()


def tick(host, lane, spawn=subprocess.Popen) -> dict:
    """Dispatch hook (backstop to the lifecycle event): start one detached drain every 15 min."""
    if os.environ.get("LANES_SELFTEST") or os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        return {"status": "selftest-skipped"}
    if not enabled():
        return {"status": "disabled"}
    probe = lane.Locked(host.state / "outcome.lock", blocking=False)
    if not probe.held:
        return {"status": "running"}
    probe.release()
    stamp = host.state / "outcome-tick.json"
    try:
        last = float(json.loads(stamp.read_text()).get("at") or 0)
    except (OSError, ValueError, TypeError, AttributeError):
        last = 0
    if time.time() - last < 900:
        return {"status": "not-due"}
    atomic_write_text(stamp, json.dumps({"at": time.time()}))
    spawn([sys.executable, str(HERE / "outcome_lane.py"), "drain"], stdin=subprocess.DEVNULL,
          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
          **lifecycle.spawn_kwargs())
    return {"status": "spawned"}


def guarded_main(argv: list[str] | None = None) -> int:
    import argparse
    import lane_runner as lane  # sibling module of the release
    lane.load_github_env()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("drain")
    one = sub.add_parser("run")
    one.add_argument("identifier")
    args = parser.parse_args(argv)
    host = lane.Host()
    if args.command == "drain":
        print(json.dumps(drain(host, lane)))
        return 0
    linear = lane.Linear(host.linear_env)
    team, number = args.identifier.upper().split("-")
    issue = linear.gql('query($t:String!,$n:Float!){issues(first:1,filter:{team:{key:{eq:$t}},number:{eq:$n}})'
                       '{nodes{id identifier title url description comments(last:30){nodes{id body createdAt parent{id} user{name}}}}}}',
                       {"t": team, "n": float(number)})["issues"]["nodes"][0]
    ask = lifecycle_ask(issue)
    if ask is None:
        print(json.dumps({"status": "not-owed", "issue": issue["identifier"]}))
        return 0
    print(json.dumps(verify(host, lane, linear, issue, ask), indent=1))
    return 0


def main(argv: list[str] | None = None) -> int:
    import lane_runner as lane
    try:
        with lifecycle.Guard(lane.Host().state):
            return guarded_main(argv)
    except lifecycle.AdmissionHeld as error:
        print(f"lifecycle admission held: {error}", file=sys.stderr)
        return 75


if __name__ == "__main__":
    sys.exit(main())
