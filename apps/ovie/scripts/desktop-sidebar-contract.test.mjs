import { describe, expect, it } from 'vitest';
import { validateDesktopSidebarContract } from './desktop-sidebar-contract.mjs';

const shell = `const isElectron = useIsElectronRuntime();
const sidebarTrigger = isMobile || isElectron ? null : <SidebarCollapseButton />;`;
const header = `<div data-web-sidebar-control='true'>{sidebarTrigger}</div>
<div data-web-sidebar-control='true'><VerticalDivider /></div>`;
const css = `html[data-desktop-runtime="electron"] [data-web-sidebar-control="true"] { display: none; }`;

describe('desktop sidebar hydration contract', () => {
  it('accepts hydration-stable detection with both controls hidden before paint', () => {
    expect(validateDesktopSidebarContract(shell, header, css)).toEqual([]);
  });
  it('rejects the previous synchronous branch that mismatched server and client HTML', () => {
    expect(
      validateDesktopSidebarContract(
        shell.replace('useIsElectronRuntime()', 'isElectronRuntime()'),
        header,
        css
      )
    ).toEqual([expect.stringContaining('preserve hydration')]);
  });
  it('rejects synchronous detection even when an unused safe hook remains', () => {
    expect(
      validateDesktopSidebarContract(
        shell.replace('isMobile || isElectron', 'isElectronRuntime()'),
        header,
        css
      )
    ).toEqual([expect.stringContaining('preserve hydration')]);
  });
  it('rejects passing the duplicate web toggle after hydration', () => {
    expect(
      validateDesktopSidebarContract(
        shell.replace('isMobile || isElectron', 'isMobile'),
        header,
        css
      )
    ).toEqual([expect.stringContaining('remove the web toggle')]);
  });
  it('rejects a visible divider even when the toggle itself has a marker', () => {
    expect(
      validateDesktopSidebarContract(
        shell,
        header.replace(
          "<div data-web-sidebar-control='true'><VerticalDivider",
          '<div><VerticalDivider'
        ),
        css
      )
    ).toEqual([expect.stringContaining('toggle and divider')]);
  });
  it('rejects missing markers', () => {
    expect(validateDesktopSidebarContract(shell, '<div />', css)).toHaveLength(
      1
    );
  });
  it('rejects a pre-hydration duplicate when runtime CSS no longer hides the controls', () => {
    expect(
      validateDesktopSidebarContract(shell, header, css.replace('none', 'flex'))
    ).toEqual([expect.stringContaining('before Electron hydration')]);
  });
});
