import { Field, Input } from '@jovie/ui';

const wrap: React.CSSProperties = { maxWidth: 320 };

export function Default() {
  return (
    <div style={wrap}>
      <Field label='Email'>
        <Input placeholder='you@example.com' />
      </Field>
    </div>
  );
}

export function WithDescription() {
  return (
    <div style={wrap}>
      <Field label='Display name' description='Shown on your public profile.'>
        <Input defaultValue='Calvin Harris' />
      </Field>
    </div>
  );
}

export function WithError() {
  return (
    <div style={wrap}>
      <Field label='Email' error='Enter a valid email address.' required>
        <Input defaultValue='not-an-email' />
      </Field>
    </div>
  );
}
