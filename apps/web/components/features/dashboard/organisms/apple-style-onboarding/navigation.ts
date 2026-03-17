import { APP_ROUTES } from '@/constants/routes';

type DashboardRouter = {
  push: (href: string) => void;
};

export const navigateToDashboard = (router: DashboardRouter) => {
  router.push(APP_ROUTES.DASHBOARD);
};
