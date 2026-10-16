# Telegram inbox archiving

Standalone Telethon user-account tool for JOV-4423. This does not start or depend
on an agent runtime. Run it on Summer's MacBook Air from a stable checkout that
will remain on disk. Requires Python 3.9+ with `venv` and internet access.

## Initial login: one command

From the repository root, in a terminal on the Air:

```sh
python3 scripts/telegram_archive.py login
```

The command creates an isolated Python environment, installs the hash-locked
dependencies, and reuses the private account configuration if one exists. For
first setup it reads `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, and `TELEGRAM_PHONE`
from the environment, prompting without echo for missing inputs. Use an existing
authorized Doppler scope to supply those variables when available; do not paste
credentials into commands, issues or source. Existing account configuration takes
precedence over environment values. API credentials come from `my.telegram.org`;
a bot token cannot archive user-account dialogs.

Supply the Telegram code in that terminal (Telegram may deliver it to another
logged-in Telegram app). If two-step verification is enabled, enter its password
there too. Neither code nor password is persisted. Phone input with a missing US
country code is normalized once, including the historical `+` plus ten digits
case. Other international numbers require their country code.

The default state directory is `~/.local/state/jovie/telegram-archive`. It contains
`account.json`, `telegram.session`, the virtual environment, and private reports.
The directory is mode `0700`; account/session/report files are `0600`. Treat the
session as an account credential. State inside a Git checkout is rejected. An
optional `--state-dir /absolute/private/path` must be used consistently on every
command. Never copy session files or account details into a PR or shared brain.

Successful login prints a confirmation. Re-running login reuses authorization
without requesting another code. A revoked session requires this command again;
scheduled runs fail with an actionable error and never request codes.

## Preview and run

After login, these commands use the saved virtual environment and session:

```sh
"$HOME/.local/state/jovie/telegram-archive/venv/bin/python" scripts/telegram_archive.py archive --dry-run
"$HOME/.local/state/jovie/telegram-archive/venv/bin/python" scripts/telegram_archive.py archive
```

The script snapshots inbox dialogs and checks their latest message. It archives
confirmed zero-message chats first, then chats whose latest message is strictly
older than seven days in UTC. Exactly seven days, recent chats, unknown dates,
Saved Messages and already archived chats are skipped. Unread count is not a
message count. Candidates are checked again immediately before being moved so
new activity during scanning skips that chat. Only the archive folder changes;
messages and memberships are preserved. Pinned, unread, group and bot dialogs
follow the same age policy. Telegram may bring a chat back to the inbox when a
new message arrives; the next run evaluates its current activity.

Dry runs save a private candidate report and make no archive or delivery calls.
Live runs send a count summary plus the full JSON report to **Saved Messages in
the authenticated account**. The account ID is bound during login and checked on
every archive run. Commissioning must verify that this is Tim's account.

Reports record each successful chat move, the reason, skipped counts, UTC cutoff
and completion/failure status. Raw message contents, codes and passwords are
excluded. Cron output includes counts and the report path, never chat titles.
Delivery failures return nonzero and leave the report pending; the next live run
retries delivery before any new changes. An interrupted run's report is marked
interrupted on retry. A crash after Telegram accepts a move but before its local
receipt can leave that move unrecorded; an ambiguous delivery can duplicate a
summary on retry. Neither is a claim of exactly-once delivery. Keep reports
private and retain them according to the account owner's local data policy.

## Schedule on the Air

Print a daily 07:00 local-time crontab entry containing absolute paths:

```sh
python3 scripts/telegram_archive.py cron
```

Install that printed line with `crontab -e`, preserving existing entries. Scheduler
installation is an operator action; printing the line does not install it. The
cron process needs no shell profile, Doppler login or interactive input. Keep the
checkout and state path stable. The Mac must be awake and online at that time;
cron does not catch up a missed invocation. Requests have finite retries and a
90-second timeout; concurrent login/archive processes share a nonblocking lock.
Large Telegram flood waits fail the run and are reported rather than sleeping
indefinitely. A later daily run resumes from the remaining inbox dialogs.

Commissioning evidence: record the installed script's Git SHA, successful login,
installed crontab, dry-run result, live exit code, private report counts, and the
Saved Messages delivery ID. Do not mark device installation or delivery complete
from tests alone. Stop scheduling by removing only this crontab entry. Preserve
the session for re-use, or revoke it through Telegram's Devices settings if
retiring access.

## Verification and cost

```sh
python3 -m pytest scripts/tests/test_telegram_archive.py -q
```

These tests run in the existing CI Python coverage suite without Telegram
credentials or network. No new workflow or paid service is introduced. One
daily account run reads inbox dialog pages, makes one latest-message request per
dialog plus one per candidate, one folder edit per eligible chat, and uploads one
small report. This is private single-account tooling, not per-customer polling.
Telethon is MIT licensed; the pinned transitive dependencies retain their own
licenses. To regenerate the lock with an existing `uv` installation:

```sh
echo 'Telethon==1.45.0' | uv pip compile --generate-hashes --no-annotate --no-header -o scripts/telegram-archive/requirements.txt -
```
