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

import hashlib
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

STEPS = ("tools", "telemetry", "agent-help", "adversarial")
PROBE_TIMEOUT_S = 120
VISION_TIMEOUT_S = 600
HELP_MARKER = "<!-- outcome-help-request:v1"
GAP_MARKER = "<!-- outcome-capability-gap:v1 -->"
GAP_FILE = "outcome-gaps.json"
GATEWAY_ENV = Path(os.environ.get("AI_GATEWAY_LANE_ENV", Path.home() / ".config/jovie-lanes/ai-gateway.env"))
# Measured 2026-10-25 on 12 real and seeded verdict items (supported / contradicted / insufficient):
# openai/gpt-6.1-sol 9/12 correct at $0.0013 per correct verdict, 3.2s; zai/glm-5.3 7/12 at $0.0073, 13.8s.
# A different family from the codex verifier. LANES_OUTCOME_ADVERSARIAL_MODEL=off disables it.
DEFAULT_ADVERSARIAL_MODEL = "openai/gpt-6.1-sol"
REPLY_PRICE = {"openai/gpt-6.1-sol": (2e-6, 1e-5), "zai/glm-5.3": (1.2e-6, 4e-6)}
VERDICTS = ("supported", "contradicted", "insufficient")
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


def request_agent_help(linear, issue: dict, item: dict, urls: list[str], mesh_send=None, corr: str = "") -> dict:
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
        linear.comment(issue["id"], f"<!-- outcome-help-request:v1 corr={corr} -->\nHelp requested from an agent with the capability "
                       f"(Summer, Instinct or the golden-path owner):\n\n> {question}\n\nReply to this comment, or quote `corr:{corr}` "
                       f"in a new one. The next outcome verification re-evaluates the item from your reply.\n({mesh_note})")
        return {"channel": "linear-comment", "delivered": True, "ref": corr, "note": mesh_note}
    except Exception as error:  # noqa: BLE001
        return {"channel": "none", "delivered": False, "note": f"{mesh_note}; linear failed: {type(error).__name__}"}


def gateway_key() -> str | None:
    key = os.environ.get("AI_GATEWAY_API_KEY", "").strip()
    if key:
        return key
    try:
        for line in GATEWAY_ENV.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip() in ("AI_GATEWAY_API_KEY", "export AI_GATEWAY_API_KEY") and value.strip():
                return value.strip().strip("'\"")
    except OSError:
        pass
    return None


def adversarial_model() -> str | None:
    model = os.environ.get("LANES_OUTCOME_ADVERSARIAL_MODEL", DEFAULT_ADVERSARIAL_MODEL).strip()
    return None if model.lower() in ("", "off", "0", "false") else model


def _gateway_host() -> str:
    scripts = str(Path(__file__).resolve().parents[1])
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    from apiclient.contract import provider_spec
    return provider_spec("ai-gateway")["hosts"][0]


def _gateway_request(body: bytes, key: str, timeout: int):
    """POST through the shared client layer (budget, breaker, backoff; host from the provider contract) and return the
    parsed JSON. `urlopen` below is a test seam only."""
    scripts = str(Path(__file__).resolve().parents[1])
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    from apiclient import ApiClient
    from apiclient.contract import provider_spec
    url = f"https://{provider_spec('ai-gateway')['hosts'][0]}/v1/chat/completions"
    client = ApiClient("ai-gateway", key, authorize=lambda headers: headers.update({"Authorization": "Bearer " + key}))
    response = client.request(url, method="POST", headers={"Content-Type": "application/json"}, body=body.decode(),
                              priority="report", timeout_ms=timeout * 1000)
    if response.status >= 400:
        raise RuntimeError(f"gateway HTTP {response.status}")
    return response.json()


