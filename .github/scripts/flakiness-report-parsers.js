/**
 * Test-report parsers for the Test Flakiness Report
 * (analyze-test-flakiness.js). Each returns failure / flaky-retry records:
 * a `flaky-retry` record is a test that failed and then passed on retry
 * within one run, the strongest flake signal.
 */

const fs = require('fs');

function decodeXml(text) {
  return String(text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function xmlAttr(tag, attr) {
  const match = tag.match(new RegExp(`${attr}="([^"]*)"`));
  return match ? decodeXml(match[1]) : '';
}

/**
 * Parse JUnit XML into failure/flaky-retry records.
 * `flakyFailure` elements mean the test failed then passed on retry within one
 * run — the strongest flake signal (vitest/Playwright retries).
 */
function parseJunitXml(xml) {
  const records = [];
  const testcaseRegex = /<testcase\b[^>]*?(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = testcaseRegex.exec(xml)) !== null) {
    const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
    const body = m[1] || '';
    const name = xmlAttr(openTag, 'name');
    const file = xmlAttr(openTag, 'file') || xmlAttr(openTag, 'classname');
    const testId = `${file}::${name}`;

    const terminal = body.match(
      /<(?:failure|error)\b[^>]*>([\s\S]*?)<\/(?:failure|error)>/
    );
    if (terminal) {
      records.push({
        testId,
        file,
        name,
        kind: 'failure',
        error: decodeXml(terminal[1]).slice(0, 2000),
      });
      continue;
    }

    // Playwright names a retried error flakyError, a retried assertion
    // flakyFailure (both only with includeRetries).
    const flakyRegex = /<flaky(Failure|Error)\b[^>]*>([\s\S]*?)<\/flaky\1>/g;
    let f;
    let sawFlaky = false;
    while ((f = flakyRegex.exec(body)) !== null) {
      sawFlaky = true;
      const error = decodeXml(f[2]).slice(0, 2000);
      records.push({ testId, file, name, kind: 'flaky-retry', error });
    }

    if (!sawFlaky) {
      const failMatch = body.match(
        /<(?:failure|error)\b[^>]*>([\s\S]*?)<\/(?:failure|error)>/
      );
      if (failMatch) {
        const error = decodeXml(failMatch[1]).slice(0, 2000);
        records.push({ testId, file, name, kind: 'failure', error });
      }
    }
  }
  return records;
}

function isPlaywrightJsonReport(report) {
  return (
    report !== null &&
    typeof report === 'object' &&
    Array.isArray(report.suites) &&
    report.stats !== null &&
    typeof report.stats === 'object' &&
    'flaky' in report.stats
  );
}

/**
 * Parse a Playwright JSON report into failure/flaky-retry records.
 * Playwright's JUnit reporter only emits <flakyFailure> with includeRetries;
 * its JSON reporter always marks a test that failed and then passed on retry
 * with status "flaky", so that status is the retry-pass signal here.
 */
function parsePlaywrightJsonReport(report) {
  if (!isPlaywrightJsonReport(report)) return [];
  const records = [];
  const visit = (suite, titles) => {
    const suiteTitles =
      suite.title && suite.title !== suite.file
        ? [...titles, suite.title]
        : titles;
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      for (const run of Array.isArray(spec.tests) ? spec.tests : []) {
        const kind =
          run.status === 'flaky'
            ? 'flaky-retry'
            : run.status === 'unexpected'
              ? 'failure'
              : null;
        if (!kind) continue;
        const file = String(spec.file || suite.file || '');
        const project = run.projectName ? `[${run.projectName}] ` : '';
        const name = `${project}${[...suiteTitles, spec.title].join(' › ')}`;
        const failed = (Array.isArray(run.results) ? run.results : []).find(
          result => !['passed', 'skipped'].includes(result?.status)
        );
        const error =
          failed?.errors?.find(e => typeof e?.message === 'string')?.message ||
          failed?.error?.message ||
          (kind === 'flaky-retry'
            ? 'passed after retry (failure message unavailable)'
            : 'failed (failure message unavailable)');
        records.push({
          testId: `${file}::${name}`,
          file,
          name,
          kind,
          error: String(error).slice(0, 2000),
        });
      }
    }
    for (const child of Array.isArray(suite.suites) ? suite.suites : []) {
      visit(child, suiteTitles);
    }
  };
  for (const suite of report.suites) visit(suite, []);
  return records;
}

function readPlaywrightJsonRecords(filePath) {
  try {
    return parsePlaywrightJsonReport(
      JSON.parse(fs.readFileSync(filePath, 'utf8'))
    );
  } catch {
    return [];
  }
}

module.exports = {
  parseJunitXml,
  parsePlaywrightJsonReport,
  readPlaywrightJsonRecords,
};
