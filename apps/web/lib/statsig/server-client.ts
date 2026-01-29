'use server';

import 'server-only';

import StatsigServer, { type StatsigUser } from 'statsig-node';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

let statsigInstance: StatsigServer | null = null;
let initPromise: Promise<StatsigServer | null> | null = null;

const tier = env.isProduction
  ? 'production'
  : env.isDevelopment
    ? 'development'
    : 'staging';

export async function getStatsigServer(): Promise<StatsigServer | null> {
  if (!env.STATSIG_SERVER_API_KEY) {
    return null;
  }

  if (statsigInstance) {
    return statsigInstance;
  }

  if (!initPromise) {
    initPromise = StatsigServer.initialize(env.STATSIG_SERVER_API_KEY, {
      environment: {
        tier,
      },
    })
      .then(server => {
        statsigInstance = server;
        return server;
      })
      .catch(error => {
        logger.error('Failed to initialize Statsig server SDK', { error });
        initPromise = null;
        return null;
      });
  }

  return initPromise;
}

export async function withStatsigServer<T>(
  callback: (client: StatsigServer) => Promise<T>
): Promise<T | null> {
  const client = await getStatsigServer();
  if (!client) {
    return null;
  }
  return callback(client);
}

export type { StatsigUser };
