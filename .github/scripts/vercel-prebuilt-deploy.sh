#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <github-output-key> [vercel args...]" >&2
  exit 1
fi

github_output_key="$1"
shift
deploy_args=("$@")

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "VERCEL_TOKEN must be set" >&2
  exit 1
fi

VERCEL_SCOPE_ARGS=()
if [ -n "${VERCEL_ORG_ID:-}" ]; then
  VERCEL_SCOPE_ARGS=(--scope "$VERCEL_ORG_ID")
fi

VERCEL_CMD=()

resolve_vercel_cmd() {
  if command -v vercel >/dev/null 2>&1; then
    VERCEL_CMD=("$(command -v vercel)")
    return 0
  fi

  if command -v pnpm >/dev/null 2>&1 && pnpm exec -- vercel --version >/dev/null 2>&1; then
    VERCEL_CMD=(pnpm exec -- vercel)
    return 0
  fi

  if [ -x "./node_modules/.bin/vercel" ]; then
    VERCEL_CMD=("./node_modules/.bin/vercel")
    return 0
  fi

  echo "Vercel CLI not found in PATH or project dependencies" >&2
  return 127
}

parse_deployment_url_file() {
  grep -Eo 'https://[^[:space:]]+\.vercel\.app/?' "$1" | tail -1 || true
}

write_deployment_url() {
  local deployment_url="$1"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "${github_output_key}=${deployment_url}" >> "$GITHUB_OUTPUT"
  fi
}

count_prebuilt_files() {
  if [ ! -d ".vercel/output" ]; then
    return
  fi

  find .vercel/output -type f | wc -l | tr -d ' '
}

# Vercel CLI >= 59 applies the repo .vercelignore to prebuilt functions'
# `.vc-config.json` filePathMap entries and drops every match from the upload
# (PREBUILT_FILEPATHMAP_IGNORED, "excludes at least 20 files the prebuilt
# functions need"). CLI 56.x uploaded the full traced closure. (Restoring
# that closure did not fix the 59.x "Extracting deployment files ...
# Unexpected error" failures; the CLI is pinned to 56.3.2 for that, see
# .github/dependabot.yml.) The prebuilt file walk ignores everything outside .vercel/output regardless
# of .vercelignore, so that file only shapes source uploads. For prebuilt
# uploads it only removes files `vercel build` traced (CHANGELOG.md,
# docs/FEATURE_REGISTRY.md, tests/quarantine.json, ...). The dropped set
# depends on the trace and the CLI truncates it at 20, so no fixed re-include
# list can cover it. Hide the file for the prebuilt CLI call only; source
# deploys keep it. assert_prebuilt_upload_has_no_secrets bounds what the
# upload set may contain.
HIDDEN_VERCELIGNORE=""

restore_vercelignore() {
  if [ -n "$HIDDEN_VERCELIGNORE" ]; then
    mv -f -- "$HIDDEN_VERCELIGNORE" .vercelignore
    HIDDEN_VERCELIGNORE=""
  fi
}

trap restore_vercelignore EXIT

run_prebuilt_cli() {
  local cli_status=0
  if [ -f .vercelignore ]; then
    HIDDEN_VERCELIGNORE="$(mktemp "${RUNNER_TEMP:-/tmp}/jovie-vercelignore.XXXXXX")"
    mv -f -- .vercelignore "$HIDDEN_VERCELIGNORE"
  fi
  "$@" || cli_status=$?
  restore_vercelignore
  return "$cli_status"
}

# A prebuilt upload is .vercel/output plus every filePathMap target of its
# .vc-config.json files. Fail closed before upload if either names a
# credential-bearing file.
assert_prebuilt_upload_has_no_secrets() {
  node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const outputDir = path.join(root, '.vercel', 'output');
const forbidden = rel => {
  const posix = rel.split(path.sep).join('/');
  const base = path.posix.basename(posix);
  return (/^\.env(\..+)?$/.test(base) && base !== '.env.example')
    || /\.(pem|key|p12|pfx)$/i.test(base)
    || /^\.(npmrc|netrc)$/.test(base)
    || base === 'credentials.json'
    || (posix.startsWith('.vercel/') && !posix.startsWith('.vercel/output/'));
};
const offenders = new Set();
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(abs); continue; }
    const rel = path.relative(root, abs);
    if (forbidden(rel)) offenders.add(rel);
    if (entry.name !== '.vc-config.json') continue;
    let config;
    try { config = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { continue; }
    for (const target of Object.values(config.filePathMap || {})) {
      const targetRel = path.relative(root, path.join(root, String(target)));
      if (forbidden(targetRel)) offenders.add(targetRel);
    }
  }
};
if (fs.existsSync(outputDir)) walk(outputDir);
if (offenders.size > 0) {
  process.stderr.write('Deploy failed: prebuilt upload would include credential-bearing files:\n');
  for (const offender of [...offenders].sort()) process.stderr.write(`  ${offender}\n`);
  process.exit(1);
}
NODE
}

