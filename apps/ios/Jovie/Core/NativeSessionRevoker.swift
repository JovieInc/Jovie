import Foundation

/**
 * Sole token provider under Better Auth. The raw session token lives in Keychain;
 * the bearer plugin authenticates API calls with it. No client refresh —
 * the server rolls `expiresAt` per `updateAge`, and the bearer plugin's
 * `set-auth-token` response header refreshes the stored token + expiry on
 * successful API calls (handled by `APIClient` and `MobileChatClient`). A
 * terminal 401 clears the Keychain in each client.
 */
struct NativeSessionTokenProvider: TokenProviding {
  func ownedRequestAuthorization(
    for userID: String, ifOwnedBy ownership: NativeSessionOwnership
  ) async throws -> NativeRequestAuthorization {
    try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: ownership, for: userID)
  }

  func bearerToken(forceRefresh: Bool) async throws -> String {
    try await requestAuthorization(forceRefresh: forceRefresh).bearerToken
  }

  func requestAuthorization(forceRefresh: Bool) async throws -> NativeRequestAuthorization {
    guard let authorization = NativeSessionTokenStore.requestAuthorization() else {
      throw APIClientError.missingToken
    }
    // No client-side mint; a 401 cannot be recovered by retrying this token.
    if forceRefresh {
      throw APIClientError.missingToken
    }
    return authorization
  }
}

enum NativeSessionRevocationResult: Equatable, Sendable {
  case revoked
  case noSession
  case failed(statusCode: Int?)
}

protocol NativeSessionRevoking: Sendable {
  func revokeCurrentSession() async -> NativeSessionRevocationResult
  func revokeSession(authorizedBy authorization: NativeRequestAuthorization?) async -> NativeSessionRevocationResult
}

/// Revokes the Better Auth session represented by the native bearer token.
/// Better Auth's bearer plugin converts the Authorization header into the
/// signed session cookie consumed by its canonical `/api/auth/sign-out` route.
struct NativeSessionRevoker: NativeSessionRevoking, Sendable {
  private let baseURL: URL
  private let session: URLSession
  private let tokenProvider: TokenProviding
  private let requestTimeout: TimeInterval

  init(
    baseURL: URL,
    session: URLSession = URLSession(configuration: .jovieMobile),
    tokenProvider: TokenProviding = NativeSessionTokenProvider(),
    requestTimeout: TimeInterval = 5
  ) {
    self.baseURL = baseURL
    self.session = session
    self.tokenProvider = tokenProvider
    self.requestTimeout = requestTimeout
  }

  func revokeCurrentSession() async -> NativeSessionRevocationResult {
    let token = try? await tokenProvider.bearerToken(forceRefresh: false)
    return await revokeSession(authorizedBy: token.map { NativeRequestAuthorization(unmanagedBearerToken: $0) })
  }

  func revokeSession(authorizedBy authorization: NativeRequestAuthorization?) async -> NativeSessionRevocationResult {
    guard let authorization else { return .noSession }
    var request = URLRequest(url: baseURL.appending(path: "/api/auth/sign-out"))
    request.httpMethod = "POST"
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(authorization.bearerToken)", forHTTPHeaderField: "Authorization")

    do {
      let (_, response) = try await session.data(for: request)
      guard let response = response as? HTTPURLResponse else {
        return .failed(statusCode: nil)
      }

      guard (200 ... 299).contains(response.statusCode) else {
        return .failed(statusCode: response.statusCode)
      }

      return .revoked
    } catch {
      return .failed(statusCode: nil)
    }
  }
}

/// Fixed credential namespace per target, selected before canonical store access.
enum NativeAuthPlatform {
#if os(macOS)
  static let storagePrefix = "ie.jov.JovieMac.Development.production"
  static let service = storagePrefix + ".session"
  private static let productionDefaults: UserDefaults = {
    guard let value = UserDefaults(suiteName: storagePrefix) else {
      preconditionFailure("The Mac session defaults domain is unavailable")
    }
    return value
  }()
#else
  static let storagePrefix = "ie.jov.Jovie"
  static let service = "ie.jov.Jovie"
  private static let productionDefaults = UserDefaults.standard
#endif
  // Separate configuration lock: diagnostics can run inside the session lock.
  // This holds no credential or session authority and never calls the store.
#if DEBUG
  private static let defaultsLock = NSLock()
  private static var defaultsOverride: UserDefaults?
  static func replaceDefaultsForTesting(_ value: UserDefaults?) -> UserDefaults? {
    defaultsLock.lock()
    defer { defaultsLock.unlock() }
    let previous = defaultsOverride
    defaultsOverride = value
    return previous
  }
#endif
  static var defaults: UserDefaults {
#if DEBUG
    defaultsLock.lock()
    defer { defaultsLock.unlock() }
    if let defaultsOverride { return defaultsOverride }
#endif
    return productionDefaults
  }
}
