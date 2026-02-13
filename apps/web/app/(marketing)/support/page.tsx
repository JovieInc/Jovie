import type { Metadata } from 'next';
import { Container } from '@/components/site/Container';
import { APP_NAME } from '@/constants/app';
import { SupportContent } from './SupportContent';

export const metadata: Metadata = {
  title: `Support - ${APP_NAME}`,
  description:
    'Get help with your Jovie profile. Contact our support team for assistance with setup, troubleshooting, and account management.',
};

export default function SupportPage() {
  return (
    <Container className='py-24 text-center'>
      <h1
        className='text-5xl font-bold tracking-tight'
        style={{ color: 'var(--linear-text-primary)' }}
      >
        We&apos;re here to help.
      </h1>
      <SupportContent />
    </Container>
  );
}
