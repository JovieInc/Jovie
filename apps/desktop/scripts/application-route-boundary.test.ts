// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createApplicationRouteBoundary } from '../src/application-route-boundary';
import support from '../src/mac-support.json';
import { getUrlDisposition } from '../src/navigation';

describe('application route boundary', () => {
  it.each(['production', 'staging', 'local'] as const)(
    'recovers SPA and history escapes in %s while preserving the last application route',
    appEnv => {
      const appUrl =
        appEnv === 'local'
          ? 'http://127.0.0.1:3112'
          : appEnv === 'staging'
            ? 'https://staging.jov.ie'
            : 'https://jov.ie';
      const entryUrl = `${appUrl}/app/chat`;
      const handoff = vi.fn();
      const restore = vi.fn();
      const boundary = createApplicationRouteBoundary({
        policy: { appUrl, appEnv },
        entryUrl,
        handoff,
        restore,
        isAuthRoute: url => new URL(url).pathname === '/signin',
      });
      boundary(`${appUrl}/app/releases?filter=ready`, true);
      for (const path of [
        '/blog',
        '/changelog',
        '/download',
        '/install',
        '/pwa',
        '/developers',
      ]) {
        boundary(`${appUrl}${path}`, true);
        expect(handoff).toHaveBeenLastCalledWith(
          `${appUrl}${path}`,
          'external'
        );
        expect(restore).toHaveBeenLastCalledWith(
          `${appUrl}/app/releases?filter=ready`
        );
        // Same rejected event is not handed off twice before recovery.
        const count = handoff.mock.calls.length;
        boundary(`${appUrl}${path}`, true);
        expect(handoff).toHaveBeenCalledTimes(count);
      }
      boundary(`${appUrl}/timwhite`, true);
      expect(handoff).toHaveBeenLastCalledWith(
        `${appUrl}/timwhite`,
        'profile-preview'
      );
      handoff.mockClear();
      restore.mockClear();
      boundary(`${appUrl}/blog`, false);
      expect(handoff).not.toHaveBeenCalled();
      expect(restore).not.toHaveBeenCalled();
      boundary(`${appUrl}/signin`, true);
      boundary(`${appUrl}/auth/native-complete`, true);
      expect(restore).not.toHaveBeenCalled();
      boundary(`${appUrl}/api/private`, true);
      expect(handoff).not.toHaveBeenCalled();
      expect(restore).toHaveBeenLastCalledWith(
        `${appUrl}/auth/native-complete`
      );
    }
  );
  it('blocks encoded/control paths and executable URLs without opening them', () => {
    for (const target of [
      'https://jov.ie/app%2fsecret',
      'https://jov.ie/app/%00',
      'javascript:alert(1)',
      'https://bad.example/blog',
    ])
      expect(
        getUrlDisposition(target, {
          appUrl: 'https://jov.ie',
          appEnv: 'production',
        })
      ).toBe('blocked');
  });
  it('keeps the support contract tied to the pinned runtime and universal architecture', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    expect(Number(pkg.devDependencies.electron.match(/\d+/)[0])).toBe(
      support.electronMajor
    );
    expect(support.minimumMacOSMajor).toBe(13);
    expect(support.architectures).toEqual(['arm64', 'x64']);
    for (const file of ['electron-builder.yml', 'electron-builder.staging.yml'])
      expect(
        readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      ).toContain('- universal');
  });
});

it('routes client handoff requests only from the live trusted main frame', async () => {
  const ts = await import('typescript');
  const { runInNewContext } = await import('node:vm');
  const source = readFileSync(
    new URL('../src/main.ts', import.meta.url),
    'utf8'
  );
  const ast = ts.createSourceFile(
    'main.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const registration = ast.statements.find(node => {
    if (
      !ts.isExpressionStatement(node) ||
      !ts.isCallExpression(node.expression)
    )
      return false;
    const call = node.expression;
    const channel = call.arguments[0];
    return (
      call.expression.getText(ast) === 'ipcMain.handle' &&
      channel &&
      ts.isStringLiteral(channel) &&
      channel.text === 'desktop-route-navigation'
    );
  });
  expect(registration).toBeDefined();
  const frame = {
    parent: null,
    detached: false,
    url: 'https://jov.ie/app/chat',
  };
  const contents = { mainFrame: frame };
  const open = vi.fn(async () => ({
    ok: false,
    reason: 'open-external-failed',
  }));
  const preview = vi.fn(() => true);
  let handler: (event: object, url: unknown) => Promise<object> =
    async () => ({});
  runInNewContext(
    ts.transpileModule(registration!.getText(ast), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    {
      ipcMain: {
        handle: (_: string, callback: typeof handler) => {
          handler = callback;
        },
      },
      mainWindow: { webContents: contents },
      isTrustedIpcSender: (event: { senderFrame: typeof frame }) =>
        new URL(event.senderFrame.url).origin === 'https://jov.ie',
      getUrlDisposition: (url: string) =>
        getUrlDisposition(url, {
          appUrl: 'https://jov.ie',
          appEnv: 'production',
        }),
      showPublicProfilePreview: preview,
      openExternalUrl: open,
    }
  );
  const event = { sender: contents, senderFrame: frame };
  expect(await handler(event, 'https://jov.ie/blog')).toMatchObject({
    ok: false,
    reason: 'open-external-failed',
  });
  expect(open).toHaveBeenCalledOnce();
  expect(await handler(event, 'https://jov.ie/timwhite')).toMatchObject({
    ok: true,
  });
  expect(preview).toHaveBeenCalledOnce();
  for (const url of [
    'javascript:alert(1)',
    'https://evil.example/blog',
    'https://jov.ie/api/private',
    'https://jov.ie/app/chat',
  ])
    expect(await handler(event, url)).toMatchObject({ ok: false });
  for (const invalid of [
    { ...event, sender: {} },
    { ...event, senderFrame: null },
    { ...event, senderFrame: { ...frame, parent: {} } },
    { ...event, senderFrame: { ...frame, detached: true } },
  ])
    expect(await handler(invalid, 'https://jov.ie/blog')).toMatchObject({
      ok: false,
      reason: 'untrusted-sender',
    });
  expect(open).toHaveBeenCalledOnce();
});
