'use client';

export function FormatHints() {
  return (
    <div className='text-xs text-secondary-token space-y-1'>
      <p>Great handles are:</p>
      <ul className='list-disc list-inside space-y-0.5 ml-2'>
        <li>Short and memorable (3-15 characters)</li>
        <li>Easy to type and share</li>
        <li>Consistent with your brand</li>
      </ul>
    </div>
  );
}
