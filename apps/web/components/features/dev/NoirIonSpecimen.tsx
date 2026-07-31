/**
 * Dev/Storybook specimen for the Jovie Noir Ion dark color system (JOV-4635).
 * Not mounted in production routes — reference surface only.
 */

const SURFACES = [
  { name: 'Canvas', token: 'var(--noir-ion-canvas)', role: 'App page' },
  { name: 'Shell', token: 'var(--noir-ion-shell)', role: 'Sidebar / chrome' },
  { name: 'Panel', token: 'var(--noir-ion-panel)', role: 'Main content' },
  { name: 'Card', token: 'var(--noir-ion-card)', role: 'Cards' },
  {
    name: 'Elevated',
    token: 'var(--noir-ion-elevated)',
    role: 'Inputs / raised',
  },
  {
    name: 'Floating',
    token: 'var(--noir-ion-floating)',
    role: 'Modals / tooltips',
  },
] as const;

const TEXT_ROLES = [
  { name: 'Strong', color: 'var(--noir-ion-text-strong)' },
  { name: 'Primary', color: 'var(--noir-ion-text-primary)' },
  { name: 'Secondary', color: 'var(--noir-ion-text-secondary)' },
  { name: 'Muted', color: 'var(--noir-ion-text-muted)' },
  { name: 'Tertiary', color: 'var(--noir-ion-text-tertiary)' },
  { name: 'Disabled', color: 'var(--noir-ion-text-disabled)' },
] as const;

const ACCENTS = [
  {
    name: 'Ion',
    role: 'Primary action / focus / selection',
    color: 'var(--noir-ion-ion)',
    soft: 'var(--noir-ion-ion-soft)',
  },
  {
    name: 'Ultra',
    role: 'Agent intelligence',
    color: 'var(--noir-ion-ultra)',
    soft: 'var(--noir-ion-ultra-soft)',
  },
  {
    name: 'Pulse',
    role: 'Creative energy',
    color: 'var(--noir-ion-pulse)',
    soft: 'var(--noir-ion-pulse-soft)',
  },
  {
    name: 'Aqua',
    role: 'System signal',
    color: 'var(--noir-ion-aqua)',
    soft: 'var(--noir-ion-aqua-soft)',
  },
  {
    name: 'Mint',
    role: 'Success',
    color: 'var(--noir-ion-mint)',
    soft: 'var(--noir-ion-mint-soft)',
  },
  {
    name: 'Gold',
    role: 'Warning',
    color: 'var(--noir-ion-gold)',
    soft: 'var(--noir-ion-gold-soft)',
  },
  {
    name: 'Flare',
    role: 'Danger / error',
    color: 'var(--noir-ion-flare)',
    soft: 'var(--noir-ion-flare-soft)',
  },
] as const;

const ROW_STATES = [
  { label: 'Default', className: '' },
  { label: 'Hover', style: { background: 'var(--linear-row-hover)' } },
  {
    label: 'Selected',
    style: { background: 'var(--noir-ion-selected)' },
  },
  {
    label: 'Selected Strong',
    style: { background: 'var(--noir-ion-selected-strong)' },
  },
] as const;

