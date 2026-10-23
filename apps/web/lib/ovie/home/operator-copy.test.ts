import { describe, expect, it } from 'vitest';
import {
  looksLikeDiagnostic,
  operatorAlertCopy,
  redactFilesystemPaths,
  summarizeSourceIssues,
} from './operator-copy';

const DOCTOR_ALERT =
  'remediation action lacks authoritative acknowledgement; failed=45, exhausted=0, next retry=None; inspect event-delivery.json';

describe('operatorAlertCopy', () => {
  it('maps the remediation delivery diagnostic to plain copy', () => {
    const text = operatorAlertCopy(DOCTOR_ALERT);
    expect(text).toBe(
      'Remediation alerts are not being acknowledged (45 failed delivery records)'
    );
    expect(text).not.toMatch(/=|\.json|None/);
  });

  it('drops the count when no deliveries failed', () => {
    expect(
      operatorAlertCopy(
        'remediation action lacks authoritative acknowledgement'
      )
    ).toBe('Remediation alerts are not being acknowledged');
  });

  it('replaces unknown machine diagnostics with a generic sentence', () => {
    for (const raw of [
      'lane gem stalled; pid=4411 state=Z',
      'see /home/timwhite/.lanes/state.json',
      'queue check failed; inspect held.json',
    ])
      expect(operatorAlertCopy(raw)).toBe(
        'Shipping automation reported a problem'
      );
  });

  it('passes plain sentences through', () => {
    expect(operatorAlertCopy(' Merge queue is paused ')).toBe(
      'Merge queue is paused'
    );
  });
});

describe('redactFilesystemPaths', () => {
  it('keeps only the tool name from absolute paths', () => {
    expect(redactFilesystemPaths('/home/timwhite/.npm-global/bin/codex')).toBe(
      'codex'
    );
    expect(redactFilesystemPaths('/Users/tim/bin/claude and ~/x/y.log')).toBe(
      'claude and y.log'
    );
    expect(redactFilesystemPaths('C:\\Users\\tim\\codex.exe')).toBe(
      'codex.exe'
    );
  });

  it.each(['/bin/codex', '/Volumes/tools/codex', 'C:/Users/tim/codex'])(
    'redacts the filesystem path %s',
    path => expect(redactFilesystemPaths(path)).toBe('codex')
  );

  it('leaves URLs, app routes and plain words alone', () => {
    for (const value of [
      'https://github.com/home/x',
      '/app/ov/inbox',
      'codex',
      '/homepage',
      '~27 components',
    ])
      expect(redactFilesystemPaths(value)).toBe(value);
  });
});

describe('looksLikeDiagnostic', () => {
  it('flags key=value pairs, paths and file hints but not sentences', () => {
    expect(looksLikeDiagnostic(DOCTOR_ALERT)).toBe(true);
    expect(looksLikeDiagnostic('/var/log/x')).toBe(true);
    expect(looksLikeDiagnostic('Production is 3 commits behind main')).toBe(
      false
    );
  });
});

describe('summarizeSourceIssues', () => {
  it('returns null with no issues', () => {
    expect(summarizeSourceIssues([])).toBeNull();
    expect(summarizeSourceIssues(['  '])).toBeNull();
  });

  it('shows one issue in full', () => {
    expect(summarizeSourceIssues(['Requested work could not be loaded.'])).toBe(
      'Source needs attention. Requested work could not be loaded.'
    );
  });

  it('deduplicates repeated source issues before counting', () => {
    expect(
      summarizeSourceIssues(['Missing proof', 'Missing proof', 'Fetch failed'])
    ).toBe('2 source issues need attention.');
  });

  it('collapses many issues to a count without naming any', () => {
    const issues = Array.from(
      { length: 27 },
      (_, index) =>
        `Marketing component ${index}: additional evidence is required.`
    );
    const text = summarizeSourceIssues(issues);
    expect(text).toBe('27 source issues need attention.');
    expect(text).not.toContain('Marketing component');
  });
});
