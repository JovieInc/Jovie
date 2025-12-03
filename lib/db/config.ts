// Database configuration constants and types

// Performance and health check thresholds
export const PERFORMANCE_THRESHOLDS = {
  // Query performance thresholds (in milliseconds)
  simpleQueryMax: 1000, // 1 second
  transactionTimeMax: 2000, // 2 seconds

  // Warning thresholds (percentage of max)
  warningMultiplier: 0.5, // 50% of max = warning

  // Connection and retry settings
  maxRetries: 3,
  retryDelay: 1000, // 1 second base delay
  retryBackoffMultiplier: 2,
} as const;

// Table names for schema operations
export const TABLE_NAMES = {
  creatorProfiles: 'creator_profiles',
  stripeWebhookEvents: 'stripe_webhook_events',
  // Add other table names as they're added to the schema
} as const;

// Health check configuration
export const HEALTH_CHECK_CONFIG = {
  // Status codes for health endpoints
  statusCodes: {
    healthy: 200,
    unhealthy: 503,
  },

  // Cache control for health endpoints
  cacheHeaders: {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  },

  // Runtime configurations
  runtime: 'nodejs' as const,
  dynamic: 'force-dynamic' as const,
} as const;

// Rate limiting configuration for health endpoints
export const RATE_LIMIT_CONFIG = {
  // Requests per window
  requests: 60,
  // Window duration in seconds
  window: 60,
  // Health endpoint specific limits (more restrictive)
  healthRequests: 30,
  healthWindow: 60,
} as const;

// Database operation contexts for better error tracking
export const DB_CONTEXTS = {
  connection: 'connection',
  query: 'query',
  transaction: 'transaction',
  health: 'health',
  performance: 'performance',
  validation: 'validation',
} as const;
