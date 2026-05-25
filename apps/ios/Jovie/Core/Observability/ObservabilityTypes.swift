import Foundation

typealias ObservabilityContext = [String: Any]

enum ObservabilityLevel: Equatable {
  case debug
  case info
  case warning
  case error
  case fatal
}

enum ObservabilityEvent: String, CaseIterable, Equatable {
  case authStart = "auth_start"
  case authSheetOpened = "auth_sheet_opened"
  case authProviderSelected = "auth_provider_selected"
  case authCallbackReceived = "auth_callback_received"
  case authCallbackURLParsed = "auth_callback_url_parsed"
  case authSessionClosed = "auth_session_closed"
  case clerkSessionExchangeStarted = "clerk_session_exchange_started"
  case clerkSessionExchangeSucceeded = "clerk_session_exchange_succeeded"
  case clerkSessionExchangeFailed = "clerk_session_exchange_failed"
  case nativeSessionPersisted = "native_session_persisted"
  case appRouteAfterLogin = "app_route_after_login"
  case deepLinkReceived = "deep_link_received"
  case deepLinkParseFailed = "deep_link_parse_failed"
  case deepLinkRouteMatched = "deep_link_route_matched"
  case deepLinkRouteUnmatched = "deep_link_route_unmatched"
  case chatFirstTokenTimeout = "chat_first_token_timeout"
  case profileImportFailed = "profile_import_failed"
}

struct ObservabilityConfiguration: Equatable {
  let dsn: String?
  let environment: String
  let release: String
  let buildNumber: String
  let platform: String
  let isEnabled: Bool

  init(
    dsn: String?,
    environment: String,
    release: String,
    buildNumber: String,
    platform: String = "ios",
    isEnabled: Bool = true
  ) {
    self.dsn = dsn?.trimmingCharacters(in: .whitespacesAndNewlines)
    self.environment = environment.trimmingCharacters(in: .whitespacesAndNewlines)
    self.release = release.trimmingCharacters(in: .whitespacesAndNewlines)
    self.buildNumber = buildNumber.trimmingCharacters(in: .whitespacesAndNewlines)
    self.platform = platform.trimmingCharacters(in: .whitespacesAndNewlines)
    self.isEnabled = isEnabled
  }
}

protocol ObservabilitySpan {
  func finish()
}

protocol ObservabilityProvider: AnyObject {
  func configure(_ configuration: ObservabilityConfiguration)
  func captureError(_ error: Error, event: ObservabilityEvent, context: ObservabilityContext)
  func captureMessage(_ event: ObservabilityEvent, level: ObservabilityLevel, context: ObservabilityContext)
  func addBreadcrumb(_ event: ObservabilityEvent, level: ObservabilityLevel, context: ObservabilityContext)
  func setUser(id: String)
  func clearUser()
  func setTag(key: String, value: String)
  func startSpan(name: ObservabilityEvent, context: ObservabilityContext) -> ObservabilitySpan
}
