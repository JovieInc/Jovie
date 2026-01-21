# SessionStart Hook - Cloud Environment Setup

This command runs automatically when a Claude Code session starts (locally or in cloud environments).
It ensures the development environment is properly configured before any work begins.

## Instructions

1. **Check and install dependencies** - Ensure node_modules are installed:
   ```bash
   # Check if node_modules exists and has content
   if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
     echo "Installing dependencies..."
     pnpm install --frozen-lockfile
   fi
   ```

2. **Verify critical tools are available**:
   - `pnpm` - Package manager (required)
   - `jq` - JSON parser (used by hooks, optional but recommended)
   - `biome` - Linter/formatter (installed via pnpm)

3. **Make hook scripts executable**:
   ```bash
   chmod +x .claude/hooks/*.sh 2>/dev/null || true
   ```

4. **Report environment status** to confirm readiness:
   - Node.js version
   - pnpm version
   - Whether dependencies are installed
   - Whether jq is available

## Execution

Run the following commands to set up the environment:

```bash
# 1. Install dependencies if needed
if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  pnpm install --frozen-lockfile
fi

# 2. Make hooks executable
chmod +x .claude/hooks/*.sh 2>/dev/null || true

# 3. Report status
echo "Environment ready:"
echo "  Node: $(node --version)"
echo "  pnpm: $(pnpm --version)"
echo "  Dependencies: $([ -d node_modules ] && echo 'installed' || echo 'missing')"
echo "  jq: $(command -v jq >/dev/null && echo 'available' || echo 'not installed (hooks will use fallback)')"
```

## Cloud Environment Notes

- Cloud environments start fresh each session - dependencies must be installed
- The `--frozen-lockfile` flag ensures reproducible installs
- Hooks are designed to fail gracefully if jq is unavailable
- Turbo remote cache speeds up subsequent builds
