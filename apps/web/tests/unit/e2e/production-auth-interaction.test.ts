import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  prepareProductionAuthEmailForm,
  waitForCheckoutEntryContent,
  waitForProductionDashboardContent,
  waitForProductionOnboardingLanding,
} from '../../e2e/utils/production-auth-interaction';

// Keep Playwright's assertion adapter local to this DOM-based unit fixture.
// The helper's readiness predicate executes against the actual fixture elements.
vi.mock('@playwright/test', () => ({
  expect: (locator: { inputValue: () => Promise<string> }) => ({
    toHaveValue: async (value: string) => {
      expect(await locator.inputValue()).toBe(value);
    },
  }),
}));

function emailFormFixture(afterLoad: () => void = () => {}) {
  document.body.innerHTML = `
    <form data-auth-email-code-step="email">
      <input name="emailAddress" type="email" autocomplete="email" />
      <button type="submit" disabled>Send sign-in code</button>
    </form>
  `;

  const input = document.querySelector('input') as HTMLInputElement;
  const button = document.querySelector('button') as HTMLButtonElement;
  const calls: string[] = [];
  const identifierInput = {
    waitFor: vi.fn(async () => {
      calls.push('input-visible');
    }),
    click: vi.fn(async () => {
      calls.push('click');
      input.focus();
    }),
    pressSequentially: vi.fn(async (value: string) => {
      calls.push(`type:${value}`);
      input.value += value;
      button.disabled = false;
    }),
    inputValue: vi.fn(async () => input.value),
  };
  const submitButton = {
    waitFor: vi.fn(async () => {
      calls.push('submit-visible');
    }),
  };
  const form = {
    waitFor: vi.fn(async () => {
      calls.push('form-visible');
    }),
    locator: vi.fn((selector: string) =>
      selector === 'button[type="submit"]'
        ? { ...submitButton, first: () => submitButton }
        : { ...identifierInput, first: () => identifierInput }
    ),
  };
  const page = {
    waitForLoadState: vi.fn(async () => {
      calls.push('load');
      afterLoad();
    }),
    locator: vi.fn(() => ({ ...form, first: () => form })),
    waitForFunction: vi.fn(
      async (
        predicate: (options: {
          selector: string;
          inputSelector: string;
          expected: string;
        }) => boolean,
        options: {
          selector: string;
          inputSelector: string;
          expected: string;
        }
      ) => {
        calls.push('submit-enabled');
        if (!predicate(options)) throw new Error('Email form is not ready');
      }
    ),
  };

  return { page, identifierInput, submitButton, calls };
}

describe('production auth interaction hydration gate', () => {
  it('types the email once before full load and verifies it survives hydration', async () => {
    const { page, identifierInput, submitButton, calls } = emailFormFixture();

    const controls = await prepareProductionAuthEmailForm(
      page as never,
      'smoke@example.com'
    );

    expect(controls).toEqual({ identifierInput, submitButton });
    expect(identifierInput.pressSequentially).toHaveBeenCalledExactlyOnceWith(
      'smoke@example.com'
    );
    expect(calls).toEqual([
      'form-visible',
      'input-visible',
      'submit-visible',
      'click',
      'type:smoke@example.com',
      'load',
      'submit-enabled',
    ]);
    // The hydration-survival gate carries its own patience floor (JOV-8495):
    // postdeploy run 43620238651 timed out at 15s under runner contention
    // while the same landed deployment hydrated in seconds on adjacent runs.
    // Visibility stays fast-fail at the caller timeout; only survival gets
    // the 45s floor, and an explicit larger caller timeout still wins.
    expect(page.waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        selector: 'form[data-auth-email-code-step="email"]',
        inputSelector:
          'input[name="identifier"], input[name="emailAddress"], input[type="email"], input[autocomplete="email"]',
        expected: 'smoke@example.com',
      },
      { timeout: 45_000 }
    );
    expect(identifierInput.waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 15_000,
    });
  });

  it.each(['cleared email', 'disabled submit'])(
    'rejects a %s after hydration without retyping',
    async failure => {
      const { page, identifierInput } = emailFormFixture(() => {
        if (failure === 'cleared email') {
          const input = document.querySelector('input') as HTMLInputElement;
          input.value = '';
        } else {
          const button = document.querySelector('button') as HTMLButtonElement;
          button.disabled = true;
        }
      });

      await expect(
        prepareProductionAuthEmailForm(page as never, 'smoke@example.com')
      ).rejects.toThrow('Email form is not ready');
      expect(identifierInput.pressSequentially).toHaveBeenCalledExactlyOnceWith(
        'smoke@example.com'
      );
    }
  );

  it('waits for meaningful dashboard content instead of sampling an empty main', async () => {
    document.body.innerHTML = '<main></main>';

    const page = {
      waitForFunction: vi.fn(
        async (
          predicate: (options: {
            selector: string;
            minimumLength: number;
          }) => string | false,
          options: { selector: string; minimumLength: number }
        ) => {
          expect(predicate(options)).toBe(false);

          const main = document.querySelector('main');
          expect(main).not.toBeNull();
          if (main) {
            main.textContent =
              'Your dashboard is ready with real authenticated content.';
          }

          const content = predicate(options);
          expect(content).toBe(
            'Your dashboard is ready with real authenticated content.'
          );
          return { jsonValue: vi.fn(async () => content) };
        }
      ),
    };

    await expect(
      waitForProductionDashboardContent(page as never, 20_000)
    ).resolves.toBe('Your dashboard is ready with real authenticated content.');
    expect(page.waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      { selector: 'main', minimumLength: 30 },
      { timeout: 20_000 }
    );
  });

  it('waits for the billing heading instead of sampling an empty main once', async () => {
    document.body.innerHTML = '<main></main>';

    const page = {
      waitForFunction: vi.fn(
        async (
          predicate: (options: {
            selector: string;
            minimumLength: number;
          }) => string | false,
          options: { selector: string; minimumLength: number }
        ) => {
          // The pre-render sample is what failed the 2026-10-29 promotion.
          expect(predicate(options)).toBe(false);
          const main = document.querySelector('main');
          if (main) main.textContent = 'Billing Current plan status only';
          return { jsonValue: vi.fn(async () => predicate(options)) };
        }
      ),
    };

    await expect(
      waitForCheckoutEntryContent(page as never, 20_000)
    ).resolves.toBe('billing current plan status only');
    expect(page.waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      { selector: 'main', minimumLength: 5 },
      { timeout: 20_000 }
    );
  });
});

