import { Switch } from '@jovie/ui';

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='mb-10'>
      <h2 className='mb-4 text-[11px] font-semibold uppercase tracking-wider text-tertiary-token'>
        {title}
      </h2>
      <div className='flex flex-wrap items-start gap-6'>{children}</div>
    </div>
  );
}

function Stack({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='flex flex-col gap-2'>
      <span className='text-[11px] text-tertiary-token'>{title}</span>
      {children}
    </div>
  );
}

export default function SwitchesPage() {
  return (
    <div>
      <h1 className='mb-1 text-lg font-semibold text-primary-token'>Switch</h1>
      <p className='mb-8 text-app text-tertiary-token'>
        Matches Linear.app toggle — compact 28×16px track, smooth thumb
        transition
      </p>

      {/* Default states */}
      <Section title='Default States'>
        <Stack title='unchecked'>
          <Switch aria-label='Toggle Unchecked' />
        </Stack>
        <Stack title='checked'>
          <Switch defaultChecked aria-label='Toggle Checked' />
        </Stack>
        <Stack title='disabled unchecked'>
          <Switch disabled aria-label='Toggle Disabled Unchecked' />
        </Stack>
        <Stack title='disabled checked'>
          <Switch
            disabled
            defaultChecked
            aria-label='Toggle Disabled Checked'
          />
        </Stack>
      </Section>

      {/* With labels */}
      <Section title='With Labels'>
        <Stack title='Enable notifications'>
          <div className='flex items-center gap-3'>
            <Switch id='notifications' aria-label='Enable Notifications' />
            <label
              htmlFor='notifications'
              className='text-app font-medium text-primary-token'
            >
              Enable notifications
            </label>
          </div>
        </Stack>
        <Stack title='Auto-assign issues'>
          <div className='flex items-center gap-3'>
            <Switch
              id='auto-assign'
              defaultChecked
              aria-label='Auto Assign Issues'
            />
            <label
              htmlFor='auto-assign'
              className='text-app font-medium text-primary-token'
            >
              Auto-assign issues
            </label>
          </div>
        </Stack>
        <Stack title='disabled with label'>
          <div className='flex items-center gap-3'>
            <Switch
              id='disabled-setting'
              disabled
              aria-label='Disabled Setting'
            />
            <label
              htmlFor='disabled-setting'
              className='text-app font-medium text-primary-token opacity-50'
            >
              Disabled setting
            </label>
          </div>
        </Stack>
      </Section>

      {/* In Context */}
      <Section title='In Context'>
        <Stack title='settings row'>
          <div className='flex w-64 flex-col divide-y rounded-lg border border-subtle'>
            {[
              { label: 'Slack Notifications', checked: true },
              { label: 'Email Digest', checked: false },
              { label: 'Desktop Alerts', checked: true },
            ].map(item => (
              <div
                key={item.label}
                className='flex items-center justify-between px-4 py-3'
              >
                <label
                  htmlFor={`setting-${item.label}`}
                  className='text-app font-book text-primary-token'
                >
                  {item.label}
                </label>
                <Switch
                  id={`setting-${item.label}`}
                  defaultChecked={item.checked}
                  aria-label={item.label}
                />
              </div>
            ))}
          </div>
        </Stack>
      </Section>
    </div>
  );
}
