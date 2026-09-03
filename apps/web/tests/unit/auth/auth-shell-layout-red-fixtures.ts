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

/** Form helper that re-owns shell padding and the canonical form width. */
export const SHELL_OWNING_FORM_CONTAINER_SOURCE = `
import { AUTH_FORM_MAX_WIDTH_CLASS } from '@/features/auth/constants';

export function AuthFormContainer({ children }) {
  return (
    <div className='w-full px-4 sm:px-6'>
      <div className={AUTH_FORM_MAX_WIDTH_CLASS}>{children}</div>
    </div>
  );
}
`;

/** Legacy branding helper with its own breakpoint, gradients, and ornaments. */
export const SHELL_OWNING_BRANDING_SOURCE = `
const gradientVariants = {
  primary: 'bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600',
};

export function AuthBranding() {
  return (
    <div className='hidden overflow-hidden lg:block bg-linear-to-br from-blue-600 via-purple-600 to-cyan-600'>
      <div className='absolute top-20 left-20 w-32 h-32 rounded-full blur-xl animate-pulse' />
    </div>
  );
}
`;
