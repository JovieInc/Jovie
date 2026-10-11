import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  closeLinearIssueByFingerprint,
  upsertLinearIssueByTitleFingerprint,
} from '../lib/linear-issue-intake.mjs';
import { HOLD_LABELS } from '../lib/merge-group-member-policy.mjs';
import {
  emptyNativeLedger,
  NATIVE_COMMENT_MARKER,
  reconcileNativeScan,
  validateNativeLedger,
} from './deepsec-native-reconcile.mjs';
import {
  nativeSourceState,
  runNativeSubscriptionScan,
} from './deepsec-native-run.mjs';
import { SECURITY_TARGETS } from './deepsec-policy.mjs';

const REPO = 'JovieInc/Jovie';
const BRANCH = 'codex/deepsec-native-ledger';
const LEDGER_PATH = 'scripts/security/deepsec/native-ledger.json';
function fact(ok, message) {
  if (!ok) throw new Error(message);
}

/** GitHub IO is isolated from scanner subprocesses; all requests are bounded.
 * @param {object} input
 * @param {string} input.token
 * @param {typeof fetch} [input.fetchImpl]
 */
export function nativeGithubStore({ token, fetchImpl = fetch }) {
  fact(
    typeof token === 'string' && token.length > 0,
    'Native controller token required'
  );
  async function api(method, path, data, allowMissing = false) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${REPO}/${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        signal: AbortSignal.timeout(30000),
      }
    );
    if (allowMissing && response.status === 404) return null;
    fact(response.ok, `Native GitHub ${method} failed: ${response.status}`);
    fact(response.body, 'Native GitHub response body unavailable');
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Native GitHub response exceeds bound');
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return JSON.parse(text);
  }
  const ref = async branch => {
    const value = await api(
      'GET',
      `git/ref/heads/${branch}`,
      undefined,
      branch === BRANCH
    );
    if (!value) return null;
    fact(
      value.ref === `refs/heads/${branch}` &&
        /^[a-f0-9]{40}$/.test(value.object?.sha),
      'Unbound native branch receipt'
    );
    return value.object.sha;
  };
  let ledgerHead;
  let initialMain;
  async function loadLedger() {
    initialMain = await ref('main');
    ledgerHead = await ref(BRANCH);
    if (!ledgerHead) return emptyNativeLedger();
    const value = await api('GET', `contents/${LEDGER_PATH}?ref=${ledgerHead}`);
    fact(
      value.type === 'file' &&
        value.encoding === 'base64' &&
        typeof value.content === 'string',
      'Native ledger file unavailable'
    );
    return validateNativeLedger(
      JSON.parse(Buffer.from(value.content, 'base64').toString('utf8'))
    );
  }
  async function ledgerLease() {
    fact((await ref(BRANCH)) === ledgerHead, 'Native ledger lease changed');
  }
  /** @param {{headSha:string,prNumber?:number}} identity */
  async function sourceLease({ headSha, prNumber }) {
    if (!prNumber)
      fact((await ref('main')) === headSha, 'Native main source lease changed');
    else {
      const pr = await api('GET', `pulls/${prNumber}`);
      fact(
        pr.number === prNumber &&
          pr.state === 'open' &&
          pr.base?.ref === 'main' &&
          pr.head?.sha === headSha &&
          pr.head?.repo?.full_name === REPO &&
          Array.isArray(pr.labels) &&
          !pr.labels.some(label =>
            [...HOLD_LABELS, 'queue-poison'].includes(label.name?.toLowerCase())
          ),
        'Native PR source lease changed or held'
      );
    }
    await ledgerLease();
  }
  async function saveLedger(ledger, lease) {
    validateNativeLedger(ledger);
    await lease();
    const parent = ledgerHead ?? initialMain;
    const commit = await api('GET', `git/commits/${parent}`);
    fact(
      commit.sha === parent && /^[a-f0-9]{40}$/.test(commit.tree?.sha),
      'Native ledger parent unavailable'
    );
    await lease();
    const tree = await api('POST', 'git/trees', {
      base_tree: commit.tree.sha,
      tree: [
        {
          path: LEDGER_PATH,
          mode: '100644',
          type: 'blob',
          content: `${JSON.stringify(ledger, null, 2)}\n`,
        },
      ],
    });
    fact(/^[a-f0-9]{40}$/.test(tree.sha), 'Native ledger tree unavailable');
    await lease();
    const next = await api('POST', 'git/commits', {
      message: 'chore(security): record verified native subscription scan',
      tree: tree.sha,
      parents: [parent],
    });
    fact(/^[a-f0-9]{40}$/.test(next.sha), 'Native ledger commit unavailable');
    await lease();
    const written = ledgerHead
      ? await api('PATCH', `git/refs/heads/${BRANCH}`, {
          sha: next.sha,
          force: false,
        })
      : await api('POST', 'git/refs', {
          ref: `refs/heads/${BRANCH}`,
          sha: next.sha,
        });
    fact(
      written.ref === `refs/heads/${BRANCH}` &&
        written.object?.sha === next.sha,
      'Native ledger publication unverified'
    );
    ledgerHead = next.sha;
  }
  async function writeComment(prNumber, body, lease) {
    const matches = [];
    for (let page = 1; page <= 10; page++) {
      const comments = await api(
        'GET',
        `issues/${prNumber}/comments?per_page=100&page=${page}`
      );
      fact(Array.isArray(comments), 'Native comment inventory unavailable');
      matches.push(
        ...comments.filter(
          comment =>
            comment.user?.login === 'jovie-bot[bot]' &&
            comment.body?.startsWith(NATIVE_COMMENT_MARKER)
        )
      );
      if (comments.length < 100) break;
      fact(page < 10, 'Native comment inventory incomplete');
    }
    fact(matches.length <= 1, 'Ambiguous native advisory comments');
    await lease();
    const result = matches.length
      ? await api('PATCH', `issues/comments/${matches[0].id}`, { body })
      : await api('POST', `issues/${prNumber}/comments`, { body });
    fact(
      Number.isSafeInteger(result.id) && result.body === body,
      'Native advisory publication unverified'
    );
  }
  return { loadLedger, sourceLease, saveLedger, writeComment };
}

