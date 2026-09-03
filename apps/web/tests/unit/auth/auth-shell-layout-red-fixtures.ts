/**
 * Deliberate-red fixtures for the auth-shell layout contract (JOV-5490).
 * Production sources must not import this file.
 */

/** Tablet breakpoint (768) instead of AUTH_SPLIT_MIN_WIDTH_PX (1024). */
export const SWAPPED_BREAKPOINT_AUTH_DESKTOP_ONLY_CSS = `
.auth-desktop-only {
  display: none;
}

@media (min-width: 768px) {
  .auth-desktop-only {
    display: block;
  }
}
`;

/** Editorial card visible at every viewport. */
export const ALWAYS_VISIBLE_AUTH_DESKTOP_ONLY_CSS = `
.auth-desktop-only {
  display: block;
}
`;

/** Split grid at md (768) instead of lg (1024). */
export const SWAPPED_GRID_BREAKPOINT_LAYOUT_SOURCE = `
function SplitLayoutContent() {
  return (
    <div className='grid w-full md:grid-cols-[minmax(0,480px)_minmax(0,1fr)]'>
      <AuthFormColumn />
      <div className='auth-desktop-only'>
        <AuthBrandPanel />
      </div>
    </div>
  );
}
`;

/** Editorial card mounted without the desktop-only visibility wrapper. */
export const UNWRAPPED_EDITORIAL_LAYOUT_SOURCE = `
function SplitLayoutContent() {
  return (
    <div className='grid w-full lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]'>
      <AuthFormColumn />
      <AuthBrandPanel />
    </div>
  );
}
`;
