#!/usr/bin/env python3
"""One-time Telegram login and headless inbox archiving (JOV-4423)."""
from __future__ import annotations

import argparse
import asyncio
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import fcntl
import getpass
import json
import logging
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import tempfile
import warnings
from uuid import uuid4

DEFAULT_STATE = Path.home() / ".local/state/jovie/telegram-archive"
REQUIREMENTS = Path(__file__).with_name("telegram-archive") / "requirements.txt"
RPC_TIMEOUT = 90
AUTH_SCHEMA = "personal-telegram-auth/v1"
FAILURE_MESSAGE = "telegram-archive: operation failed; inspect private state on the account's device."
LOGIN_INSTRUCTION = (
    "On the account's device, run python3 scripts/telegram_archive.py login in a private "
    "terminal, using the same private state directory; enter account inputs and the login "
    "code only there. Then resume with status. Do not send credentials to the agent."
)


class ArchiveError(Exception):
    """An actionable error safe to print without private account details."""


class AuthRequired(ArchiveError):
    """Stop until the account owner logs in locally; never retry or prompt headless."""


class PrivateArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, "telegram-archive: invalid arguments; use --help (never pass credentials).\n")


def auth_receipt(state, ready):
    path = state / "auth-receipt.json"
    try:
        previous = read_json(path) if path.exists() else {}
    except ValueError:
        previous = {}
    if not isinstance(previous, dict):
        previous = {}
    # Construct an allowlisted projection; never echo fields read from disk.
    notified = (previous.get("schema") == AUTH_SCHEMA
                and previous.get("status") == "blocked"
                and previous.get("instruction_emitted") is True)
    receipt = {"schema": AUTH_SCHEMA, "classification": "personal",
               "externalization": "denied", "dispatch_allowed": False,
               "status": "ready" if ready else "blocked",
               "instruction_emitted": not ready}
    write_json(path, receipt)
    if not ready and not notified:
        print(LOGIN_INSTRUCTION, file=sys.stderr)
    print(json.dumps(receipt, sort_keys=True))
    return receipt


def prepare_state(state):
    state = state.expanduser().absolute()
    if any(ord(char) < 32 for char in str(state)):
        raise ArchiveError("State path must not contain control characters.")
    if state.is_symlink():
        raise ArchiveError("State directory must not be a symlink.")
    if any((parent / ".git").is_file() or (parent / ".git/HEAD").is_file()
           for parent in (state.resolve(), *state.resolve().parents)):
        raise ArchiveError("Private Telegram state must live outside a Git checkout.")
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    if state.stat().st_uid != os.getuid():
        raise ArchiveError("State directory must belong to the current user.")
    state.chmod(0o700)
    return state.resolve()


def private_file(path):
    if path.is_symlink():
        raise ArchiveError("Private state files must not be symlinks.")
    if path.exists():
        info = path.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
            raise ArchiveError("Private state files must be owned regular files.")
        path.chmod(0o600)


def write_json(path, value):
    private_file(path)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".write-")
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, indent=2, ensure_ascii=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def read_json(path):
    private_file(path)
    return json.loads(path.read_text())


@contextmanager
def session_lock(state):
    path = state / "run.lock"
    private_file(path)
    with path.open("a+") as stream:
        os.fchmod(stream.fileno(), 0o600)
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ArchiveError("Another login/archive run holds the session lock.") from None
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def normalize_phone(value):
    phone = re.sub(r"[\s().-]", "", value)
    if phone.startswith("00"):
        phone = "+" + phone[2:]
    digits = phone.removeprefix("+")
    # Historical input omitted the US country code, including after '+'.
    if re.fullmatch(r"[2-9]\d{9}", digits):
        phone = "+1" + digits
    elif re.fullmatch(r"1\d{10}", phone):
        phone = "+" + phone
    if not re.fullmatch(r"\+[1-9]\d{7,14}", phone):
        raise ArchiveError("Phone must include a country code (US 10-digit input is normalized).")
    return phone


