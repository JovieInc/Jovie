import Foundation

enum ObservabilityRedactor {
  static let filteredValue = "[Filtered]"

  private static let sensitiveKeyFragments = [
    "authorization",
    "auth_code",
    "authcode",
    "callback",
    "code_verifier",
    "codeverifier",
    "cookie",
    "email",
    "id_token",
    "idtoken",
    "phone",
    "refresh_token",
    "refreshtoken",
    "state",
    "token",
    "user_id",
    "userid",
  ]

  private static let urlKeyFragments = [
    "url",
    "uri",
    "link",
  ]

  private static let emailPattern =
    #"(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}"#
  private static let phonePattern =
    #"(?:\+?\d[\d\s().-]{7,}\d)"#
  private static let authHeaderPattern =
    #"(?i)\b(?:bearer|basic)\s+[A-Za-z0-9._~+/\-=]+"#
  private static let jwtPattern =
    #"[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"#
  private static let querySecretPattern =
    #"(?i)(?:code|state|token|access_token|refresh_token|id_token|cookie|authorization)=[^&\s]+"#
  private static let longTokenPattern =
    #"(?i)\b(?=[A-Z0-9_-]{40,}\b)(?=[A-Z0-9_-]*[A-Z])(?=[A-Z0-9_-]*\d)[A-Z0-9_-]+\b"#
  private static let uuidPathSegmentPattern =
    #"(?i)^[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$"#
  private static let numericPathSegmentPattern =
    #"^\d{4,}$"#

  static func sanitizedContext(
    _ context: ObservabilityContext
  ) -> ObservabilityContext {
    context.reduce(into: ObservabilityContext()) { result, entry in
      result[entry.key] = sanitizedValue(entry.value, key: entry.key)
    }
  }

  static func sanitizedValue(_ value: Any, key: String? = nil) -> Any {
    if let key, isSensitiveKey(key) {
      if isURLLikeValue(value) {
        return sanitizedURLValue(value) ?? filteredValue
      }
      return filteredValue
    }

    if let key, isURLKey(key), let sanitizedURL = sanitizedURLValue(value) {
      return sanitizedURL
    }

    switch value {
    case let url as URL:
      return sanitizedURL(url)
    case let string as String:
      if let url = URL(string: string),
         url.scheme != nil,
         let sanitizedURL = sanitizedURLValue(url)
      {
        return sanitizedURL
      }

      return containsSensitiveString(string) ? filteredValue : string
    case let dictionary as [String: Any]:
      return sanitizedContext(dictionary)
    case let dictionary as [String: String]:
      return sanitizedContext(dictionary)
    case let array as [Any]:
      return array.map { sanitizedValue($0) }
    case let value as Int:
      return value
    case let value as Double:
      return value
    case let value as Float:
      return value
    case let value as Bool:
      return value
    default:
      let description = String(describing: value)
      return containsSensitiveString(description) ? filteredValue : description
    }
  }

  static func sanitizedURL(_ url: URL) -> ObservabilityContext {
    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    return [
      "scheme": components?.scheme ?? url.scheme ?? "",
      "host": components?.host ?? url.host ?? "",
      "path": sanitizedPath(components?.path ?? url.path),
      "queryKeys": (components?.queryItems ?? []).map(\.name).sorted(),
    ]
  }

  static func sanitizedURLString(_ value: String) -> String {
    guard let url = URL(string: value) else {
      return containsSensitiveString(value) ? filteredValue : value
    }

    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    var output = ""

    if let scheme = components?.scheme, !scheme.isEmpty {
      output += "\(scheme)://"
    }
    if let host = components?.host, !host.isEmpty {
      output += host
    }
    let path = sanitizedPath(components?.path ?? url.path)
    output += path == filteredValue ? "/\(filteredValue)" : path

    let queryKeys = (components?.queryItems ?? []).map(\.name).sorted()
    if !queryKeys.isEmpty {
      output += "?query_keys=\(queryKeys.joined(separator: ","))"
    }

    return output
  }

  static func containsSensitiveString(_ value: String) -> Bool {
    matches(emailPattern, in: value) ||
      matches(phonePattern, in: value) ||
      matches(authHeaderPattern, in: value) ||
      matches(jwtPattern, in: value) ||
      matches(querySecretPattern, in: value) ||
      matches(longTokenPattern, in: value)
  }

  private static func sanitizedURLValue(_ value: Any) -> ObservabilityContext? {
    if let url = value as? URL {
      return sanitizedURL(url)
    }

    if let string = value as? String,
       let url = URL(string: string),
       url.scheme != nil
    {
      return sanitizedURL(url)
    }

    return nil
  }

  private static func isURLLikeValue(_ value: Any) -> Bool {
    if value is URL {
      return true
    }

    if let string = value as? String,
       let url = URL(string: string),
       url.scheme != nil
    {
      return true
    }

    return false
  }

  private static func sanitizedPath(_ path: String) -> String {
    path
      .split(separator: "/", omittingEmptySubsequences: false)
      .map { segment in
        let value = String(segment)
        return isSensitivePathSegment(value) ? filteredValue : value
      }
      .joined(separator: "/")
  }

  private static func isSensitivePathSegment(_ segment: String) -> Bool {
    guard !segment.isEmpty else { return false }
    return containsSensitiveString(segment) ||
      matches(uuidPathSegmentPattern, in: segment) ||
      matches(numericPathSegmentPattern, in: segment)
  }

  private static func isSensitiveKey(_ key: String) -> Bool {
    let normalized = normalizeKey(key)
    return sensitiveKeyFragments.contains { normalized.contains($0) }
  }

  private static func isURLKey(_ key: String) -> Bool {
    let normalized = normalizeKey(key)
    return urlKeyFragments.contains { normalized.contains($0) }
  }

  private static func normalizeKey(_ key: String) -> String {
    key
      .replacingOccurrences(of: "-", with: "_")
      .lowercased()
  }

  private static func matches(_ pattern: String, in value: String) -> Bool {
    value.range(
      of: pattern,
      options: [.regularExpression, .caseInsensitive]
    ) != nil
  }
}