describe('fresh production signup landing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function onboardingFixture(url = 'https://jov.ie/start?fresh_signup=true') {
    vi.stubGlobal('location', new URL(url));
    document.body.innerHTML = `<main data-testid="onboarding-chat">
      <textarea aria-label="Chat message input"></textarea>
    </main>`;
    const shell = document.querySelector('main') as HTMLElement;
    const input = document.querySelector('textarea') as HTMLTextAreaElement;
    for (const element of [shell, input]) {
      vi.spyOn(element, 'getClientRects').mockReturnValue([
        new DOMRect(0, 0, 100, 40),
      ] as unknown as DOMRectList);
    }
    return { shell, input };
  }

  type LandingOptions = {
    origin: string;
    pathname: string;
    shellSelector: string;
    inputSelector: string;
  };

  it('waits across the intermediate app landing until onboarding is usable', async () => {
    const { input } = onboardingFixture('https://jov.ie/app');
    input.disabled = true;
    const dispose = vi.fn();
    const page = {
      waitForFunction: vi.fn(
        async (
          predicate: (options: LandingOptions) => boolean,
          options: LandingOptions
        ) => {
          expect(predicate(options)).toBe(false);
          vi.stubGlobal(
            'location',
            new URL('https://jov.ie/start?fresh_signup=true')
          );
          expect(predicate(options)).toBe(false);
          input.disabled = false;
          expect(predicate(options)).toBe(true);
          return { dispose };
        }
      ),
    };
    await waitForProductionOnboardingLanding(page as never, 'https://jov.ie');
    expect(page.waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        origin: 'https://jov.ie',
        pathname: '/start',
        shellSelector: '[data-testid="onboarding-chat"]',
        inputSelector: '[aria-label="Chat message input" i]',
      },
      { timeout: 30_000 }
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it.each([
    'wrong origin',
    'wrong path',
    'hidden shell',
    'hidden input',
    'disabled input',
    'readonly input',
    'missing onboarding',
  ])('rejects a %s rather than accepting an off-signin URL', async failure => {
    const { shell, input } = onboardingFixture();
    if (failure === 'wrong origin')
      vi.stubGlobal('location', new URL('https://other.example/start'));
    if (failure === 'wrong path')
      vi.stubGlobal('location', new URL('https://jov.ie/app'));
    if (failure === 'hidden shell') shell.style.display = 'none';
    if (failure === 'hidden input') input.style.visibility = 'hidden';
    if (failure === 'disabled input') input.disabled = true;
    if (failure === 'readonly input') input.readOnly = true;
    if (failure === 'missing onboarding') shell.removeAttribute('data-testid');
    const page = {
      waitForFunction: vi.fn(
        async (
          predicate: (options: LandingOptions) => boolean,
          options: LandingOptions
        ) => {
          expect(predicate(options)).toBe(false);
          throw new Error('Fresh onboarding is not ready');
        }
      ),
    };
    await expect(
      waitForProductionOnboardingLanding(page as never, 'https://jov.ie')
    ).rejects.toThrow('Fresh onboarding is not ready');
  });

  it.each(['missing', 'disabled'])(
    'ignores a writable input outside onboarding when its own input is %s',
    async state => {
      const { shell, input } = onboardingFixture();
      const decoy = document.createElement('textarea');
      decoy.setAttribute('aria-label', 'Chat message input');
      document.body.prepend(decoy);
      vi.spyOn(decoy, 'getClientRects').mockReturnValue([
        new DOMRect(0, 0, 100, 40),
      ] as unknown as DOMRectList);
      if (state === 'missing') input.remove();
      else input.disabled = true;

      const dispose = vi.fn();
      const page = {
        waitForFunction: vi.fn(
          async (
            predicate: (options: LandingOptions) => boolean,
            options: LandingOptions
          ) => {
            expect(predicate(options)).toBe(false);
            if (state === 'missing') shell.append(input);
            else input.disabled = false;
            expect(predicate(options)).toBe(true);
            return { dispose };
          }
        ),
      };

      await waitForProductionOnboardingLanding(page as never, 'https://jov.ie');
      expect(dispose).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps the fresh signup and first reply on the same naturally reached page', () => {
    const source = readFileSync(
      resolve(__dirname, '../../e2e/smoke-prod-auth.spec.ts'),
      'utf8'
    );
    const start = source.indexOf("test('new user signs up with an email code'");
    expect(start).toBeGreaterThan(0);
    const signup = source.slice(start);
    const afterCode = signup.slice(
      signup.indexOf('await codeInput.fill(code);')
    );
    expect(afterCode).toContain('await waitForProductionOnboardingLanding(');
    expect(afterCode).not.toContain('page.goto(');
    expect(afterCode).toContain(
      "await assertAssistantReply(page, 'fresh-user onboarding first value')"
    );
  });
});
