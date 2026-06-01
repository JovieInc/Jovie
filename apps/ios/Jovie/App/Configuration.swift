import Foundation

struct AppConfiguration: Sendable {
  let clerkPublishableKey: String
  let apiBaseURL: URL
  let webBaseURL: URL
  let sentryDSN: String?
  let observabilityEnvironment: String
  // Clerk redirect config for iOS native SDK (gh-9806 / JOV-2652).
  // Must match allowed redirect URLs registered in Clerk dashboard for the
  // publishable key's native/iOS application (explicit per-env via plist/env).
  let clerkRedirectUrl: String
  let clerkCallbackUrlScheme: String

  static let mock = AppConfiguration(
    clerkPublishableKey: "pk_test_mock",
    apiBaseURL: URL(string: "http://localhost:3100")!,
    webBaseURL: URL(string: "https://jov.ie")!,
    sentryDSN: nil,
    observabilityEnvironment: "test",
    clerkRedirectUrl: "ie.jov.jovie://callback",
    clerkCallbackUrlScheme: "ie.jov.jovie"
  )

  static func load(bundle: Bundle = .main) -> AppConfiguration {
    let plistURL = bundle.url(
      forResource: "Configuration.local",
      withExtension: "plist"
    )
    let values = plistURL.flatMap { NSDictionary(contentsOf: $0) as? [String: Any] }

    func stringValue(
      key: String,
      envKey: String,
      fallback: String? = nil
    ) -> String {
      if let value = optionalStringValue(key: key, envKeys: [envKey]) {
        return value
      }

      if let fallback {
        return fallback
      }

      preconditionFailure("Missing configuration for \(key)")
    }

    func optionalStringValue(
      key: String,
      envKeys: [String]
    ) -> String? {
      for envKey in envKeys {
        if let value = ProcessInfo.processInfo.environment[envKey] {
          let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
          if !trimmedValue.isEmpty {
            return trimmedValue
          }
        }
      }

      if let value = values?[key] as? String {
        let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedValue.isEmpty {
          return trimmedValue
        }
      }

      return nil
    }

    let publishableKey = stringValue(
      key: "ClerkPublishableKey",
      envKey: "CLERK_PUBLISHABLE_KEY"
    )
    let apiBaseURL = URL(
      string: stringValue(
        key: "ApiBaseUrl",
        envKey: "API_BASE_URL",
        fallback: "http://localhost:3100"
      )
    )!
    let webBaseURL = URL(
      string: stringValue(
        key: "WebBaseUrl",
        envKey: "WEB_BASE_URL",
        fallback: "https://jov.ie"
      )
    )!
    let sentryDSN = optionalStringValue(
      key: "SentryDsn",
      envKeys: [
        "JOVIE_IOS_SENTRY_DSN",
        "NEXT_PUBLIC_SENTRY_DSN_DEV",
        "NEXT_PUBLIC_SENTRY_DSN",
        "SENTRY_DSN_DEV",
        "SENTRY_DSN",
      ]
    )
    let observabilityEnvironment = optionalStringValue(
      key: "ObservabilityEnvironment",
      envKeys: [
        "JOVIE_IOS_OBSERVABILITY_ENVIRONMENT",
        "OBSERVABILITY_ENVIRONMENT",
        "SENTRY_ENVIRONMENT",
      ]
    ) ?? "development"

    // Clerk iOS redirect config (HOT ZONE gh-9806/JOV-2652): explicit, env-driven
    // so each Clerk instance (dev/staging/prod) can have its matching allowed
    // redirect URLs registered in the Clerk dashboard. Falls back to current
    // values for backward compat. 6 principles: explicit > clever, pragmatic.
    let clerkRedirectUrl = optionalStringValue(
      key: "ClerkRedirectUrl",
      envKeys: ["CLERK_REDIRECT_URL", "JOVIE_IOS_CLERK_REDIRECT_URL"]
    ) ?? "ie.jov.jovie://callback"

    let clerkCallbackUrlScheme = optionalStringValue(
      key: "ClerkCallbackUrlScheme",
      envKeys: ["CLERK_CALLBACK_URL_SCHEME", "JOVIE_IOS_CLERK_CALLBACK_URL_SCHEME"]
    ) ?? "ie.jov.jovie"

    return AppConfiguration(
      clerkPublishableKey: publishableKey,
      apiBaseURL: apiBaseURL,
      webBaseURL: webBaseURL,
      sentryDSN: sentryDSN,
      observabilityEnvironment: observabilityEnvironment,
      clerkRedirectUrl: clerkRedirectUrl,
      clerkCallbackUrlScheme: clerkCallbackUrlScheme
    )
  }

  static func loadForLiveLaunch() throws -> AppConfiguration {
    let configuration = load()
    try ClerkPublishableKeyValidator.validateForDistribution(configuration.clerkPublishableKey)
    return configuration
  }
}
