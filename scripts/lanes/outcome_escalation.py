"""Escalation before `unverifiable`: the outcome verifier never shrugs (Tim, 2026-10-25).

When the model marks an acceptance item `unverifiable`, the lane tries, in order, to get the
capability before accepting that:

  1. tools      a headless Playwright load of the item's URLs with a screenshot, then a vision read of the
                screenshot. A page that loads and shows the thing means the item was observable after all.
  2. telemetry  the model must say which signal it added or queued, or why that is not cheap.
  3. agent-help ask an agent that has the capability (mesh to Summer or Instinct when the host holds
                mesh credentials, else the lanes escalation surface: a Linear help-request comment).
  4. adversarial a different model reviews judgement items.

Every attempt and its result is recorded on the item (`attempts`). `judge` refuses an `unverifiable` item
without the required steps, and each item left unverifiable is routed as a capability gap with an owner.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

STEPS = ("tools", "telemetry", "agent-help", "adversarial")
PROBE_TIMEOUT_S = 120
VISION_TIMEOUT_S = 600
HELP_MARKER = "<!-- outcome-help-request:v1 -->"
GAP_MARKER = "<!-- outcome-capability-gap:v1 -->"
GAP_FILE = "outcome-gaps.json"
URL_RE = re.compile(r"https://[A-Za-z0-9.-]*jov\.ie[^\s)\"'<>]*")

# capability -> (owner, what to build)
CAPABILITIES = {
    "signed-in-browser": ("golden-path (authqaprod fixture)", "a signed-in fixture browser session the lanes can use read-only"),
    "device": ("ios/mac app owners", "a real-device or simulator observation path with a receipt"),
    "telemetry": ("gem-lanes", "the missing production signal emitted through the existing metrics path"),
    "third-party-console": ("ops owner", "read-only API access to the third-party console"),
    "process-record": ("gem-lanes", "a durable receipt for the process step (controller/workpad provenance)"),
    "taste": ("founder-taste (Ovie taste card)", "founder or reviewer-model judgement on the exact build"),
    "other": ("gem-lanes", "unspecified: the item's evidence names what was missing"),
}

PROBE_JS = """import { chromium } from '@playwright/test';
const [url, shot] = process.argv.slice(2);
const out = { url, ok: false };
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  out.status = response ? response.status() : null;
  out.finalUrl = page.url();
  out.title = await page.title();
  out.text = (await page.innerText('body')).replace(/\\s+/g, ' ').slice(0, 600);
  await page.screenshot({ path: shot, fullPage: false });
  out.screenshot = shot;
  out.ok = true;
} catch (error) {
  out.error = String(error && error.message || error).slice(0, 300);
} finally {
  await browser.close();
}
console.log(JSON.stringify(out));
"""


def item_urls(item: dict) -> list[str]:
    urls = [u for u in (item.get("urls") or []) if isinstance(u, str) and URL_RE.fullmatch(u)]
    urls += URL_RE.findall(str(item.get("evidence") or ""))
    seen, out = set(), []
    for url in urls:
        url = url.rstrip(".,;")
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out[:2]


def looks_blocked(probe: dict) -> bool:
    """A probe that could not see the page as a user: error, HTTP error, or a sign-in wall."""
    if not probe.get("ok"):
        return True
    if isinstance(probe.get("status"), int) and probe["status"] >= 400:
        return True
    haystack = f"{probe.get('finalUrl', '')} {probe.get('text', '')[:200]}".lower()
    return "/signin" in haystack or "/sign-in" in haystack or "log in to jovie" in haystack


def browser_probe(tree: Path, url: str, out_dir: Path, run, env: dict) -> dict:
    web = Path(tree) / "apps" / "web"
    script = web / ".outcome-probe.mjs"
    out_dir.mkdir(parents=True, exist_ok=True)
    shot = out_dir / ("probe-" + re.sub(r"[^A-Za-z0-9]+", "-", url)[-60:] + ".png")
    try:
        script.write_text(PROBE_JS)
        done = run(["node", str(script), url, str(shot)], cwd=str(web), env={**env, "PLAYWRIGHT_BROWSERS_PATH": "/opt/ms-playwright"},
                   capture_output=True, text=True, timeout=PROBE_TIMEOUT_S)
        last = (done.stdout or "").strip().splitlines()[-1:] or [""]
        return json.loads(last[0]) if done.returncode == 0 and last[0].startswith("{") else {
            "url": url, "ok": False, "error": ((done.stderr or done.stdout or "no output")[-200:]).strip()}
    except (OSError, ValueError, Exception) as error:  # noqa: BLE001 - a probe failure is a recorded result
        return {"url": url, "ok": False, "error": f"{type(error).__name__}: {error}"[:200]}


def vision_read(shot: str | None, out_dir: Path, run, env: dict, codex_cmd: list[str]) -> str | None:
    """A vision-capable model describes the screenshot; None when unavailable."""
    if not shot or not Path(shot).exists():
        return None
    answer = Path(out_dir) / "vision.txt"
    prompt = Path(out_dir) / "vision.prompt.md"
    answer.unlink(missing_ok=True)
    prompt.write_text(f"Open the image file {shot} with your image viewing tool and describe, in at most 6 short lines, "
                      f"exactly which UI states, text and layout are visible. Write only that description to {answer}. "
                      "Do nothing else.")
    try:
        run([*codex_cmd, "--prompt-file", str(prompt), "--cwd", str(out_dir), "--reasoning-effort", "low"],
            capture_output=True, text=True, timeout=VISION_TIMEOUT_S, env=env)
        return answer.read_text()[:600].strip() or None
    except (OSError, Exception):  # noqa: BLE001
        return None


def request_agent_help(linear, issue: dict, item: dict, urls: list[str], mesh_send=None) -> dict:
    """Ask an agent that has the capability. Mesh when the host holds credentials, else a Linear comment."""
    question = (f"Outcome verifier for {issue['identifier']} could not observe: \"{item['criterion']}\". "
                f"Blocked by: {str(item.get('evidence') or '')[:240]}. Please open {', '.join(urls) or 'the production build'} "
                "as the signed-in test fixture and report what you see for this criterion (pass, fail, or the visible state).")
    if mesh_send is not None:
        try:
            ref = mesh_send(question)
            return {"channel": "mesh", "delivered": True, "ref": str(ref)[:80]}
        except Exception as error:  # noqa: BLE001
            mesh_note = f"mesh failed: {type(error).__name__}"
    else:
        mesh_note = "mesh unavailable on this host (no credentials)"
    try:
        linear.comment(issue["id"], f"{HELP_MARKER}\nHelp requested from an agent with the capability (Summer, Instinct or the "
                       f"golden-path owner):\n\n> {question}\n\nReply on this issue; the next outcome verification reads it.\n({mesh_note})")
        return {"channel": "linear-comment", "delivered": True, "ref": "issue-comment", "note": mesh_note}
    except Exception as error:  # noqa: BLE001
        return {"channel": "none", "delivered": False, "note": f"{mesh_note}; linear failed: {type(error).__name__}"}


def adversarial_review(item: dict, run, env: dict, codex_cmd: list[str], out_dir: Path) -> dict:
    """A different model reviews a judgement item. Needs LANES_OUTCOME_ADVERSARIAL_MODEL."""
    model = os.environ.get("LANES_OUTCOME_ADVERSARIAL_MODEL", "").strip()
    if not model:
        return {"ran": False, "result": "unavailable: no second-model reviewer configured (LANES_OUTCOME_ADVERSARIAL_MODEL)"}
    answer = Path(out_dir) / "adversarial.txt"
    prompt = Path(out_dir) / "adversarial.prompt.md"
    answer.unlink(missing_ok=True)
    prompt.write_text("You are an adversarial reviewer from a different model than the verifier. Judge this acceptance item "
                      f"strictly from the evidence given.\nItem: {item['criterion']}\nEvidence: {item.get('evidence')}\n"
                      f"Write to {answer} one line: VERDICT pass|fail|inconclusive, then one sentence of reasoning.")
    try:
        run([*codex_cmd, "--prompt-file", str(prompt), "--cwd", str(out_dir), "--model", model, "--reasoning-effort", "high"],
            capture_output=True, text=True, timeout=VISION_TIMEOUT_S, env=env)
        text = answer.read_text()[:300].strip()
        return {"ran": bool(text), "result": text or "no answer written"}
    except (OSError, Exception) as error:  # noqa: BLE001
        return {"ran": False, "result": f"failed: {type(error).__name__}"}


def escalate(items: list[dict], *, tree: Path, out_dir: Path, run, env: dict, codex_cmd: list[str], linear, issue: dict,
             mesh_send=None) -> list[dict]:
    """Attach `attempts` to every unverifiable item (the model supplies its telemetry attempt). May flip an item
    the probe shows to be observable to `fail` ("observable but not observed")."""
    result = []
    for item in items:
        if item.get("status") != "unverifiable":
            result.append(item)
            continue
        item = dict(item)
        attempts = [a for a in (item.get("attempts") or []) if isinstance(a, dict) and a.get("step") in STEPS and a.get("step") != "tools"
                    and a.get("step") != "agent-help" and a.get("step") != "adversarial"]  # code owns tools/help/adversarial
        urls = item_urls(item)
        blocked = True
        probes = []
        for url in urls:
            probe = browser_probe(tree, url, out_dir, run, env)
            vision = vision_read(probe.get("screenshot"), out_dir, run, env, codex_cmd) if probe.get("ok") else None
            probes.append({"url": url, "status": probe.get("status"), "finalUrl": probe.get("finalUrl"), "error": probe.get("error"),
                           "vision": vision})
            blocked = blocked and looks_blocked(probe)
        if urls:
            summary = "; ".join(f"{p['url']} -> {p.get('status') or 'no response'} {p.get('finalUrl') or ''} "
                                f"{'vision: ' + p['vision'] if p.get('vision') else (p.get('error') or '')}".strip() for p in probes)
            attempts.append({"step": "tools", "result": "playwright+vision: " + summary[:400]})
        else:
            attempts.append({"step": "tools", "result": "no URL to load; HTTP/API reads and logs were tried by the verifier: "
                             + str(item.get("evidence") or "")[:200]})
        if urls and not blocked:
            item["status"] = "fail"
            item["evidence"] = ("observable but not observed: the page loads for the lane's own browser, so this is not "
                                "unverifiable. " + attempts[-1]["result"])[:600]
            item["attempts"] = attempts
            result.append(item)
            continue
        help_ = request_agent_help(linear, issue, item, urls, mesh_send)
        attempts.append({"step": "agent-help", "result": f"{help_['channel']} delivered={help_['delivered']} {help_.get('note', '')}".strip()})
        if item.get("kind") == "judgement" or item.get("capability") == "taste":
            review = adversarial_review(item, run, env, codex_cmd, out_dir)
            attempts.append({"step": "adversarial", "result": review["result"]})
        item["attempts"] = attempts
        result.append(item)
    return result


def required_steps(item: dict) -> tuple[str, ...]:
    return ("tools", "telemetry", "agent-help") + (("adversarial",) if item.get("kind") == "judgement" or item.get("capability") == "taste" else ())


def missing_steps(item: dict) -> list[str]:
    done = {a.get("step") for a in (item.get("attempts") or []) if isinstance(a, dict) and str(a.get("result") or "").strip()}
    return [step for step in required_steps(item) if step not in done]


def gap_for(issue: str, item: dict) -> dict:
    capability = item.get("capability") if item.get("capability") in CAPABILITIES else "other"
    owner, build = CAPABILITIES[capability]
    return {"issue": issue, "criterion": item["criterion"][:200], "capability": capability, "owner": owner, "build": build,
            "attempts": [f"{a['step']}: {a['result'][:120]}" for a in item.get("attempts") or []]}


def route_gaps(state: Path, linear, issue: dict, items: list[dict], now: float) -> list[dict]:
    """Record each unverifiable item as a capability gap (state ledger + one comment) so it gets built."""
    gaps = [gap_for(issue["identifier"], item) for item in items if item.get("status") == "unverifiable"]
    if not gaps:
        return []
    path = Path(state) / GAP_FILE
    try:
        book = json.loads(path.read_text())
        book = book if isinstance(book, dict) else {}
    except (OSError, ValueError):
        book = {}
    book[issue["identifier"]] = {"at": now, "gaps": gaps}
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(book, sort_keys=True))
    os.replace(tmp, path)
    lines = [GAP_MARKER, f"Outcome verification left {len(gaps)} item(s) unverifiable after escalation. Each is a missing capability, not a pass:"]
    for gap in gaps:
        lines.append(f"- {gap['criterion']}: needs {gap['capability']} ({gap['build']}); owner {gap['owner']}. Tried: "
                     + " | ".join(gap["attempts"]))
    try:
        linear.comment(issue["id"], "\n".join(lines))
    except Exception:  # noqa: BLE001 - the ledger entry stands
        pass
    return gaps
