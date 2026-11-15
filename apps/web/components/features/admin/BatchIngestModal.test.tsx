import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react'

  it('renders error status copy with the AA error-text token', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'components/features/admin/BatchIngestModal.tsx'),
      'utf8'
    );

    expect(source).toContain("className: 'text-error-text'");
    expect(source).not.toContain("className: 'text-error'");
  });
});
