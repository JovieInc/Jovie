# Telegram inbox archiving

Standalone Telethon user-account tool for JOV-4423 and JOV-4490. This does not
start or depend on an agent runtime. Run it on Summer's MacBook Air from a stable checkout that
will remain on disk. Requires Python 3.9+ with `venv` and internet access.

## Agent privacy and resume contract

Personal Telegram cleanup is **personal**, with **externalization denied**, even
when a company task is mentioned alongside it. Conversation intake refuses to
create/link company issues or build dispatch packets from these requests. Keep
raw account material, contact details, codes, session files, chat titles, and
private report contents out of GitHub, Linear, prompts, shared agent context,
and shared GBrain. Never ask the user to paste a secret into chat. A company
engineering repair may describe the defect without including private evidence.

The only authentication entry point is the account owner's private on-device
terminal. Reuse the locally saved configuration; do not export/import sessions
between agent runtimes. Use encrypted device storage for the private state.
An agent may run the following non-interactive probe on that same device:

```sh
python3 scripts/telegram_archive.py status
```

`status` checks the saved session against Telegram without sending a code. It
automatically reuses the existing private virtual environment without installing
anything, then prints and atomically stores `auth-receipt.json`: a fixed schema, personal
classification, denied externalization, disabled dispatch, readiness (`ready`
or `blocked`), and whether the blocked instruction has been emitted. It contains
no phone, API hash, code, session contents/path, account ID, conversation link,
or free-text error. Only this allowlisted output may be used as a task receipt;
never attach the state directory. Exit 0 means observed ready; exit 2 means
local authentication/setup is required; exit 1 is an operation failure.

On the first blocked result the tool gives one instruction: run `login` in a
private terminal on the account's device, enter inputs only there, then resume
with `status`. Persist the redacted receipt and stop. Do not poll, automatically
retry login, or ask for the phone/code again. Repeated blocked probes across
process restarts suppress that instruction. A successful login clears the block;
a later revocation permits one new instruction. After the owner completes login,
resume with `status`, then preview. A stored ready receipt is context, never
proof of current authorization: every command rechecks the saved account.

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

Successful login prints the redacted ready receipt. Re-running login reuses
authorization without requesting another code. A revoked session requires this command again;
scheduled runs fail with an actionable error and never request codes.

## Preview and run

After login, these commands use the saved virtual environment and session:

```sh
"$HOME/.local/state/jovie/telegram-archive/venv/bin/python" scripts/telegram_archive.py archive --dry-run
# Inspect the generated report locally; substitute its report ID after review.
"$HOME/.local/state/jovie/telegram-archive/venv/bin/python" scripts/telegram_archive.py archive --reviewed-plan report-YYYYMMDDTHHMMSS-UUID.json
"$HOME/.local/state/jovie/telegram-archive/venv/bin/python" scripts/telegram_archive.py verify --report report-YYYYMMDDTHHMMSS-UUID.json
```

A live run requires explicit `--reviewed-plan` selection of a completed dry-run
report for the same authenticated account, created within 24 hours. Review its
candidate list locally first. A plan is consumed once, before side effects;
failed or interrupted attempts require a fresh preview/review. Newly eligible
chats cannot be added by the live run. The cron command now schedules **dry runs
only** so unattended archiving cannot bypass this review boundary.

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
excluded. Output includes counts and an opaque report ID, never private paths or
chat titles.
Delivery failures return nonzero and leave the report pending; the next live run
retries delivery before any new changes. An interrupted run's report is marked
interrupted on retry. Each move's intent is written before the RPC so an
interrupted or ambiguous move remains a target for verification/undo; an ambiguous delivery can duplicate
a summary on retry. Neither is a claim of exactly-once delivery. Keep reports
private and retain them according to the account owner's local data policy.

A successful move is not verification. Run `verify --report <live-report-id>`
separately; it reads current folder state, stores a private verification result,
and exits nonzero on disagreement. New messages can legitimately return chats to
the inbox, which this check reports. Reverse a run with:

```sh
"$HOME/.local/state/jovie/telegram-archive/venv/bin/python" scripts/telegram_archive.py undo --report report-YYYYMMDDTHHMMSS-UUID.json
"$HOME/.local/state/jovie/telegram-archive/venv/bin/python" scripts/telegram_archive.py verify --report report-YYYYMMDDTHHMMSS-UUID.json
```

Use the live run's report ID for verification and undo, not the preview ID. Undo
moves only that run's attempted chats back to the inbox, records progress for
safe retries, and invalidates earlier verification. It never deletes messages or
leaves groups. Verify again after undo. Reports remain on-device; only redacted
outcomes belong in task context.

## Schedule previews on the Air

Print a daily 07:00 local-time **dry-run** crontab entry containing absolute paths:

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
indefinitely. A later daily preview evaluates the current inbox; live mutation
still requires review.

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
credentials or network. No new workflow or paid service is introduced. A
preview reads inbox dialog pages and makes one latest-message request per dialog
plus one per candidate. A reviewed live run adds one folder edit per eligible
chat and uploads one small report. This is private single-account tooling, not per-customer polling.
Telethon is MIT licensed; the pinned transitive dependencies retain their own
licenses. To regenerate the lock with an existing `uv` installation:

```sh
echo 'Telethon==1.45.0' | uv pip compile --generate-hashes --no-annotate --no-header -o scripts/telegram-archive/requirements.txt -
```

EVENT: Personal-account authentication remains on-device; shared systems receive
only allowlisted receipts. Ship now: require a fresh reviewed preview for each
archive run. Re-evaluate when repeated local previews demonstrate a need for a
bounded standing authorization. Then: design and test an account-bound, expiring
policy before changing the review gate; scheduling does not imply authorization.
