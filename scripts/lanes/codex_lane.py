#!/usr/bin/env python3
"""Codex as a shipping lane: one run = one leased ChatGPT account, its own CODEX_HOME.

  codex_lane.py run --prompt-file F [--cwd DIR]   # exec codex on an available account
  codex_lane.py status                            # JSON: every account's state (HUD, doctor)
  codex_lane.py health                            # exit 0 when at least one account is usable

Accounts are the ChatGPT-authenticated profiles under ~/.codex-accounts/<name>/auth.json
(the ones with OAuth tokens; API-key and adapter profiles are ignored). Exhaustion is read
from codex's own output ("hit your usage limit", "rate limit", 429) and stored with the
reset time codex reports, or a default cooldown when it reports none, so the lane never
burns a slot on an account that cannot answer and the HUD can show who is banked.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import math
import os
import re
import select
import subprocess
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

ACCOUNTS_ROOT = Path(os.environ.get("CODEX_ACCOUNTS_ROOT", Path.home() / ".codex-accounts"))
STATE = Path(os.environ.get("LANES_STATE", Path.home() / ".local/state/jovie-lanes")) / "codex-accounts.json"
DEFAULT_COOLDOWN_S = int(os.environ.get("CODEX_DEFAULT_COOLDOWN_S", 5 * 3600))
LIMIT = re.compile(r"usage limit|rate limit|too many requests|\b429\b|quota", re.I)
# A short burst limit (429 / "rate limit") backs off briefly and rotates; only a spent
# plan (usage limit / quota) banks the account until its reset.
USAGE = re.compile(r"usage limit|quota|insufficient", re.I)
RATE_BACKOFF_S = int(os.environ.get("CODEX_RATE_BACKOFF_S", 120))
ROTATE_PAUSE_S = float(os.environ.get("CODEX_ROTATE_PAUSE_S", 20))
# An account leased by another run is busy, not spent. On Gem (one current-login lease) three
# runs started within two minutes on 2026-10-11; the losers exited NO_ACCOUNT_EXIT, which the
# lane reads as provider failure: a fix attempt was charged and codex cooled down. A run now
# waits (bounded) for a busy lease; only exhausted accounts end it early.
LEASE_WAIT_S = int(os.environ.get("CODEX_LEASE_WAIT_S", 1800))
LEASE_POLL_S = float(os.environ.get("CODEX_LEASE_POLL_S", 15))
LEDGER_SCHEMA = "jovie.capacity-lease/v1"
LEDGER_CADENCE_S = 3600
EVIDENCE_MAX_AGE_S = 2 * 3600
AUTH = re.compile(r"not logged in|login required|unauthori[sz]ed|invalid.*(token|credential)|\b401\b", re.I)
# "Try again at 3:15 PM", "try again in 2 hours 5 minutes", "resets at 2026-09-27T01:00:00Z"
RESET_AT = re.compile(r"(?:try again|resets?|available)\s+(?:at|on)\s+([0-9T:\-\. ]+(?:AM|PM|Z)?)", re.I)
RESET_IN = re.compile(r"try again in\s+((?:\d+\s*(?:days?|hours?|hrs?|minutes?|mins?|seconds?|secs?|[dhms])\s*)+)", re.I)
IMMEDIATE_RESET = re.compile(r"(?:\b(?:rate|usage) limits?\b.{0,30}\b(?:reset|restored)\b|\b(?:reset|restored)\b.{0,30}\b(?:rate|usage) limits?\b)", re.I)
BANKED_GRANT = re.compile(r"\b(?:banked resets?|reset credits?|credits?\s+(?:for|to)\s+reset)\b", re.I)
UNASSERTED = re.compile(r"\b(?:if|would|could|might|may|hypothetical|proposal|considering)\b", re.I)
HISTORICAL = re.compile(r"\b(?:yesterday|last (?:week|month|year)|previously|historically)\b", re.I)
NEGATED = re.compile(r"\b(?:no|not|never|won't|will not|didn't|did not)\b", re.I)
NO_ACCOUNT_EXIT = 75  # EX_TEMPFAIL: the lane treats it as provider-error and cools down
PROVIDER_EVIDENCE_SCHEMA = "jovie-provider-lease/v1"
ACCOUNT_CLASS = "chatgpt-oauth"
CURRENT_LOGIN = "current-login"
SUBSCRIPTION_POOL = "subscription-pool"


def subscription_pool_mode() -> bool:
    return os.environ.get("CODEX_LANE_AUTH_MODE") == SUBSCRIPTION_POOL


def subscription_profiles() -> dict:
    """Explicit, identity-bound two-account configuration; never discover credentials."""
    if not subscription_pool_mode():
        return {}
    try:
        profiles = json.loads(os.environ.get("CODEX_LANE_SUBSCRIPTION_PROFILES", ""))
    except (ValueError, TypeError):
        raise ValueError("subscription profiles malformed") from None
    if not isinstance(profiles, dict) or len(profiles) != 2 or CURRENT_LOGIN not in profiles:
        raise ValueError("subscription pool requires current-login and one additional profile")
    result, homes, identities = {}, set(), set()
    current_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")).resolve()
    for name, profile in profiles.items():
        if not isinstance(name, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,39}", name):
            raise ValueError("subscription alias invalid")
        if not isinstance(profile, dict) or set(profile) != {"home", "slots", "emailSha256"}:
            raise ValueError("subscription profile fields invalid")
        home, slots, identity = profile["home"], profile["slots"], profile["emailSha256"]
        if not isinstance(home, str) or not Path(home).is_absolute():
            raise ValueError("subscription home must be absolute")
        home = str(Path(home).resolve())
        if not Path(home).is_dir():
            raise ValueError("subscription home unavailable")
        if type(slots) is not int or not 1 <= slots <= (3 if name == CURRENT_LOGIN else 1):
            raise ValueError("subscription slot limit invalid")
        if not isinstance(identity, str) or not re.fullmatch(r"[0-9a-f]{64}", identity):
            raise ValueError("subscription identity binding invalid")
        if name == CURRENT_LOGIN and (Path(home) != current_home or
                                     slots != int(os.environ.get("CODEX_LANE_LOGIN_SLOTS", "1"))):
            raise ValueError("current-login home and slots must remain unchanged")
        if home in homes or identity in identities:
            raise ValueError("subscription homes and identities must be distinct")
        homes.add(home)
        identities.add(identity)
        result[name] = {"home": home, "slots": slots, "emailSha256": identity}
    return result


def subscription_binding(profile: dict) -> dict:
    return {key: profile[key] for key in ("home", "emailSha256")}


def bind_subscription_alias(state: dict, name: str, profile: dict) -> None:
    """Permanent principal/home custody, serialized before any alias slot is leased."""
    binding = subscription_binding(profile)
    for alias, row in state.items():
        prior = row.get("subscriptionBinding")
        if prior is None:
            continue
        if alias == name and prior != binding:
            raise ValueError("subscription alias cannot be rebound")
        if alias != name and any(prior.get(key) == binding[key] for key in binding):
            raise ValueError("subscription home or identity already bound to another alias")
    state.setdefault(name, {})["subscriptionBinding"] = binding


def leased_profile(name: str, handle) -> dict:
    profile = getattr(handle, "subscription_profile", None)
    if (handle is None or handle.closed or getattr(handle, "subscription_name", None) != name
            or profile != subscription_profiles().get(name)
            or str(handle.name) not in {str(path) for path in _slot_paths(name)}):
        raise ValueError("subscription metadata requires its bound account lease")
    state = read_state()
    bind_subscription_alias(state, name, profile)
    return profile


def verify_subscription_identity(name: str, snapshot: dict, profile: dict) -> None:
    account = snapshot["account"]["account"]
    email = account.get("email")
    if (account.get("type") != "chatgpt" or not isinstance(email, str) or not email.strip()
            or hashlib.sha256(email.strip().lower().encode()).hexdigest() != profile["emailSha256"]
            or account.get("planType") != "pro"):
        raise ValueError("authorized subscription identity unavailable")


def current_login_mode() -> bool:
    """Opt-in to the existing CLI login; never discover or rotate other profiles."""
    return os.environ.get("CODEX_LANE_AUTH_MODE") in (CURRENT_LOGIN, SUBSCRIPTION_POOL)


def cli() -> str:
    return os.environ.get("CODEX_LANE_CLI", "codex")


def account_home(name: str, profile: dict | None = None) -> Path:
    if subscription_pool_mode():
        return Path((profile or subscription_profiles()[name])["home"])
    if current_login_mode() and name == CURRENT_LOGIN:
        return Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    return ACCOUNTS_ROOT / name


def subscription_env(name: str, profile: dict | None = None) -> dict:
    # Environment API credentials must never override a subscription login.
    excluded = {"OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL", "AZURE_OPENAI_API_KEY"}
    return {**{key: value for key, value in os.environ.items() if key not in excluded},
            "CODEX_HOME": str(account_home(name, profile))}


def current_login_available(name: str = CURRENT_LOGIN) -> bool:
    """Ask the supported CLI for auth mode; do not open/copy credentials or infer quota."""
    try:
        result = subprocess.run([cli(), "login", "status"], env=subscription_env(name),
                                capture_output=True, text=True, timeout=10)
        return result.returncode == 0 and "Logged in using ChatGPT" in (result.stdout + result.stderr).splitlines()
    except (OSError, subprocess.SubprocessError):
        return False


def accounts() -> list[str]:
    """ChatGPT-authenticated profiles only; adapters and API-key profiles never lease."""
    if subscription_pool_mode():
        return [name for name in subscription_profiles() if current_login_available(name)]
    if current_login_mode():
        return [CURRENT_LOGIN] if current_login_available() else []
    found = []
    for auth in sorted(ACCOUNTS_ROOT.glob("*/auth.json")):
        try:
            data = json.loads(auth.read_text())
        except (OSError, ValueError):
            continue
        if isinstance(data.get("tokens"), dict) and data["tokens"].get("access_token"):
            found.append(auth.parent.name)
    return found


def read_state() -> dict:
    try:
        value = json.loads(STATE.read_text())
        if current_login_mode() and (not isinstance(value, dict)
                                    or any(not isinstance(row, dict) for row in value.values())):
            raise ValueError("subscription banking state malformed")
        return value
    except FileNotFoundError:
        return {}
    except (OSError, ValueError):
        if current_login_mode():
            raise
        return {}


def write_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(state, indent=1, sort_keys=True))
    os.replace(tmp, STATE)


def record_lease(path: str | None, name: str, cwd, now: float) -> None:
    """Append proof after flock succeeds, before the Codex process starts."""
    if not path:
        return
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    row = {"schema": PROVIDER_EVIDENCE_SCHEMA, "provider": "codex", "event": "account-leased",
           "accountClass": ACCOUNT_CLASS, "account": name, "leasedAt": iso(now),
           "worktree": str(Path(cwd or ".").resolve())}
    with open(target, "a") as handle:
        handle.write(json.dumps(row, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


class LaunchEvidence:
    """Allowlisted identity from verified CLIs' first, pre-prompt startup header.

    Codex 0.147.0 JSON thread.started exposes only thread_id. The verified
    0.144.6/0.147.0/0.162.1 human header (exec/src/event_processor_with_human_output.rs)
    reports the thread/start model/provider and configured reasoning effort.
    This is CLI launch evidence, never provider attestation or generated text.
    A different format/version stays unknown until its contract is verified.
    """
    VERSIONS = {"0.144.6", "0.147.0", "0.162.1"}
    KEYS = ("workdir", "model", "provider", "approval", "sandbox",
            "reasoning effort", "reasoning summaries", "session id")
    REQUIRED = {"workdir", "model", "provider", "approval", "sandbox", "session id"}
    EFFORTS = {"none", "minimal", "low", "medium", "high", "xhigh"}

    @staticmethod
    def identifier(value):
        return value if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}", value) else None

    def __init__(self, path, name, cmd, cwd):
        self.path, self.pid = path, None
        self.done, self.recorded = False, False
        self.stage, self.size, self.lines = 0, 0, 0
        self.fields = {}
        requested = {"model": None, "provider": None, "reasoningEffort": None}
        for flag, value in zip(cmd, cmd[1:]):
            if flag in ("-m", "--model"):
                requested["model"] = self.identifier(value)
            if flag in ("-c", "--config"):
                match = re.fullmatch(r'model_reasoning_effort="([a-z]+)"', value)
                if match and match[1] in self.EFFORTS:
                    requested["reasoningEffort"] = match[1]
        try:
            digest = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        except OSError:
            digest = None
        self.row = {"schema": PROVIDER_EVIDENCE_SCHEMA, "provider": "codex", "event": "cli-launch",
                    "accountClass": ACCOUNT_CLASS, "account": name, "launchId": str(uuid.uuid4()),
                    "startedAt": iso(time.time()), "host": os.uname().nodename,
                    "worktree": str(Path(cwd or ".").resolve()), "adapterSha256": digest,
                    "requested": requested, "identityState": "unknown", "cliReported": None,
                    "provenance": None, "reasoningEffortSource": None, "providerAttested": False,
                    "usage": None, "costUsd": None}

    def observe(self, line):
        if self.done:
            return
        self.size += len(line)
        self.lines += 1
        value = line.rstrip("\r\n")
        if self.size > 16384 or self.lines > 16:
            self.done = True
        elif self.stage == 0:
            self.version = value.removeprefix("OpenAI Codex v")
            self.done = self.version not in self.VERSIONS or not value.startswith("OpenAI Codex v")
            self.stage = 1
        elif self.stage == 1:
            self.done = value != "--------"
            self.stage = 2
        elif self.stage == 2:
            if value == "--------":
                self.done = not self.valid_fields()
                self.stage = 3
            else:
                key, separator, item = value.partition(": ")
                if not separator or key not in self.KEYS or key in self.fields or \
                        (self.fields and self.KEYS.index(key) <= self.KEYS.index(next(reversed(self.fields)))):
                    self.done = True
                else:
                    self.fields[key] = item
        elif self.stage == 3:
            self.done = True
            if value == "user":
                effort = self.fields.get("reasoning effort")
                self.row.update(identityState="reported", provenance="codex-cli-startup-header",
                                cliVersion=self.version,
                                reasoningEffortSource="cli-resolved-configuration" if effort else None,
                                cliReported={"model": self.fields["model"], "provider": self.fields["provider"],
                                             "reasoningEffort": effort, "sessionId": self.fields["session id"]})
        if self.done:
            self.record()

    def valid_fields(self):
        if not self.REQUIRED.issubset(self.fields):
            return False
        if not self.identifier(self.fields["model"]) or not self.identifier(self.fields["provider"]):
            return False
        effort = self.fields.get("reasoning effort")
        if effort is not None and effort not in self.EFFORTS:
            return False
        try:
            return (Path(self.fields["workdir"]).is_absolute() and
                    str(Path(self.fields["workdir"]).resolve()) == self.row["worktree"] and
                    str(uuid.UUID(self.fields["session id"])) == self.fields["session id"])
        except (OSError, ValueError, RuntimeError):
            return False

    def record(self):
        if self.recorded or self.pid is None:
            return
        self.recorded = True
        if not self.path:
            return
        # Metadata failure must not change the child exit, banking or rotation.
        try:
            with open(self.path, "a") as handle:
                handle.write(json.dumps({**self.row, "pid": self.pid, "observedAt": iso(time.time())},
                                        sort_keys=True) + "\n")
                handle.flush()
                os.fsync(handle.fileno())
        except OSError as exc:
            print(f"codex-lane: launch evidence unavailable ({type(exc).__name__})", file=sys.stderr)

    def finish(self):
        self.done = True
        self.record()


def update_state(change) -> dict:
    """Read-modify-write under one lock, so concurrent runs never drop each other's banking."""
    STATE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE.with_suffix(".lock"), "w") as guard:
        fcntl.flock(guard, fcntl.LOCK_EX)
        state = read_state()
        change(state)
        write_state(state)
        return state


