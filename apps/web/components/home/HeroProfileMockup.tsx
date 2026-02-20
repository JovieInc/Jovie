/**
 * HeroProfileMockup — A phone-frame product screenshot for the homepage hero.
 *
 * Shows the top third of a Jovie profile (avatar, name, genre, two releases)
 * clipped with a bottom fade, rendered inside a Linear-style elevated card
 * with "jov.ie/tim" underneath.
 *
 * Visual reference: linear.app hero product screenshots.
 */
export function HeroProfileMockup() {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Phone frame — Linear-style elevated card */}
      <div
        className="relative w-[280px] sm:w-[300px]"
        style={{
          borderRadius: 'var(--linear-radius-lg)',
          border: '1px solid var(--linear-border-subtle)',
          background: 'var(--linear-bg-surface-0)',
          boxShadow: 'var(--linear-shadow-card-elevated)',
          overflow: 'hidden',
        }}
      >
        {/* Notch / status bar */}
        <div
          className="flex items-center justify-center py-2"
          style={{
            borderBottom: '1px solid var(--linear-border-subtle)',
          }}
        >
          <div
            className="h-[5px] w-[60px] rounded-full"
            style={{ background: 'var(--linear-border-default)' }}
            aria-hidden="true"
          />
        </div>

        {/* Profile content — top third of a profile page */}
        <div className="px-5 pt-5 pb-0">
          {/* Avatar + name row */}
          <div className="flex items-center gap-3.5">
            <div
              className="w-14 h-14 rounded-full shrink-0 flex items-center justify-center text-xl font-semibold"
              style={{
                background: 'linear-gradient(135deg, #2a1f3d, #1a1a2e)',
                color: 'var(--linear-text-primary)',
              }}
              aria-hidden="true"
            >
              T
            </div>
            <div>
              <div
                className="text-[15px] font-semibold"
                style={{ color: 'var(--linear-text-primary)' }}
              >
                Tim White
              </div>
              <div
                className="text-[12px] mt-0.5"
                style={{ color: 'var(--linear-text-tertiary)' }}
              >
                Indie / Alternative
              </div>
            </div>
          </div>

          {/* Bio line */}
          <p
            className="mt-3 text-[12px] leading-relaxed"
            style={{ color: 'var(--linear-text-secondary)' }}
          >
            LA-based artist blending indie rock with electronic textures.
          </p>

          {/* Releases */}
          <div className="mt-4 flex flex-col gap-2.5">
            {/* Release 1 */}
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-md shrink-0"
                style={{ backgroundColor: '#6366f1', opacity: 0.85 }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div
                  className="text-[13px] font-medium truncate"
                  style={{ color: 'var(--linear-text-primary)' }}
                >
                  Signals
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  Album &middot; 12 tracks
                </div>
              </div>
            </div>

            {/* Release 2 */}
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-md shrink-0"
                style={{ backgroundColor: '#f59e0b', opacity: 0.85 }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div
                  className="text-[13px] font-medium truncate"
                  style={{ color: 'var(--linear-text-primary)' }}
                >
                  Where It Goes
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  Single
                </div>
              </div>
            </div>

            {/* Release 3 — partially clipped by the fade */}
            <div className="flex items-center gap-3 pb-1">
              <div
                className="w-10 h-10 rounded-md shrink-0"
                style={{ backgroundColor: '#ec4899', opacity: 0.85 }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div
                  className="text-[13px] font-medium truncate"
                  style={{ color: 'var(--linear-text-primary)' }}
                >
                  Fading Light
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  EP &middot; 5 tracks
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom fade — clips the content to show "top third" effect */}
        <div
          className="pointer-events-none relative h-16"
          aria-hidden="true"
          style={{
            background: `linear-gradient(to bottom, transparent, var(--linear-bg-surface-0))`,
          }}
        />
      </div>

      {/* URL label underneath — "jov.ie/tim" */}
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1"
        style={{
          fontSize: '13px',
          fontWeight: 500,
          letterSpacing: '0.01em',
          color: 'var(--linear-text-tertiary)',
          background: 'var(--linear-bg-surface-1)',
          border: '1px solid var(--linear-border-subtle)',
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ opacity: 0.6 }}
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        jov.ie/tim
      </span>
    </div>
  );
}
