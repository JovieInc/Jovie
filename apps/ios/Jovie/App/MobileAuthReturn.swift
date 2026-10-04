import Foundation

enum MobileAuthCopy {
  static let cancellation = "Sign-in was cancelled. Sign in again when you're ready."
  static let failure = "Couldn't finish sign-in. Try again."
}

extension Notification.Name {
  static let jovieAuthCallbackURL = Notification.Name("ie.jov.Jovie.auth.callbackURL")
}

enum MobileAuthDiagnostics {
  static let statusKey = "ie.jov.Jovie.mobileAuth.status"
  static let detailKey = "ie.jov.Jovie.mobileAuth.detail"
  static let timestampKey = "ie.jov.Jovie.mobileAuth.timestamp"

  static func record(_ status: String, detail: String? = nil) {
    let defaults = UserDefaults.standard
    defaults.set(status, forKey: statusKey)

    if let detail, !detail.isEmpty {
      defaults.set(detail, forKey: detailKey)
    } else {
      defaults.removeObject(forKey: detailKey)
    }

    defaults.set(Date().timeIntervalSince1970, forKey: timestampKey)
  }
}

struct MobileAuthReturn: Equatable, Sendable {
  let code: String
  let state: String
  let codeVerifier: String
  let nativeAttempt: String?

  init(code: String, state: String, codeVerifier: String, nativeAttempt: String? = nil) {
    self.code = code
    self.state = state
    self.codeVerifier = codeVerifier
    self.nativeAttempt = nativeAttempt
  }
}

struct MobileAuthProviderError: Equatable {
  let error: String
  let errorDescription: String?
  let state: String?

  var userMessage: String {
    error == "access_denied"
      ? MobileAuthCopy.cancellation
      : MobileAuthCopy.failure
  }
}

@MainActor
final class MobileAuthPendingStore {
  static let shared = MobileAuthPendingStore()

  struct Snapshot: Equatable, Sendable {
    fileprivate let generation: UUID
    fileprivate let verifier: String?
    fileprivate var record: Record? = nil
    var isCorrelated: Bool { record != nil }
  }

  fileprivate struct Record: Codable, Equatable, Sendable {
    var version = 1
    let nativeAttempt: String
    let verifier: String
    let origin: String
    var client = "ios"
    let createdAt: TimeInterval
    var claimID: UUID?
  }

  struct Claim: Sendable {
    let authReturn: MobileAuthReturn
    fileprivate let snapshot: Snapshot
  }

  private let defaults: UserDefaults
  private let codeVerifierKey = "ie.jov.Jovie.auth.pendingCodeVerifier"
  private var generation = UUID()

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func save(codeVerifier: String) {
    let trimmedVerifier = codeVerifier.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedVerifier.isEmpty else {
      clear()
      return
    }

    generation = UUID()
    defaults.set(trimmedVerifier, forKey: codeVerifierKey)
  }

  @discardableResult
  func save(codeVerifier: String, nativeAttempt: String, baseURL: URL) -> Bool {
    guard !codeVerifier.isEmpty, MobileAuthReturnParser.isValidNativeAttempt(nativeAttempt),
          let origin = Self.origin(baseURL) else { return false }
    return write(Record(nativeAttempt: nativeAttempt, verifier: codeVerifier,
      origin: origin, createdAt: Date().timeIntervalSince1970))
  }

  private func write(_ record: Record) -> Bool {
    guard let data = try? JSONEncoder().encode(record) else { return false }
    generation = UUID()
    defaults.set(data, forKey: codeVerifierKey)
    return true
  }

  private static func origin(_ url: URL) -> String? {
    guard MobileBrowserAuthURLBuilder.isSupportedBrowserAuthURL(url),
          var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          components.user == nil, components.password == nil else { return nil }
    components.scheme = components.scheme?.lowercased()
    components.host = components.host?.lowercased()
    if (components.scheme == "https" && components.port == 443)
      || (components.scheme == "http" && components.port == 80) { components.port = nil }
    components.path = ""
    components.query = nil
    components.fragment = nil
    return components.string
  }

  func matches(_ url: URL, snapshot: Snapshot, baseURL: URL) -> Bool {
    guard isCurrent(snapshot), let record = snapshot.record, record.claimID == nil,
          record.origin == Self.origin(baseURL),
          MobileAuthReturnParser.nativeAttempt(url) == record.nativeAttempt else { return false }
    return url.scheme?.lowercased() == "ie.jov.jovie" || Self.origin(url) == record.origin
  }

