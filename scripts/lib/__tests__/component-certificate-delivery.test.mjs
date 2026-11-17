import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDeliveryPayload,
  serializeDeliveryPayload,
} from '../component-certificate-delivery.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
function workflowText(name) {
  return readFileSync(resolve(REPO_ROOT, '.github/workflows', name), 'utf8');
}
const workflow = workflowText('component-certificate.yml');
const { load } = createRequire(import.meta.url)('js-yaml');
const job = load(workflow).jobs.certify;
const steps = job.steps;
const fixtureRoots = [];
function fixtureRoot(prefix) {
  const root = mkdtempSync(resolve(tmpdir(), prefix));
  fixtureRoots.push(root);
  return root;
}
function minimalReport() {
  return JSON.stringify({
    generatedAt: '2026-11-13T00:00:00.000Z',
    headSha: 'ffffffffffffffffffffffffffffffffffffffff',
    totals: { byCriterion: {}, certified: 0, components: 0 },
    certificates: [],
  });
}

function stubMainLookup(root) {
  const bin = resolve(root, 'bin');
  writeFileSync(
    resolve(bin, 'git'),
    '#!/bin/bash\ncase "$1" in\nrev-parse) printf "%s\\n" "${FIXTURE_SHALLOW:-false}" ;;\nrev-list) printf "%s\\n" "${FIXTURE_SOURCE_ORDINAL-15}" ;;\n*) value="$FIXTURE_MAIN_SHA"; if [ "${FIXTURE_MAIN_ADVANCES:-false}" = true ] && [ -e "$RUNNER_TEMP/main-read" ]; then value=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; fi; touch "$RUNNER_TEMP/main-read"; printf "%s\\trefs/heads/main\\n" "$value" ;;\nesac\n',
    { mode: 0o755 }
  );
  writeFileSync(resolve(bin, 'gh'), '#!/bin/bash\nexit 1\n', { mode: 0o755 });
  writeFileSync(resolve(bin, 'sleep'), '#!/bin/bash\nexit 0\n', {
    mode: 0o755,
  });
  writeFileSync(
    resolve(bin, 'timeout'),
    '#!/bin/bash\n[ "$1" = 30s ] && [ "$RESOLVE_MAIN_BUDGET_SECONDS" = 0 ] || exit 99\n[ "${FIXTURE_MAIN_TIMEOUT:-false}" != true ] || exit 124\nshift\nexec "$@"\n',
    {
      mode: 0o755,
    }
  );
}

