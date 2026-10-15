export const TRUSTED_SIZE_BOOTSTRAP_BASE =
  '7641ffa76d03326542541c62080735c28190a1f0';

function count(source, value) {
  return source.split(value).length - 1;
}

function stepBlock(job, name) {
  const marker = `      - name: ${name}`;
  const start = job.indexOf(marker);
  if (start < 0) return '';
  const next = job.indexOf('\n      - name:', start + marker.length);
  return job.slice(start, next < 0 ? job.length : next).trimEnd();
}

function jobBlock(workflow) {
  const marker = '  merge-group-size:';
  const start = workflow.indexOf(marker);
  if (start < 0) return '';
  const next = workflow.slice(start + marker.length).search(/^  [\w-]+:/m);
  return next < 0
    ? workflow.slice(start)
    : workflow.slice(start, start + marker.length + next);
}

function expectedBootstrapStep(exactBase) {
  return [
    '      - name: Run exact-base bootstrap size policy',
    `        if: ${exactBase}`,
    '        env:',
    '          GH_TOKEN: ${{ github.token }}',
    '          BOOTSTRAP_HEAD: ${{ github.event.merge_group.head_sha }}',
    "          MAX_LINES: ${{ vars.PR_MAX_LINES || '800' }}",
    "          MAX_FILES: ${{ vars.PR_MAX_FILES || '40' }}",
    '        run: |',
    '          set -euo pipefail',
    '          [[ "$BOOTSTRAP_HEAD" =~ ^[0-9a-f]{40}$ ]] || exit 1',
    '          AUTH_HEADER="AUTHORIZATION: basic $(printf \'x-access-token:%s\' "$GH_TOKEN" | base64 | tr -d \'\\n\')"',
    "          trap 'unset AUTH_HEADER GH_TOKEN' EXIT",
    '          GIT_CONFIG_COUNT=2 \\',
    '          GIT_CONFIG_KEY_0=http.https://github.com/.extraheader \\',
    '          GIT_CONFIG_VALUE_0="$AUTH_HEADER" \\',
    '          GIT_CONFIG_KEY_1=core.hooksPath \\',
    '          GIT_CONFIG_VALUE_1=/dev/null \\',
    '          GIT_TERMINAL_PROMPT=0 \\',
    '          GCM_INTERACTIVE=never \\',
    '          GIT_LFS_SKIP_SMUDGE=1 \\',
    "            timeout --kill-after=5s 40s bash --noprofile --norc <<'BOOTSTRAP_POLICY'",
    '          set -euo pipefail',
    '          git fetch --refetch --filter=blob:limit=1g --no-tags --depth=1 origin "$BOOTSTRAP_HEAD"',
    '          node scripts/lib/merge-group-member-policy.mjs --policy=size',
    '          BOOTSTRAP_POLICY',
  ].join('\n');
}

function expectedCheckoutStep(exactBase) {
  return [
    '      - name: Check out trusted queue policy',
    '        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
    '        with:',
    '          # The one-flight bootstrap executes policy only from the exact',
    '          # reviewed protected base. Every later group executes protected main.',
    `          ref: \${{ ${exactBase} && '${TRUSTED_SIZE_BOOTSTRAP_BASE}' || 'main' }}`,
    '          persist-credentials: false',
    '          sparse-checkout: |',
    '            scripts/lib/merge-group-local-evidence.mjs',
    '            scripts/lib/merge-group-member-policy.mjs',
    '            scripts/lib/pr-size-guard-policy.mjs',
    '            scripts/lib/repo-hygiene-limits.mjs',
    '          sparse-checkout-cone-mode: false',
  ].join('\n');
}

function expectedCacheStep() {
  return [
    '      - name: Restore per-head policy evidence',
    '        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0',
    '        continue-on-error: true',
    '        with:',
    '          path: ${{ runner.temp }}/merge-group-policy-cache',
    '          # run_id misses on purpose. restore-keys reloads the last group',
    '          # so a quota miss can reuse the cached /pulls/N record.',
    '          key: merge-group-policy-${{ github.run_id }}',
    '          restore-keys: merge-group-policy-',
  ].join('\n');
}

