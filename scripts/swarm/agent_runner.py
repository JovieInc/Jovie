"""Agent runner for the PR Remediation Swarm, split out so pr_remediation_swarm.py stays inside the size ratchet.

Helpers that tests patch on pr_remediation_swarm (pick_model, named_files, subprocess, model_mode_on)
are resolved at call time from that module.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import provider_order as po  # noqa: E402


def _s():
    import pr_remediation_swarm as s
    return s

PROMPT = """You are a bounded CI remediator for one failing pull request in this repo.
Failing checks: {checks}. Failure class: {cls}.
Below are the extracted error and the files it names (truncated). Fix ONLY what the error shows,
editing the fewest files. Do not explore the repo; the files you need are below.
Rules: never edit tests to make them pass (no skip/only/deleted assertions), never touch auth, billing,
migrations, secrets, .github or canon files, never add dependencies, never use --no-verify.
Do not commit or push. If the error is not fixable with a few small edits, change nothing.

=== ERROR EXTRACT ===
{error}

=== FILES NAMED IN THE ERROR ===
{files}
"""
CONTEXT_CHARS = 60_000  # about 15-20k tokens of named files
ERROR_CHARS = 8_000
FILE_REF = re.compile(r"(?<![\w/.-])((?:[\w.@-]+/)*[\w.@-]+\.(?:tsx?|mjs|cjs|jsx?|py|json|ya?ml|md|sh))(?::\d+)?")

def named_files(error: str, cwd: str) -> str:
    """Contents of repo files the error names, bounded in total and per file; sensitive paths excluded."""
    s = _s()
    SENSITIVE = s.SENSITIVE
    seen, out, used = set(), [], 0
    for m in FILE_REF.finditer(error):
        rel = m.group(1)
        path = Path(cwd) / rel
        if rel in seen or SENSITIVE.search(rel) or not path.is_file() or ".." in rel:
            continue
        seen.add(rel)
        try:
            text = path.read_text()[:15_000]
        except (OSError, UnicodeDecodeError):
            continue
        if used + len(text) > CONTEXT_CHARS:
            break
        used += len(text)
        out.append(f"--- {rel} ---\n{text}")
    return "\n\n".join(out) or "(none of the named files exist in the checkout)"


CREDIT_TEXT = re.compile(r"insufficient[_ ]funds|insufficient credit|payment required|\"status\"\s*:\s*402", re.I)


def gateway_base() -> str:
    """SWARM_BASE_URL or "" (no provider: model slots close). There is no Vercel AI Gateway fallback
    (Tim 2026-09-02 / 2026-11-19: never the Gateway), and a Gateway URL in the variable is refused."""
    base = os.environ.get("SWARM_BASE_URL") or ""
    return "" if not base or po.banned(base) else base


def walk_cost(node, acc: dict) -> None:
    if isinstance(node, dict):
        if isinstance(node.get("tokens"), dict):
            t = node["tokens"]
            acc["in"] += int(t.get("input") or 0)
            acc["cached"] = acc.get("cached", 0) + int(t.get("cache", {}).get("read", 0) if isinstance(t.get("cache"), dict) else 0)
            acc["out"] += int(t.get("output") or 0)
            acc["reasoning"] = acc.get("reasoning", 0) + int(t.get("reasoning") or 0)
        for v in node.values():
            walk_cost(v, acc)
    elif isinstance(node, list):
        for v in node:
            walk_cost(v, acc)


def cmd_agent(a) -> int:
    """Run opencode with no shell, no key in its env (provider keys are read from files outside the
    checkout), and a hard stop when the running cost passes the per-attempt cap. Providers are tried
    credits-first (provider_order); the next one is used only when this one's credits read zero or it
    answers with a credits/quota-exhausted error. The per-attempt cap spans every provider tried."""
    s = _s()
    model_mode_on = s.model_mode_on
    pick_model = s.pick_model
    named_files = s.named_files
    run_agent_once = s.run_agent_once
    iso = s.iso
    now = s.now
    sh = s.sh
    credits_available = s.credits_available
    plan = json.loads(Path(a.plan).read_text())
    env_in = dict(os.environ, SWARM_KEY_FILE=a.key_file)
    providers, _refused = po.resolve(env_in)
    tiers = {t for t in os.environ.get("SWARM_TIERS", "").split(",") if t}  # admitted at select; none = no call
    key_files = {p.key_file_env: Path(env_in.get(p.key_file_env) or "/nonexistent") for p in providers}

    def cleanup():
        for f in key_files.values():
            f.unlink(missing_ok=True)
        Path(a.key_file).unlink(missing_ok=True)

    if not model_mode_on():  # defence in depth: no model call even if a workflow edit skips the gates
        cleanup()
        plan.update(outcome="gave-up", reason="model-mode-off")
        Path(a.plan).write_text(json.dumps(plan))
        Path(a.meta).write_text(json.dumps({"costUsd": 0, "aborted": "model-mode-off"}))
        return 0
    cands = [m.strip() for m in os.environ.get("SWARM_MODELS", "@cf/zai-org/glm-5.3-flash").split(",") if m.strip()]
    cap = float(os.environ.get("SWARM_ATTEMPT_USD_CAP", "0.10"))
    error = Path(a.log).read_text()[:ERROR_CHARS]
    prompt = PROMPT.format(checks=", ".join(plan.get("checks", [])), cls=plan.get("cls"), error=error,
                           files=named_files(error, a.cwd))
    started = now()
    spent = {"oop": 0.0, "credit": 0.0}
    tried, outcome, model, last_text, tokens = [], None, None, "", {}
    try:
        for prov in [p for p in providers if p.tier in tiers]:
            kf = key_files[prov.key_file_env]
            key = kf.read_text().strip() if kf.is_file() else ""
            if not key:
                tried.append(f"{prov.name}:no-key")
                continue
            if prov.probe == "credits-endpoint" and not credits_available(prov.base_url, key):
                tried.append(f"{prov.name}:credits-zero")
                continue
            try:
                model, unit = pick_model(prov.base_url, key, cands, prov)
            except OSError as exc:  # urllib HTTPError/URLError are OSErrors
                if po.exhausted(str(exc)):
                    tried.append(f"{prov.name}:exhausted")
                    continue
                outcome = "relay-unreachable:" + str(exc)[:80]
                break
            except SystemExit as exc:
                outcome = str(exc)[:120]
                break
            left = cap - spent["oop"] - spent["credit"]
            used, why, last_text, tokens = run_agent_once(a, prov, kf, model, unit, prompt, left, started)
            spent[prov.tier] += used
            tried.append(f"{prov.name}:{why or 'done'}")
            if why == "exhausted":
                continue  # fall through to the next source with what is left of the attempt cap
            outcome = why
            break
        else:
            outcome = outcome or "blocked-credits"
    finally:
        cleanup()
    total = spent["oop"] + spent["credit"]
    meta = {"model": model, "costUsd": round(total, 5), "oopUsd": round(spent["oop"], 5),
            "creditUsd": round(spent["credit"], 5), "tokens": tokens, "providersTried": tried,
            "agentSeconds": int(now() - started), "agentSaid": last_text}
    if outcome == "blocked-credits":
        plan.update(outcome="blocked-credits", reason="all-sources-exhausted:" + ",".join(tried)[:120])
    elif outcome:
        meta["aborted"] = outcome
        plan.update(reason="agent-" + outcome.split(" ")[0])
    if outcome:
        sh(["git", "checkout", "--", "."], a.cwd)
        sh(["git", "clean", "-fdq"], a.cwd)
        Path(a.plan).write_text(json.dumps(plan))
    Path(a.meta).write_text(json.dumps(meta))
    return 0


def run_agent_once(a, prov, key_file: Path, model: str, unit: dict, prompt: str, left: float, started: float):
    """One opencode run on one provider. Returns (usd, why, last_text, tokens); why is None when the
    agent finished, "exhausted" on a credits/quota error event, else the abort reason."""
    s = _s()
    subprocess, now = s.subprocess, s.now
    config = {"$schema": "https://opencode.ai/config.json", "autoupdate": False, "share": "disabled",
              "provider": {"swarm": {"npm": "@ai-sdk/openai-compatible", "name": "swarm",
                                      "options": {"baseURL": prov.base_url, "apiKey": "{file:" + str(key_file) + "}"},
                                      "models": {model: {"name": model}}}},
              # No shell at all: the push gate's preflight is the only executor, in a step with no secrets.
              "permission": {"edit": "allow", "bash": "deny", "webfetch": "deny", "external_directory": "deny"},
              "agent": {"build": {"steps": a.max_steps}}}
    env = {k: v for k, v in os.environ.items() if k not in {"SWARM_API_KEY", "GH_TOKEN", "GITHUB_TOKEN"}}
    env["OPENCODE_CONFIG_CONTENT"] = json.dumps(config)
    acc = {"in": 0, "cached": 0, "out": 0, "reasoning": 0}
    reported, why, last_text = 0.0, None, ""
    proc = subprocess.Popen(["npx", "--yes", "opencode-ai@1.19.5", "run", "--format", "json", "-m", f"swarm/{model}", prompt],
                            cwd=a.cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    try:
        for line in proc.stdout:
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            # Only an error event counts: the agent echoes repo text that may mention payments.
            if isinstance(ev, dict) and (ev.get("type") == "error" or "error" in ev) and \
                    (CREDIT_TEXT.search(line) or po.exhausted(line)):
                why = "exhausted"
                break
            if isinstance(ev, dict) and ev.get("type") == "text":
                last_text = str((ev.get("part") or {}).get("text") or "")[-300:] or last_text
            walk_cost(ev, acc)
            reported += sum_reported_cost(ev)
            if max(po.cost(acc, unit), reported) > left:
                why = f"attempt-cap ${max(po.cost(acc, unit), reported):.4f}>${left:.4f}"
                break
            if now() - started > a.timeout:
                why = "timeout"
                break
    finally:
        if proc.poll() is None:
            proc.kill()
    # Tokens already streamed before a credits error were served: they still count (no silent $0).
    return max(po.cost(acc, unit), reported), why, last_text, acc


def sum_reported_cost(node) -> float:
    if isinstance(node, dict):
        own = node.get("cost")
        return (float(own) if isinstance(own, (int, float)) else 0.0) + sum(sum_reported_cost(v) for v in node.values())
    if isinstance(node, list):
        return sum(sum_reported_cost(v) for v in node)
    return 0.0
