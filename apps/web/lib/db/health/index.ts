import type { DbType } from '../index';
import { checkDatabaseConnection } from './checkConnection';
import { checkPoolHealth, type PoolState } from './checkPoolHealth';
import { checkQueryPerformance } from './checkQueryPerformance';
import { checkReplicationLag } from './checkReplicationLag';

type LogDbInfo = (
  context: string,
  message: string,
  metadata?: Record<string, unknown>
) => void;

type LogDbError = (
  context: string,
  error: unknown,
  metadata?: Record<string, unknown>
) => void;

export type DbHealthDetails = {
  connection: boolean;
  query: boolean;
  transaction: boolean;
  schemaAccess: boolean;
};

export type DbHealthResult = {
  healthy: boolean;
  latency?: number;
  error?: string;
  details?: DbHealthDetails;
};

type HealthCheckDependencies = {
  getDb: () => DbType;
  getPoolState: () => PoolState | null;
  logDbInfo: LogDbInfo;
  logDbError: LogDbError;
  tableNames: { creatorProfiles: string };
  withRetry: <T>(operation: () => Promise<T>, context: string) => Promise<T>;
};

export function buildDbHealthChecker(deps: HealthCheckDependencies) {
  return async function checkDbHealth(): Promise<DbHealthResult> {
    const startTime = Date.now();
    const details: DbHealthDetails = {
      connection: false,
      query: false,
      transaction: false,
      schemaAccess: false,
    };

    try {
      await deps.withRetry(async () => {
        const database = deps.getDb();
        details.connection = await checkDatabaseConnection(database);
        details.query = await checkQueryPerformance(database);
        details.transaction = await checkPoolHealth(
          database,
          deps.getPoolState(),
          deps.logDbInfo
        );
        details.schemaAccess = (
          await checkReplicationLag(
            database,
            deps.tableNames.creatorProfiles,
            deps.logDbInfo
          )
        ).schemaAccess;
      }, 'healthCheck');

      const latency = Date.now() - startTime;
      deps.logDbInfo('healthCheck', 'Database health check passed', {
        latency,
        details,
      });

      return { healthy: true, latency, details };
    } catch (error) {
      const latency = Date.now() - startTime;
      deps.logDbError('healthCheck', error, { latency, details });

      return {
        healthy: false,
        latency,
        error: error instanceof Error ? error.message : 'Unknown error',
        details,
      };
    }
  };
}