function expectedNormalStep(otherBase) {
  return [
    '      - name: Enforce combined-tree payload and member size policy',
    '        id: member-policy',
    `        if: ${otherBase}`,
    '        env:',
    '          # The synthetic head controls this workflow definition. Never expose',
    '          # an App private key here; the read-only ephemeral token is enough.',
    '          GH_TOKEN: ${{ github.token }}',
    '          GROUP_BASE: ${{ github.event.merge_group.base_sha }}',
    '          GROUP_HEAD: ${{ github.event.merge_group.head_sha }}',
    "          MAX_LINES: ${{ vars.PR_MAX_LINES || '800' }}",
    "          MAX_FILES: ${{ vars.PR_MAX_FILES || '40' }}",
    '          MERGE_GROUP_LOCAL_EVIDENCE: ${{ runner.temp }}/merge-group-local-evidence.json',
    '          MERGE_GROUP_POLICY_CACHE_DIR: ${{ runner.temp }}/merge-group-policy-cache',
    '        # Publishes fork_verdict before any size failure, so the Fork PR Gate',
    '        # job below judges the members it was asked about. The helper is absent',
    '        # on the pinned bootstrap base; a missing file or a failed fetch falls',
    '        # back to the API inside the policy.',
    '        run: |',
    '          set -euo pipefail',
    '          mkdir -p "$MERGE_GROUP_POLICY_CACHE_DIR"',
    '          if [[ -f scripts/lib/merge-group-local-evidence.mjs && "$GROUP_HEAD" =~ ^[0-9a-f]{40}$ && "$GROUP_BASE" =~ ^[0-9a-f]{40}$ ]]; then',
    '            AUTH_HEADER="AUTHORIZATION: basic $(printf \'x-access-token:%s\' "$GH_TOKEN" | base64 | tr -d \'\\n\')"',
    '            (',
    "              trap 'unset AUTH_HEADER' EXIT",
    '              GIT_CONFIG_COUNT=2 \\',
    '              GIT_CONFIG_KEY_0=http.https://github.com/.extraheader \\',
    '              GIT_CONFIG_VALUE_0="$AUTH_HEADER" \\',
    '              GIT_CONFIG_KEY_1=core.hooksPath \\',
    '              GIT_CONFIG_VALUE_1=/dev/null \\',
    '              GIT_TERMINAL_PROMPT=0 \\',
    '              GCM_INTERACTIVE=never \\',
    '              GIT_LFS_SKIP_SMUDGE=1 \\',
    '                timeout --kill-after=5s 20s \\',
    '                  git fetch --filter=blob:none --no-tags --depth=2 origin "$GROUP_HEAD" \\',
    '                  || true',
    '              node scripts/lib/merge-group-local-evidence.mjs || true',
    '            )',
    '          fi',
    '          node scripts/lib/merge-group-member-policy.mjs --policy=size --also=fork',
  ].join('\n');
}

