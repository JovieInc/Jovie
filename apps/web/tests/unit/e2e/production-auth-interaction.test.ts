import { describe, expect, it, vi } from 'vitest';
import {
  prepareProductionAuthEmailForm,
  waitForProductionDashboardContent,
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
});