  func claim(_ url: URL, matching snapshot: Snapshot, baseURL: URL) -> Claim? {
    guard matches(url, snapshot: snapshot, baseURL: baseURL), var record = snapshot.record,
          let parsed = MobileAuthReturnParser.parse(url, codeVerifier: record.verifier) else { return nil }
    record.claimID = UUID()
    guard write(record) else { return nil }
    return Claim(authReturn: MobileAuthReturn(code: parsed.code, state: parsed.state,
      codeVerifier: parsed.codeVerifier, nativeAttempt: record.nativeAttempt), snapshot: self.snapshot())
  }

  func isCurrent(_ claim: Claim) -> Bool { isCurrent(claim.snapshot) }

  @discardableResult
  func rearm(_ claim: Claim) -> Bool {
    guard isCurrent(claim), var record = claim.snapshot.record, record.claimID != nil else { return false }
    record.claimID = nil
    return write(record)
  }

  func finish(_ claim: Claim) { clear(matching: claim.snapshot) }

  func snapshot() -> Snapshot {
    if let data = defaults.data(forKey: codeVerifierKey),
       let record = try? JSONDecoder().decode(Record.self, from: data),
       record.version == 1, record.client == "ios", record.createdAt.isFinite,
       !record.verifier.isEmpty, MobileAuthReturnParser.isValidNativeAttempt(record.nativeAttempt),
       let url = URL(string: record.origin), Self.origin(url) == record.origin {
      return Snapshot(generation: generation, verifier: record.verifier, record: record)
    }
    let value = defaults.string(forKey: codeVerifierKey)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return Snapshot(generation: generation, verifier: value?.isEmpty == false ? value : nil)
  }

  func isCurrent(_ snapshot: Snapshot) -> Bool { self.snapshot() == snapshot }

  func consumeCodeVerifier(matching snapshot: Snapshot) -> String? {
    guard isCurrent(snapshot), snapshot.verifier != nil else { return nil }
    return consumeCodeVerifier()
  }

  @discardableResult
  func clear(matching snapshot: Snapshot) -> Bool {
    guard isCurrent(snapshot) else { return false }
    clear()
    return true
  }

  func consumeCodeVerifier() -> String? {
    // Legacy parser helpers cannot consume the new correlated record.
    guard defaults.data(forKey: codeVerifierKey) == nil else { return nil }
    let verifier = defaults.string(forKey: codeVerifierKey)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    clear()

    guard let verifier, !verifier.isEmpty else {
      return nil
    }

    return verifier
  }

  func hasCodeVerifier() -> Bool {
    let pending = snapshot()
    return pending.verifier != nil && pending.record?.claimID == nil
  }

  func clear() {
    generation = UUID()
    defaults.removeObject(forKey: codeVerifierKey)
  }
}

func shouldHandleMobileAuthProviderError(
  route: AppRouter,
  hasPendingVerifier: Bool
) -> Bool {
  route == .signedOut && hasPendingVerifier
}

/// Duplicate Better Auth callbacks arrive via ASWebAuthenticationSession,
/// `onOpenURL`, and the inbox notification. After the verifier is consumed,
/// a later miss must not sign out a finalize that already started.
func shouldSignOutAfterMissingVerifier(
  callbackState: String?,
  handledStates: Set<String>,
  hasFinalizeInFlight: Bool,
  hasStoredSession: Bool
) -> Bool {
  if hasFinalizeInFlight || hasStoredSession {
    return false
  }

  if let callbackState, handledStates.contains(callbackState) {
    return false
  }

  return true
}

@MainActor
final class MobileAuthCallbackURLInbox {
  static let shared = MobileAuthCallbackURLInbox()

  private var pendingURLs: [URL] = []
  private var seenURLKeys: Set<String> = []

  func enqueue(_ url: URL) {
    let key = url.absoluteString
    guard !seenURLKeys.contains(key) else { return }

    seenURLKeys.insert(key)
    pendingURLs.append(url)
    NotificationCenter.default.post(name: .jovieAuthCallbackURL, object: url)
  }

  func allowRetry(nativeAttempt: String) {
    pendingURLs.removeAll { MobileAuthReturnParser.nativeAttempt($0) == nativeAttempt }
    seenURLKeys = seenURLKeys.filter { value in
      guard let url = URL(string: value) else { return true }
      return MobileAuthReturnParser.nativeAttempt(url) != nativeAttempt
    }
  }

  func drain() -> [URL] {
    let urls = pendingURLs
    pendingURLs.removeAll()
    return urls
  }
}