def iso(stamp: float | None) -> str | None:
    try:
        return datetime.fromtimestamp(float(stamp), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError, OverflowError, OSError):
        return "far-future" if stamp else None


def available(name: str, state: dict, now: float) -> bool:
    if subscription_pool_mode():
        profile = subscription_profiles().get(name)
        row = state.get(name) or {}
        verified_at = row.get("subscriptionIdentityVerifiedAt")
        capacity = (row.get("capacityLease") or {}).get("usableCapacityRemaining") or {}
        if (profile is None or row.get("subscriptionBinding") != subscription_binding(profile)
                or type(verified_at) not in (int, float) or not 0 <= now - verified_at < LEDGER_CADENCE_S
                or not capacity or any(type(window.get("remainingPercent")) not in (int, float)
                                       or window["remainingPercent"] <= 0
                                       or type(window.get("resetsAt")) not in (int, float)
                                       or window["resetsAt"] <= now for window in capacity.values())):
            return False
    return float(state.get(name, {}).get("exhaustedUntil") or 0) <= now


def parse_reset(text: str, now: float) -> float | None:
    """The reset instant codex printed, if any; None means 'unknown, use the default'."""
    match = RESET_IN.search(text)
    if match:
        seconds = 0
        for amount, unit in re.findall(r"(\d+)\s*([a-z]+)", match.group(1), re.I):
            seconds += int(amount) * {"d": 86400, "h": 3600, "m": 60, "s": 1}[unit[0].lower()]
        return now + seconds if seconds else None
    match = RESET_AT.search(text)
    if not match:
        return None
    raw = match.group(1).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc).timestamp()
        except ValueError:
            continue
    for fmt in ("%I:%M %p", "%I %p", "%H:%M"):
        try:
            clock = datetime.strptime(raw.upper(), fmt)
        except ValueError:
            continue
        local = datetime.fromtimestamp(now).replace(hour=clock.hour, minute=clock.minute, second=0)
        if local.timestamp() <= now:
            local += timedelta(days=1)
        return local.timestamp()
    return None


