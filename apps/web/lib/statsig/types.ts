/**
 * @module statsig/types
 *
 * Statsig Bootstrap Data Types
 *
 * TypeScript type definitions for the Statsig client initialization response.
 * This data is returned by Statsig's `/v1/initialize` API and used to bootstrap
 * the client SDK without requiring a network round-trip.
 *
 * ## Bootstrap Pattern Usage
 *
 * These types define the structure of pre-evaluated Statsig data that enables
 * instant feature flag access on the client:
 *
 * 1. **Server-side**: `fetchStatsigBootstrapData()` fetches this data from Statsig's API
 * 2. **Client-side**: `MyStatsig` component uses this to initialize the SDK synchronously
 *
 * ## Data Structure
 *
 * The bootstrap data contains pre-evaluated results for:
 * - **Feature Gates**: Boolean flags (on/off) with matching rule information
 * - **Dynamic Configs**: Key-value configuration objects
 * - **Layer Configs**: Experiment layer configurations
 *
 * All gate/config names in the response are hashed (using djb2 algorithm) for
 * compression and privacy. The SDK handles name translation automatically.
 *
 * ## Fallback Behavior
 *
 * When bootstrap data is unavailable (null), the client SDK falls back to
 * standard async initialization, fetching data directly from Statsig servers.
 *
 * @see https://docs.statsig.com/client/javascript-sdk/next-js/client/concepts/initialize
 * @see fetchStatsigBootstrapData - Server-side function that fetches this data
 * @see MyStatsig - Client component that consumes this data
 */

/**
 * Secondary exposure recorded during gate/config evaluation
 */
export interface StatsigSecondaryExposure {
  gate: string;
  gateValue: string;
  ruleID: string;
}

/**
 * Feature gate evaluation result
 */
export interface StatsigFeatureGateValue {
  /** The name of the feature gate */
  name: string;
  /** Whether the gate is passing for this user */
  value: boolean;
  /** The rule ID that matched, or null if no rule matched */
  rule_id: string | null;
  /** Any secondary exposures recorded during evaluation */
  secondary_exposures?: StatsigSecondaryExposure[];
}

/**
 * Dynamic config or experiment evaluation result
 */
export interface StatsigDynamicConfigValue {
  /** The name of the config */
  name: string;
  /** The rule ID that matched, or null if no rule matched */
  rule_id: string | null;
  /** The config values as a key-value map */
  value: Record<string, unknown>;
  /** The group name if part of an experiment */
  group?: string;
  /** Any secondary exposures recorded during evaluation */
  secondary_exposures?: StatsigSecondaryExposure[];
  /** Undelegated secondary exposures */
  undelegated_secondary_exposures?: StatsigSecondaryExposure[];
  /** Whether this is a device-based experiment */
  is_device_based?: boolean;
  /** Whether the user is in this experiment */
  is_user_in_experiment?: boolean;
  /** Whether this experiment is active */
  is_experiment_active?: boolean;
  /** Parameters explicitly set on this config */
  explicit_parameters?: string[];
  /** Whether this config is in a layer */
  is_in_layer?: boolean;
  /** The allocated experiment name if in a layer */
  allocated_experiment_name?: string;
}

/**
 * Layer config evaluation result
 */
export interface StatsigLayerConfigValue {
  /** The name of the layer */
  name: string;
  /** The rule ID that matched, or null if no rule matched */
  rule_id: string | null;
  /** The layer values as a key-value map */
  value: Record<string, unknown>;
  /** The group name if part of an experiment */
  group?: string;
  /** Any secondary exposures recorded during evaluation */
  secondary_exposures?: StatsigSecondaryExposure[];
  /** Undelegated secondary exposures */
  undelegated_secondary_exposures?: StatsigSecondaryExposure[];
  /** Whether this is a device-based experiment */
  is_device_based?: boolean;
  /** Whether the user is in this experiment */
  is_user_in_experiment?: boolean;
  /** Whether this experiment is active */
  is_experiment_active?: boolean;
  /** Parameters explicitly set on this layer */
  explicit_parameters?: string[];
  /** Whether this config is in a layer */
  is_in_layer?: boolean;
  /** The allocated experiment name if in a layer */
  allocated_experiment_name?: string;
}

/**
 * User identifiers that were evaluated
 */
export interface StatsigEvaluatedKeys {
  /** The user ID that was evaluated */
  userID?: string;
  /** The stable ID that was evaluated */
  stableID?: string;
  /** Custom IDs that were evaluated */
  customIDs?: Record<string, string>;
}

/**
 * Complete Statsig bootstrap data structure.
 *
 * This is the response from Statsig's /v1/get_client_initialize_response API,
 * used to bootstrap the client SDK with pre-evaluated feature gates and configs.
 *
 * @example
 * ```typescript
 * // Server-side: fetch bootstrap data
 * const bootstrapData = await fetchStatsigBootstrapData(userId);
 *
 * // Client-side: pass to Statsig provider
 * <MyStatsig bootstrapData={bootstrapData}>
 *   {children}
 * </MyStatsig>
 * ```
 */
export interface StatsigBootstrapData {
  /** Feature gate evaluations keyed by hashed gate name */
  feature_gates: Record<string, StatsigFeatureGateValue>;

  /** Dynamic config evaluations keyed by hashed config name */
  dynamic_configs: Record<string, StatsigDynamicConfigValue>;

  /** Layer config evaluations keyed by hashed layer name */
  layer_configs: Record<string, StatsigLayerConfigValue>;

  /** Whether the response contains updates from the sinceTime */
  has_updates: boolean;

  /** Name of the service that generated the response */
  generator: string;

  /** Timestamp of response (Unix milliseconds) */
  time: number;

  /** Timestamp of company's last config update time (Unix milliseconds) */
  company_lcut: number;

  /** The user keys that were evaluated */
  evaluated_keys: StatsigEvaluatedKeys;

  /** The hashing algorithm used for gate/config names (e.g., 'djb2', 'sha256') */
  hash_used: string;

  /** SDKs store additional params that we should pass through */
  sdkParams?: Record<string, unknown>;

  /** SDK info from the generating server */
  sdkInfo?: Record<string, unknown>;

  /** User object that was evaluated (may be included for debugging) */
  user?: Record<string, unknown>;
}
