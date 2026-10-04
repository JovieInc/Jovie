"""Workstream model for lane admission (JOV-7514 / JOV-7330 / JOV-7423 / JOV-5555).

One deterministic classifier shared by the dispatcher (`lane_runner.pick_issue`),
the doctor/HUD admission census, and the Linear backlog grouping, so new intake and
the existing backlog follow the same rule:

* every issue belongs to exactly one workstream: an explicit `ws:<key>` Linear label
  wins, otherwise the first matching rule in RULES (topical label or title), otherwise `general`;
* workstreams are ranked so compounding infrastructure goes first: CI, then Symphony
  throughput, then the rest by impact (RANK);
* issues whose normalized titles collide are one unit of work: only the canonical
  (oldest) member is admitted, the rest are rejected as `duplicate-candidate:<JOV>`.

Pure stdlib, no I/O: safe to import from the lane runner, doctor and tests.
"""
from __future__ import annotations

import re

LABEL_PREFIX = "ws:"

# Dispatch rank: lower runs first.  Compounding infrastructure leads (every CI or
# throughput fix multiplies every later landing), then user-facing impact.
RANK: tuple[tuple[str, str], ...] = (
    ("ci", "CI, merge queue & test infrastructure"),
    ("symphony-throughput", "Symphony throughput & agent fleet"),
    ("release-deploy", "Release, deploy & production control"),
    ("reliability", "Production errors & stability"),
    ("security-auth", "Security, auth & billing guardrails"),
    ("ui-ia", "UI polish, jank & information architecture"),
    ("native-apps", "iOS, macOS & desktop apps"),
    ("chat-agent", "Chat & agent experience"),
    ("ovie-ops", "Ovie, HUD & founder operations"),
    ("profiles-marketing", "Profiles, links & marketing surfaces"),
    ("library-content", "Library, releases & content"),
    ("analytics-gtm", "Analytics, GTM & revenue"),
    ("docs-changelog", "Changelog, help & docs"),
    ("lyb", "LogYourBody"),
    ("memory-gbrain", "GBrain, memory & knowledge"),
    ("general", "General product backlog"),
    ("human-decision", "Founder decisions & human-only tasks"),
)
KEYS = tuple(key for key, _ in RANK)
NAMES = dict(RANK)
RANK_INDEX = {key: index for index, key in enumerate(KEYS)}
COMPOUNDING = frozenset({"ci", "symphony-throughput"})


def _re(pattern: str) -> re.Pattern:
    return re.compile(pattern, re.IGNORECASE)


