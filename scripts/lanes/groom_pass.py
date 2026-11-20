#!/usr/bin/env python3
"""(Label retired 2026-10-29: admission no longer needs `agent-ready`; a ready verdict only comments.) Readiness pass: a cheap model judges groomed-but-unlabelled Backlog issues against the refill's agent-ready bar.

  groom_pass.py select N [--teams JOV,LYB] > cands.json     ranked candidates (backlog_rank order), never held/epic
  groom_pass.py judge cands.json > verdicts.json            one single-turn model call per issue, no tools
Writes nothing to Linear; the caller applies verdicts (label + one-line rationale, or a missing-info comment).
"""
import json, os, subprocess, sys, tempfile, time
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import backlog_rank, binding_refill

STATE = Path.home() / ".local/state/jovie-lanes"
BAR = """An issue is AGENT-READY only if ALL hold:
1. Scope: one reviewable PR (small/medium). Not an epic, program, research spike, or multi-PR roadmap.
2. Acceptance: there are concrete, checkable outcomes a CI test, typecheck, script or repo diff can prove.
3. No human gate: it does not need Tim's taste/product/pricing/medical-claims decision, real credentials or secrets, device/runtime/production observation, outbound messages to real people, or an external account action.
4. No unresolved blocker: it does not wait on another open issue, an approval, or an external event.
5. Safe to start from the text alone: no missing information an engineer would have to ask a human for.
Be conservative: when unsure, answer not_ready and name exactly what is missing."""

CHECKED_LABEL = "readiness-checked"
MODEL = "grok-4.7"


def apply(state, verdicts, outbox_enqueue=None):
    """Queue the Linear writes for judged issues through the outbox (readback, retry, never overwrites a
    remote decision). ready: one-line rationale comment (no label). not_ready: comment exactly what is
    missing. Both: label readiness-checked so the pass never re-reads the same issue. Errors write nothing."""
    import linear_sync
    enqueue = outbox_enqueue or (lambda op, issue_id, **kw: linear_sync.enqueue(Path(state), op, issue_id, **kw))
    rows = {}
    for team in ("JOV", "LYB"):
        for row in json.load(open(Path(state) / f"linear/mirror-{team}.json"))["issues"].values():
            rows[row["identifier"]] = row
    done = []
    for verdict in verdicts:
        row = rows.get(verdict.get("id"))
        if not row or verdict.get("verdict") not in ("ready", "not_ready"):
            continue
        if verdict["verdict"] == "ready":
            enqueue("comment", row["id"], body=f"Readiness pass ({verdict.get('model', MODEL)}): agent-ready. {verdict['rationale']}")
        elif row["priority"] in (1, 2):  # only Urgent/High earn a comment; the rest are labelled silently so 400 bots-notes never hit the team
            missing = "\n".join(f"- {item}" for item in verdict.get("missing") or [verdict["rationale"]])
            enqueue("comment", row["id"], body=f"Readiness pass ({verdict.get('model', MODEL)}): not agent-ready yet. {verdict['rationale']}\n\nMissing:\n{missing}")
        enqueue("label", row["id"], body=CHECKED_LABEL)
        done.append(verdict["id"])
    return done


def cands(n, teams, seed=None):
    now = time.time(); out = []
    for team in teams:
        rows = list(json.load(open(STATE / f"linear/mirror-{team}.json"))["issues"].values())
        open_ids = {r["identifier"] for r in rows}
        pool = [r for r in rows if r["state"] == "Backlog" and "agent-ready" not in [l.lower() for l in r["labels"]]
                and r.get("labelsComplete") and not ({l.lower() for l in r["labels"]} & (binding_refill.HOLD_LABELS | {CHECKED_LABEL}))
                and len(r["description"]) >= 200 and binding_refill.ACCEPTANCE.search(r["description"])]  # unlabelled is no longer a reason to judge
        out += [dict(r, score=backlog_rank.score(r, now)) for r in pool]
    out.sort(key=lambda r: -r["score"])
    if seed is not None:  # unbiased sample for precision measurement: top-ranked rows are the ones humans already held back
        import random
        return random.Random(seed).sample(out, min(n, len(out)))
    return out[:n]

def judge(row, tries=2):
    for attempt in range(tries):
        result = _judge(row)
        if result["verdict"] != "error":
            return result
    return result


def _judge(row):
    prompt = (f"{BAR}\n\nIssue {row['identifier']}: {row['title']}\nLabels: {', '.join(row['labels'])}\n"
              f"Priority: {row['priority']}\n---\n{row['description'][:5000]}\n---\n"
              'Do not use tools or read files. Reply with ONLY one JSON object: {"verdict":"ready"|"not_ready","rationale":"one line","missing":["specific item", ...]}')
    f = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False); f.write(prompt); f.close()
    env = dict(os.environ, PATH=str(Path.home() / ".grok/bin") + ":" + os.environ["PATH"])
    try:
        p = subprocess.run(["grok", "-m", "grok-4.7", "--tools", "", "--max-turns", "4", "--prompt-file", f.name],
                           capture_output=True, text=True, timeout=240, cwd=str(Path.home()), env=env)
        text = p.stdout
        a, b = text.find("{"), text.rfind("}")
        v = json.loads(text[a:b + 1])
        assert v["verdict"] in ("ready", "not_ready")
        return {"id": row["identifier"], "verdict": v["verdict"], "rationale": str(v.get("rationale", ""))[:300],
                "missing": v.get("missing") or [], "model": "grok-4.7"}
    except Exception as e:
        return {"id": row["identifier"], "verdict": "error", "error": f"{type(e).__name__}: {e}"[:200]}
    finally:
        os.unlink(f.name)

if __name__ == "__main__":
    if sys.argv[1] == "apply":
        print(json.dumps(apply(STATE, json.load(open(sys.argv[2])))))
    elif sys.argv[1] == "select":
        teams = (sys.argv[3] if len(sys.argv) > 3 else "JOV,LYB").split(",")
        seed = int(sys.argv[4]) if len(sys.argv) > 4 else None
        json.dump(cands(int(sys.argv[2]), teams, seed), sys.stdout)
    else:
        rows = json.load(open(sys.argv[2]))
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(3) as pool:  # 3 concurrent single-turn calls; grok is quota-limited, not seat-limited here
            json.dump(list(pool.map(judge, rows)), sys.stdout, indent=1)