/** Execute a source-leased scan and reconcile only its validated receipt.
 * @param {object} input
 * @param {any} [input.suppressionDoc]
 * @param {any} input.scanInput
 * @param {number|undefined} [input.prNumber]
 * @param {ReturnType<typeof nativeGithubStore>} input.store
 * @param {typeof runNativeSubscriptionScan} [input.scan]
 * @param {any} [input.upsert]
 * @param {any} [input.close]
 */
export async function runNativeController({
  scanInput,
  suppressionDoc,
  prNumber,
  store,
  scan = runNativeSubscriptionScan,
  upsert = upsertLinearIssueByTitleFingerprint,
  close = closeLinearIssueByFingerprint,
}) {
  const ledger = await store.loadLedger();
  const source = nativeSourceState(scanInput.sourceRoot, scanInput.files);
  const lease = async () => {
    const current = nativeSourceState(scanInput.sourceRoot, scanInput.files);
    fact(
      !current.changes &&
        JSON.stringify(current) === JSON.stringify(source) &&
        current.headSha === scanInput.headSha,
      'Local native source lease changed'
    );
    await store.sourceLease({ headSha: scanInput.headSha, prNumber });
  };
  await lease();
  const result = await scan(scanInput);
  await lease();
  const reconciled = await reconcileNativeScan({
    ...result,
    suppressionDoc,
    files: scanInput.files,
    ledger,
    scope: prNumber ? 'pr' : 'main',
    lease,
    upsert,
    close,
    ...(prNumber
      ? { writeComment: body => store.writeComment(prNumber, body, lease) }
      : {}),
  });
  if (!reconciled.replay) await store.saveLedger(reconciled.ledger, lease);
  await lease();
  return result.receipt;
}

export async function main() {
  fact(
    process.env.DEEPSEC_NATIVE_ENABLED === 'true',
    'Native scanner execution is disabled'
  );
  fact(
    process.env.GITHUB_REPOSITORY === REPO,
    'Native controller repository mismatch'
  );
  const sourceRoot = resolve(process.env.NATIVE_SOURCE_ROOT ?? '');
  const workspace = resolve(process.env.NATIVE_SCAN_WORKSPACE ?? '');
  fact(
    process.env.NATIVE_SOURCE_ROOT && process.env.NATIVE_SCAN_WORKSPACE,
    'Native source and workspace required'
  );
  const prNumber = process.env.NATIVE_PR_NUMBER
    ? Number(process.env.NATIVE_PR_NUMBER)
    : undefined;
  fact(
    prNumber === undefined || (Number.isSafeInteger(prNumber) && prNumber > 0),
    'Invalid native PR number'
  );
  const headSha = nativeSourceState(sourceRoot, SECURITY_TARGETS).headSha;
  const receipt = await runNativeController({
    suppressionDoc: JSON.parse(
      readFileSync(
        new URL('./deepsec/suppressions.json', import.meta.url),
        'utf8'
      )
    ),
    scanInput: {
      sourceRoot,
      workspace,
      headSha,
      files: [...SECURITY_TARGETS],
      repository: REPO,
      headRepository: REPO,
    },
    prNumber,
    store: nativeGithubStore({ token: process.env.GH_TOKEN }),
  });
  console.log(JSON.stringify(receipt));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
