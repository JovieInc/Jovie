import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { checkHue, HUE_BASELINE, hueViolations, isOrangeHex } from './hue.mjs';

const FIXTURE_CSS = 'apps/web/components/marketing/fixture.css';
const TRIAD =
  '.theme { --color-accent-blue: blue; --color-accent-purple: purple; --color-accent-pink: pink; }';

function withHueRepo(run, initial = TRIAD) {
  const root = mkdtempSync(join(tmpdir(), 'jovie-hue-relocation-'));
  const write = (file, value) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), value);
  };
  const record = (source, file = FIXTURE_CSS) => {
    write(file, source);
    write(HUE_BASELINE, JSON.stringify({ ids: hueViolations(source, file) }));
  };
  try {
    record(initial);
    write('design.tokens.json', '{}');
    const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git(['init', '-q']);
    git(['add', '.']);
    git([
      '-c',
      'user.name=Hue fixture',
      '-c',
      'user.email=hue@example.invalid',
      'commit',
      '-qm',
      'Record one existing hue identity',
    ]);
    git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    run({ root, record, write, git });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('marketing hue', () => {
  it('flags orange and ignores an accent role', () => {
    assert.equal(isOrangeHex('#ff7800'), true);
    assert.equal(isOrangeHex('#11afff'), false);
    assert.equal(isOrangeHex('#5c4033'), false);
  });

  it('flags a literal triad in one rule and an orange hex', () => {
    const css =
      '.all { color: #3faff3; background: #a789f0; border-color: #eb6ac6; } .sun { color: #ff7800; }';
    const ids = hueViolations(css, 'apps/web/components/marketing/sample.css');
    assert.ok(ids.some(id => id.startsWith('triad:')));
    assert.ok(
      ids.includes('orange:apps/web/components/marketing/sample.css:#ff7800')
    );
  });

  it('preserves one unchanged rule allowance when unrelated lines move it', () => {
    withHueRepo(({ root, record, git }) => {
      record(`\n\n\n${TRIAD}`);
      assert.deepEqual(checkHue(root).failures, []);
      git(['add', '.']);
      git([
        '-c',
        'user.name=Hue fixture',
        '-c',
        'user.email=hue@example.invalid',
        'commit',
        '-qm',
        'Land unchanged rule relocation',
      ]);
      git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
      assert.deepEqual(checkHue(root).failures, []);
    });
  });

  it('rejects changed rule bodies, selectors, and enclosing contexts after relocation', () => {
    withHueRepo(({ root, record }) => {
      for (const source of [
        TRIAD.replace('blue;', 'cyan;'),
        TRIAD.replace('.theme', '.other'),
        `@media (min-width: 800px) { ${TRIAD} }`,
        `}\n${TRIAD}`,
      ]) {
        record(`\n\n\n${source}`);
        assert.ok(
          checkHue(root).failures.some(error => /new violations/.test(error))
        );
      }
    });
  });

  it('does not spend a retained allowance again on a copied rule', () => {
    withHueRepo(({ root, record }) => {
      record(`${TRIAD}\n${TRIAD}`);
      assert.ok(
        checkHue(root).failures.some(error => /new violations/.test(error))
      );
    });
  });

  it('does not turn one moved allowance into two copies', () => {
    withHueRepo(({ root, record }) => {
      record(`\n\n${TRIAD}\n${TRIAD}`);
      assert.ok(
        checkHue(root).failures.some(error => /new violations/.test(error))
      );
    });
  });

  it('does not merge two same-line copies into one relocated identity', () => {
    withHueRepo(({ root, record }) => {
      record(`\n\n${TRIAD} ${TRIAD}`);
      assert.ok(
        checkHue(root).failures.some(error => /new violations/.test(error))
      );
    });
  });

  it('preserves unchanged quoted CSS but rejects changes hidden inside quotes', () => {
    const quoted = TRIAD.replace(' }', ` content: '/*old*/}'; }`);
    withHueRepo(({ root, record }) => {
      record(`\n\n${quoted}`);
      assert.deepEqual(checkHue(root).failures, []);
      record(`\n\n${quoted.replace('old', 'new')}`);
      assert.ok(
        checkHue(root).failures.some(error => /new violations/.test(error))
      );
    }, quoted);
  });

  it('does not transfer a rule allowance to another file', () => {
    withHueRepo(({ root, record, write }) => {
      write(FIXTURE_CSS, '');
      record(`\n\n${TRIAD}`, 'apps/web/components/marketing/other.css');
      assert.ok(
        checkHue(root).failures.some(error => /new violations/.test(error))
      );
    });
  });

  it('fails closed when the ancestor stylesheet cannot prove the allowance', () => {
    withHueRepo(({ root, record, git }) => {
      git(['rm', FIXTURE_CSS]);
      git([
        '-c',
        'user.name=Hue fixture',
        '-c',
        'user.email=hue@example.invalid',
        'commit',
        '-qm',
        'Remove ancestor stylesheet',
      ]);
      git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
      record(`\n\n${TRIAD}`);
      assert.ok(
        checkHue(root).failures.some(error => /new violations/.test(error))
      );
    });
  });

  it('matches the shrink-only baseline', () => {
    assert.deepEqual(checkHue().failures, []);
  });
});
