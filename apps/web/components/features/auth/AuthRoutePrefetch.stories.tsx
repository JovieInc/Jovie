import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { AuthRoutePrefetch } from './AuthRoutePrefetch';

const meta = {
  title: 'Features/Auth/AuthRoutePrefetch',
  component: AuthRoutePrefetch,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Renders nothing — it only calls router.prefetch(href) on mount so the post-auth destination is warm before the user lands on it.',
      },
    },
  },
  args: {
    href: APP_ROUTES.HOME,
  },
} satisfies Meta<typeof AuthRoutePrefetch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
