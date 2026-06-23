import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { template: '%s | Jovie Console', default: 'Jovie Console' },
  description: 'Internal ops console — not for public use.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#06070a',
};

const navItems = [{ href: '/taste-inbox/index.html', label: 'Taste Inbox' }];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body>
        <div
          style={{
            display: 'flex',
            minHeight: '100vh',
            flexDirection: 'column',
          }}
        >
          <header
            style={{
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              padding: '0 20px',
              height: 44,
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontWeight: 600,
                fontSize: 13,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              Jovie Console
            </span>
            <nav style={{ display: 'flex', gap: 4 }}>
              {navItems.map(item => (
                <a
                  key={item.href}
                  href={item.href}
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </header>
          <main style={{ flex: 1, padding: '24px 20px' }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
