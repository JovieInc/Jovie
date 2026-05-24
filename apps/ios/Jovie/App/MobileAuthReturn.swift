import Foundation

struct MobileAuthReturn: Equatable {
  let code: String
  let state: String
  let codeVerifier: String
}

enum MobileAuthReturnParser {
  static func parse(_ url: URL, codeVerifier: String? = nil) -> MobileAuthReturn? {
    guard isSupportedCallback(url) else { return nil }

    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    let code = components?.queryItems?.first { $0.name == "code" }?.value?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let state = components?.queryItems?.first { $0.name == "state" }?.value?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let verifier = codeVerifier?
      .trimmingCharacters(in: .whitespacesAndNewlines)

    guard let code, !code.isEmpty,
          let state, !state.isEmpty,
          let verifier, !verifier.isEmpty
    else {
      return nil
    }

    return MobileAuthReturn(
      code: code,
      state: state,
      codeVerifier: verifier
    )
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
