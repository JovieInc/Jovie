import { SegmentControl } from '@jovie/ui';
import { useState } from 'react';

export function Default() {
  const [value, setValue] = useState('links');
  return (
    <div style={{ maxWidth: 320 }}>
      <SegmentControl
        aria-label='View'
        value={value}
        onValueChange={setValue}
        options={[
          { value: 'links', label: 'Links' },
          { value: 'music', label: 'Music' },
          { value: 'shows', label: 'Shows' },
        ]}
      />
    </div>
  );
}

export function TwoUp() {
  const [value, setValue] = useState('month');
  return (
    <div style={{ maxWidth: 240 }}>
      <SegmentControl
        aria-label='Range'
        value={value}
        onValueChange={setValue}
        options={[
          { value: 'month', label: 'Monthly' },
          { value: 'year', label: 'Yearly' },
        ]}
      />
    </div>
  );
}