export function NoirIonSpecimen() {
  return (
    <div
      className='dark min-h-dvh p-6 text-primary-token'
      style={{
        background: 'var(--noir-ion-canvas)',
        color: 'var(--noir-ion-text-primary)',
        fontFamily: 'var(--font-sans, Inter, system-ui, sans-serif)',
      }}
      data-testid='noir-ion-specimen'
    >
      <div
        className='mx-auto flex max-w-5xl flex-col gap-8 rounded-xl border p-6'
        style={{
          background: 'var(--noir-ion-panel)',
          borderColor: 'var(--noir-ion-border-default)',
        }}
      >
        <header className='flex flex-wrap items-end justify-between gap-4'>
          <div>
            <p
              className='text-xs font-medium'
              style={{ color: 'var(--noir-ion-text-muted)' }}
            >
              Design System · Authenticated Shell
            </p>
            <h1
              className='text-xl font-semibold tracking-tight'
              style={{ color: 'var(--noir-ion-text-strong)' }}
            >
              Jovie Noir Ion
            </h1>
            <p
              className='mt-1 max-w-xl text-sm'
              style={{ color: 'var(--noir-ion-text-secondary)' }}
            >
              Dark-first product palette. ~90% neutral surfaces, sparse accent.
              One section, one dominant action.
            </p>
          </div>
          <button
            type='button'
            className='inline-flex h-9 items-center rounded-full px-4 text-sm font-medium'
            style={{
              background: 'var(--color-btn-primary-bg)',
              color: 'var(--color-btn-primary-fg)',
            }}
          >
            Primary Action
          </button>
        </header>

        <section aria-labelledby='noir-surfaces'>
          <h2
            id='noir-surfaces'
            className='mb-3 text-sm font-medium'
            style={{ color: 'var(--noir-ion-text-secondary)' }}
          >
            Surfaces
          </h2>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6'>
            {SURFACES.map(surface => (
              <div
                key={surface.name}
                className='flex flex-col gap-2 rounded-lg border p-3'
                style={{
                  background: surface.token,
                  borderColor: 'var(--noir-ion-border-subtle)',
                }}
              >
                <div
                  className='h-10 rounded-md border'
                  style={{
                    background: surface.token,
                    borderColor: 'var(--noir-ion-border-default)',
                  }}
                />
                <div className='text-xs font-medium'>{surface.name}</div>
                <div
                  className='text-[11px]'
                  style={{ color: 'var(--noir-ion-text-tertiary)' }}
                >
                  {surface.role}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby='noir-text'>
          <h2
            id='noir-text'
            className='mb-3 text-sm font-medium'
            style={{ color: 'var(--noir-ion-text-secondary)' }}
          >
            Text Hierarchy
          </h2>
          <div className='flex flex-col gap-1.5'>
            {TEXT_ROLES.map(role => (
              <p
                key={role.name}
                className='text-sm'
                style={{ color: role.color }}
              >
                {role.name} — The quick brown fox jumps over the lazy dog.
              </p>
            ))}
          </div>
        </section>

        <section aria-labelledby='noir-accents'>
          <h2
            id='noir-accents'
            className='mb-3 text-sm font-medium'
            style={{ color: 'var(--noir-ion-text-secondary)' }}
          >
            Accents (Seasoning)
          </h2>
          <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
            {ACCENTS.map(accent => (
              <div
                key={accent.name}
                className='rounded-lg border p-3'
                style={{
                  background: accent.soft,
                  borderColor: 'var(--noir-ion-border-subtle)',
                }}
              >
                <div className='flex items-center gap-2'>
                  <span
                    className='inline-block size-3 rounded-full'
                    style={{ background: accent.color }}
                    aria-hidden
                  />
                  <span
                    className='text-sm font-medium'
                    style={{ color: accent.color }}
                  >
                    {accent.name}
                  </span>
                </div>
                <p
                  className='mt-1 text-[11px]'
                  style={{ color: 'var(--noir-ion-text-muted)' }}
                >
                  {accent.role}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby='noir-states'>
          <h2
            id='noir-states'
            className='mb-3 text-sm font-medium'
            style={{ color: 'var(--noir-ion-text-secondary)' }}
          >
            Row States · Focus · Status
          </h2>
          <div
            className='overflow-hidden rounded-lg border'
            style={{
              background: 'var(--noir-ion-card)',
              borderColor: 'var(--noir-ion-border-default)',
            }}
          >
            <table className='w-full text-left text-sm'>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--noir-ion-border-subtle)',
                    color: 'var(--noir-ion-text-muted)',
                  }}
                >
                  <th className='px-3 py-2 font-medium'>State</th>
                  <th className='px-3 py-2 font-medium'>Track</th>
                  <th className='px-3 py-2 font-medium'>Status</th>
                </tr>
              </thead>
              <tbody>
                {ROW_STATES.map(row => (
                  <tr
                    key={row.label}
                    style={{
                      ...('style' in row ? row.style : undefined),
                      borderBottom: '1px solid var(--noir-ion-border-subtle)',
                    }}
                  >
                    <td className='px-3 py-2'>{row.label}</td>
                    <td
                      className='px-3 py-2'
                      style={{ color: 'var(--noir-ion-text-secondary)' }}
                    >
                      Midnight Protocol
                    </td>
                    <td className='px-3 py-2'>
                      <span
                        className='inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium'
                        style={{
                          background: 'var(--noir-ion-mint-soft)',
                          color: 'var(--noir-ion-mint)',
                        }}
                      >
                        <span
                          className='size-1.5 rounded-full'
                          style={{ background: 'var(--noir-ion-mint)' }}
                          aria-hidden
                        />
                        Live
                      </span>
                    </td>
                  </tr>
                ))}
                <tr
                  style={{
                    outline: '2px solid var(--noir-ion-focus-ring)',
                    outlineOffset: '-2px',
                  }}
                >
                  <td className='px-3 py-2'>Focus Visible</td>
                  <td
                    className='px-3 py-2'
                    style={{ color: 'var(--noir-ion-ion)' }}
                  >
                    Ion focus ring
                  </td>
                  <td className='px-3 py-2'>
                    <span
                      className='inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium'
                      style={{
                        background: 'var(--noir-ion-gold-soft)',
                        color: 'var(--noir-ion-gold)',
                      }}
                    >
                      <span
                        className='size-1.5 rounded-full'
                        style={{ background: 'var(--noir-ion-gold)' }}
                        aria-hidden
                      />
                      Attention
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className='px-3 py-2'>Error</td>
                  <td
                    className='px-3 py-2'
                    style={{ color: 'var(--noir-ion-text-secondary)' }}
                  >
                    Failed sync
                  </td>
                  <td className='px-3 py-2'>
                    <span
                      className='inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium'
                      style={{
                        background: 'var(--noir-ion-flare-soft)',
                        color: 'var(--noir-ion-flare)',
                      }}
                    >
                      <span
                        className='size-1.5 rounded-full'
                        style={{ background: 'var(--noir-ion-flare)' }}
                        aria-hidden
                      />
                      Blocked
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p
            className='mt-2 text-[11px]'
            style={{ color: 'var(--noir-ion-text-tertiary)' }}
          >
            Status uses color plus label and shape. Color alone never carries
            meaning.
          </p>
        </section>

        <section aria-labelledby='noir-link'>
          <h2
            id='noir-link'
            className='mb-2 text-sm font-medium'
            style={{ color: 'var(--noir-ion-text-secondary)' }}
          >
            Links · Disabled
          </h2>
          <div className='flex flex-wrap items-center gap-4 text-sm'>
            <a
              href='#noir-ion-specimen'
              className='underline-offset-2 hover:underline'
              style={{ color: 'var(--color-link-default)' }}
            >
              Ion link
            </a>
            <button
              type='button'
              disabled
              className='rounded-full border px-3 py-1.5 text-sm'
              style={{
                color: 'var(--noir-ion-text-disabled)',
                borderColor: 'var(--noir-ion-border-subtle)',
                opacity: 'var(--state-disabled-opacity)',
              }}
            >
              Disabled
            </button>
            <span
              className='rounded-full border px-3 py-1.5 text-sm'
              style={{
                color: 'var(--noir-ion-ion)',
                borderColor: 'var(--noir-ion-border-interactive)',
                background: 'var(--noir-ion-ion-soft)',
              }}
            >
              Interactive border
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