# (key, labels, title pattern).  Classification precedence differs from dispatch rank:
# human-only work and the separate LYB product are recognised before topical rules.
RULES: tuple[tuple[str, frozenset, re.Pattern | None], ...] = (
    ("human-decision",
     frozenset({"tim-action-required", "needs-human", "needs:human", "human-review-required",
                "needs:taste", "tim-action", "quality-gap:needs-tim"}),
     _re(r"^\s*(tim[:\s-]|decide\b|decision needed|taste:)|tim[- ]action")),
    ("lyb", frozenset({"lyb", "logyourbody", "area:lyb"}), _re(r"\b(lyb|logyourbody|log your body)\b")),
    ("ci",
     frozenset({"ci-nightly", "flaky-test", "ci-stability", "merge-queue"}),
     _re(r"\bci\b|merge[- ]queue|\bflak|knip|playwright|\be2e\b|nightly|typecheck|\blint|eslint|biome|"
         r"pre-push|pre-commit|test (?:suite|harness|infra)|unit tests?|test infra|github actions|workflow (?:run|file|fail)|workflows? fail|\.ya?ml\b|"
         r"\bvitest|\bjest\b|storybook|lighthouse|check runs?|required check|turbo cache|build cache|"
         r"exact-head|stabilize manual|fleet gate|\bpr gate|actionlint|test fixture|fixture timeout")),
    ("symphony-throughput",
     frozenset({"area:symphony", "area:lanes", "throughput-investigation"}),
     _re(r"symphony|\blanes?\b|\bgem\b|admission|dispatch|\bfleet\b|leverage-first|summer governor|throughput|"
         r"\bcodex\b|\bdevin\b|hyperagent|agent ?os\b|linear in progress|in progress (?:liveness|lease)|"
         r"\blease|dedup|backlog hygiene|control[- ]plane|singleflight|worker (?:slot|lane)|autofix|"
         r"fix loop|shipping bottleneck|native queue|\bmq\b|stacked pr|rebase #|concurrency")),
    ("release-deploy",
     frozenset({"area:release", "area:deploy"}),
     _re(r"production controller|\bdeploy|release (?:train|pipeline|gate|stamp)|\bstaging\b|promot(e|ion)|"
         r"rollback|canary|vercel|preview (?:deploy|env)|feature flag|statsig|desktop update|testflight|"
         r"artifact freshness|break-glass|\bversion manifest|bump version|signed release")),
    ("security-auth",
     frozenset({"security", "secrets", "blocked:auth", "area:billing", "stripe"}),
     _re(r"security|\bauth\b|authn|authz|clerk|oauth|\bcsp\b|credential|secret|\bcsrf|\bxss|"
         r"rate[- ]limit|permission|\brls\b|stripe|billing|webhook signature|passkey|phishing|"
         r"sign-?in\b|sign-?out|active sessions|session (?:revoc|hijack|token)|dmarc|\bspf\b|account deletion|reauth")),
    ("reliability",
     frozenset({"stability-audit", "incident", "sentry", "observability"}),
     _re(r"^\s*\w*error\b|\b\w+error:|timed? ?out|timeout|upstash|redis|sentry|crash|exception|"
         r"\b5\d\d\b|regression|memory leak|unhandled|stability|performance|\bslow\b|latency|n\+1|"
         r"failed query|degraded|blocking operation|low-value spans|cron failure|synthetic monitoring|"
         r"\bquery\b.*\bindex|seq(?:uential)? scan|neon|database")),
    ("native-apps",
     frozenset({"area:ios", "area:mac", "area:desktop", "ios", "macos", "desktop", "swift", "electron"}),
     _re(r"\bios\b|macos|\bmac\b|desktop|swift|xcode|\bwidget|app intent|iphone|ipad|electron|tauri|"
         r"jovie ?mac|xcuitest|app store")),
    ("ui-ia",
     frozenset({"area:ui", "ui", "polish", "ux", "design-system", "category:ui-ux", "category:app-shell",
                "ui-nav", "a11y", "accessibility", "design", "jank", "ia", "ds-drift", "theme",
                "stream:ux-0-drift", "qa:a11y"}),
     _re(r"\bjank|\bia\b|information architecture|navigation|\bnav\b|design (?:invariant|system|token)|"
         r"canonicali[sz]|layout|spacing|density|sidebar|\bshell\b|visual|scroll|tap target|responsive|"
         r"dark mode|light mode|accessib|\baxe\b|\bfocus\b|tooltip|modal|drawer|dropdown|button|"
         r"\bicon|typography|\bfont|empty state|skeleton|loading state|toast|animation|hover|"
         r"\btab\b|tabs\b|header|footer|breadcrumb|\bui\b|\bux\b|pixel|align|overflow|truncat|\bcss\b|"
         r"\bpen\b|\batoms?\b|44px|wcag|toolbar|chrome|polish|optical|motion|\bdial\b|"
         r"route bod|story|stories|splash|wordmark|\blogo\b|\btheme")),
    ("chat-agent", frozenset({"area:chat"}),
     _re(r"\bchat|composer|transcript|assistant|\bvoice\b|\bprompt|conversation|\bllm\b|tool call|"
         r"promptfoo|\bjev\b|\bai\b|model router|skill")),
    ("ovie-ops", frozenset({"area:ovie", "hud"}),
     _re(r"\bovie?\b|\bhud\b|founder|\badmin\b|\binbox|cockpit|\bops\b|operator|mission control|"
         r"\bsummer\b|\beve\b|\bzoe\b|missed work|agent improvement|quiet hours|kanban|postmortem|"
         r"post-mortem|company|investor|cfo|fundrais|department agent")),
    ("profiles-marketing",
     frozenset({"area:profile", "area:marketing", "seo", "area:links", "stream:homepage-lander"}),
     _re(r"profile|smart ?links?|\blinks? page|homepage|landing|lander|marketing|\bseo\b|\bblog\b|"
         r"\bpress\b|\bpitch\b|og image|open graph|json-ld|schema\.org|sitemap|public page|claim flow|"
         r"artist[- ]site|solutions?\b|waitlist|signup|onboarding|share preview")),
    ("library-content", frozenset({"area:library"}),
     _re(r"library|\basset|youtube|thumbnail|release planner|catalog|\bmerch|playlist|spotify|"
         r"apple music|\btrack|\balbum|\bsongs?\b|\bdsp\b|artwork|upload|release|lyrics|now-playing|"
         r"player\b|storefront|\bdrop\b")),
    ("analytics-gtm", frozenset({"gtm"}),
     _re(r"analytics|\bmetrics?\b|\bgtm\b|fundrais|revenue|\bmrr\b|pricing|conversion|"
         r"funnel|experiment|outreach|\bcrm\b|posthog|attribution|retention|cust(?:omer)? cert|"
         r"certification|dogfood|retarget|competitor|\bspend credit")),
    ("docs-changelog", frozenset({"docs", "documentation", "changelog", "area:docs"}),
     _re(r"changelog|help center|what'?s new|\bdocs?\b|documentation|readme|\bfaq\b|runbook|"
         r"docs-recert|user guide|\bcli\b|\bnpm\b|\bmcp\b")),
    ("memory-gbrain", frozenset({"gbrain"}),
     _re(r"gbrain|\bmemory\b|knowledge base|\bbrain\b|embedding|\brag\b")),
)