function stubTransport(root) {
  writeFileSync(
    resolve(root, 'bin/curl'),
    `#!/bin/bash
method=GET; output=; payload=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -X) method="$2"; shift 2 ;;
    -o) output="$2"; shift 2 ;;
    --data-binary) payload="\${2#@}"; shift 2 ;;
    *) shift ;;
  esac
done
if [ "$method" = OPTIONS ]; then
  touch "$RUNNER_TEMP/capability-sent"
  node - "$output" <<'NODE'
const fs = require('node:fs');
fs.writeFileSync(process.argv[2], process.env.FIXTURE_CAPABILITY_BODY ?? JSON.stringify({ok:true,deliveryOrderSchema:'jovie.source-order/v1'}));
NODE
  printf '%s' "\${FIXTURE_CAPABILITY_CODE:-200}"
  [ "\${FIXTURE_CAPABILITY_CODE:-200}" != 000 ]; exit
fi
touch "$RUNNER_TEMP/sent"
printf '@%s' "$payload" > "$RUNNER_TEMP/posted-arg.txt"
node - "$payload" "$output" <<'NODE'
const fs = require('node:fs'), packet = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const bad = process.env.FIXTURE_ACK;
fs.writeFileSync(process.argv[3], bad === 'empty' ? '' : JSON.stringify({
  ok:true,accepted:true,reason:'stored',deliveryOrder:packet.deliveryOrder,
  storedHeadSha:bad === 'mismatch' ? 'a'.repeat(40) : packet.headSha,
}));
NODE
printf '%s' "$FIXTURE_HTTP_CODE"
[ "$FIXTURE_HTTP_CODE" != 000 ]
`,
    { mode: 0o755 }
  );
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('Ovie delivery outcome from the real workflow shell', () => {
  const notSent = {
    requested: true,
    secret: true,
    report: true,
    code: '200',
    exit: 1,
    outcome: 'failed',
    sent: false,
    mainSha: 'f'.repeat(40),
    timedOut: false,
  };
  it.each([
    {
      ...notSent,
      requested: false,
      secret: false,
      report: false,
      exit: 0,
      outcome: 'skipped',
      reason: 'post-disabled',
    },
    { ...notSent, report: false, reason: 'report-unavailable' },
    { ...notSent, secret: false, reason: 'credential-unavailable' },
    {
      ...notSent,
      mainSha: 'a'.repeat(40),
      exit: 0,
      outcome: 'skipped',
      reason: 'superseded-main',
    },
    { ...notSent, mainSha: '', reason: 'main-ref-unavailable' },
    { ...notSent, timedOut: true, reason: 'main-ref-unavailable' },
    {
      ...notSent,
      advances: true,
      capabilitySent: true,
      exit: 0,
      outcome: 'skipped',
      reason: 'superseded-main',
    },
    { ...notSent, runNumber: '', reason: 'invalid-order-metadata' },
    { ...notSent, shallow: 'true', reason: 'invalid-order-metadata' },
    { ...notSent, ordinal: 'invalid', reason: 'invalid-order-metadata' },
    {
      ...notSent,
      reportHead: 'a'.repeat(40),
      reason: 'invalid-order-metadata',
    },
    {
      ...notSent,
      capabilityBody: '{}',
      capabilitySent: true,
      status: '200',
      reason: 'receiver-ordering-unavailable',
    },
    ...['405', '503', '000'].map(capabilityCode => ({
      ...notSent,
      capabilityCode,
      capabilitySent: true,
      status: capabilityCode,
      reason: 'receiver-ordering-unavailable',
    })),
    {
      ...notSent,
      sent: true,
      ack: 'mismatch',
      reason: 'invalid-order-acknowledgement',
    },
    ...[
      '200',
      '202',
      '204',
      '302',
      '401',
      '404',
      '405',
      '429',
      '500',
      '000',
    ].map(code => ({
      requested: true,
      secret: true,
      report: true,
      code,
      exit: code.startsWith('2') && code !== '204' ? 0 : 1,
      outcome:
        code.startsWith('2') && code !== '204' ? 'http-accepted' : 'failed',
      reason:
        code === '204'
          ? 'invalid-order-acknowledgement'
          : code.startsWith('2')
            ? 'readback-required'
            : 'http-or-transport-error',
      ack: code === '204' ? 'empty' : '',
      sent: true,
      mainSha: 'f'.repeat(40),
      timedOut: false,
    })),
  ])(
    'records $outcome for HTTP $code, requested=$requested, secret=$secret, report=$report',
    /** @param {typeof notSent & {reason:string,runNumber?:string,shallow?:string,ordinal?:string,reportHead?:string,capabilityBody?:string,capabilityCode?:string,capabilitySent?:boolean,status?:string,ack?:string,advances?:boolean}} fixture */
    fixture => {
      const root = fixtureRoot('certificate-delivery-');
      mkdirSync(resolve(root, 'component-certificate'));
      mkdirSync(resolve(root, 'bin'));
      stubMainLookup(root);
      const reportText = fixture.reportHead
        ? minimalReport().replace('f'.repeat(40), fixture.reportHead)
        : minimalReport();
      if (fixture.report)
        writeFileSync(
          resolve(root, 'component-certificate/report.json'),
          reportText
        );
      // Offline transport double: never print or persist request headers.
      // It records which file curl was pointed at so tests can assert the
      // step posts the compact payload, not the full report.
      stubTransport(root);
      const summary = resolve(root, 'summary.md');
      const output = resolve(root, 'output');
      const result = spawnSync(
        'bash',
        ['-c', steps.find(step => step.name === 'Post to Ovie').run],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${resolve(root, 'bin')}:${process.env.PATH}`,
            RUNNER_TEMP: root,
            GITHUB_STEP_SUMMARY: summary,
            GITHUB_OUTPUT: output,
            CERT_SHA: 'f'.repeat(40),
            GITHUB_REPOSITORY: 'JovieInc/Jovie',
            GH_TOKEN: 'fixture-readonly-token',
            GITHUB_TOKEN: '',
            GITHUB_RUN_NUMBER: fixture.runNumber ?? '1',
            GITHUB_RUN_ATTEMPT: '1',
            FIXTURE_MAIN_SHA: fixture.mainSha,
            FIXTURE_MAIN_TIMEOUT: String(fixture.timedOut),
            FIXTURE_MAIN_ADVANCES: String(fixture.advances ?? false),
            FIXTURE_SHALLOW: fixture.shallow ?? 'false',
            FIXTURE_SOURCE_ORDINAL: fixture.ordinal ?? '15',
            ...(fixture.capabilityBody === undefined
              ? {}
              : { FIXTURE_CAPABILITY_BODY: fixture.capabilityBody }),
            FIXTURE_CAPABILITY_CODE: fixture.capabilityCode ?? '200',
            FIXTURE_ACK: fixture.ack ?? '',
            POST_REQUESTED: String(fixture.requested),
            CRON_SECRET: fixture.secret ? 'fixture-secret-value' : '',
            OVIE_BASE_URL: 'https://ovie.invalid',
            FIXTURE_HTTP_CODE: fixture.code,
          },
        }
      );
      expect(result.status, result.stdout + result.stderr).toBe(fixture.exit);
      const receiptText = readFileSync(
        resolve(root, 'component-certificate/delivery.json'),
        'utf8'
      );
      expect(JSON.parse(receiptText)).toMatchObject({
        headSha: 'f'.repeat(40),
        requested: fixture.requested,
        outcome: fixture.outcome,
        reason: fixture.reason,
        httpStatus: fixture.status ?? (fixture.sent ? fixture.code : 'none'),
        ingestion: 'unverified',
      });
      expect(existsSync(resolve(root, 'sent'))).toBe(fixture.sent);
      expect(existsSync(resolve(root, 'capability-sent'))).toBe(
        fixture.capabilitySent ?? fixture.sent
      );
      if (fixture.report)
        expect(
          readFileSync(
            resolve(root, 'component-certificate/report.json'),
            'utf8'
          )
        ).toBe(reportText);
      if (fixture.sent) {
        // The step must post the compact payload, never the full report.
        const postedArg = readFileSync(resolve(root, 'posted-arg.txt'), 'utf8');
        expect(postedArg).toBe(
          `@${resolve(root, 'component-certificate/delivery-payload.json')}`
        );
        const posted = JSON.parse(
          readFileSync(
            resolve(root, 'component-certificate/delivery-payload.json'),
            'utf8'
          )
        );
        expect(posted).toMatchObject({
          headSha: 'ffffffffffffffffffffffffffffffffffffffff',
          schema: 'jovie.component-certificate-evidence/v1',
          deliveryOrder: {
            schema: 'jovie.source-order/v1',
            sourceOrdinal: 15,
            runNumber: 1,
            runAttempt: 1,
          },
        });
      }
      expect(readFileSync(output, 'utf8')).toContain(
        `outcome=${fixture.outcome}`
      );
      expect(readFileSync(summary, 'utf8')).toContain('Ingestion unverified');
      expect(
        result.stdout +
          result.stderr +
          receiptText +
          readFileSync(summary, 'utf8')
      ).not.toContain('fixture-secret-value');
    }
  );

  it('delivers an oversized report as a compact payload under the ingest cap', () => {
    // The real failure class (JOV-12456): the full report with evidence
    // receipts exceeds the ~4.5MB function-body limit enforced at the edge
    // before routing. Delivery must still succeed by posting the compact
    // payload instead.
    const root = fixtureRoot('certificate-delivery-oversized-');
    mkdirSync(resolve(root, 'component-certificate'));
    mkdirSync(resolve(root, 'bin'));
    stubMainLookup(root);
    const bigCertificates = Array.from({ length: 30000 }, (_, i) => ({
      applicable: 10,
      certified: false,
      component: `apps/web/components/features/area/component-${i}.tsx`,
      criteria: [
        { id: 'tests', status: 'fail' },
        { id: 'tokens', status: 'pass' },
      ],
      passing: 8,
      schema: 'jovie.component-certificate/v1',
    }));
    const reportPath = resolve(root, 'component-certificate/report.json');
    writeFileSync(
      reportPath,
      JSON.stringify({
        generatedAt: '2026-11-13T00:00:00.000Z',
        headSha: 'ffffffffffffffffffffffffffffffffffffffff',
        totals: {
          byCriterion: { tests: { fail: 30000, na: 0, pass: 0, unknown: 0 } },
          certified: 0,
          components: 30000,
        },
        certificates: bigCertificates,
      })
    );
    expect(statSync(reportPath).size).toBeGreaterThan(4.5 * 1024 * 1024);
    stubTransport(root);
    const summary = resolve(root, 'summary.md');
    const output = resolve(root, 'output');
    const result = spawnSync(
      'bash',
      ['-c', steps.find(step => step.name === 'Post to Ovie').run],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${resolve(root, 'bin')}:${process.env.PATH}`,
          RUNNER_TEMP: root,
          GITHUB_STEP_SUMMARY: summary,
          GITHUB_OUTPUT: output,
          CERT_SHA: 'f'.repeat(40),
          GH_TOKEN: 'fixture-readonly-token',
          GITHUB_TOKEN: '',
          FIXTURE_MAIN_SHA: 'f'.repeat(40),
          GITHUB_SERVER_URL: 'https://github.com',
          GITHUB_REPOSITORY: 'JovieInc/Jovie',
          GITHUB_RUN_ID: '123',
          GITHUB_RUN_NUMBER: '1',
          GITHUB_RUN_ATTEMPT: '1',
          POST_REQUESTED: 'true',
          CRON_SECRET: 'fixture-secret-value',
          OVIE_BASE_URL: 'https://ovie.invalid',
          FIXTURE_HTTP_CODE: '200',
        },
      }
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const payloadPath = resolve(
      root,
      'component-certificate/delivery-payload.json'
    );
    const payloadSize = statSync(payloadPath).size;
    expect(payloadSize).toBeLessThan(64 * 1024);
    const posted = JSON.parse(readFileSync(payloadPath, 'utf8'));
    expect(posted).toMatchObject({
      headSha: 'ffffffffffffffffffffffffffffffffffffffff',
      reportBytes: expect.any(Number),
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123',
      artifactName: 'component-certificate-123',
      schema: 'jovie.component-certificate-evidence/v1',
      totals: { certified: 0, components: 30000 },
    });
    expect(posted.failingComponents.length).toBe(25);
    expect(posted.failingComponentsTotal).toBe(30000);
    expect(payloadSize).toBeLessThan(statSync(reportPath).size);
  });
});

