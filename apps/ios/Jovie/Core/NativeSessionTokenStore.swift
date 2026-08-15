import Foundation
import Security

struct NativeStoredSession: Equatable, Sendable {
  let userID: String
  let token: String
  let expiresAt: Date
}

enum NativeSessionTokenStore {
  private static let service = "ie.jov.Jovie"
  private static let account = "nativeSessionToken"
  private static let fallbackTokenKey = "ie.jov.Jovie.nativeSession.token"
  private static let userIDKey = "ie.jov.Jovie.nativeSession.userID"
  private static let expiresAtKey = "ie.jov.Jovie.nativeSession.expiresAt"
  private static let expiryLeeway: TimeInterval = 30

  static func save(token: String, userID: String, expiresAt: Date) {
    guard let data = token.data(using: .utf8) else { return }

    clearToken()

    var addQuery = baseQuery()
    addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    addQuery[kSecValueData as String] = data
    let status = SecItemAdd(addQuery as CFDictionary, nil)

    if status == errSecSuccess {
      UserDefaults.standard.removeObject(forKey: fallbackTokenKey)
      UserDefaults.standard.set(userID, forKey: userIDKey)
      UserDefaults.standard.set(expiresAt.timeIntervalSince1970, forKey: expiresAtKey)
      return
    }

#if targetEnvironment(simulator)
    if status == errSecMissingEntitlement {
      UserDefaults.standard.set(token, forKey: fallbackTokenKey)
      UserDefaults.standard.set(userID, forKey: userIDKey)
      UserDefaults.standard.set(expiresAt.timeIntervalSince1970, forKey: expiresAtKey)
    }
#endif
  }

  static func load() -> NativeStoredSession? {
    guard
      let userID = UserDefaults.standard.string(forKey: userIDKey),
      let token = loadToken()
    else {
      return nil
    }

    let expiresAt = Date(
      timeIntervalSince1970: UserDefaults.standard.double(forKey: expiresAtKey)
    )

    guard expiresAt.timeIntervalSinceNow > expiryLeeway else {
      clear()
      return nil
    }

    return NativeStoredSession(userID: userID, token: token, expiresAt: expiresAt)
  }

  static func clear() {
    clearToken()
    UserDefaults.standard.removeObject(forKey: fallbackTokenKey)
    UserDefaults.standard.removeObject(forKey: userIDKey)
    UserDefaults.standard.removeObject(forKey: expiresAtKey)
  }

  /// Persists the Better Auth bearer-plugin roll emitted on successful API calls.
  /// The response header contains only the token; keep the existing user identity
  /// and extend the local lease to match the server's seven-day session lifetime.
  static func refresh(from response: URLResponse) {
    guard
      let httpResponse = response as? HTTPURLResponse,
      let token = httpResponse.value(forHTTPHeaderField: "set-auth-token"),
      !token.isEmpty,
      let stored = load()
    else { return }

    save(
      token: token,
      userID: stored.userID,
      expiresAt: Date().addingTimeInterval(60 * 60 * 24 * 7)
    )
  }

  private static func loadToken() -> String? {
    var query = baseQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else {
#if targetEnvironment(simulator)
      return UserDefaults.standard.string(forKey: fallbackTokenKey)
#else
      return nil
#endif
    }

    guard let data = item as? Data else {
      return nil
    }

    return String(data: data, encoding: .utf8)
  }

  private static func clearToken() {
    SecItemDelete(baseQuery() as CFDictionary)
  }

  private static func baseQuery() -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
}

/**
 * Sole token provider under Better Auth. The raw session token lives in Keychain;
 * the bearer plugin authenticates API calls with it. No client refresh —
 * the server rolls `expiresAt` per `updateAge`, and the bearer plugin's
 * `set-auth-token` response header refreshes the stored token + expiry on
 * successful API calls (handled by `APIClient` and `MobileChatClient`). A
 * terminal 401 clears the Keychain in each client.
 */
struct NativeSessionTokenProvider: TokenProviding {
  func bearerToken(forceRefresh: Bool) async throws -> String {
    guard let session = NativeSessionTokenStore.load() else {
      throw APIClientError.missingToken
    }
    return session.token
  }
}

enum NativeSessionRevocationResult: Equatable, Sendable {
  case revoked
  case noSession
  case failed(statusCode: Int?)
}

protocol NativeSessionRevoking: Sendable {
  func revokeCurrentSession() async -> NativeSessionRevocationResult
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
    guard let token = try? await tokenProvider.bearerToken(forceRefresh: false) else {
      return .noSession
    }

    var request = URLRequest(url: baseURL.appending(path: "/api/auth/sign-out"))
    request.httpMethod = "POST"
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

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
