import Foundation

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
    defaults.synchronize()
  }
}

struct MobileAuthReturn: Equatable {
  let code: String
  let state: String
  let codeVerifier: String
}

struct MobileAuthProviderError: Equatable {
  let error: String
  let errorDescription: String?
  let state: String?

  var userMessage: String {
    "Couldn't finish sign-in. Try again."
  }
}

@MainActor
final class MobileAuthPendingStore {
  static let shared = MobileAuthPendingStore()

  private let defaults: UserDefaults
  private let codeVerifierKey = "ie.jov.Jovie.auth.pendingCodeVerifier"

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func save(codeVerifier: String) {
    let trimmedVerifier = codeVerifier.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedVerifier.isEmpty else {
      clear()
      return
    }

    defaults.set(trimmedVerifier, forKey: codeVerifierKey)
  }

  func consumeCodeVerifier() -> String? {
    let verifier = defaults.string(forKey: codeVerifierKey)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    clear()

    guard let verifier, !verifier.isEmpty else {
      return nil
    }

    return verifier
  }

  func clear() {
    defaults.removeObject(forKey: codeVerifierKey)
  }
}

@MainActor
final class MobileAuthCallbackURLInbox {
  static let shared = MobileAuthCallbackURLInbox()

  private var pendingURLs: [URL] = []

  func enqueue(_ url: URL) {
    pendingURLs.append(url)
    NotificationCenter.default.post(name: .jovieAuthCallbackURL, object: url)
  }

  func drain() -> [URL] {
    let urls = pendingURLs
    pendingURLs.removeAll()
    return urls
  }
}

enum MobileAuthReturnParser {
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
    guard url.scheme?.lowercased() == "ie.jov.jovie" else { return false }

    if url.host == "auth", url.path == "/complete" {
      return true
    }

    if url.host == "auth-return" {
      return true
    }

    return url.path == "/auth-return"
  }
}
