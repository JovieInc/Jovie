import {
  persistSidebarPreference,
  readSidebarPreference,
  SIDEBAR_STORAGE_KEY,
} from '../sidebarPreference';

describe('sidebarPreference', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns server default when no local preference is set', () => {
    const preference = readSidebarPreference(true);

    expect(preference).toEqual({ open: true, hasStoredPreference: false });
  });

  it('uses stored open preference without rewriting storage', () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, '0');
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');

    const preference = readSidebarPreference(false);

    expect(preference).toEqual({ open: true, hasStoredPreference: true });
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('uses stored collapsed preference', () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, '1');

    const preference = readSidebarPreference(true);

    expect(preference).toEqual({ open: false, hasStoredPreference: true });
  });

  it('persists user changes to storage', () => {
    persistSidebarPreference(true);
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('0');

    persistSidebarPreference(false);
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('1');
  });
});
