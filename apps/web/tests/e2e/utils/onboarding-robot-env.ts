export interface OnboardingRobotEnv {
  readonly CLERK_SECRET_KEY?: string;
  readonly DATABASE_URL?: string;
  readonly E2E_PROD_SIGNUP_EMAIL_BASE?: string;
  readonly E2E_SYNTHETIC_MODE?: string;
}

export const onboardingRobotEnv: OnboardingRobotEnv = {
  get CLERK_SECRET_KEY() {
    return process.env.CLERK_SECRET_KEY || undefined;
  },
  get DATABASE_URL() {
    return process.env.DATABASE_URL || undefined;
  },
  get E2E_PROD_SIGNUP_EMAIL_BASE() {
    return process.env.E2E_PROD_SIGNUP_EMAIL_BASE || undefined;
  },
  get E2E_SYNTHETIC_MODE() {
    return process.env.E2E_SYNTHETIC_MODE || undefined;
  },
};
