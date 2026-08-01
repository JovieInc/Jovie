import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Account',
  description: 'Manage account security, theme, and notifications',
};

export default function SettingsAccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
