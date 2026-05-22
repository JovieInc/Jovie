import Foundation

struct MobileAuthReturn: Equatable {
  let ticket: String
  let route: String
}

enum MobileAuthReturnParser {
  static func parse(_ url: URL) -> MobileAuthReturn? {
    guard isSupportedCallback(url) else { return nil }

    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    let ticket = components?.queryItems?.first { $0.name == "ticket" }?.value?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let route = components?.queryItems?.first { $0.name == "route" }?.value?
      .trimmingCharacters(in: .whitespacesAndNewlines)

    guard let ticket, !ticket.isEmpty else { return nil }

    return MobileAuthReturn(
      ticket: ticket,
      route: route.flatMap(Self.sanitizeReturnRoute) ?? "/app"
    )
  }

  private static func isSupportedCallback(_ url: URL) -> Bool {
    guard url.scheme?.lowercased() == "ie.jov.jovie" else { return false }

    if url.host == "auth-return" {
      return true
    }

    return url.path == "/auth-return"
  }

  private static func sanitizeReturnRoute(_ route: String) -> String? {
    guard route.starts(with: "/"), !route.starts(with: "//") else {
      return nil
    }

    guard !route.contains("\\") else {
      return nil
    }

    guard let components = URLComponents(string: route) else {
      return nil
    }

    let path = components.path
    guard path != "/",
          !path.hasPrefix("/signin"),
          !path.hasPrefix("/signup"),
          !path.hasPrefix("/sign-in"),
          !path.hasPrefix("/sign-up"),
          !path.hasPrefix("/sso-callback"),
          !path.hasPrefix("/auth-return"),
          !path.hasPrefix("/mobile-auth-return"),
          !path.hasPrefix("/api")
    else {
      return nil
    }

    return route
  }
}
