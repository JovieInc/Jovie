import type { Metadata } from 'next';
import { Container } from '@/components/site/Container';
import { Button } from '@/components/ui/Button';
import { APP_NAME } from '@/constants/app';

export const metadata: Metadata = {
  title: `Support - ${APP_NAME}`,
  description: "We're here to help.",
};

export default function SupportPage() {
  return (
    <Container className='py-24 text-center'>
      <h1 className='text-5xl font-bold tracking-tight text-gray-900 dark:text-white'>
        We’re here to help.
      </h1>
      <Button as='a' href='mailto:support@jov.ie' className='mt-8'>
        Contact Support
      </Button>
    </Container>
  );
}