export function validateSizeGuardBootstrapWorkflow(workflow) {
  const errors = [];
  if (typeof workflow !== 'string') {
    return ['size bootstrap workflow source is required'];
  }

  const job = jobBlock(workflow);
  const checkout = stepBlock(job, 'Check out trusted queue policy');
  const cache = stepBlock(job, 'Restore per-head policy evidence');
  const bootstrap = stepBlock(job, 'Run exact-base bootstrap size policy');
  const normal = stepBlock(
    job,
    'Enforce combined-tree payload and member size policy'
  );
  const exactBase = `github.event.merge_group.base_sha == '${TRUSTED_SIZE_BOOTSTRAP_BASE}'`;
  const otherBase = `github.event.merge_group.base_sha != '${TRUSTED_SIZE_BOOTSTRAP_BASE}'`;

  if (!job) errors.push('merge-group-size job is missing');
  if (count(job, '\n      - name:') !== 4 || job.includes('\n      - uses:')) {
    errors.push('merge-group size job must contain exactly four named steps');
  }
  if (cache !== expectedCacheStep()) {
    errors.push('per-head evidence cache differs from the reviewed allowlist');
  }
  if (cache.includes('secrets.') || cache.includes('private-key:')) {
    errors.push('per-head evidence cache must not take a privileged token');
  }
  if (
    !checkout.includes(
      `ref: \${{ ${exactBase} && '${TRUSTED_SIZE_BOOTSTRAP_BASE}' || 'main' }}`
    )
  ) {
    errors.push(
      'policy checkout is not pinned to exact bootstrap base or main'
    );
  }
  if (!checkout.includes('persist-credentials: false')) {
    errors.push('policy checkout must not persist credentials');
  }
  if (checkout.includes('github.event.merge_group.head_sha')) {
    errors.push('policy checkout must never use the candidate head');
  }
  if (checkout !== expectedCheckoutStep(exactBase)) {
    errors.push('policy checkout differs from the exact reviewed allowlist');
  }

  if (!bootstrap.includes(`if: ${exactBase}`)) {
    errors.push('bootstrap step is not restricted to the exact trusted base');
  }
  if (bootstrap !== expectedBootstrapStep(exactBase)) {
    errors.push(
      'bootstrap step differs from the exact reviewed command allowlist'
    );
  }
  for (const required of [
    'GH_TOKEN: ${{ github.token }}',
    'BOOTSTRAP_HEAD: ${{ github.event.merge_group.head_sha }}',
    "MAX_LINES: ${{ vars.PR_MAX_LINES || '800' }}",
    "MAX_FILES: ${{ vars.PR_MAX_FILES || '40' }}",
    'AUTH_HEADER="AUTHORIZATION: basic $(printf \'x-access-token:%s\' "$GH_TOKEN" | base64 | tr -d \'\\n\')"',
    "trap 'unset AUTH_HEADER GH_TOKEN' EXIT",
    'GIT_CONFIG_COUNT=2',
    'GIT_CONFIG_KEY_0=http.https://github.com/.extraheader',
    'GIT_CONFIG_VALUE_0="$AUTH_HEADER"',
    'GIT_CONFIG_KEY_1=core.hooksPath',
    'GIT_CONFIG_VALUE_1=/dev/null',
    'GIT_TERMINAL_PROMPT=0',
    'GCM_INTERACTIVE=never',
    'GIT_LFS_SKIP_SMUDGE=1',
    "timeout --kill-after=5s 40s bash --noprofile --norc <<'BOOTSTRAP_POLICY'",
    'BOOTSTRAP_POLICY',
    'git fetch --refetch --filter=blob:limit=1g --no-tags --depth=1 origin "$BOOTSTRAP_HEAD"',
    'node scripts/lib/merge-group-member-policy.mjs --policy=size',
  ]) {
    if (!bootstrap.includes(required)) {
      errors.push(`bootstrap step is missing required boundary: ${required}`);
    }
  }
  for (const forbidden of [
    'uses:',
    'git config ',
    'persist-credentials:',
    'actions/create-github-app-token',
    'private-key:',
    'secrets.',
    'git submodule',
    'git lfs',
    'source ',
    'pnpm ',
    'npm ',
    'npx ',
    'yarn ',
    './',
  ]) {
    if (bootstrap.includes(forbidden)) {
      errors.push(
        `bootstrap step contains forbidden candidate surface: ${forbidden}`
      );
    }
  }
  if (/git[^\n]*\$GH_TOKEN/.test(bootstrap)) {
    errors.push('bootstrap token must not appear in git argv');
  }
  if (count(bootstrap, 'node ') !== 1) {
    errors.push('bootstrap must execute exactly one trusted node policy');
  }

  if (!normal.includes(`if: ${otherBase}`)) {
    errors.push('normal policy is not excluded from the bootstrap base');
  }
  if (!normal.includes('GH_TOKEN: ${{ github.token }}')) {
    errors.push('normal policy is missing its read-only API token');
  }
  if (
    !normal.includes(
      'node scripts/lib/merge-group-member-policy.mjs --policy=size'
    )
  ) {
    errors.push('normal policy does not execute the protected-main policy');
  }
  if (normal !== expectedNormalStep(otherBase)) {
    errors.push('normal policy differs from the exact reviewed allowlist');
  }
  if (count(job, `if: ${exactBase}`) !== 1) {
    errors.push('bootstrap exact-base condition must occur exactly once');
  }

  return errors;
}
