# Grok proof-seat token identity

The useful-turn grok seat used to copy `~/.grok/auth.json` into the enrolled
`CODEX_HOME`. Every grok CLI refresh left that copy stale (the probe then
failed with `HTTP 403 unauthenticated:bad-credentials`) and, once the copy
was synced, changed `profile_identity()` because the hash covered the whole
file.

`symphony-grok-codex-completion` now reads the live grok CLI auth file
(`~/.grok/auth.json`, override `SYMPHONY_GROK_AUTH_PATH`). It selects the
single `https://auth.x.ai` OIDC entry, rejects an access token whose
`expires_at` is more than 30 seconds in the past, and never prints token
material. The grok CLI owns refresh and the atomic replace of that file.
This repo does not write `auth.json` and does not take the CLI's lock.

**Ship now:** 30-second expiry skew, and the grok CLI remains the refresher.
**Re-evaluate when:** host clocks disagree by more than 30 seconds, or the
grok CLI stops atomically replacing `~/.grok/auth.json`.
**Then:** adjust the skew, or add a locked refresh that matches the CLI's
replace protocol.

Grok `profile_identity()` hashes the resolved account path, the resolved live
auth path, `config.toml` bytes, and the stable principal
(`oidc_issuer`, `oidc_client_id`, `user_id`, `principal_id`,
`principal_type`, `team_id`, `email`, `auth_mode`). It excludes `key`,
`refresh_token`, `expires_at`, `create_time`, names, and any other field.
A different principal, a config change, or a symlink still invalidates the
seat. Kimi and other non-grok codex accounts still hash the full
`auth.json` under the account directory. `CODEX_HOME` remains the enrolled
account directory the probe already sets; only the bearer source changed.

## Migration

Current host `proof-context.json` grok row (2026-09-24, no secrets):

- `profile` = `6b023ff9b4b0062b6f0f5f9efd8911b2b2a46ab1df933f6e50569b95017dd57c` (full-file hash)
- `codexPath` = `/home/timwhite/.local/bin/symphony-grok-codex-completion`
- `codexSha256` = `244188b19515bd62b6c3a865d88ec300a1bfe011f3169710fbe5178b81e58013`
- kimi `profile` = `14c6aa5331f271401348ddc07367cf6e5f769d6fcd2f679f8f826061682b535d` (leave it)

After the updated `symphony_proof_context.py` and completion shim are on the
host, recompute the grok row with the dry-run helper. It prints the new row
and the new `codexSha256`. It writes only with `--write`, and then only after
an atomic backup named `proof-context.json.bak-grok-reenroll-<UTC>`:

```bash
python3 scripts/symphony/reenroll_grok_proof_seat.py \
  --context /home/timwhite/gem-workspace/state/proof-context.json \
  --codex /home/timwhite/.local/bin/symphony-grok-codex-completion

python3 scripts/symphony/reenroll_grok_proof_seat.py \
  --context /home/timwhite/gem-workspace/state/proof-context.json \
  --codex /home/timwhite/.local/bin/symphony-grok-codex-completion \
  --write
```

Proofs bound to `6b023ff9b4b0062b6f0f5f9efd8911b2b2a46ab1df933f6e50569b95017dd57c`
stop counting. The first capacity-chain run after install must produce a
fresh probe. The capacity-gate remint stays Tune's follower with `ALLOW=0`.
This repository change does not remint, restart services, edit credentials,
or set `ALLOW`.

Host install is Tim-gated. It joins the #18309 install packet: exact SHA,
verify-only first, then an explicit apply. Nothing in CI or this change runs
the installers against a host.

```bash
# verify only; writes nothing
bash scripts/symphony/install-symphony-grok-codex-completion.sh

# exact origin/main only, after the SHA is approved
bash scripts/symphony/install-symphony-grok-codex-completion.sh --apply
```

`scripts/symphony/install-gem-service-attestation.sh` already copies
`symphony_proof_context.py`. That installer is the path that publishes the
new identity function, under the same verify-only-first rule. Re-enroll runs
after both files match the approved SHA.
