import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useState } from 'react';
import { CookieBannerSection } from './CookieBannerSection';

function RequiredConsentFixture() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.cookie = 'jv_cc_required=1; path=/';
    localStorage.removeItem('jv_cc');
    setReady(true);

    return () => {
      document.cookie = 'jv_cc_required=; Max-Age=0; path=/';
      document.documentElement.style.removeProperty('--cookie-banner-h');
    };
  }, []);

  return ready ? <CookieBannerSection /> : null;
}

const meta: Meta<typeof CookieBannerSection> = {
  title: 'Organisms/CookieBannerSection',
  component: CookieBannerSection,
  parameters: {
    layout: 'fullscreen',
    chromatic: {
      viewports: [320, 390],
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/tim',
        query: {},
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const AboveProfileNavigation: Story = {
  render: () => <RequiredConsentFixture />,
};
