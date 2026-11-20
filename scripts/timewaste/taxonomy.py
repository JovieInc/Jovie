"""Categories, human-only vs automatable classes, the classifier and the minutes heuristic.

North star: human_only_pct = minutes on HUMAN_ONLY categories / all Tim minutes (this week). A message the
classifier cannot place counts in the denominator only, so the number is conservative.

Minutes per event (documented heuristic, calibrated where timestamps allow):
  heuristic = CONTEXT_SWITCH + chars / TYPE_CPM + THINK_FLOOR[category]
  measured  = gap between the previous assistant/tool entry and Tim's prompt (read + think + type), used when
              0.05 <= gap <= AWAY_MIN minutes; a longer gap means Tim was away and the heuristic applies.
`calibration()` reports measured/heuristic per category so the floors can be re-tuned from data.
"""
from __future__ import annotations

import re
import statistics
from collections import defaultdict

HUMAN_ONLY, AUTOMATABLE, STEERING = "human_only", "automatable", "steering"

# category -> (class, label, think-floor minutes)
CATEGORIES: dict[str, tuple[str, str, float]] = {
    "taste_call": (HUMAN_ONLY, "Taste call", 0.4),
    "new_direction": (HUMAN_ONLY, "New direction / vision", 0.6),
    "outbound": (HUMAN_ONLY, "Outbound relationship", 0.7),
    "spend_legal": (HUMAN_ONLY, "Spend / legal", 0.3),
    "status_ask": (AUTOMATABLE, "Status ask", 0.2),
    "chase_stalled": (AUTOMATABLE, "Chasing stalled work", 0.3),
    "re_explanation": (AUTOMATABLE, "Re-explaining a given rule", 0.5),
    "correction": (AUTOMATABLE, "Correction", 0.4),
    "verify_ask": (AUTOMATABLE, "Verify-it-for-me ask", 0.3),
    "slop_flag": (AUTOMATABLE, "Flagged slop a machine should catch", 0.3),
    "copy_number_update": (AUTOMATABLE, "Copy / number update", 0.2),
    "approval": (AUTOMATABLE, "Approval a policy could grant", 0.3),
    "github_review": (AUTOMATABLE, "GitHub review", 3.0),
    "github_merge": (AUTOMATABLE, "GitHub merge", 0.5),
    "github_label": (AUTOMATABLE, "GitHub label change", 0.2),
    "linear_triage": (AUTOMATABLE, "Linear triage / assign / complete", 0.5),
    "delegation": (STEERING, "Delegating work", 0.2),
    "unclassified": (STEERING, "Unclassified", 0.2),
}
CONTEXT_SWITCH, TYPE_CPM, AWAY_MIN, MIN_GAP = 0.2, 220.0, 15.0, 0.05
CHAR_CAP = 1500  # beyond this a message is pasted material, not typed
SHORT_ONLY = frozenset({"status_ask", "chase_stalled", "verify_ask", "approval", "correction", "copy_number_update"})
SHORT_MAX = 400

_R = lambda p: re.compile(p, re.I)
# Order matters: first match wins. Patterns see lowercased message text; nothing is stored.
RULES: list[tuple[str, re.Pattern]] = [
    ("status_ask", _R(r"\b(fill me in|catch me up|where are we|what('?s| is) (the )?(status|state|going on)|what happened|any update|update me|how('?s| is) it going|status\b)")),
    ("chase_stalled", _R(r"\b(still (waiting|not|stuck)|stuck|stalled|why (hasn'?t|isn'?t|didn'?t)|did (it|that|this) (land|merge|ship)|not (merged|landed)|nothing (happened|merged)|hasn'?t (landed|merged))")),
    ("verify_ask", _R(r"(is (this|that|it) (a )?bug|is that (right|correct|real)|did you (check|verify|test|look)|can you (verify|check|confirm)|does (it|this) (actually )?work|are you sure|double.?check)")),
    ("slop_flag", _R(r"(slop|misalign|not aligned|alignment|misspell|typo|text on text|oversized|cliche|off.?brand|looks? (cheap|bad|off|wrong)|inconsisten)")),
    ("re_explanation", _R(r"(i (already )?(said|told you|asked)|as i (said|mentioned)|\bagain\b|summer should (run|own|do|be)|execution on gem|should (be )?(running|run|executed) on gem|always (ship|run|do|use)|never (ask|wait|stop)|remember (that|to)|you should be (doing|making)|if you.?re doing your job|run the show)")),
    ("correction", _R(r"(^(no|nope|wrong|not that)\b|that'?s (wrong|not|incorrect)|i meant|one correction|not what i|you (missed|forgot|broke)|that is not|\bactually\b)")),
    ("copy_number_update", _R(r"\b(change (the )?(copy|text|number|price|wording)|rename|update (the )?(copy|number|price|text)|wording)\b")),
    ("spend_legal", _R(r"(\$\s?\d|\bpric(e|ing)|\bbudget|\bcredits?\b|contract|\blegal\b|invoice|\bspend\b|subscription|purchase|\bcosts?\b|\bpay(ing|ment)?\b)")),
    ("outbound", _R(r"\b(outreach|reach out|investors?|intro(duce)?|customers?|partners?|press|announce|hiring|recruit|email (to|them))\b")),
    ("approval", _R(r"^(yes|yep|yeah|ok(ay)?|done|do it|go|ship it|approved?|sure|sounds good|lgtm|good|cool|fine|go ahead)\b")),
    ("taste_call", _R(r"(\[image|\blooks?\b|\bfeel|spacing|clean up|clutter|\bugly|premium|design|too (big|small|much)|less noise|clarity|\bfont|colou?r|polish|\bvibe|\bcard\b|layout|padding|right rail|copy\b)")),
    ("new_direction", _R(r"\b(goal|vision|strategy|we should|i want|i think we|jovie is|launch|priorit|focus|pivot|roadmap|north star|the plan)\b")),
]