def explicit(labels) -> str | None:
    """A `ws:<key>` label is an explicit, reversible human override."""
    for label in labels or ():
        name = str(label).strip().lower()
        if name.startswith(LABEL_PREFIX) and name[len(LABEL_PREFIX):] in RANK_INDEX:
            return name[len(LABEL_PREFIX):]
    return None


def classify(title: str, labels=()) -> str:
    """Exactly one workstream key per issue; deterministic and side-effect free."""
    override = explicit(labels)
    if override:
        return override
    lowered = {str(label).strip().lower() for label in labels or ()}
    # Rule order decides; within a rule a topical label or a title match both count.
    # Intake/routing labels (symphony, agent-ready, codex, ci-on-every-infra-issue)
    # are deliberately not topical signals.
    for key, names, pattern in RULES:
        if names & lowered or (pattern is not None and pattern.search(title or "")):
            return key
    return "general"


def rank(key: str) -> int:
    return RANK_INDEX.get(key, RANK_INDEX["general"])


def compounding(key: str) -> bool:
    return key in COMPOUNDING


# Only conventional type/priority prefixes are noise; bracketed tags such as
# `[web-053]` are identity and are kept.
_BRACKETS = re.compile(r"^\s*(?:(?:p[0-4]|bug|feat|fix|chore|task)\s*[:\-]\s*)+", re.IGNORECASE)
_PUNCT = re.compile(r"[^a-z0-9]+")


def normalize_title(title: str) -> str:
    """Duplicate identity: case, punctuation, type prefixes and whitespace do not matter.

    Deliberately exact after normalization; near-duplicates are grouped by workstream,
    never auto-merged (a false duplicate silently drops work)."""
    text = _BRACKETS.sub("", title or "").lower()
    return " ".join(_PUNCT.sub(" ", text).split())


def _identifier_number(identifier: str) -> int:
    match = re.search(r"(\d+)$", identifier or "")
    return int(match.group(1)) if match else 1 << 62


def duplicate_of(issues, created=lambda issue: issue.created_at) -> dict[str, str]:
    """identifier -> canonical identifier for exact normalized-title collisions.

    Canonical is the oldest issue (createdAt, then lowest number).  Titles that
    normalize to fewer than 3 words are never collapsed (too generic to be identity)."""
    groups: dict[str, list] = {}
    for issue in issues:
        key = normalize_title(issue.title)
        if len(key.split()) >= 3:
            groups.setdefault(key, []).append(issue)
    result = {}
    for members in groups.values():
        if len(members) < 2:
            continue
        members.sort(key=lambda issue: (created(issue) or "", _identifier_number(issue.identifier)))
        for issue in members[1:]:
            result[issue.identifier] = members[0].identifier
    return result
