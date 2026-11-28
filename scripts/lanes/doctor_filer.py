"""The JOV-14452 filer engine: durable ledger + Linear upserts (moved from
doctor_keys so each file stays under the 500-line new-file cap).

doctor_keys owns stable identity (normalize, keys, close plans); this module owns
the state that files issues: the per-family create+reopen cap, flap damping and
the per-host rollup checklist (Backlog, never Triage). A sweep report with no
readable secretHeld is UNKNOWN coverage — a hold, never an empty set — so nothing
closes mid-sweep (P0 2026-11-24).
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

from doctor_keys import (
    ANOMALY_CLASS,
    CAP_WINDOW_S,
    CHECKLIST_ITEM_CAP,
    CREATE_CAP_PER_HOUR,
    FLAP_COMMENT_INTERVAL_S,
    FLAP_LABEL,
    FLAP_REOPENS,
    FLAP_WINDOW_S,
    ROLLOUP_KEY,
    default_ledger_path,
    issue_title,
    marker,
    now_iso,
    stable_of,
)


class FilerLedger:
    """Durable filer state beside doctor.json: create-cap window, reopen/flap counts,
    damp-comment stamps, and the rollup checklist. A lost ledger rebuilds; Linear
    markers keep issue identity."""

    def __init__(self, path: Path | None):
        self.path = path
        self.data: dict = {"creates": {}, "reopens": {}, "reopenFamilies": {},
                           "flapComments": {}, "overflowAt": {}, "rollup": {"classes": {}}}
        if path is not None:
            try:
                loaded = json.loads(path.read_text())
                if isinstance(loaded, dict):
                    self.data.update(loaded)
            except (OSError, ValueError):
                pass
        # Legacy shapes stay conservative: an unattributed stamp counts for every
        # family ("*"), so a migration can only tighten the cap, never loosen it.
        if isinstance(self.data.get("creates"), list):
            self.data["creates"] = {"*": [float(at) for at in self.data["creates"]]}
        if not isinstance(self.data.get("overflowAt"), dict):
            at = self.data.get("overflowAt")
            self.data["overflowAt"] = {"*": float(at)} if isinstance(at, (int, float)) else {}

    # -- create/reopen window per key family (the rate cap; P0 2026-11-24)
    def creates_within(self, family: str | None, window_s: float, now: float) -> int:
        rows = self.data.get("creates") or {}
        buckets = list(rows.values()) if family is None else [rows.get(family) or [], rows.get("*") or []]
        return sum(1 for bucket in buckets for at in bucket if now - float(at) < window_s)

    def record_create(self, now: float, family: str | None = None) -> None:
        rows = self.data.setdefault("creates", {})
        if not isinstance(rows, dict):
            rows = self.data["creates"] = {"*": list(rows)}
        name = family if family is not None else "*"
        kept = [at for at in rows.get(name, []) if now - at < FLAP_WINDOW_S] + [now]
        rows[name] = kept
        self.save()

    def family_actions_within(self, family: str, window_s: float, now: float) -> int:
        """Creates plus reopens attributed to this family inside the window."""
        stamps = (self.data.get("reopenFamilies") or {}).get(family) or []
        return (self.creates_within(family, window_s, now)
                + sum(1 for at in stamps if now - float(at) < window_s))

    # -- reopen/flap window per stable key
    def reopens_within(self, stable: str, window_s: float, now: float) -> int:
        return sum(1 for at in (self.data.get("reopens") or {}).get(stable, []) if now - at < window_s)

    def record_reopen(self, stable: str, now: float, family: str | None = None) -> None:
        rows = self.data.setdefault("reopens", {})
        kept = [at for at in rows.get(stable, []) if now - at < FLAP_WINDOW_S] + [now]
        rows[stable] = kept
        if family is not None:  # state-changing reopens feed the family cap; damped holds do not
            family_rows = self.data.setdefault("reopenFamilies", {})
            kept_f = [at for at in family_rows.get(family, []) if now - at < FLAP_WINDOW_S] + [now]
            family_rows[family] = kept_f
        self.save()

    def reopens_total_within(self, window_s: float, now: float) -> int:
        return sum(1 for rows in (self.data.get("reopens") or {}).values()
                   for at in rows if now - at < window_s)

    # -- damp comments (at most one per day per damped issue)
    def comment_due(self, stable: str, now: float) -> bool:
        last = (self.data.get("flapComments") or {}).get(stable)
        return last is None or now - float(last) >= FLAP_COMMENT_INTERVAL_S

    def record_comment(self, stable: str, now: float) -> None:
        self.data.setdefault("flapComments", {})[stable] = now
        self.save()

    # -- rate-cap overflow (doctor-filer-anomaly), per family
    def note_overflow(self, now: float, family: str | None = None) -> None:
        rows = self.data.get("overflowAt")
        if not isinstance(rows, dict):
            rows = self.data["overflowAt"] = {}
        rows[family if family is not None else "*"] = now
        self.save()

    def overflow_within(self, window_s: float, now: float, family: str | None = None) -> bool:
        rows = self.data.get("overflowAt")
        if not isinstance(rows, dict):
            return False
        names = list(rows) if family is None else [family, "*"]
        return any(now - float(rows[name]) < window_s for name in names if name in rows)

    # -- rollup checklist: class -> {"text", "firstSeenAt", "keys": {stable: text}}
    def rollup_id(self):
        return (self.data.get("rollup") or {}).get("id")

    def set_rollup_id(self, issue_id: str | None) -> None:
        self.data.setdefault("rollup", {})["id"] = issue_id
        self.save()

    def rollup_classes(self) -> dict:
        return (self.data.get("rollup") or {}).get("classes") or {}

    def class_has(self, group: str, stable: str) -> bool:
        return stable in ((self.rollup_classes().get(group) or {}).get("keys") or {})

    def add_rollup_item(self, group: str, stable: str, text: str, now: float) -> None:
        classes = self.data.setdefault("rollup", {}).setdefault("classes", {})
        row = classes.setdefault(group, {"firstSeenAt": now, "keys": {}})
        row["keys"][stable] = str(text)[:400]
        row["text"] = str(text)[:400]
        self.save()

    def remove_rollup_item(self, group: str, stable: str) -> bool:
        classes = self.data.setdefault("rollup", {}).setdefault("classes", {})
        row = classes.get(group)
        if not row or stable not in (row.get("keys") or {}):
            return False
        row["keys"].pop(stable, None)
        if not row["keys"]:
            classes.pop(group, None)
        self.save()
        return True

    def save(self) -> None:
        if self.path is None:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, default=str))
            os.replace(tmp, self.path)
        except OSError:
            pass  # Linear keeps durable truth; a lost window only re-tightens slowly


class Filer:
    """The JOV-14452 guardrail engine behind doctor.Tracker: marker upsert, flap
    damping, the per-hour create cap and the host rollup checklist. Callers supply
    the Linear transport (gql/move/comment/state_of) exactly as doctor.Tracker does."""

    def __init__(self, linear, host: str, ledger: FilerLedger | None = None):
        self.linear, self.host = linear, host
        self.ledger = ledger if ledger is not None else FilerLedger(default_ledger_path())
        self.last_error = None     # why the last open() produced no issue id
        self.last_action = None    # created|reused|rollup|capped — what open() actually did
        self.existing_error = None
        self._dirty = False

    # -- identity -------------------------------------------------------------
    def is_rollup(self, issue_id) -> bool:
        return issue_id is not None and issue_id == self.ledger.rollup_id()

    def _marker_lookup(self, marker_text: str):
        """(issue id, completed?) for the issue whose body carries this marker, any state."""
        try:
            data = self.linear.gql(
                'query($d:String!){issues(first:5,filter:{team:{key:{eq:"JOV"}},description:{contains:$d}})'
                '{nodes{id state{type}}}}', {"d": marker_text})
            nodes = ((data or {}).get("issues") or {}).get("nodes") or []
            self.existing_error = None
            if not nodes:
                return None, False
            node = nodes[0]
            return node.get("id"), (node.get("state") or {}).get("type") in ("completed", "canceled")
        except Exception as error:  # noqa: BLE001 - a failed lookup is reported, never swallowed
            self.existing_error = f"{type(error).__name__}: {str(error)[:160]}"
            return None, False

    def existing(self, key: str, reopen=None):
        """The issue owning this key in ANY state (JOV-14452): the body marker is the
        identity, so a closed owner is handed back for reopening instead of a twin.
        Impact-free keys never own an issue; their class line lives in the rollup."""
        if key == ROLLOUP_KEY:
            found, _ = self._marker_lookup(marker(key, self.host))
            return found
        stable, impact = stable_of(key)
        if impact:
            return self.ledger.rollup_id() if self.ledger.class_has(impact, stable) else None
        found, completed = self._marker_lookup(marker(key, self.host))
        if found and completed and reopen is not None:
            reopen(found, f"refired on `{self.host}`", key)
        return found

    # -- create/reopen cap per key family (P0 2026-11-24) ---------------------
    def cap_hit(self, family: str | None = None) -> bool:
        if family is None:
            return self.ledger.creates_within(None, CAP_WINDOW_S, time.time()) >= CREATE_CAP_PER_HOUR
        return self.ledger.family_actions_within(family, CAP_WINDOW_S, time.time()) >= CREATE_CAP_PER_HOUR

    def note_overflow(self, family: str | None = None) -> None:
        self.ledger.note_overflow(time.time(), family)

    def record_create(self, family: str | None = None) -> None:
        self.ledger.record_create(time.time(), family)

    # -- flap damping ---------------------------------------------------------
    def damped(self, stable: str) -> bool:
        return self.ledger.reopens_within(stable, FLAP_WINDOW_S, time.time()) >= FLAP_REOPENS

    def record_reopen(self, stable: str, family: str | None = None) -> None:
        self.ledger.record_reopen(stable, time.time(), family)

    def damp(self, issue_id: str, stable: str, text: str) -> None:
        """Freeze a flapping issue in place: label doctor-flapping when the team has it
        (the lanes app may not create labels), at most one comment a day, and no state
        moves — while still recording the attempt so the window stays sustained."""
        now = time.time()
        label_note = ""
        try:
            label_id = self._label_by_name(FLAP_LABEL)
            if label_id:
                self.linear.gql('mutation($id:String!,$l:String!){issueAddLabel(id:$id,labelId:$l){success}}',
                                {"id": issue_id, "l": label_id})
            else:
                label_note = (f" (label `{FLAP_LABEL}` is not on team JOV yet; "
                              "create it once to mark damped issues)")
        except Exception:  # noqa: BLE001 - the label is decoration; the freeze is local
            pass
        if self.ledger.comment_due(stable, now):
            try:
                self.linear.comment(
                    issue_id,
                    f"🤖 doctor: flapping ({FLAP_REOPENS}+ reopens in 24h) — leaving this issue in "
                    f"place on `{self.host}` at {now_iso()}: {text}{label_note}")
            except Exception as error:  # noqa: BLE001
                print(f"doctor: damped issue; notification failed ({type(error).__name__})", file=sys.stderr)
            self.ledger.record_comment(stable, now)
        self.ledger.record_reopen(stable, now)

    def _label_by_name(self, name: str):
        try:
            data = self.linear.gql(
                'query($n:String!){issueLabels(first:1,filter:{team:{key:{eq:"JOV"}},name:{eq:$n}}){nodes{id name}}}',
                {"n": name})
            node = (((data or {}).get("issueLabels") or {}).get("nodes") or [None])[0]
            return node["id"] if node and node.get("id") else None
        except Exception:  # noqa: BLE001
            return None

    # -- rollup ---------------------------------------------------------------
    def rollup_upsert(self, group: str, stable: str, text: str):
        """Fold one line into the host's single rollup issue; returns its id."""
        self.ledger.add_rollup_item(group, stable, text, time.time())
        self._dirty = True
        if self.ledger.rollup_id() is None:  # first use this process: create (or reclaim) now
            return self.publish()
        return self.ledger.rollup_id()

    def rollup_remove(self, group: str, stable: str) -> bool:
        """Drop one line; the rollup closes only when nothing is left."""
        removed = self.ledger.remove_rollup_item(group, stable)
        issue_id = self.ledger.rollup_id()
        if removed and issue_id and not self.ledger.rollup_classes() \
                and not self.ledger.overflow_within(CAP_WINDOW_S, time.time()):
            try:
                self.linear.move(issue_id, "Done")  # best-effort; the marker reclaims it on refire
            except Exception:  # noqa: BLE001
                pass
            self._dirty = False
        elif removed:
            self._dirty = True
        return True

    def publish(self):
        """Create or update the rollup issue to match the ledger checklist (batched)."""
        issue_id = self.ledger.rollup_id()
        if issue_id is None:
            found, _ = self._marker_lookup(marker(ROLLOUP_KEY, self.host))
            if found:
                issue_id = found
                self.ledger.set_rollup_id(found)
        description = self._description()
        if issue_id is None:
            issue_id = self._create_rollup(description)
        else:
            try:
                self.linear.gql('mutation($id:String!,$d:String!){issueUpdate(id:$id,input:{description:$d}){success}}',
                                {"id": issue_id, "d": description})
            except Exception:  # noqa: BLE001 - the checklist is a cache; the marker is truth
                pass
        self._dirty = False
        return issue_id

    def publish_if_dirty(self):
        if self._dirty:
            self.publish()

    def _description(self) -> str:
        classes = self.ledger.rollup_classes()
        lines = ["Auto-updated checklist of no-impact doctor conditions (JOV-14452); each class",
                 "below folds here instead of filing individual Triage issues.", ""]
        if self.ledger.overflow_within(CAP_WINDOW_S, time.time()):
            hit = sorted(name for name, at in (self.ledger.data.get("overflowAt") or {}).items()
                         if time.time() - float(at) < CAP_WINDOW_S)
            lines.append(f"- [ ] `{ANOMALY_CLASS}` — the per-family create+reopen cap "
                         f"({CREATE_CAP_PER_HOUR}/h) was hit ({', '.join(hit) or 'unknown'} family); "
                         "overflow is folded here")
        rows = sorted(classes.items(), key=lambda kv: float(kv[1].get("firstSeenAt") or 0))
        for name, row in rows[:CHECKLIST_ITEM_CAP]:
            variants = len(row.get("keys") or {})
            extra = f" (+{variants - 1} more variant(s))" if variants > 1 else ""
            lines.append(f"- [ ] `{name}` — {str(row.get('text') or '').strip()}{extra}")
        if len(rows) > CHECKLIST_ITEM_CAP:
            lines.append(f"- (+{len(rows) - CHECKLIST_ITEM_CAP} more classes)")
        lines += ["", marker(ROLLOUP_KEY, self.host)]
        return "\n".join(lines)

    def _create_rollup(self, description: str):
        team = self._team()
        labels = [l["id"] for l in team["labels"]["nodes"] if l["name"] == "symphony"]
        try:
            # Never Triage (P0 2026-11-24): the rollup is a background checklist,
            # not something a human triages; Backlog keeps it out of the intake queue.
            state = next((s["id"] for s in team["states"]["nodes"] if s["name"] in ("Backlog", "To Do")), None)
            data = self.linear.gql(
                'mutation($i:IssueCreateInput!){issueCreate(input:$i){issue{id identifier}}}',
                {"i": {"teamId": team["id"], "stateId": state, "labelIds": labels, "priority": 3,
                       "title": issue_title(ROLLOUP_KEY, self.host), "description": description}})
        except Exception as error:  # noqa: BLE001
            self.last_error = f"rollup-create-failed:{type(error).__name__}: {str(error)[:120]}"
            return None
        issue_id = ((data or {}).get("issueCreate") or {}).get("issue", {}).get("id")
        if issue_id:
            self.ledger.set_rollup_id(issue_id)
            self.record_create(ROLLOUP_KEY)  # its own family: the valve never eats a key family's budget
        return issue_id

    def _team(self) -> dict:
        data = self.linear.gql(
            'query{teams(filter:{key:{eq:"JOV"}}){nodes{id states{nodes{id name}} labels{nodes{id name}}}}}',
            {})["teams"]["nodes"][0]
        return data

    # -- self-monitor ---------------------------------------------------------
    def report(self, now: float) -> dict:
        """The filer block for doctor.json: creates/reopens per hour, cap, rollup, damping."""
        dampened = sorted(stable for stable in (self.ledger.data.get("reopens") or {})
                          if self.ledger.reopens_within(stable, FLAP_WINDOW_S, now) >= FLAP_REOPENS)
        families = sorted({*(self.ledger.data.get("creates") or {}),
                           *(self.ledger.data.get("reopenFamilies") or {})})
        return {"createCap": CREATE_CAP_PER_HOUR,
                "createsPastHour": self.ledger.creates_within(None, CAP_WINDOW_S, now),
                "reopensPastHour": self.ledger.reopens_total_within(CAP_WINDOW_S, now),
                "familiesPastHour": {name: self.ledger.family_actions_within(name, CAP_WINDOW_S, now)
                                     for name in families},
                "rollupId": self.ledger.rollup_id(),
                "rollupClasses": sorted(self.ledger.rollup_classes()),
                "dampened": dampened,
                "anomaly": self.ledger.overflow_within(CAP_WINDOW_S, now)}

LIVENESS_OWNER_NUMBER = 6004.0  # JOV-6004: the control-plane liveness tracker issue


def contradict_liveness(linear, event: dict) -> None:
    """Reopen the liveness owner only when a new typed generation contradicts its proof."""
    try:
        data = linear.gql(
            'query($n:Float!){issues(filter:{team:{key:{eq:"JOV"}},number:{eq:$n}})'
            '{nodes{id state{type}}}}', {"n": LIVENESS_OWNER_NUMBER})
        owner = data["issues"]["nodes"][0]
        if owner["state"]["type"] == "completed":
            linear.move(owner["id"], "Triage")
        linear.comment(
            owner["id"],
            f"🤖 liveness contradiction `{event['idempotencyKey']}`: {event['evidence']}\n\n"
            f"First observed: {event['firstObservedAt']}; deadline: {event['deadlineAt']}; "
            f"next: `{event['nextAction']}`.",
        )
    except Exception:
        pass