def gateway_judge(question: str, model: str, urlopen=None, timeout: int = 90) -> dict:
    """One strict three-way verdict from a model of another family through the AI Gateway."""
    key = gateway_key()
    if not key:
        return {"ran": False, "result": f"unavailable: no AI Gateway key on this host ({GATEWAY_ENV})"}
    prompt = ("You are an adversarial reviewer from a different model family than the verifier. Answer with JSON only: "
              '{"verdict":"supported"|"contradicted"|"insufficient","reason":"<one sentence>"}. supported = the evidence directly '
              "proves the criterion; contradicted = it shows the criterion is false; insufficient = it establishes neither.\n" + question)
    body = json.dumps({"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0,
                       "max_tokens": 2000}).encode()
    try:
        if urlopen is None:
            data = _gateway_request(body, key, timeout)
        else:
            request = urllib.request.Request(f"https://{_gateway_host()}/v1/chat/completions", body,
                                             {"Authorization": "Bearer " + key, "Content-Type": "application/json"})
            with urlopen(request, timeout=timeout) as response:
                data = json.load(response)
        text = data["choices"][0]["message"]["content"]
        parsed = json.loads(text[text.index("{"):text.rindex("}") + 1])
        verdict = parsed.get("verdict")
        if verdict not in VERDICTS:
            raise ValueError("verdict outside the contract")
    except Exception as error:  # noqa: BLE001 - the attempt and its failure are the record
        return {"ran": False, "result": f"{model} failed: {type(error).__name__}: {str(error)[:80]}"}
    usage = data.get("usage") or {}
    price = REPLY_PRICE.get(model, (0, 0))
    cost = usage.get("prompt_tokens", 0) * price[0] + usage.get("completion_tokens", 0) * price[1]
    return {"ran": True, "verdict": verdict, "costUsd": round(cost, 5),
            "result": f"{model}: {verdict} - {str(parsed.get('reason') or '')[:160]} (${cost:.4f})"}


def adversarial_review(item: dict, run=None, env=None, codex_cmd=None, out_dir=None, urlopen=None) -> dict:
    """A different-family model reviews a judgement item from the recorded evidence."""
    model = adversarial_model()
    if model is None:
        return {"ran": False, "result": "disabled (LANES_OUTCOME_ADVERSARIAL_MODEL=off)"}
    return gateway_judge(f"Criterion: {item['criterion']}\nEvidence: {item.get('evidence')}", model, urlopen=urlopen)


def correlation_id(issue_id: str, item: dict, sha: str = "") -> str:
    return "oh-" + hashlib.sha1(f"{issue_id}|{item['criterion']}|{sha}".encode()).hexdigest()[:10]


def find_help(comments: list[dict], corr: str) -> dict | None:
    """The help request carrying `corr` and the replies to it (child comments or comments quoting `corr:<id>`)."""
    nodes = sorted(comments or [], key=lambda c: c.get("createdAt") or "")
    request = next((c for c in nodes if HELP_MARKER in (c.get("body") or "") and f"corr={corr}" in (c.get("body") or "")), None)
    if request is None:
        return None
    replies = [c for c in nodes if c is not request and (c.get("createdAt") or "") >= (request.get("createdAt") or "")
               and HELP_MARKER not in (c.get("body") or "") and GAP_MARKER not in (c.get("body") or "")
               and ((c.get("parent") or {}).get("id") == request.get("id") or f"corr:{corr}" in (c.get("body") or ""))]
    return {"request": request, "replies": replies}


def evaluate_reply(item: dict, reply_text: str, urlopen=None) -> dict:
    """Re-evaluate an item from an agent's reply (strict: a reply that only asserts is insufficient)."""
    model = adversarial_model() or DEFAULT_ADVERSARIAL_MODEL
    return gateway_judge(f"Criterion: {item['criterion']}\nWhy the verifier could not observe it: {item.get('evidence')}\n"
                         f"Another agent that has the capability replied: {reply_text[:1500]}\n"
                         "Judge the criterion from the reply only if it reports concrete observed state.", model, urlopen=urlopen)