enum MobileAuthReturnParser {
  static func isValidNativeAttempt(_ value: String) -> Bool {
    value.utf8.count == 43 && value.utf8.allSatisfy {
      (65...90).contains($0) || (97...122).contains($0) || (48...57).contains($0) || $0 == 45 || $0 == 95
    }
  }

  static func nativeAttempt(_ url: URL) -> String? {
    guard isSupportedCallback(url) else { return nil }
    let values = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?
      .filter { $0.name == "native_attempt" } ?? []
    guard values.count == 1, let value = values.first?.value, isValidNativeAttempt(value) else { return nil }
    return value
  }

  static func parseProviderError(_ url: URL) -> MobileAuthProviderError? {
    guard isSupportedCallback(url) else { return nil }

    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    let error = components?.queryItems?.first { $0.name == "error" }?.value?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let errorDescription = components?.queryItems?.first {
      $0.name == "error_description"
    }?.value?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let state = components?.queryItems?.first { $0.name == "state" }?.value?
      .trimmingCharacters(in: .whitespacesAndNewlines)

    guard let error, !error.isEmpty else {
      return nil
    }

    return MobileAuthProviderError(
      error: error,
      errorDescription: errorDescription?.isEmpty == true ? nil : errorDescription,
      state: state?.isEmpty == true ? nil : state
    )
  }

  static func isCodeCallback(_ url: URL) -> Bool {
    parseCallbackComponents(url) != nil
  }

  static func callbackState(_ url: URL) -> String? {
    guard isSupportedCallback(url) else { return nil }

    let state = URLComponents(url: url, resolvingAgainstBaseURL: false)?
      .queryItems?
      .first { $0.name == "state" }?
      .value?
      .trimmingCharacters(in: .whitespacesAndNewlines)

    guard let state, !state.isEmpty else {
      return nil
    }

    return state
  }

  static func parse(_ url: URL, codeVerifier: String? = nil) -> MobileAuthReturn? {
    guard let components = parseCallbackComponents(url) else { return nil }
    let verifier = codeVerifier?
      .trimmingCharacters(in: .whitespacesAndNewlines)

    guard let verifier, !verifier.isEmpty else {
      return nil
    }

    return MobileAuthReturn(
      code: components.code,
      state: components.state,
      codeVerifier: verifier
    )
  }

  @MainActor
  static func parse(
    _ url: URL,
    pendingStore: MobileAuthPendingStore
  ) async -> MobileAuthReturn? {
    guard let components = parseCallbackComponents(url),
          let verifier = pendingStore.consumeCodeVerifier()
    else {
      return nil
    }

    return MobileAuthReturn(
      code: components.code,
      state: components.state,
      codeVerifier: verifier
    )
  }

  @MainActor
  static func parse(_ url: URL, pendingStore: MobileAuthPendingStore,
                    matching snapshot: MobileAuthPendingStore.Snapshot) -> MobileAuthReturn? {
    guard let components = parseCallbackComponents(url),
          let verifier = pendingStore.consumeCodeVerifier(matching: snapshot) else { return nil }
    return MobileAuthReturn(code: components.code, state: components.state, codeVerifier: verifier)
  }

  private static func parseCallbackComponents(_ url: URL) -> (code: String, state: String)? {
    guard isSupportedCallback(url) else { return nil }

    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    let code = components?.queryItems?.first { $0.name == "code" }?.value?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let state = components?.queryItems?.first { $0.name == "state" }?.value?
      .trimmingCharacters(in: .whitespacesAndNewlines)

    guard let code, !code.isEmpty,
          let state, !state.isEmpty
    else {
      return nil
    }

    return (code, state)
  }

  private static func isSupportedCallback(_ url: URL) -> Bool {
    if url.scheme?.lowercased() == "ie.jov.jovie" {
      if url.host == "auth", url.path == "/complete" {
        return true
      }

      if url.host == "auth-return" {
        return true
      }

      return url.path == "/auth-return"
    }

    return isAllowlistedHttpsHandback(url)
  }

  private static func isAllowlistedHttpsHandback(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased(),
          let host = url.host?.lowercased(),
          !host.isEmpty
    else {
      return false
    }

    let path = url.path
    guard path == "/auth/ios/complete" || path == "/auth/native-return" else {
      return false
    }

    let isLoopback = host == "localhost"
      || host == "127.0.0.1"
      || host == "[::1]"
      || host.hasSuffix(".localhost")

    if scheme == "https" {
      return host == "jov.ie" || host == "staging.jov.ie" || isLoopback
    }

    if scheme == "http" {
      return isLoopback
    }

    return false
  }
}
