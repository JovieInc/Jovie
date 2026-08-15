import Foundation

struct AppConfiguration: Sendable {
  let apiBaseURL: URL
  let webBaseURL: URL
  let sentryDSN: String?
  let observabilityIngestURL: URL?
  let observabilityIngestSecret: String?
  let observabilityEnvironment: String

  static let mock = AppConfiguration(
    apiBaseURL: URL(string: "http://localhost:3100")!,
    webBaseURL: URL(string: "https://jov.ie")!,
    sentryDSN: nil,
    observabilityIngestURL: nil,
    observabilityIngestSecret: nil,
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
    let observabilityIngestURL = optionalStringValue(
      key: "ObservabilityIngestUrl",
      envKeys: [
        "JOVIE_IOS_OBSERVABILITY_INGEST_URL",
        "OBSERVABILITY_INGEST_URL",
      ]
    ).flatMap(URL.init(string:))
    let observabilityIngestSecret = optionalStringValue(
      key: "ObservabilityIngestSecret",
      envKeys: [
        "JOVIE_IOS_OBSERVABILITY_INGEST_SECRET",
        "OBSERVABILITY_INGEST_SECRET",
      ]
    )

    return AppConfiguration(
      apiBaseURL: apiBaseURL,
      webBaseURL: webBaseURL,
      sentryDSN: sentryDSN,
      observabilityIngestURL: observabilityIngestURL,
      observabilityIngestSecret: observabilityIngestSecret,
      observabilityEnvironment: observabilityEnvironment
    )
  }

  static func loadForLiveLaunch() throws -> AppConfiguration {
    return load()
  }
}
