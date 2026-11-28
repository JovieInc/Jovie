import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import flow from '../../golden-path-walk/flow-new-user.mjs';

const ORIGIN = 'https://jovie.example';
const ARTIST = 'Canary Artist';

function fixture({
  waitlist = false,
  proofPending = false,
  profileStatus = 200,
} = {}) {
  let url = ORIGIN;
  let handle;
  const profile = {
    profileId: 'profile-1',
    get handle() {
      return handle;
    },
  };
  const page = Object.assign(new EventEmitter(), {
    goto: vi.fn(async target => {
      url = target;
      return { status: () => (target === ORIGIN ? 200 : profileStatus) };
    }),
    url: () => url,
    waitForURL: predicate => expect(predicate(new URL(url))).toBe(true),
    waitForResponse: async predicate => {
      const response = {
        url: () => ORIGIN + '/api/onboarding/claim',
        request: () => ({ method: () => 'POST' }),
        ok: () => true,
        status: () => 200,
        json: async () => ({ profile, proofPending }),
      };
      expect(predicate(response)).toBe(true);
      return response;
    },
    getByRole: vi.fn((_role, { name }) => {
      const locator = {
        ...element(),
        and: () => locator,
        click: async () => {
          if (name === 'Claim your profile') url = ORIGIN + '/start';
        },
      };
      return locator;
    }),
    getByTestId: id => element(id),
    getByLabel: label => element(label),
    getByText: () => element(),
    locator: () => element(),
  });
  function element(id = '') {
    const locator = {
      first: () => locator,
      last: () => locator,
      filter: () => locator,
      getByTestId: id => element(id),
      getByLabel: label => element(label),
      waitFor: async () => {},
      isVisible: async () => false,
      click: async () => {},
      fill: async value => {
        if (id === 'Edit Proposed Handle') handle = value;
        if (id === 'otp-autofill-input' && waitlist) {
          page.emit('request', {
            isNavigationRequest: () => true,
            url: () => ORIGIN + '/waitlist',
          });
        }
      },
    };
    return locator;
  }
  const snap = vi.fn();
  return {
    ctx: /** @type {Parameters<typeof flow>[0]} */ (
      /** @type {unknown} */ ({
        page,
        snap,
        otp: async () => '123456',
        email: 'browse-ready+synthetic-prodcert-fixture@jov.ie',
        ARTIST,
        ARTIST_SPOTIFY: 'https://open.spotify.com/artist/fixture',
        ORIGIN,
      })
    ),
    page,
    snap,
  };
}

describe('registered new-visitor walk', () => {
  it('follows the current link and records first value at the claimed profile', async () => {
    const { ctx, page, snap } = fixture();
    await flow(ctx);
    expect(page.getByRole).toHaveBeenCalledWith('link', {
      name: 'Claim your profile',
      exact: true,
    });
    expect(page.getByRole).toHaveBeenCalledWith('heading', {
      name: ARTIST,
      level: 1,
      exact: true,
    });
    expect(snap).toHaveBeenLastCalledWith('profile live', {
      receiptReached: true,
      receiptMs: expect.any(Number),
    });
  });

  it('fails if a waitlist navigation starts, even if the claim later succeeds', async () => {
    const { ctx, snap } = fixture({ waitlist: true });
    await expect(flow(ctx)).rejects.toThrow('Walk visited /waitlist');
    expect(snap).not.toHaveBeenCalledWith('profile live', expect.anything());
  });

  it('fails when the public URL does not render the claimed profile', async () => {
    const { ctx, snap } = fixture({ profileStatus: 404 });
    await expect(flow(ctx)).rejects.toThrow(
      'Public profile did not return HTTP 200'
    );
    expect(snap).not.toHaveBeenCalledWith('profile live', expect.anything());
  });

  it('fails when the claimed profile still requires operator proof', async () => {
    const { ctx, page } = fixture({ proofPending: true });
    await expect(flow(ctx)).rejects.toThrow('requires operator proof');
    expect(page.goto).toHaveBeenCalledTimes(1);
  });
});
