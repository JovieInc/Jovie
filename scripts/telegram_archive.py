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
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import tempfile
from uuid import uuid4

DEFAULT_STATE = Path.home() / ".local/state/jovie/telegram-archive"
REQUIREMENTS = Path(__file__).with_name("telegram-archive") / "requirements.txt"
RPC_TIMEOUT = 90


class ArchiveError(Exception):
    """An actionable error safe to print without private account details."""


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
                raise ArchiveError("Account setup missing; run the login command in a terminal.")
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
    subprocess.run([sys.executable, "-m", "venv", str(environment)], check=True, timeout=120)
    python = environment / "bin/python"
    subprocess.run(
        [str(python), "-m", "pip", "install", "--disable-pip-version-check",
         "--require-hashes", "-r", str(REQUIREMENTS)], check=True, timeout=240,
    )
    os.execv(str(python), [str(python), str(Path(__file__).resolve()), *arguments])


def make_client(state, config):
    try:
        from telethon import TelegramClient
    except ImportError:
        raise ArchiveError("Telethon is missing; run the login command first.") from None
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
            raise ArchiveError("Initial login needs a terminal for the Telegram code; cron never prompts.")
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
    print("Telegram login saved. Scheduled archive runs can now reuse this session.")


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


async def archive(client, state, config, dry_run=False, now=None):
    await rpc(client.connect())
    if not await rpc(client.is_user_authorized()):
        raise ArchiveError("Session is missing or revoked; run login in a terminal. No code was requested.")
    user = await rpc(client.get_me())
    if user is None or user.bot or user.id != config.get("user_id"):
        raise ArchiveError("Session account is not the saved user account; run login before archiving.")
    if not dry_run:
        # Retry undelivered reports before making more changes.
        await deliver_pending(client, state)
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=7)
    report = {"started_at": now.isoformat(), "cutoff": cutoff.isoformat(),
              "dry_run": dry_run, "status": "running", "archived": [], "planned": [],
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
                # Activity may have changed while reading a large inbox.
                if await classify(client, dialog.input_entity, cutoff) != reason:
                    skip("activity_changed")
                    continue
                item = {"id": dialog.id, "title": dialog.name, "reason": reason}
                if dry_run:
                    report["planned"].append(item)
                else:
                    await rpc(client.edit_folder(dialog.input_entity, folder=1))
                    report["archived"].append(item)
                write_json(path, report)
        report["status"] = "completed"
    except Exception as error:
        # Preserve partial success and avoid leaking request contents/phone in error text.
        report["status"] = "failed"
        report["error_type"] = type(error).__name__
    write_json(path, report)
    print(summary(report))
    if dry_run:
        print(f"Dry run: {len(report['planned'])} chats would be archived; no summary sent.")
    print(f"Private report: {path}")
    if not dry_run:
        await deliver_pending(client, state)
    return 0 if report["status"] == "completed" else 1


def cron_line(state):
    command = shlex.join([str(state / "venv/bin/python"), str(Path(__file__).resolve()),
                          "archive", "--state-dir", str(state)])
    # Crontab treats '%' specially even inside shell quotes.
    command = command.replace("%", r"\%")
    return f"0 7 * * * {command}"


async def run(command, state, config, dry_run):
    client = make_client(state, config)
    try:
        if command == "login":
            await login(client, state, config)
            return 0
        return await archive(client, state, config, dry_run)
    finally:
        await rpc(client.disconnect())


def main(arguments=None):
    arguments = list(sys.argv[1:] if arguments is None else arguments)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("login", "archive", "cron"))
    parser.add_argument("--state-dir", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(arguments)
    if args.dry_run and args.command != "archive":
        parser.error("--dry-run is only valid with archive")
    os.umask(0o077)
    try:
        state = prepare_state(args.state_dir)
        if args.command == "cron":
            print(cron_line(state))
            return 0
        if args.command == "login":
            bootstrap(state, arguments)
        with session_lock(state):
            config = load_config(state, interactive=args.command == "login" and sys.stdin.isatty())
            return asyncio.run(run(args.command, state, config, args.dry_run))
    except ArchiveError as error:
        print(f"telegram-archive: {error}", file=sys.stderr)
    except (Exception, KeyboardInterrupt) as error:
        print(f"telegram-archive: {type(error).__name__}; inspect private state and retry. "
              "For authorization errors run login in a terminal.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
