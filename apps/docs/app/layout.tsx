import 'nextra-theme-docs/style.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Jovie Docs',
  description: 'Product and developer documentation for Jovie.',
};

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  );
};

export default RootLayout;
