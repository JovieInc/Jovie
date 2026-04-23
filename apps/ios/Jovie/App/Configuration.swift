import Foundation

struct AppConfiguration: Sendable {
  let clerkPublishableKey: String
  let apiBaseURL: URL
  let webBaseURL: URL

  static let mock = AppConfiguration(
    clerkPublishableKey: "pk_test_mock",
    apiBaseURL: URL(string: "http://localhost:3100")!,
    webBaseURL: URL(string: "https://jov.ie")!
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
      if let value = values?[key] as? String, !value.isEmpty {
        return value
      }

      if let value = ProcessInfo.processInfo.environment[envKey], !value.isEmpty {
        return value
      }

      if let fallback {
        return fallback
      }

      preconditionFailure("Missing configuration for \(key)")
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

    return AppConfiguration(
      clerkPublishableKey: publishableKey,
      apiBaseURL: apiBaseURL,
      webBaseURL: webBaseURL
    )
  }
}
