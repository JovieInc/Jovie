# Official Symphony Burrito (macOS arm64)

Use the upstream `openai/symphony` v0.0.3 Burrito asset; do not build or publish a Jovie fork.

Prerequisites: Apple Silicon macOS, `codex`, `git`, and `LINEAR_API_KEY` supplied by the host secret manager.

```sh
version=v0.0.3
asset="symphony-${version}-macos_arm64"
curl -fLO "https://github.com/openai/symphony/releases/download/${version}/${asset}"
curl -fLO "https://github.com/openai/symphony/releases/download/${version}/${asset}.sha256"
shasum -a 256 -c "${asset}.sha256"
install -d "$HOME/.local/bin"
install -m 0755 "$asset" "$HOME/.local/bin/symphony"
"$HOME/.local/bin/symphony" /path/to/Jovie/WORKFLOW.md
```

The workflow retains `$LINEAR_API_KEY`; never commit a token.
