import 'server-only';

/**
 * Single control for native mobile chat. Chat is available to any authenticated
 * iOS user when the runtime is enabled for the environment
 * (`MOBILE_CHAT_RUNTIME_ENABLED=true`, set per-environment in Doppler).
 *
 * The iOS app is internal-TestFlight only today, so this scopes chat to alpha
 * testers. To disable chat in an environment, flip the env switch off. Before a
 * public App Store launch, re-introduce a per-user gate here (see JOV-3239) so
 * production users don't get chat by default.
 */
export function isMobileChatRuntimeEnabled(): boolean {
  return process.env.MOBILE_CHAT_RUNTIME_ENABLED === 'true';
}
