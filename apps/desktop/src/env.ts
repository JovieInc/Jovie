type AppEnv = 'production' | 'staging';

function getAppEnv(): AppEnv {
  const raw = process.env.ELECTRON_ENV;
  return raw === 'staging' ? 'staging' : 'production';
}

export const APP_ENV = getAppEnv();
export const APP_URL =
  APP_ENV === 'staging' ? 'https://staging.app.jov.ie' : 'https://jov.ie';
