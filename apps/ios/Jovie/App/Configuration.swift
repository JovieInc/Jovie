import Foundation

struct AppConfiguration: Sendable {
  let clerkPublishableKey: String
  let apiBaseURL: URL
  let webBaseURL: URL
  let sentryDSN: String?
  let observabilityEnvironment: String

  static let mock = AppConfiguration(
    clerkPublishableKey: "pk_test_mock",
    apiBaseURL: URL(string: "http://localhost:3100")!,
    webBaseURL: URL(string: "https://jov.ie")!,
    sentryDSN: nil,
    observabilityEnvironment: "test"
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

    return AppConfiguration(
      clerkPublishableKey: publishableKey,
      apiBaseURL: apiBaseURL,
      webBaseURL: webBaseURL,
      sentryDSN: sentryDSN,
      observabilityEnvironment: observabilityEnvironment
    )
  }
}