def parse_announcement(message: dict) -> dict | None:
    if not isinstance(message, dict) or not isinstance(message.get("messageId"), str):
        return None
    body = message.get("messageBody")
    if not isinstance(body, str) or not body.strip():
        return None
    flags = {"immediateReset": False, "bankedCreditGrant": False}
    if UNASSERTED.search(body) or HISTORICAL.search(body):
        return {"messageId": message["messageId"], "createdAt": message.get("createdAt"), **flags, "digest": hashlib.sha256(body.encode()).hexdigest()}
    for clause in re.split(r"(?:[.;\n]|\b(?:and|but)\b)", body):
        if NEGATED.search(clause) or UNASSERTED.search(clause) or HISTORICAL.search(clause):
            continue
        banked = bool(BANKED_GRANT.search(clause))
        flags["bankedCreditGrant"] |= banked
        flags["immediateReset"] |= bool(IMMEDIATE_RESET.search(clause)) and not banked
    return {"messageId": message["messageId"], "createdAt": message.get("createdAt"), **flags,
            "digest": hashlib.sha256(body.encode()).hexdigest()}

def announcement_evidence(messages: list, seen: dict | None = None) -> tuple[list[dict], dict]:
    seen = dict(seen or {})
    fresh = []
    for message in messages if isinstance(messages, list) else []:
        parsed = parse_announcement(message)
        if parsed and seen.get(parsed["messageId"]) != parsed["digest"]:
            seen[parsed["messageId"]] = parsed["digest"]
            fresh.append(parsed)
    return fresh, seen

def _windows(rate_response: dict) -> dict:
    limits = (rate_response or {}).get("rateLimits") or {}
    return {key: limits.get(key) for key in ("primary", "secondary") if isinstance(limits.get(key), dict)}

