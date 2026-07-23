import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const seedDashboardAuth = require('./lighthouse-dashboard-auth.cjs') as (
  browser: {
    newPage(): Promise<Record<string, unknown>>;
    defaultBrowserContext?(): {
      setCookie(...cookies: unknown[]): Promise<void>;
    };
  },
  options: { url: string }
) => Promise<void>;

const temporaryDirectories: string[] = [];

function writeStorageState() {
  const directory = mkdtempSync(
    join(tmpdir(), 'jovie-lighthouse-auth-entrypoints-')
  );
  temporaryDirectories.push(directory);
  const storageStatePath = join(directory, 'storage-state.json');
  writeFileSync(
    storageStatePath,
    JSON.stringify({
      cookies: [
        {
          name: '__e2e_test_user_id',
          value: 'app-user-1',
          domain: 'localhost',
        },
        {
          name: '__e2e_test_persona',
          value: 'creator-ready',
          domain: 'localhost',
        },
        {
          name: 'better-auth.session_token',
          value: 'signed-session',
          domain: 'localhost',
        },
        {
          name: 'unrelated',
          value: 'other-origin',
          domain: 'example.com',
        },
      ],
      origins: [],
    })
  );
  vi.stubEnv('LIGHTHOUSE_AUTH_STATE_PATH', storageStatePath);
  return storageStatePath;
}

function createBrowser(options?: {
  landedUrl?: string;
  resolvedUserId?: string | null;
}) {
  const setCookie = vi.fn().mockResolvedValue(undefined);
  const setStorageItem = vi.fn();
  const setStyleProperty = vi.fn();
  vi.stubGlobal('localStorage', { setItem: setStorageItem });
  vi.stubGlobal('document', {
    documentElement: { style: { setProperty: setStyleProperty } },
  });
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(
      async (
        callback: (input?: { hiddenKey: string; openKey: string }) => unknown,
        input?: { hiddenKey: string; openKey: string }
      ) => {
        if (input) return callback(input);
        return options?.resolvedUserId ?? 'app-user-1';
      }
    ),
    url: vi.fn(
      () => options?.landedUrl ?? 'http://localhost:3000/app/releases'
    ),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForNetworkIdle: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newPage: vi.fn().mockResolvedValue(page),
    defaultBrowserContext: vi.fn(() => ({ setCookie })),
  };
  return { browser, page, setCookie, setStorageItem, setStyleProperty };
}

describe('authenticated performance entrypoints', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps every package script target present', () => {
    const webRoot = resolve(import.meta.dirname, '..');
    const packageJson = JSON.parse(
      readFileSync(resolve(webRoot, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    const commandNames = [
      'perf:auth',
      'test:lighthouse:dashboard:pr',
      'test:lighthouse:onboarding:pr',
      'test:lighthouse:admin:pr',
      'test:lighthouse:chat:pr',
    ];

    for (const commandName of commandNames) {
      const command = packageJson.scripts[commandName];
      expect(command, `missing script: ${commandName}`).toBeDefined();
      const scriptTargets = command.match(/scripts\/[\w.-]+/g) ?? [];
      expect(scriptTargets, commandName).not.toHaveLength(0);
      for (const scriptTarget of scriptTargets) {
        expect(existsSync(resolve(webRoot, scriptTarget)), commandName).toBe(
          true
        );
      }
    }
  });

  it('seeds matching cookies, hides the toolbar, and waits for main', async () => {
    writeStorageState();
    const { browser, page, setCookie, setStorageItem, setStyleProperty } =
      createBrowser();

    await seedDashboardAuth(browser, {
      url: 'http://localhost:3000/app/releases',
    });

    expect(setCookie).toHaveBeenCalledOnce();
    expect(setCookie.mock.calls[0]).toEqual([
      expect.objectContaining({
        name: '__e2e_test_user_id',
        domain: 'localhost',
        path: '/',
      }),
      expect.objectContaining({
        name: '__e2e_test_persona',
        domain: 'localhost',
        path: '/',
      }),
      expect.objectContaining({
        name: 'better-auth.session_token',
        domain: 'localhost',
        path: '/',
      }),
    ]);
    expect(page.evaluate).toHaveBeenNthCalledWith(1, expect.any(Function), {
      hiddenKey: '__dev_toolbar_hidden',
      openKey: '__dev_toolbar_open',
    });
    expect(setStorageItem).toHaveBeenNthCalledWith(
      1,
      '__dev_toolbar_hidden',
      '1'
    );
    expect(setStorageItem).toHaveBeenNthCalledWith(
      2,
      '__dev_toolbar_open',
      '0'
    );
    expect(setStyleProperty).toHaveBeenCalledWith(
      '--dev-toolbar-height',
      '0px'
    );
    expect(page.waitForSelector).toHaveBeenCalledWith('main', {
      timeout: 30_000,
    });
    expect(page.waitForNetworkIdle).toHaveBeenCalledWith({
      idleTime: 500,
      timeout: 10_000,
    });
    expect(page.close).toHaveBeenCalledOnce();
  });

  it('fails closed when the authenticated route redirects', async () => {
    writeStorageState();
    const { browser, page } = createBrowser({
      landedUrl: 'http://localhost:3000/sign-in',
    });

    await expect(
      seedDashboardAuth(browser, {
        url: 'http://localhost:3000/app/releases',
      })
    ).rejects.toThrow(
      'Lighthouse Better Auth state redirected /app/releases to /sign-in.'
    );
    expect(page.waitForSelector).not.toHaveBeenCalled();
    expect(page.close).toHaveBeenCalledOnce();
  });

  it('fails closed when Better Auth resolves a different user', async () => {
    writeStorageState();
    const { browser, page } = createBrowser({
      resolvedUserId: 'different-user',
    });

    await expect(
      seedDashboardAuth(browser, {
        url: 'http://localhost:3000/app/releases',
      })
    ).rejects.toThrow(
      'Lighthouse Better Auth session resolved different-user instead of app-user-1.'
    );
    expect(page.waitForSelector).not.toHaveBeenCalled();
    expect(page.close).toHaveBeenCalledOnce();
  });
});