describe('component-certificate delivery payload builder', () => {
  const fullReport = {
    certificates: Array.from({ length: 40 }, (_, i) => ({
      applicable: 10,
      certified: i >= 25,
      component: `apps/web/components/c${i}.tsx`,
      passing: 8,
    })),
    generatedAt: '2026-11-13T00:00:00.000Z',
    headSha: 'a'.repeat(40),
    totals: {
      byCriterion: { tests: { fail: 15, na: 0, pass: 25, unknown: 0 } },
      certified: 15,
      components: 40,
    },
  };

  it('builds a bounded compact payload with totals and capped failing components', () => {
    const payload = buildDeliveryPayload(fullReport, {
      artifactName: 'component-certificate-1',
      evaluatedAt: '2026-11-13T00:00:00.000Z',
      reportBytes: 4_500_000,
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    });
    expect(payload.schema).toBe('jovie.component-certificate-evidence/v1');
    expect(payload.totals).toMatchObject({ certified: 15, components: 40 });
    expect(payload.failingComponentsTotal).toBe(40 - 15);
    expect(payload.failingComponents).toHaveLength(25);
    expect(serializeDeliveryPayload(payload).length).toBeLessThan(64 * 1024);
  });

  it('throws on a report without totals so delivery fails loudly', () => {
    expect(() => buildDeliveryPayload({})).toThrow();
    expect(() => buildDeliveryPayload(null)).toThrow();
  });

  it('throws on a report without a valid 40-hex headSha', () => {
    expect(() =>
      buildDeliveryPayload({
        ...fullReport,
        headSha: 'fixture-sha',
      })
    ).toThrow(/40-hex headSha/);
  });

  it('fails closed when the compact payload would outgrow the ingest cap', () => {
    const bloated = buildDeliveryPayload({
      ...fullReport,
      totals: {
        byCriterion: Object.fromEntries(
          Array.from({ length: 2000 }, (_, i) => [
            `criterion-${i}`,
            { fail: 1, na: 0, pass: 1, unknown: 0 },
          ])
        ),
        certified: 0,
        components: 0,
      },
    });
    expect(() => serializeDeliveryPayload(bloated)).toThrow(/exceeds .* bytes/);
  });
});