def classify(text: str) -> str:
    """Category label only; the text is never returned or stored."""
    t = (text or "").strip().lower()
    if not t:
        return "unclassified"
    if len(t) <= 40:
        for cat, rx in RULES:
            if cat == "approval" and rx.search(t):
                return cat
    for cat, rx in RULES:
        if cat in SHORT_ONLY and len(t) > SHORT_MAX:
            continue
        if rx.search(t):
            return cat
    return "delegation" if len(t) >= 12 else "unclassified"


def cls_of(category: str) -> str:
    return CATEGORIES.get(category, CATEGORIES["unclassified"])[0]


def heuristic_minutes(category: str, chars: int = 0) -> float:
    floor = CATEGORIES.get(category, CATEGORIES["unclassified"])[2]
    return round(CONTEXT_SWITCH + min(max(0, chars), CHAR_CAP) / TYPE_CPM + floor, 2)


def minutes_for(category: str, chars: int = 0, gap_min: float | None = None) -> tuple[float, bool]:
    """(minutes, measured). Measured gap wins when plausible; otherwise the heuristic."""
    if gap_min is not None and MIN_GAP <= gap_min <= AWAY_MIN:
        return round(gap_min, 2), True
    return heuristic_minutes(category, chars), False


def calibration(events: list[dict]) -> dict:
    """Per category: n measured, median measured minutes, median heuristic for the same events, ratio."""
    by: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for e in events:
        if e.get("measured") and e.get("heuristic") is not None:
            by[e["category"]].append((e["minutes"], e["heuristic"]))
    out = {}
    for cat, pairs in by.items():
        m, h = statistics.median(p[0] for p in pairs), statistics.median(p[1] for p in pairs)
        out[cat] = {"n": len(pairs), "measuredMedian": round(m, 2), "heuristicMedian": round(h, 2),
                    "ratio": round(m / h, 2) if h else None}
    return out


def summarize(events: list[dict]) -> dict:
    """Aggregate events -> minutes by category/class and the north-star percentage."""
    cats: dict[str, dict] = {}
    for e in events:
        c = cats.setdefault(e["category"], {"minutes": 0.0, "events": 0})
        c["minutes"] += e["minutes"]
        c["events"] += 1
    total = sum(c["minutes"] for c in cats.values())
    human = sum(c["minutes"] for k, c in cats.items() if cls_of(k) == HUMAN_ONLY)
    auto = sum(c["minutes"] for k, c in cats.items() if cls_of(k) == AUTOMATABLE)
    rows = [{"id": k, "label": CATEGORIES.get(k, CATEGORIES["unclassified"])[1], "class": cls_of(k),
             "minutes": round(v["minutes"], 1), "events": v["events"]} for k, v in cats.items()]
    rows.sort(key=lambda r: -r["minutes"])
    return {"totalMinutes": round(total, 1), "humanOnlyMinutes": round(human, 1),
            "automatableMinutes": round(auto, 1),
            "humanOnlyPct": round(100 * human / total, 1) if total else None,
            "automatablePct": round(100 * auto / total, 1) if total else None, "categories": rows}


def trim_overlap(events: list[dict]) -> list[dict]:
    """Tim cannot be in two places: an event's interval is [ts - minutes, ts]; clip each to start after the
    previous event's end so overlapping sources (a session prompt and a text reply) are not double counted."""
    out, prev_end = [], 0.0
    for e in sorted(events, key=lambda x: x["ts"]):
        start = max(e["ts"] - e["minutes"] * 60, prev_end)
        minutes = max(0.0, (e["ts"] - start) / 60)
        out.append({**e, "rawMinutes": e["minutes"], "minutes": round(minutes, 2)})
        prev_end = max(prev_end, e["ts"])
    return out
