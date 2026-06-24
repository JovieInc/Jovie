import { Input, InputGroup } from '@jovie/ui';

// InputGroup positions an icon when the icon is a DIRECT child carrying
// data-slot="icon" — so the svg must be inlined, not wrapped in a component.
export function LeadingIcon() {
  return (
    <div style={{ maxWidth: 320 }}>
      <InputGroup>
        <svg
          data-slot='icon'
          width='16'
          height='16'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
          aria-hidden='true'
        >
          <circle cx='11' cy='11' r='8' />
          <path d='m21 21-4.3-4.3' />
        </svg>
        <Input placeholder='Search artists…' />
      </InputGroup>
    </div>
  );
}