def load_config(state, interactive):
    path = state / "account.json"
    config = read_json(path) if path.exists() else {}
    for key, variable, prompt in (
        ("api_id", "TELEGRAM_API_ID", "Telegram API ID: "),
        ("api_hash", "TELEGRAM_API_HASH", "Telegram API hash: "),
        ("phone", "TELEGRAM_PHONE", "Telegram phone with country code: "),
    ):
        if not config.get(key):
            value = os.environ.get(variable)
            if not value and interactive:
                value = getpass.getpass(prompt)
            if not value:
                raise AuthRequired()
            config[key] = value.strip()
    try:
        config["api_id"] = int(config["api_id"])
    except (TypeError, ValueError):
        raise ArchiveError("Telegram API ID must be a positive integer.") from None
    if config["api_id"] <= 0 or not re.fullmatch(r"[a-fA-F0-9]{32}", config["api_hash"]):
        raise ArchiveError("Telegram API ID/hash are invalid; check the private account config.")
    config["phone"] = normalize_phone(config["phone"])
    if interactive:
        # Persist before OTP so an interrupted login reuses supplied inputs.
        write_json(path, config)
    return config


def bootstrap(state, arguments):
    """Only explicit login may install dependencies, never a scheduled run."""
    environment = state / "venv"
    if Path(sys.prefix).resolve() == environment:
        return
    subprocess.run([sys.executable, "-m", "venv", str(environment)], check=True, timeout=120,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    python = environment / "bin/python"
    subprocess.run(
        [str(python), "-m", "pip", "install", "--disable-pip-version-check",
         "--require-hashes", "-r", str(REQUIREMENTS)], check=True, timeout=240,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    os.execv(str(python), [str(python), str(Path(__file__).resolve()), *arguments])


def reuse_environment(state, arguments):
    """Resume with the installed interpreter; headless commands never install."""
    environment = state / "venv"
    python = environment / "bin/python"
    if Path(sys.prefix).resolve() != environment and python.is_file():
        os.execv(str(python), [str(python), str(Path(__file__).resolve()), *arguments])


def make_client(state, config):
    try:
        from telethon import TelegramClient
    except ImportError:
        raise AuthRequired("Local setup required.") from None
    for suffix in ("", "-journal", "-wal", "-shm"):
        private_file(state / f"telegram.session{suffix}")
    return TelegramClient(
        str(state / "telegram.session"), config["api_id"], config["api_hash"],
        request_retries=2, connection_retries=2, flood_sleep_threshold=30,
        receive_updates=False, raise_last_call_error=True,
    )


async def rpc(awaitable):
    return await asyncio.wait_for(awaitable, timeout=RPC_TIMEOUT)


async def login(client, state, config):
    from telethon.errors import SessionPasswordNeededError

    await rpc(client.connect())
    if not await rpc(client.is_user_authorized()):
        if not sys.stdin.isatty():
            raise AuthRequired("Local terminal authentication required.")
        sent = await rpc(client.send_code_request(config["phone"]))
        code = getpass.getpass("Telegram login code: ").strip()
        try:
            await rpc(client.sign_in(config["phone"], code, phone_code_hash=sent.phone_code_hash))
        except SessionPasswordNeededError:
            await rpc(client.sign_in(password=getpass.getpass("Telegram two-step password: ")))
    user = await rpc(client.get_me())
    if user is None or user.bot:
        raise ArchiveError("A Telegram user account is required.")
    if config.get("user_id") not in (None, user.id):
        raise ArchiveError("Session account differs from the saved account; use a separate state directory.")
    config["user_id"] = user.id
    write_json(state / "account.json", config)
    auth_receipt(state, True)


async def check_auth(client, config):
    await rpc(client.connect())
    if not await rpc(client.is_user_authorized()):
        raise AuthRequired("Session revoked; run login in a local terminal.")
    user = await rpc(client.get_me())
    if user is None or user.bot or user.id != config.get("user_id"):
        raise AuthRequired("Saved account differs; run login in a local terminal.")
    return user


async def classify(client, entity, cutoff):
    messages = await rpc(client.get_messages(entity, limit=1))
    if len(messages) == 0:
        return "empty"
    date = getattr(messages[0], "date", None)
    if date is None:
        return "unknown_date"
    if date.tzinfo is None:
        date = date.replace(tzinfo=timezone.utc)
    return "old" if date < cutoff else "recent"


def summary(report):
    counts = {reason: sum(item["reason"] == reason for item in report["archived"])
              for reason in ("empty", "old")}
    return (f"Telegram archive: {report['status']}. "
            f"Archived {len(report['archived'])} chats "
            f"({counts['empty']} empty, {counts['old']} inactive >7 days). "
            f"Skipped {sum(report['skipped'].values())}. "
            "The attached private report lists each chat and reason.")


async def deliver_pending(client, state):
    for path in sorted(state.glob("report-*.json")):
        report = read_json(path)
        if report["dry_run"] or report.get("summary_message_id"):
            continue
        if report["status"] == "running":
            report["status"] = "interrupted"
            write_json(path, report)
        # A private document avoids truncating long lists or exposing titles to cron logs.
        message = await rpc(client.send_file(
            "me", str(path), caption=summary(report), force_document=True, parse_mode=None,
        ))
        report["summary_message_id"] = message.id
        write_json(path, report)


def load_report(state, identifier):
    if not isinstance(identifier, str) or not re.fullmatch(r"report-\d{8}T\d{6}-[a-f0-9]{32}\.json", identifier):
        raise ArchiveError("Use a private report ID from a completed dry run or archive.")
    return state / identifier, read_json(state / identifier)


async def archive(client, state, config, dry_run=False, now=None, reviewed_plan=None):
    user = await check_auth(client, config)
    now = now or datetime.now(timezone.utc)
    approved = None
    if not dry_run:
        plan_path, plan = load_report(state, reviewed_plan)
        age = now - datetime.fromisoformat(plan["started_at"])
        if (plan.get("dry_run") is not True or plan.get("status") != "completed"
                or plan.get("user_id") != user.id or plan.get("applied")
                or not timedelta(0) <= age <= timedelta(days=1)):
            raise ArchiveError("Review a fresh completed dry run for this account before archiving.")
        approved = {(item["id"], item["reason"]) for item in plan["planned"]}
        # Consume review before side effects. A retry requires a new dry run.
        plan["applied"] = True
        write_json(plan_path, plan)
    if not dry_run:
        # Retry undelivered reports before making more changes.
        await deliver_pending(client, state)
    cutoff = now - timedelta(days=7)
    report = {"started_at": now.isoformat(), "cutoff": cutoff.isoformat(), "user_id": user.id,
              "reviewed_plan": reviewed_plan,
              "dry_run": dry_run, "status": "running", "archived": [], "attempted": [], "planned": [],
              "skipped": {}, "summary_message_id": None}
    path = state / f"report-{now.strftime('%Y%m%dT%H%M%S')}-{uuid4().hex}.json"
    write_json(path, report)

    def skip(reason):
        report["skipped"][reason] = report["skipped"].get(reason, 0) + 1

    try:
        # Snapshot before mutation so changing folders cannot invalidate dialog pagination.
        dialogs = await rpc(client.get_dialogs(folder=0, ignore_migrated=True))
        passes = {"empty": [], "old": []}
        for dialog in dialogs:
            if dialog.id == user.id or dialog.archived:
                skip("saved_or_archived")
                continue
            reason = await classify(client, dialog.input_entity, cutoff)
            if reason in passes:
                passes[reason].append(dialog)
            else:
                skip(reason)
        for reason in ("empty", "old"):
            for dialog in passes[reason]:
                if approved is not None and (dialog.id, reason) not in approved:
                    skip("not_reviewed")
                    continue
                # Activity may have changed while reading a large inbox.
                if await classify(client, dialog.input_entity, cutoff) != reason:
                    skip("activity_changed")
                    continue
                item = {"id": dialog.id, "title": dialog.name, "reason": reason}
                if dry_run:
                    report["planned"].append(item)
                else:
                    # Write intent first: even an ambiguous RPC/crash has an undo target.
                    report["attempted"].append(item)
                    write_json(path, report)
                    await rpc(client.edit_folder(dialog.input_entity, folder=1))
                    report["archived"].append(item)
                write_json(path, report)
        report["status"] = "completed"
    except Exception:
        # Preserve partial success and avoid leaking request contents/phone in error text.
        report["status"] = "failed"
        report["error_type"] = "request_failed"
    write_json(path, report)
    print(summary(report))
    if dry_run:
        print(f"Dry run: {len(report['planned'])} chats would be archived; no summary sent.")
    print(f"Private report ID: {path.name}")
    if not dry_run:
        await deliver_pending(client, state)
    return 0 if report["status"] == "completed" else 1


async def inspect_archive(client, state, config, identifier, undo=False):
    user = await check_auth(client, config)
    path, report = load_report(state, identifier)
    if report.get("dry_run") is not False or report.get("user_id") != user.id:
        raise ArchiveError("Verification/undo requires an archive report for this account.")
    archived = {item.id: item for item in await rpc(client.get_dialogs(folder=1, ignore_migrated=True))}
    targets = report.get("attempted", report["archived"])
    restored = report.setdefault("restored", [])
    if undo:
        report.pop("verification", None)
        write_json(path, report)
        for item in targets:
            identifier = item["id"]
            if identifier not in restored:
                if identifier in archived:
                    await rpc(client.edit_folder(archived[identifier].input_entity, folder=0))
                restored.append(identifier)
                write_json(path, report)
        print("Undo recorded. Run verify separately to confirm folder state.")
        return 0
    passed = all((item["id"] in archived) == (item["id"] not in restored)
                 for item in targets)
    report["verification"] = {"status": "passed" if passed else "failed",
                              "checked_at": datetime.now(timezone.utc).isoformat()}
    write_json(path, report)
    print(f"Archive verification: {report['verification']['status']}.")
    return 0 if passed else 1


def cron_line(state):
    command = shlex.join([str(state / "venv/bin/python"), str(Path(__file__).resolve()),
                          "archive", "--dry-run", "--state-dir", str(state)])
    # Crontab treats '%' specially even inside shell quotes.
    command = command.replace("%", r"\%")
    return f"0 7 * * * {command}"


async def run(command, state, config, dry_run, reviewed_plan=None, report=None):
    client = make_client(state, config)
    try:
        if command == "login":
            await login(client, state, config)
            return 0
        if command == "status":
            await check_auth(client, config)
            auth_receipt(state, True)
            return 0
        if command in ("undo", "verify"):
            return await inspect_archive(client, state, config, report, undo=command == "undo")
        return await archive(client, state, config, dry_run, reviewed_plan=reviewed_plan)
    finally:
        await rpc(client.disconnect())


def main(arguments=None):
    arguments = list(sys.argv[1:] if arguments is None else arguments)
    parser = PrivateArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("archive", "cron", "login", "status", "undo", "verify"))
    parser.add_argument("--state-dir", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reviewed-plan", help="Reviewed private dry-run report ID (valid for 24 hours)")
    parser.add_argument("--report", help="Private archive report ID to verify or undo")
    args = parser.parse_args(arguments)
    if args.dry_run and args.command != "archive":
        parser.error("--dry-run is only valid with archive")
    if args.reviewed_plan and (args.command != "archive" or args.dry_run):
        parser.error("--reviewed-plan requires a live archive")
    if bool(args.report) != (args.command in ("undo", "verify")):
        parser.error("--report is required only with undo or verify")
    os.umask(0o077)
    # Library diagnostics may include request/peer details. Only our projection
    # and fixed messages may reach captured output in this standalone process.
    logging.disable(logging.CRITICAL)
    warnings.simplefilter("error", getpass.GetPassWarning)
    try:
        state = prepare_state(args.state_dir)
        if args.command == "cron":
            print(cron_line(state))
            return 0
        if args.command == "login":
            if not sys.stdin.isatty():
                raise AuthRequired()
            bootstrap(state, arguments)
        else:
            reuse_environment(state, arguments)
        with session_lock(state):
            config = load_config(state, interactive=args.command == "login" and sys.stdin.isatty())
            return asyncio.run(run(args.command, state, config, args.dry_run,
                                   args.reviewed_plan, args.report))
    except AuthRequired:
        try:
            with session_lock(state):
                auth_receipt(state, False)
            return 2
        except (Exception, KeyboardInterrupt):
            print(FAILURE_MESSAGE, file=sys.stderr)
    except (Exception, KeyboardInterrupt):
        # Even exception class names and custom paths may contain private inputs.
        print(FAILURE_MESSAGE, file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
