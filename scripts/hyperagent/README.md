# Managed Hyperagent CLI

Install with `python3 scripts/hyperagent/install.py` (default prefix `~/.local`),
or pass `--prefix /absolute/path` for an isolated install. Installation replaces
only `bin/hyperagent` and files in `lib/jovie-hyperagent`; it never opens OAuth
files. Existing `HYPERAGENT_CONFIG_DIR`, `HYPERAGENT_MCP_TOKEN_FILE`, token refresh,
registration scopes and the importable `mcp_call(name, arguments=None, timeout=60)`
remain supported. The lane imports this function with `runpy.run_path`.

`models.json` is the managed model-to-agent registry. `HYPERAGENT_MODELS_FILE`
selects a complete replacement registry. Invalid/missing files, duplicate keys,
unknown fields, duplicate agent IDs, unknown models and mismatched `--agent-id`
overrides fail closed (exit 78), before token access or thread creation.

`hyperagent models --json` retains `{ "models": { "model-id": {} } }` and lists
coding agents by default. `--role research` permits both research and coding
agents; it is required for Fable, Astra and Grok Reviewer. Existing reason-lane
commands declare this role. Shipping uses the default coding role. MCP
`create_thread` receives only `agentId`, `message` and `namingHint`; the selected
agent owns the model setting.

The GLM/Flash IDs came from the installed CLI; Kimi's existing copy identity and
Fable/Astra/Grok IDs were confirmed by read-only `list_agents` on 2026-10-20.
The Kimi copy still has the provider name `GLM 5.3 Developer (copy)`. These
mappings declare operator intent, not executed-model, permission or budget proof.
The lane's live identity plus owner-attestation checks remain authoritative.

The recovered CLI SHA256 was
`d38a1f8f89d0f1492538da6ba005bdf6a5b55d56f60efdd15b3c2e609ab97a73`.
Before recovery, main `8546abb69df` was compared with retained JOV-6871 refs
`9442ad88f6e6e4799377535a6708e5d4483ca120`,
`153e6b6f8b9048a13b1a2b35860caaf4e005f4b5` and
`0b9cca76df3a3e692ff990df58a4c76c9c2fe1fd`. Main includes later recovery and
attestation changes (#20228, #20388); those were preserved. Rescue refs contain
no managed CLI source. Full provenance and qualification receipts are in JOV-8661.

Ship now: configure existing integration without a new dependency. Re-evaluate
when provider IDs, roles or model settings change; then update this registry and
repeat qualification. Roll back by installing the preceding repository revision.

Run `python3 -m pytest scripts/tests/test_hyperagent_cli.py -q` for deterministic
compatibility tests. The existing canonical lane coverage selector also runs
these tests and enforces 90% combined branch coverage on the managed CLI/installer.
