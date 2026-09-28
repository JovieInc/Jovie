// Deliberate-red fixture (JOV-6039 / JOV-INV-038): a persona label must not
// route to a developer/tooling destination — "Founders" cannot land on the
// CLI page.
import { APP_ROUTES } from '@/constants/routes';

export const MARKETING_FOR_FLYOUT_LINKS = [
  {
    href: APP_ROUTES.CLI,
    label: 'Founders',
    description: 'Show what you are building and give people a next step.',
  },
] as const;