def build_capacity_lease(name: str, snapshot: dict, lifecycle: dict | None = None,
                         now: float | None = None) -> dict:
    now = time.time() if now is None else now
    lifecycle = lifecycle or {}
    rates = snapshot.get("rateLimits") or {}
    limits = rates.get("rateLimits") or {}
    windows = _windows(rates)
    capacity = {key: {"remainingPercent": max(0, 100 - int(value.get("usedPercent", 100))),
                      "resetsAt": value.get("resetsAt"), "windowDurationMins": value.get("windowDurationMins")}
                for key, value in windows.items()}
    resets = [w["resetsAt"] for w in capacity.values() if isinstance(w.get("resetsAt"), int)]
    summary = rates.get("rateLimitResetCredits")
    details = None if summary is None else summary.get("credits")
    credits = None if details is None else [
        {"id": row.get("id"), "kind": "bankedReset", "status": row.get("status"),
         "resetType": row.get("resetType"), "grantedAt": row.get("grantedAt"),
         "redemptionDeadline": row.get("expiresAt"), "bankedUntilRedeemed": True, "redeemedCapacityLossAt": min(resets) if resets else None}
        for row in details]
    for row in lifecycle.get("promotionalCredits") or []:
        if isinstance(row, dict):
            (credits if credits is not None else (credits := [])).append(
                {"id": row.get("id"), "kind": "promotional", "status": row.get("status", "available"),
                 "hardCap": row.get("hardCap"), "redemptionDeadline": row.get("expiresAt"),
                 "capacityLossAt": row.get("expiresAt")})
    access_loss = lifecycle.get("accessLossAt")
    if lifecycle.get("canceledAtPeriodEnd"):
        access_loss = min(filter(None, (access_loss, lifecycle.get("subscriptionEndAt"))), default=None)
    if lifecycle.get("paymentFailure"):
        access_loss = min(filter(None, (access_loss, lifecycle.get("graceEndsAt"))), default=None)
    unavailable = min(filter(None, [*resets, access_loss]), default=None)
    throughput = lifecycle.get("observedSustainableThroughputPerHour")
    observed_at = lifecycle.get("throughputObservedAt")
    concurrency = lifecycle.get("observedConcurrency")
    fresh = all(isinstance(v, (int, float)) for v in (throughput, observed_at, concurrency)) and 0 <= now - observed_at <= EVIDENCE_MAX_AGE_S
    drain = None if not fresh or throughput <= 0 or concurrency <= 0 else int(3600 * min((w["remainingPercent"] for w in capacity.values()), default=0) / (throughput * concurrency))
    usable = None if drain is None or unavailable is None else min(
        min((w["remainingPercent"] for w in capacity.values()), default=0), throughput * concurrency * max(0, unavailable - now) / 3600)
    announcements = snapshot.get("announcementEvidence") or announcement_evidence((snapshot.get("messages") or {}).get("messages", []))[0]
    paid = (limits.get("planType") or (((snapshot.get("account") or {}).get("account") or {}).get("planType"))) not in (None, "free", "unknown")
    grant_start = min((a["createdAt"] for a in announcements if a["bankedCreditGrant"] and isinstance(a.get("createdAt"), int)), default=None)
    astra = lifecycle.get("astraAccess")
    accrual_end = lifecycle.get("astraEnabledAt") if astra is True else now
    expected = None if astra is None or not paid or grant_start is None or accrual_end is None else max(0, int((accrual_end - grant_start) // 86400) + 1)
    account = (snapshot.get("account") or {}).get("account") or {}
    return {
        "schema": LEDGER_SCHEMA, "leaseId": f"codex:{name}", "generatedAt": iso(now),
        "provider": "openai", "account": name, "planType": limits.get("planType") or account.get("planType"),
        "usableCapacityRemaining": capacity, "capacityUnit": "percentOfIncludedWindow",
        "nextNaturalResetAt": min(resets) if resets else None, "capacityReplacedAtReset": {key: row["resetsAt"] for key, row in capacity.items()},
        "credits": {"availableCount": None if summary is None else summary.get("availableCount"),
                    "details": credits, "detailsComplete": details is not None and len(details) >= int(summary.get("availableCount") or 0)},
        "subscription": {key: lifecycle.get(key) for key in ("renewalAt", "subscriptionEndAt", "canceledAtPeriodEnd", "paymentFailure", "graceEndsAt")},
        "earliestAccessLossAt": access_loss, "timeToUnavailabilityS": None if unavailable is None else max(0, int(unavailable - now)),
        "usableBeforeUnavailability": usable, "astraAccess": astra, "announcementEvidence": announcements,
        "astraDelayCredits": {"expected": expected, "observed": None if details is None else sum("astra" in f"{row.get('title', '')} {row.get('description', '')}".lower() for row in details)},
        "compatibility": {"cli": "codex", "harness": "symphony", "models": lifecycle.get("models"),
                          "restrictions": lifecycle.get("restrictions", [])},
        "throughput": {"sustainablePercentPerHour": throughput, "concurrency": concurrency,
                       "estimatedDrainTimeS": drain, "fresh": bool(fresh), "confidence": lifecycle.get("throughputConfidence", "unknown")},
        "sources": {"capacity": {"source": "account/rateLimits/read", "reconciliation": "authoritative", "observedAt": iso(now)},
                    "lifecycle": {"source": lifecycle.get("lifecycleSource"), "reconciliation": "reconciled" if any(lifecycle.get(key) is not None for key in ("renewalAt", "subscriptionEndAt", "paymentFailure", "graceEndsAt", "accessLossAt")) else "unknown"},
                    "throughput": {"source": lifecycle.get("source"), "reconciliation": "observed" if fresh else "unknown"}, "announcements": {"source": "account/workspaceMessages/read", "reconciliation": "notification-only"}},
    }

def select_reset_credit(rate_response: dict, now: float) -> dict | None:
    summary = (rate_response or {}).get("rateLimitResetCredits") or {}
    rows = summary.get("credits")
    if not isinstance(rows, list) or len(rows) < int(summary.get("availableCount") or 0): return None
    eligible = [row for row in rows if row.get("status") == "available" and
                row.get("resetType") == "codexRateLimits" and
                (row.get("expiresAt") is None or row["expiresAt"] > now)]
    return min(eligible, key=lambda row: (row.get("expiresAt") is None, row.get("expiresAt") or 0,
                                          row.get("grantedAt") or 0), default=None)

def redemption_decision(name: str, event: dict, rate_response: dict, lifecycle: dict,
                        others_exhausted: bool, lock_held: bool, now: float) -> dict:
    reason = None
    if event.get("type") != "terminal_limit": reason = "not-terminal-limit"
    elif not lock_held: reason = "lock-lost"
    elif not others_exhausted: reason = "other-seat-available"
    credit = select_reset_credit(rate_response, now)
    if reason is None and credit is None: reason = "no-compatible-credit"
    throughput, concurrency = lifecycle.get("observedSustainableThroughputPerHour"), lifecycle.get("observedConcurrency")
    observed = lifecycle.get("throughputObservedAt")
    if reason is None and (not all(isinstance(v, (int, float)) for v in (throughput, concurrency, observed)) or
                           throughput <= 0 or concurrency <= 0 or not 0 <= now - observed <= EVIDENCE_MAX_AGE_S):
        reason = "missing-or-stale-drain-evidence"
    drain = None if reason else 3600 * 100 / (throughput * concurrency)
    resets = [w.get("resetsAt") for w in _windows(rate_response).values() if isinstance(w.get("resetsAt"), int)]
    access = lifecycle.get("accessLossAt")
    if lifecycle.get("canceledAtPeriodEnd"):
        access = min(filter(None, (access, lifecycle.get("subscriptionEndAt"))), default=None)
    if lifecycle.get("paymentFailure"):
        access = min(filter(None, (access, lifecycle.get("graceEndsAt"))), default=None)
    deadline = min(filter(None, [*resets, access]), default=None)
    if reason is None and (deadline is None or deadline - now <= drain):
        reason = "natural-reset-before-drain" if resets and min(resets) == deadline else "access-loss-before-drain"
    event_key = event.get("id") or f"{name}:{','.join(str(x) for x in sorted(resets))}:terminal-limit"
    return {"eligible": reason is None, "reason": reason, "credit": credit,
            "drainHorizonS": None if drain is None else int(drain),
            "idempotencyKey": str(uuid.uuid5(uuid.NAMESPACE_URL, f"jovie:{event_key}"))}

def reset_readback_verified(before: dict, after: dict) -> bool:
    comparisons = []
    for key, old in _windows(before).items():
        new = _windows(after).get(key)
        if not new or not isinstance(old.get("usedPercent"), int) or not isinstance(new.get("usedPercent"), int):
            return False
        comparisons.append(new["usedPercent"] < old["usedPercent"])
        if new["usedPercent"] > old["usedPercent"]:
            return False
    return bool(comparisons) and any(comparisons)

def app_server_calls(name: str, calls: list[tuple[str, dict | None]], timeout: float = 15,
                     *, lease_handle=None) -> list[dict]:
    current = current_login_mode()
    profile = leased_profile(name, lease_handle) if subscription_pool_mode() else None
    allowed_names = subscription_profiles() if subscription_pool_mode() else {CURRENT_LOGIN}
    if current and (name not in allowed_names or calls != CURRENT_METADATA_CALLS):
        raise ValueError("current-login permits only public subscription metadata reads")
    if current and (lease_handle is None or lease_handle.closed):
        raise ValueError("current-login metadata requires its execution account lease")
    command = ([cli(), "app-server", "--stdio", "-c", 'forced_login_method="chatgpt"']
               if current else ["codex", "app-server", "--stdio"])
    if profile is not None:
        command += ["-c", 'model_provider="openai"']
    proc = subprocess.Popen(command, stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                            env=(subscription_env(name, profile) if current else
                                 {**os.environ, "CODEX_HOME": str(ACCOUNTS_ROOT / name)}),
                            **({"pass_fds": (lease_handle.fileno(),)} if current else {}))
    deadline = time.monotonic() + timeout

    def request(request_id: int, method: str, params=None) -> dict:
        payload = {"id": request_id, "method": method}
        if params is not None:
            payload["params"] = params
        proc.stdin.write(json.dumps(payload) + "\n")
        proc.stdin.flush()
        while time.monotonic() < deadline:
            ready, _, _ = select.select([proc.stdout], [], [], max(0, deadline - time.monotonic()))
            if not ready:
                break
            line = proc.stdout.readline()
            if not line:
                break
            message = json.loads(line)
            if message.get("id") == request_id:
                if message.get("error"):
                    raise RuntimeError(f"{method}: app-server error")
                return message.get("result") or {}
        raise TimeoutError(f"{method}: app-server response unavailable")

    try:
        request(1, "initialize", {"clientInfo": {"name": "jovie-quota-ledger", "version": "1"},
                                   "capabilities": {"experimentalApi": not current}})
        proc.stdin.write(json.dumps({"method": "initialized"}) + "\n")
        proc.stdin.flush()
        return [request(index + 2, method, params) for index, (method, params) in enumerate(calls)]
    finally:
        if current:
            reap_current_metadata(proc)
        else:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=2)
        for stream in (proc.stdin, proc.stdout): stream.close()


def reap_current_metadata(proc):
    """Never release the account lease while metadata cleanup is unproved.

    The child inherits the same locked descriptor, so parent death also cannot
    admit another account user while that child retains ownership.
    """
    interrupted = None
    first = True
    while True:
        try:
            if proc.poll() is not None:
                break
            if first:
                proc.terminate()
                first = False
            else:
                proc.kill()
            proc.wait(timeout=2)
            break
        except subprocess.TimeoutExpired:
            first = False
        except BaseException as error:
            first = False
            if not isinstance(error, Exception):
                interrupted = interrupted or error
            # Follow the maintained cleanup-unproved rule: keep ownership.
            # Retry observation; a signal/error alone does not prove reap.
            try:
                time.sleep(.1)
            except BaseException as pause_error:
                interrupted = interrupted or pause_error
    if interrupted is not None:
        raise interrupted

def account_snapshot(name: str) -> dict:
    account, rates, messages = app_server_calls(name, [
        ("account/read", {"refreshToken": False}), ("account/rateLimits/read", None),
        ("account/workspaceMessages/read", None)])
    return {"account": account, "rateLimits": rates, "messages": messages}


CURRENT_METADATA_CALLS = [("account/read", {"refreshToken": False}),
                          ("account/rateLimits/read", None),
                          ("model/list", {"limit": 100, "includeHidden": False})]


def current_subscription_snapshot(name: str, *, lease_handle=None) -> dict:
    account, rates, models = app_server_calls(name, CURRENT_METADATA_CALLS, lease_handle=lease_handle)
    return {"account": account, "rateLimits": rates, "models": models}


def reconcile_current_subscription(now, if_due, fetch, name=CURRENT_LOGIN) -> dict:
    """Observe one existing login; never redeem credits, rotate or clear banks.

    Use the execution account's lock, and the maintained hourly cadence. Failure
    leaves the previous observation to become stale; it cannot certify capacity.
    """
    def due():
        state = read_state()
        ledger = ((state.get(name) or {}).get("subscriptionLedger") if subscription_pool_mode()
                  else state.get("_ledger")) or {}
        last = ledger.get("reconciledAt")
        if subscription_pool_mode() and type(last) in (int, float):
            capacity = ((state.get(name) or {}).get("capacityLease") or {}).get("usableCapacityRemaining") or {}
            # Once per expired window: a failed refresh stamps the attempt after
            # the reset, retaining the normal failure throttle on later calls.
            if any(type(row.get("resetsAt")) in (int, float) and last < row["resetsAt"] <= now
                   for row in capacity.values()):
                return True
        return not (ledger.get("authMode") == os.environ.get("CODEX_LANE_AUTH_MODE") and if_due
                    and type(last) in (int, float) and 0 <= now - last < if_due)
    def ledger_update(state, errors):
        ledger = {"schema": LEDGER_SCHEMA, "authMode": os.environ.get("CODEX_LANE_AUTH_MODE"),
                  "reconciledAt": now, "errors": errors}
        if subscription_pool_mode():
            state.setdefault(name, {})["subscriptionLedger"] = ledger
        else:
            state["_ledger"] = ledger
    try:
        if not due():
            return {"reconciled": False, "reason": "cadence"}
    except (OSError, ValueError):
        return {"reconciled": False, "reason": "banking-state-unreadable"}
    handle = lease(name)
    if handle is None:
        return {"reconciled": False, "reason": "account-lease-busy"}
    errors = {}
    try:
        try:
            if not due():
                return {"reconciled": False, "reason": "cadence"}
        except (OSError, ValueError):
            return {"reconciled": False, "reason": "banking-state-unreadable"}
        # Persist the attempt before provider access. If storage is unavailable,
        # make no request; a failed observation or event write must not hot-loop.
        try:
            update_state(lambda state: ledger_update(state, {name: "observation-in-progress"}))
        except Exception as error:
            return {"reconciled": False, "accounts": [],
                    "errors": {"_reconcile": type(error).__name__ + ": observation storage unavailable"}}
        value = None
        try:
            profile = leased_profile(name, handle) if subscription_pool_mode() else None
            snapshot = (fetch(name, lease_handle=handle)
                        if fetch is current_subscription_snapshot else fetch(name))
            if profile is not None:
                verify_subscription_identity(name, snapshot, profile)
            account = snapshot["account"]["account"]
            if account.get("type") != "chatgpt":
                raise ValueError("subscription account not established")
            windows = _windows(snapshot["rateLimits"])
            if not windows or any(type(row.get("usedPercent")) not in (int, float)
                                  or not math.isfinite(row["usedPercent"])
                                  or not 0 <= row["usedPercent"] <= 100
                                  or type(row.get("resetsAt")) is not int
                                  or row["resetsAt"] <= now for row in windows.values()):
                raise ValueError("included capacity metadata incomplete")
            catalog = snapshot["models"]
            if not isinstance(catalog.get("data"), list) or catalog.get("nextCursor"):
                raise ValueError("model catalog incomplete")
            ids = [row["id"] for row in catalog["data"] if isinstance(row, dict)
                   and isinstance(row.get("id"), str) and row.get("hidden") is not True]
            if len(ids) != len(catalog["data"]):
                raise ValueError("model catalog ambiguous")
            value = build_capacity_lease(name, snapshot, {"models": ids}, now)
            value["sources"]["announcements"] = {"source": None, "reconciliation": "not-requested"}
            value["compatibility"].update(cli=cli(), authMode=os.environ.get("CODEX_LANE_AUTH_MODE"),
                                           restrictions=["subscription-only", "one-account-lease"])
        except Exception as error:
            errors[name] = type(error).__name__ + ": public subscription metadata unavailable"

        def apply(state):
            if value is not None:
                # Merge only observation fields into the current locked row.
                # Quota/auth banks and run/attempt ownership remain untouched.
                entry = state.setdefault(name, {})
                if subscription_pool_mode():
                    binding = subscription_binding(profile)
                    bind_subscription_alias(state, name, profile)
                    entry.update(subscriptionBinding=binding, subscriptionIdentityVerifiedAt=now)
                previous = entry.get("capacityLease") or {}
                entry["capacityLease"] = value
                if _lease_digest(previous) != _lease_digest(value):
                    path = STATE.parent / "capacity-events.jsonl"
                    with path.open("a") as stream:
                        stream.write(json.dumps({"schema": "jovie.capacity-lease-change/v1", "at": iso(now),
                                                 "leaseId": value["leaseId"], "previousDigest": _lease_digest(previous) if previous else None,
                                                 "currentDigest": _lease_digest(value), "lease": value}) + "\n")
            ledger_update(state, errors)
        try:
            update_state(apply)
        except Exception as error:
            errors["_reconcile"] = type(error).__name__ + ": observation storage unavailable"
            return {"reconciled": False, "accounts": [], "errors": errors}
        return {"reconciled": value is not None, "accounts": [name] if value else [], "errors": errors}
    finally:
        handle.close()

def _lease_digest(value: dict) -> str:
    stable = json.loads(json.dumps(value))
    stable.pop("generatedAt", None)
    stable.pop("timeToUnavailabilityS", None)
    stable.pop("usableBeforeUnavailability", None)
    for source in stable.get("sources", {}).values():
        source.pop("observedAt", None)
    return hashlib.sha256(json.dumps(stable, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def reconcile(now: float | None = None, if_due: int = LEDGER_CADENCE_S, fetch=account_snapshot) -> dict:
    if subscription_pool_mode():
        now = time.time() if now is None else now
        observer = current_subscription_snapshot if fetch is account_snapshot else fetch
        return {"authMode": SUBSCRIPTION_POOL, "profiles": {
            name: reconcile_current_subscription(now, if_due, observer, name)
            for name in subscription_profiles()}}
    if current_login_mode():
        return reconcile_current_subscription(time.time() if now is None else now, if_due,
                                              current_subscription_snapshot if fetch is account_snapshot else fetch)
    now = time.time() if now is None else now
    current = read_state()
    last = float(current.get("_ledger", {}).get("reconciledAt") or 0)
    if if_due and now - last < if_due:
        return {"reconciled": False, "nextInS": int(if_due - (now - last))}
    snapshots, errors = {}, {}
    for name in accounts():
        try:
            snapshots[name] = fetch(name)
        except Exception as error:
            errors[name] = f"{type(error).__name__}: {error}"[:160]

    def apply(state: dict) -> None:
        events = []
        for name, snapshot in snapshots.items():
            try:
                entry = state.setdefault(name, {})
                fresh, digests = announcement_evidence((snapshot.get("messages") or {}).get("messages", []), entry.get("announcementDigests"))
                stored = entry.setdefault("announcementEvidence", {})
                stored.update({row["messageId"]: row for row in fresh})
                snapshot["announcementEvidence"], entry["announcementDigests"] = list(stored.values()), digests
                window = ((snapshot.get("rateLimits") or {}).get("rateLimits") or {}).get("primary") or {}
                sample = entry.get("usageSample") or {}
                if sample.get("resetsAt") == window.get("resetsAt") and all(isinstance(value, (int, float)) for value in (sample.get("at"), sample.get("usedPercent"), window.get("usedPercent"))) and now > sample["at"] and window["usedPercent"] > sample["usedPercent"]:
                    entry.setdefault("lifecycle", {}).update(observedSustainableThroughputPerHour=3600 * (window["usedPercent"] - sample["usedPercent"]) / (now - sample["at"]), observedConcurrency=1, throughputObservedAt=now, throughputConfidence="observed", source="derived:account/rateLimits/read")
                entry["usageSample"] = {"at": now, "usedPercent": window.get("usedPercent"), "resetsAt": window.get("resetsAt")}
                lease_value = build_capacity_lease(name, snapshot, entry.get("lifecycle"), now)
                old = entry.get("capacityLease") or {}
                old_digest, new_digest = (_lease_digest(old) if old else None), _lease_digest(lease_value)
                entry["capacityLease"] = lease_value
                pending = entry.get("pendingReset") or {}
                if pending.get("before") and reset_readback_verified(pending["before"], snapshot["rateLimits"]):
                    entry.pop("pendingReset", None)
                    entry.pop("exhaustedUntil", None)
                    entry["lastRedemptionReadbackAt"] = now
                remaining = list(lease_value["usableCapacityRemaining"].values())
                depleted = max((row["resetsAt"] for row in remaining if row["remainingPercent"] == 0 and row.get("resetsAt")), default=None)
                if depleted:
                    entry["exhaustedUntil"] = depleted
                elif remaining and all(row["remainingPercent"] > 0 for row in remaining) and not entry.get("pendingReset"):
                    entry.pop("exhaustedUntil", None)
                if old_digest != new_digest:
                    events.append({"schema": "jovie.capacity-lease-change/v1", "at": iso(now),
                                   "leaseId": lease_value["leaseId"], "previousDigest": old_digest,
                                   "currentDigest": new_digest, "lease": lease_value})
            except Exception as error:
                errors[name] = f"{type(error).__name__}: {error}"[:160]
        state["_ledger"] = {"schema": LEDGER_SCHEMA, "reconciledAt": now, "errors": errors}
        if events:
            path = STATE.parent / "capacity-events.jsonl"
            with open(path, "a") as handle:
                for event in events:
                    handle.write(json.dumps(event, sort_keys=True) + "\n")

    # The tick runs minutely and suppresses failures, so the cadence must be stamped on
    # attempt, not only on success — otherwise one bad snapshot or write hot-loops full
    # account reads every minute instead of hourly.
    try:
        update_state(apply)
    except Exception as error:
        errors["_reconcile"] = f"{type(error).__name__}: {error}"[:160]
        try:
            update_state(lambda state: state.__setitem__("_ledger",
                         {"schema": LEDGER_SCHEMA, "reconciledAt": now, "errors": errors}))
        except Exception:
            pass
        return {"reconciled": False, "accounts": sorted(snapshots), "errors": errors}
    return {"reconciled": True, "accounts": sorted(snapshots), "errors": errors}

def maybe_redeem(name: str, handle, now: float) -> bool:
    state = read_state()
    pending = dict(state.get(name, {}).get("pendingReset") or {})
    if not pending.get("creditId") or not pending.get("before") or not pending.get("idempotencyKey"):
        # No in-flight redemption: a retry must reuse the recorded credit and idempotency
        # key — the previous consume may have succeeded while its readback failed, and
        # selecting a different credit here would burn two credits for one event.
        lifecycle = state.get(name, {}).get("lifecycle") or {}
        if not all(lifecycle.get(key) is not None for key in
                   ("observedSustainableThroughputPerHour", "observedConcurrency", "throughputObservedAt")):
            return False
        try:
            snapshot = account_snapshot(name)
        except Exception:
            return False
        others = [n for n in accounts() if n != name]
        decision = redemption_decision(name, {"type": "terminal_limit", "id": f"{name}:{state[name].get('lastRunAt')}"}, snapshot["rateLimits"], lifecycle,
            now - float(state.get("_ledger", {}).get("reconciledAt") or 0) <= EVIDENCE_MAX_AGE_S and all(
                n not in state.get("_ledger", {}).get("errors", {}) and not available(n, state, now) and any(
                    row.get("remainingPercent") == 0 for row in ((state.get(n, {}).get("capacityLease") or {}).get("usableCapacityRemaining") or {}).values()) for n in others),
            not handle.closed, now)
        update_state(lambda data: data.setdefault(name, {}).update(lastRedemptionDecision=decision))
        if not decision["eligible"]:
            return False
        pending = {"creditId": decision["credit"]["id"], "idempotencyKey": decision["idempotencyKey"],
                   "before": snapshot["rateLimits"]}
        update_state(lambda data: data.setdefault(name, {}).update(pendingReset=pending))
    try:
        consumed, after = app_server_calls(name, [
            ("account/rateLimitResetCredit/consume", {"creditId": pending["creditId"],
                                                       "idempotencyKey": pending["idempotencyKey"]}),
            ("account/rateLimits/read", None)])
    except Exception:
        return False
    verified = consumed.get("outcome") in ("reset", "alreadyRedeemed") and reset_readback_verified(pending["before"], after)
    if verified:
        def clear(data: dict) -> None:
            entry = data.setdefault(name, {})
            entry.pop("pendingReset", None)
            entry.pop("exhaustedUntil", None)
            entry["lastRedemptionReadbackAt"] = now
        update_state(clear)
    return verified


def classify(output: str, code: int, now: float) -> tuple[str, float | None]:
    """(kind, exhausted_until): kind is ok | rate | limit | auth | error."""
    tail = output[-20000:]
    # Only a failed run can be an exhausted account. A successful run's transcript often
    # mentions "429", "quota" or "rate limit" (Jovie has a rate limiter), and matching that
    # banked all 5 healthy accounts for 5h on 2026-09-27. Read only codex's closing lines.
    closing = "\n".join(tail.splitlines()[-30:])
    if code != 0 and LIMIT.search(closing):
        if not USAGE.search(closing):
            return "rate", parse_reset(closing, now) or now + RATE_BACKOFF_S
        return "limit", parse_reset(closing, now) or now + DEFAULT_COOLDOWN_S
    # Same rule as limits: only codex's closing lines can say the login failed. An agent
    # working on auth code prints "401"/"unauthorized" all run long; scanning the whole tail
    # benched Gem's only login for 24h on a plain 429 (2026-10-12, 96% capacity left).
    if code != 0 and AUTH.search(closing):
        return "auth", now + 24 * 3600
    return ("ok" if code == 0 else "error"), None


def login_slots(name: str) -> int:
    """Concurrent runs one account may hold. Only the single current-login account can be
    widened (CODEX_LANE_LOGIN_SLOTS, Tim 2026-10-11: more runs on one login, no account
    rotation); every other account keeps one exclusive run."""
    if subscription_pool_mode():
        return subscription_profiles()[name]["slots"]
    if not (current_login_mode() and name == CURRENT_LOGIN):
        return 1
    try:
        return max(1, int(os.environ.get("CODEX_LANE_LOGIN_SLOTS", "1")))
    except ValueError:
        return 1


def _slot_paths(name: str) -> list[Path]:
    locks = STATE.parent / "codex-locks"
    return [locks / (f"{name}.lock" if slot == 0 else f"{name}.{slot}.lock") for slot in range(login_slots(name))]


def lease(name: str):
    """One flock per concurrent run slot; released by the kernel if the run dies."""
    profile = subscription_profiles()[name] if subscription_pool_mode() else None
    if profile is not None:
        update_state(lambda state: bind_subscription_alias(state, name, profile))
    (STATE.parent / "codex-locks").mkdir(parents=True, exist_ok=True)
    for path in _slot_paths(name):
        handle = open(path, "w")
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            handle.close()
            continue
        if subscription_pool_mode():
            handle.subscription_name = name
            handle.subscription_profile = profile
        return handle
    return None


def reverify_auth_bank(state: dict, now: float) -> dict:
    """An auth bank on the current login is only as good as the login: `codex login status`
    (local, no quota) is the authority. A logged-in CLI clears the bank instead of idling
    the lane for a day on a misread transcript."""
    if subscription_pool_mode():
        profiles = subscription_profiles()
        def clear_verified(st):
            for name, profile in profiles.items():
                row = st.get(name) or {}
                verified = row.get("subscriptionIdentityVerifiedAt")
                failed = row.get("lastRunAt")
                if (row.get("lastKind") == "auth" and float(row.get("exhaustedUntil") or 0) > now
                        and row.get("subscriptionBinding") == subscription_binding(profile)
                        and type(verified) in (int, float) and type(failed) in (int, float)
                        and failed < verified <= now and now - verified < LEDGER_CADENCE_S):
                    row.pop("exhaustedUntil", None)
                    row.update(lastKind="auth-reverified", authReverifiedAt=now)
        return update_state(clear_verified)
    entry = state.get(CURRENT_LOGIN) or {}
    if not (current_login_mode() and entry.get("lastKind") == "auth"
            and float(entry.get("exhaustedUntil") or 0) > now and current_login_available()):
        return state
    def clear(st: dict) -> None:
        row = st.setdefault(CURRENT_LOGIN, {})
        row.pop("exhaustedUntil", None)
        row.update(lastKind="auth-reverified", authReverifiedAt=now)
    update_state(clear)
    return read_state()


def pick(state: dict, now: float, names: list[str] | None = None):
    """Least-recently-used available account that nobody else has leased right now."""
    state = reverify_auth_bank(state, now)
    names = accounts() if names is None else names
    order = sorted((n for n in names if available(n, state, now)),
                   key=lambda n: float(state.get(n, {}).get("lastUsed") or 0))
    for name in order:
        handle = lease(name)
        if handle is not None:
            return name, handle
    return None, None


def run(args) -> int:
    """One lane run. When an account hits a limit or auth failure mid-run, bank it and rotate to
    the next available account on the same worktree, so the work finishes instead of stalling.
    Returns NO_ACCOUNT_EXIT only when every account is spent, so the lane fails over to another
    provider."""
    prompt = Path(args.prompt_file).read_text()
    if subscription_pool_mode():
        reconcile()
    last = Path(args.cwd or ".") / ".codex-last-message.txt"
    base = [cli(), "exec", "--ignore-user-config", "--skip-git-repo-check", "--ephemeral",
            "--dangerously-bypass-approvals-and-sandbox", "--color", "never", "-o", str(last)]
    if current_login_mode():
        base.remove("--dangerously-bypass-approvals-and-sandbox")
        # The installed CLI supports these configuration keys but not the TUI's
        # --approve-for-me shortcut. Keep the sandbox and reviewer explicit.
        base += ["--sandbox", "workspace-write", "-c", 'approval_policy="on-request"',
                 "-c", 'approvals_reviewer="auto_review"', "-c", 'model_provider="openai"',
                 "-c", 'forced_login_method="chatgpt"']
    if args.model:
        base += ["-m", args.model]
    if args.reasoning_effort:
        base += ["-c", f'model_reasoning_effort="{args.reasoning_effort}"']
    if args.cwd:
        base += ["-C", args.cwd]
    base.append("-")
    tried: list[str] = []
    attempted = False
    wait_until, waiting = time.time() + LEASE_WAIT_S, False
    while True:
        now = time.time()
        candidates = [n for n in accounts() if n not in tried]
        state = read_state()
        name, handle = pick(state, now, candidates)
        if name is None:
            busy = [n for n in candidates if available(n, state, now)]
            if busy and now < wait_until:
                if not waiting:
                    print(f"codex-lane: account lease busy ({', '.join(busy)}); waiting up to {LEASE_WAIT_S}s",
                          file=sys.stderr, flush=True)
                    waiting = True
                time.sleep(LEASE_POLL_S)
                continue
            why = "leased by other runs past the wait" if busy else "all exhausted"
            print(f"codex-lane: no available account ({why})", file=sys.stderr)
            return NO_ACCOUNT_EXIT
        tried.append(name)
        text = prompt if not attempted else (
            "A previous attempt on this worktree stopped when its account hit a limit. Continue from the "
            "current state of the worktree (check `git status` and `git diff`); do not start over.\n\n" + prompt)
        attempted = True
        code, kind, until = run_account(name, handle, base, text, args.cwd, now,
                                        getattr(args, "receipt_file", None))
        if current_login_mode():
            # Preserve the worktree for the harness's existing retry/handoff policy;
            # never rotate accounts or consume reset credits after an exhausted run.
            return NO_ACCOUNT_EXIT if kind in ("rate", "limit", "auth") else code
        if kind == "reset-credit":
            tried.remove(name)
            continue
        if kind not in ("rate", "limit", "auth"):
            return code
        print(f"codex-lane: account {name} {kind}; unavailable until {iso(until)}; rotating", file=sys.stderr)
        time.sleep(ROTATE_PAUSE_S)


def run_account(name: str, handle, cmd: list[str], prompt: str, cwd, now: float,
                receipt_file: str | None = None):
    from collections import deque
    tail = deque(maxlen=400)  # classification only needs the end of the output
    launch = None
    try:
        profile = leased_profile(name, handle) if subscription_pool_mode() else None
        home = account_home(name, profile)
        env = subscription_env(name, profile) if current_login_mode() else {**os.environ, "CODEX_HOME": str(home)}
        if profile is not None:
            snapshot = current_subscription_snapshot(name, lease_handle=handle)
            verify_subscription_identity(name, snapshot, profile)
            windows = _windows(snapshot["rateLimits"])
            observed_at = time.time()
            if not windows or any(type(row.get("usedPercent")) not in (int, float)
                                  or not math.isfinite(row["usedPercent"]) or not 0 <= row["usedPercent"] <= 100
                                  or type(row.get("resetsAt")) is not int or row["resetsAt"] <= observed_at
                                  for row in windows.values()):
                raise ValueError("subscription capacity metadata unavailable")
            depleted = max((row["resetsAt"] for row in windows.values() if row["usedPercent"] == 100), default=None)
            if depleted is not None:
                def bank(st):
                    row = st.setdefault(name, {})
                    if float(row.get("exhaustedUntil") or 0) < depleted:
                        row.update(exhaustedUntil=depleted, lastKind="limit", lastExit=NO_ACCOUNT_EXIT,
                                   lastRunAt=observed_at, lastError="public-subscription-capacity-exhausted")
                update_state(bank)
                return NO_ACCOUNT_EXIT, "limit", depleted
        update_state(lambda st: st.setdefault(name, {}).update(
            lastUsed=now, runs=int(st.get(name, {}).get("runs") or 0) + 1))
        record_lease(receipt_file, name, cwd, now)
        launch = LaunchEvidence(receipt_file, name, cmd, cwd)
        print(f"codex-lane: account={name} accountClass={ACCOUNT_CLASS} home={home}", flush=True)
        proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True,
                                **({"pass_fds": (handle.fileno(),)} if profile is not None else {}))
        launch.pid = proc.pid
        proc.stdin.write(prompt)
        proc.stdin.close()
        for line in proc.stdout:
            launch.observe(line)
            tail.append(line)
            sys.stdout.write(line)
            sys.stdout.flush()
        proc.stdout.close()
        launch.finish()
        code = proc.wait()
        output = "".join(tail)
        completed_at = time.time()
        kind, until = classify(output, code, completed_at)

        def record(st: dict) -> None:
            entry = st.setdefault(name, {})
            bank_until = float(entry.get("exhaustedUntil") or 0)
            # Another slot may have banked this account while this run was executing.
            # Completion cannot disprove an active bank or shorten its reset window;
            # retain the diagnostics of the observation that owns the longer bank.
            if bank_until > completed_at and (until is None or bank_until >= until):
                return
            entry.update(lastKind=kind, lastExit=code, lastRunAt=completed_at)
            if until:
                entry.update(exhaustedUntil=until, lastError=(LIMIT.search(output) or AUTH.search(output)).group(0)[:80])
            else:
                entry.pop("exhaustedUntil", None)
            if kind == "ok":
                entry.pop("lastError", None)  # stale failure with no active bank
        update_state(record)
        if kind == "limit" and not current_login_mode() and maybe_redeem(name, handle, time.time()):
            return 0, "reset-credit", None
        return code, kind, until
    finally:
        if launch is not None:
            launch.finish()
        handle.close()


def status(now: float | None = None, names: list[str] | None = None, state: dict | None = None) -> dict:
    now = time.time() if now is None else now
    state = read_state() if state is None else state
    names = accounts() if names is None else names
    rows = {}
    for name in names:
        entry = state.get(name, {})
        until = float(entry.get("exhaustedUntil") or 0)
        capacity_lease = entry.get("capacityLease") or {}
        primary = (capacity_lease.get("usableCapacityRemaining") or {}).get("primary") or {}
        reset_at = capacity_lease.get("nextNaturalResetAt")
        credit_count = (capacity_lease.get("credits") or {}).get("availableCount")
        rows[name] = {
            "available": available(name, state, now),
            "leased": (free := _free_slots(name)) == 0,
            "freeSlots": free,
            "exhaustedUntil": iso(until) if until > now else None,
            "resetsInS": max(0, int(until - now)) if until > now else 0,
            "lastKind": entry.get("lastKind"), "lastError": entry.get("lastError"),
            "runs": entry.get("runs", 0),
            "lastUsed": iso(entry.get("lastUsed")),
            "remainingPercent": primary.get("remainingPercent"),
            "naturalResetAt": iso(reset_at),
            "naturalResetInS": max(0, int(reset_at - now)) if isinstance(reset_at, (int, float)) else None,
            "bankedResetCount": credit_count,
            "capacityLease": capacity_lease or None,
        }
    banked = [n for n, r in rows.items() if r["available"] and not r["leased"]]
    return {"generatedAt": iso(now),
            "accounts": rows, "available": banked, "count": len(rows), "ledger": state.get("_ledger")}


def _free_slots(name: str) -> int:
    """Slots nobody holds right now; probe each with a non-blocking flock and release it."""
    free = 0
    for path in _slot_paths(name):
        if not path.exists():
            free += 1
            continue
        handle = open(path, "a")
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            free += 1
        except BlockingIOError:
            pass
        finally:
            handle.close()
    return free


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    go = sub.add_parser("run")
    go.add_argument("--prompt-file", required=True)
    go.add_argument("--receipt-file")
    go.add_argument("--cwd")
    go.add_argument("--model", default=os.environ.get("CODEX_LANE_MODEL"))
    go.add_argument("--reasoning-effort", choices=("low", "medium", "high", "xhigh"))
    sub.add_parser("status")
    sub.add_parser("health")
    refresh = sub.add_parser("reconcile")
    refresh.add_argument("--if-due", type=int, default=LEDGER_CADENCE_S)
    receipt = sub.add_parser("install-receipt")
    receipt.add_argument("--source-commit", required=True)
    receipt.add_argument("--source-tree", required=True)
    receipt.add_argument("--platform", required=True)
    receipt.add_argument("--cadence", type=int, default=LEDGER_CADENCE_S)
    args = parser.parse_args(argv)
    if args.command == "run":
        return run(args)
    if args.command == "reconcile":
        print(json.dumps(reconcile(if_due=args.if_due), sort_keys=True))
        return 0
    if args.command == "install-receipt":
        payload = {"schema": "jovie.capacity-ledger-install/v1", "installedAt": iso(time.time()),
                   "sourceCommit": args.source_commit, "sourceTree": args.source_tree,
                   "platform": args.platform, "monitorCadenceSeconds": args.cadence,
                   "leaseSchema": LEDGER_SCHEMA}
        path = STATE.parent / "capacity-ledger-install.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps(payload, indent=1, sort_keys=True))
        os.replace(tmp, path)
        print(json.dumps(payload, sort_keys=True))
        return 0
    report = status()
    if args.command == "status":
        print(json.dumps(report, indent=1))
        return 0
    print(f"codex accounts available: {len(report['available'])}/{report['count']}")
    return 0 if report["available"] else 1


if __name__ == "__main__":
    sys.exit(main())