run_deploy() {
  local mode="$1"
  shift

  # One realistically budgeted archive attempt plus the source fallback must
  # leave a full minute beneath the workflow step's 10-minute ceiling.
  local timeout_seconds="${VERCEL_DEPLOY_ARCHIVE_TIMEOUT_SECONDS:-480}"
  if [ "$mode" = "source" ]; then
    timeout_seconds="${VERCEL_DEPLOY_SOURCE_TIMEOUT_SECONDS:-30}"
  fi
  local kill_grace_seconds="${VERCEL_DEPLOY_KILL_GRACE_SECONDS:-5}"

  local deploy_cmd=(timeout --signal=TERM --kill-after="${kill_grace_seconds}s" "$timeout_seconds")

  if [ "$mode" = "tgz" ]; then
    run_prebuilt_cli "${deploy_cmd[@]}" "${VERCEL_CMD[@]}" deploy --prebuilt --archive=tgz "$@" "${VERCEL_SCOPE_ARGS[@]}"
    return
  fi

  if [ "$mode" = "split-tgz" ]; then
    run_prebuilt_cli "${deploy_cmd[@]}" "${VERCEL_CMD[@]}" deploy --prebuilt --archive=split-tgz "$@" "${VERCEL_SCOPE_ARGS[@]}"
    return
  fi

  if [ "$mode" = "plain" ]; then
    run_prebuilt_cli "${deploy_cmd[@]}" "${VERCEL_CMD[@]}" deploy --prebuilt "$@" "${VERCEL_SCOPE_ARGS[@]}"
    return
  fi

  if [ -f ".vercel/jovie-generated-public-files" ]; then
    while IFS= read -r generated_file; do
      if [ -n "$generated_file" ]; then
        rm -f -- "$generated_file"
      fi
    done < ".vercel/jovie-generated-public-files"
  fi

  if [ -n "${VERCEL_GIT_COMMIT_SHA:-}" ]; then
    local build_sha="${VERCEL_GIT_COMMIT_SHA:0:7}"
    export NEXT_PUBLIC_BUILD_SHA="$build_sha"
    "${deploy_cmd[@]}" "${VERCEL_CMD[@]}" deploy "$@" \
      --build-env VERCEL_GIT_COMMIT_SHA \
      --env VERCEL_GIT_COMMIT_SHA \
      --build-env NEXT_PUBLIC_BUILD_SHA \
      --env NEXT_PUBLIC_BUILD_SHA \
      "${VERCEL_SCOPE_ARGS[@]}"
    return
  fi

  "${deploy_cmd[@]}" "${VERCEL_CMD[@]}" deploy "$@" "${VERCEL_SCOPE_ARGS[@]}"
}