def escalate(items: list[dict], *, tree: Path, out_dir: Path, run, env: dict, codex_cmd: list[str], linear, issue: dict,
             mesh_send=None, sha: str = "", urlopen=None) -> list[dict]:
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
        corr = correlation_id(issue["id"], item, sha)
        item["helpCorr"] = corr
        found = find_help((issue.get("comments") or {}).get("nodes") or [], corr)
        if found and found["replies"]:
            # The loop closes without the mesh: an earlier help request got a reply, so re-evaluate from it.
            reply = found["replies"][-1]
            who = (reply.get("user") or {}).get("name") or "an agent"
            verdict = evaluate_reply(item, reply.get("body") or "", urlopen=urlopen)
            attempts.append({"step": "agent-help", "result": f"reply from {who} to {corr}: {verdict['result']}"})
            if verdict.get("verdict") == "supported":
                item["status"] = "pass"
                item["evidence"] = f"observed by {who} at the lane's request ({corr}): {(reply.get('body') or '')[:360]}"
            elif verdict.get("verdict") == "contradicted":
                item["status"] = "fail"
                item["evidence"] = f"contradicted by {who}'s observation ({corr}): {(reply.get('body') or '')[:360]}"
        elif found:
            attempts.append({"step": "agent-help", "result": f"requested {found['request'].get('createdAt')} ({corr}); no reply yet, not re-posted"})
        else:
            help_ = request_agent_help(linear, issue, item, urls, mesh_send, corr=corr)
            attempts.append({"step": "agent-help", "result": f"{help_['channel']} delivered={help_['delivered']} corr={corr} {help_.get('note', '')}".strip()})
        if item.get("kind") == "judgement" or item.get("capability") == "taste":
            review = adversarial_review(item, urlopen=urlopen)
            attempts.append({"step": "adversarial", "result": review["result"]})
            if review.get("verdict") == "contradicted" and item["status"] == "unverifiable":
                item["status"] = "fail"
                item["evidence"] = "contradicted by the adversarial reviewer: " + review["result"]
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
            "evidence": str(item.get("evidence") or "")[:300], "helpCorr": item.get("helpCorr"),
            "attempts": [f"{a['step']}: {a['result'][:120]}" for a in item.get("attempts") or []]}


def route_gaps(state: Path, linear, issue: dict, items: list[dict], now: float, sha: str = "", episode: str | None = None) -> list[dict]:
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
    book[issue["identifier"]] = {"at": now, "sha": sha, "episode": episode, "gaps": gaps}
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


HELP_ISSUE_QUERY = ("query($id:String!){issue(id:$id){id identifier state{name} "
                    "comments(last:50){nodes{id body createdAt parent{id} user{name}}}}}")
RESOLUTION_MARKER = "<!-- outcome-help-resolution:v1 -->"


def read_gaps(state: Path) -> dict:
    try:
        data = json.loads((Path(state) / GAP_FILE).read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def followup_replies(state: Path, linear, now: float, limit: int = 15, urlopen=None) -> list[dict]:
    """Close help loops between verifications: for each gap with an open help request, read the issue's
    comments, and when a reply arrived re-evaluate the item. Supported or contradicted resolves the gap
    (comment + ledger). Returns the resolutions so the caller can act on a contradiction."""
    book = read_gaps(state)
    resolved, checked = [], 0
    for ident, record in sorted(book.items()):
        for gap in record.get("gaps") or []:
            if not gap.get("helpCorr") or gap.get("resolved") or checked >= limit:
                continue
            checked += 1
            row = linear.gql(HELP_ISSUE_QUERY, {"id": ident}).get("issue")
            if not row:
                continue
            found = find_help((row.get("comments") or {}).get("nodes") or [], gap["helpCorr"])
            if not found or not found["replies"]:
                continue
            reply = found["replies"][-1]
            if reply.get("id") and reply["id"] == gap.get("lastReplyId"):
                continue  # already judged insufficient
            who = (reply.get("user") or {}).get("name") or "an agent"
            verdict = evaluate_reply({"criterion": gap["criterion"], "evidence": gap.get("evidence")}, reply.get("body") or "",
                                     urlopen=urlopen)
            gap["lastReplyId"] = reply.get("id")
            if verdict.get("verdict") in ("supported", "contradicted"):
                gap["resolved"] = {"at": now, "verdict": verdict["verdict"], "by": who, "result": verdict["result"]}
                try:
                    linear.comment(row["id"], f"{RESOLUTION_MARKER}\nCapability gap resolved from {who}'s reply to {gap['helpCorr']}: "
                                   f"**{verdict['verdict']}** for \"{gap['criterion']}\". {verdict['result']}")
                except Exception:  # noqa: BLE001 - the ledger entry stands
                    pass
                resolved.append({"issue": ident, "gap": gap, "state": (row.get("state") or {}).get("name"),
                                 "sha": record.get("sha"), "episode": record.get("episode"), "verdict": verdict["verdict"],
                                 "issueId": row["id"]})
    if checked:
        tmp = (Path(state) / GAP_FILE).with_suffix(".tmp")
        tmp.write_text(json.dumps(book, sort_keys=True))
        os.replace(tmp, Path(state) / GAP_FILE)
    return resolved