emit_failure_diagnostic() {
  # Provider output may contain credentials or workflow commands. Node is
  # already required by the Vercel CLI. Read only a bounded tail, emit
  # allowlisted receipt fields plus a redacted, command-neutralized line tail
  # and one ::error:: annotation; diagnostic failure must not change status.
  node - "$1" "$2" "$3" "$4" <<'NODE'
const fs = require('node:fs');
const [file, mode, attempt, status] = process.argv.slice(2);
let fd;
try {
  fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const buffer = Buffer.alloc(Math.min(size, 32768));
  const read = fs.readSync(fd, buffer, 0, buffer.length, Math.max(0, size - buffer.length));
  const output = buffer.subarray(0, read).toString('utf8');
  const codes = ['ENOENT', 'EACCES', 'ENOSPC', 'ENOTFOUND', 'EAI_AGAIN',
    'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'];
  const signatures = [
    ['AUTH', /token is not valid|invalid token|not authorized|\bforbidden\b|status code 40[13]\b/i],
    ['RATE_LIMITED', /rate.?limit|too many requests|status code 429\b/i],
    ['PAYLOAD_TOO_LARGE', /too large|size limit|status code 413\b/i],
    ['MISSING_FILES', /missing_files|missing files/i],
    ['PREBUILT_OUTPUT_INVALID', /filePathMap/i],
    ['PROVIDER_5XX', /status code 5\d\d\b|internal server error|bad gateway|service unavailable/i],
  ];
  const errorCode = codes.find(code => new RegExp(`\\b${code}\\b`).test(output))
    || signatures.find(([, pattern]) => pattern.test(output))?.[0] || 'UNKNOWN';
  const urls = [...output.matchAll(/https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app(?=\/?(?:\s|$))/gi)];
  const candidate = urls.at(-1)?.[0] || null;
  const token = process.env.VERCEL_TOKEN;
  const deploymentUrl = candidate && !(token && candidate.includes(token)) ? candidate : null;
  const asset = errorCode === 'ENOENT' && output.includes('/retouching/styles/white-space.md')
    ? 'retouch-style-prompt' : errorCode === 'ENOENT' && output.includes('/tests/quarantine.json')
      ? 'runtime-quarantine-ledger' : null;
  const receipt = {
    schema: 'jovie-vercel-deploy-failure/v1',
    mode: ['tgz', 'split-tgz', 'plain', 'source'].includes(mode) ? mode : 'unknown',
    attempt: /^\d+$/.test(attempt) ? Number(attempt) : null,
    exitStatus: /^\d+$/.test(status) ? Number(status) : null,
    errorCode, asset, deploymentUrl,
  };
  process.stderr.write(`Deploy failure diagnostic: ${JSON.stringify(receipt)}\n`);
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const redact = line => {
    let out = token ? line.replace(new RegExp(escapeRegExp(token), 'g'), '[redacted]') : line;
    return out
      .replace(/(--token(?:=|\s+))\S+/gi, '$1[redacted]')
      .replace(/(\bbearer\s+)\S+/gi, '$1[redacted]')
      .replace(/(\b[\w-]*(?:token|secret|password|authorization|api[_-]?key)["']?\s*[:=]\s*)(?!bearer\s)\S+/gi, '$1[redacted]')
      .replace(/:\/\/[^/\s@]+@/g, '://[redacted]@');
  };
  // The read may start mid-line (possibly mid-secret): drop that fragment.
  const rawLines = output.split(/\r?\n|\r/);
  if (size > buffer.length) rawLines.shift();
  const tail = rawLines
    .map(line => line.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ''))
    .filter(line => line.trim() !== '')
    .slice(-40)
    .map(line => /^\s*(?:::|##\[)/.test(line) ? '[workflow command line removed]' : redact(line).slice(0, 300));
  process.stderr.write(`Vercel CLI output tail (last ${tail.length} lines, redacted):\n`);
  for (const line of tail) process.stderr.write(`  | ${line}\n`);
  const specific = [...tail].reverse().find(line => line !== '[workflow command line removed]'
    && /\berror\b|error:|ERR_|failed/i.test(line));
  const escapeData = value => value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const message = `Vercel ${receipt.mode} deploy attempt ${receipt.attempt ?? '?'} failed `
    + `(exit ${receipt.exitStatus ?? '?'}, ${errorCode})${specific ? `: ${specific.trim()}` : ''}`;
  // A timeout may still hand off an accepted deployment, so it only warns.
  const level = receipt.exitStatus === 124 || receipt.exitStatus === 137 ? 'warning' : 'error';
  process.stdout.write(`::${level} title=Vercel deploy failed::${escapeData(message)}\n`);
} catch {
  process.stderr.write('Deploy failure diagnostic unavailable\n');
} finally {
  if (fd !== undefined) fs.closeSync(fd);
}
NODE
}

try_mode() {
  local mode="$1"
  local attempt="$2"
  shift 2

  local deploy_output_file=""
  local deploy_status=0
  deploy_output_file="$(mktemp "${RUNNER_TEMP:-/tmp}/jovie-vercel-deploy.XXXXXX")"
  chmod 600 "$deploy_output_file"
  run_deploy "$mode" "$@" >"$deploy_output_file" 2>&1 || deploy_status=$?
  local deployment_url=""
  deployment_url="$(parse_deployment_url_file "$deploy_output_file")"
  if [ "$deploy_status" -ne 0 ]; then
    emit_failure_diagnostic "$deploy_output_file" "$mode" "$attempt" "$deploy_status" || true
  fi
  rm -f "$deploy_output_file"
  if [ "$deploy_status" -eq 0 ]; then
    if [ -z "$deployment_url" ]; then
      echo "Deploy succeeded but no preview URL was found in Vercel output" >&2
      return 1
    fi
    write_deployment_url "$deployment_url"
    echo "Deploy succeeded on attempt $attempt with ${mode} upload"
    return 0
  fi

  if [ "$deploy_status" -eq 124 ] || [ "$deploy_status" -eq 137 ]; then
    echo "Deploy attempt $attempt with ${mode} upload exceeded its time budget" >&2
    local accepted_deployment_url=""
    accepted_deployment_url="$deployment_url"
    if [ -n "$accepted_deployment_url" ]; then
      write_deployment_url "$accepted_deployment_url"
      echo "Vercel accepted ${accepted_deployment_url}; downstream health gates will verify readiness"
      return 0
    fi
  fi
  return 1
}

plain_prebuilt_limit=15000
plain_prebuilt_requested="${VERCEL_ENABLE_PLAIN_PREBUILT_FALLBACK:-false}"
source_fallback_requested="${VERCEL_ENABLE_SOURCE_FALLBACK:-true}"
force_source_deploy="${VERCEL_FORCE_SOURCE_DEPLOY:-false}"
prebuilt_file_count="$(count_prebuilt_files)"
has_prebuilt_output=true
can_use_plain_prebuilt=true

if [ -z "$prebuilt_file_count" ] || [ "$prebuilt_file_count" -eq 0 ]; then
  has_prebuilt_output=false
  can_use_plain_prebuilt=false
elif [ "$prebuilt_file_count" -gt "$plain_prebuilt_limit" ]; then
  can_use_plain_prebuilt=false
fi

if [ "$plain_prebuilt_requested" != "true" ]; then
  can_use_plain_prebuilt=false
fi

if [ "$has_prebuilt_output" = true ]; then
  echo "Prebuilt output file count: $prebuilt_file_count"
else
  echo "Prebuilt output file count: unavailable (.vercel/output missing or empty)"
fi
resolve_vercel_cmd
echo "Using Vercel CLI command: ${VERCEL_CMD[*]}"
echo "Plain prebuilt fallback requested: $plain_prebuilt_requested"
echo "Plain prebuilt fallback enabled: $can_use_plain_prebuilt"
echo "Source fallback requested: $source_fallback_requested"
echo "Force source deploy: $force_source_deploy"

if [ "$force_source_deploy" = "true" ] && [ "$source_fallback_requested" != "true" ]; then
  echo "Deploy failed: force-source and disabled source fallback are mutually exclusive." >&2
  exit 1
fi

deploy_modes=()

if [ "$has_prebuilt_output" = true ] && [ "$force_source_deploy" != "true" ]; then
  deploy_modes+=(tgz)
fi

if [ "$can_use_plain_prebuilt" = true ] && [ "$force_source_deploy" != "true" ]; then
  deploy_modes+=(plain)
fi

if [ "$force_source_deploy" = "true" ] || [ "$source_fallback_requested" = "true" ]; then
  deploy_modes+=(source)
fi

if [ "${#deploy_modes[@]}" -eq 0 ]; then
  echo "Deploy failed: no prebuilt output is available and source fallback is disabled." >&2
  exit 1
fi
if [ "$has_prebuilt_output" = true ] && [ "$force_source_deploy" != "true" ]; then
  assert_prebuilt_upload_has_no_secrets
fi
total_attempts="${#deploy_modes[@]}"
attempt=0

for mode in "${deploy_modes[@]}"; do
  attempt=$((attempt + 1))

  case "$mode" in
    tgz)
      echo "Deploy attempt $attempt/$total_attempts (tgz archive prebuilt)"
      ;;
    split-tgz)
      echo "tgz archive deploy failed; trying split-tgz."
      echo "Deploy attempt $attempt/$total_attempts (split-tgz archive prebuilt)"
      ;;
    plain)
      echo "Archive deploys failed; falling back to standard prebuilt upload."
      echo "Deploy attempt $attempt/$total_attempts (plain prebuilt)"
      ;;
    source)
      if [ "$has_prebuilt_output" = false ]; then
        echo "Skipping prebuilt deploy modes because .vercel/output is missing."
        echo "Falling back to source deployment."
      elif [ "$can_use_plain_prebuilt" = true ]; then
        echo "Plain prebuilt upload failed; falling back to source deployment."
      elif [ "$plain_prebuilt_requested" != "true" ]; then
        echo "Skipping plain prebuilt fallback because it is opt-in only for this repo."
        echo "Falling back to source deployment."
      else
        echo "Skipping plain prebuilt fallback because Vercel rejects more than ${plain_prebuilt_limit} files and .vercel/output has ${prebuilt_file_count} files."
        echo "Falling back to source deployment."
      fi
      echo "Deploy attempt $attempt/$total_attempts (source deploy)"
      ;;
  esac

  if try_mode "$mode" "$attempt" "${deploy_args[@]}"; then
    exit 0
  fi
done

echo "Deploy failed after $total_attempts attempts" >&2
exit 1
