import Foundation
import Security

struct NativeStoredSession: Equatable, Sendable {
  let userID: String
  let token: String
  let expiresAt: Date
}

/// Authority to apply a response header belongs to the bearer actually sent.
/// Providers outside the native store can send tokens without gaining this authority.
struct NativeRequestAuthorization: Equatable, Sendable {
  let bearerToken: String
  fileprivate let session: NativeStoredSession?
  fileprivate let generation: UUID?
  fileprivate let bearerRevision: UUID?

  init(unmanagedBearerToken: String) {
    bearerToken = unmanagedBearerToken
    session = nil
    generation = nil
    bearerRevision = nil
  }

  fileprivate init(session: NativeStoredSession, generation: UUID, bearerRevision: UUID) {
    bearerToken = session.token
    self.session = session
    self.generation = generation
    self.bearerRevision = bearerRevision
  }
}

/// Login ownership outlives bearer rotation, but never an explicit save or clear.
struct NativeSessionOwnership: Equatable, Sendable {
  fileprivate let generation: UUID
}

struct NativeSessionContext: Equatable, Sendable {
  let ownership: NativeSessionOwnership
  let authorization: NativeRequestAuthorization?
}

enum NativeSessionTokenStore {
  /// Every complete Keychain + metadata operation uses this same lock. Locked
  /// helpers never call a public operation, so expiry cleanup cannot re-enter it.
  private final class State: @unchecked Sendable {
    let lock = NSLock()
    var generation = UUID()
    var bearerRevision = UUID()
  }

  private static let state = State()
  private static let service = "ie.jov.Jovie"
  private static let account = "nativeSessionToken"
  private static let fallbackTokenKey = "ie.jov.Jovie.nativeSession.token"
  private static let userIDKey = "ie.jov.Jovie.nativeSession.userID"
  private static let expiresAtKey = "ie.jov.Jovie.nativeSession.expiresAt"
  private static let expiryLeeway: TimeInterval = 30

  static func save(token: String, userID: String, expiresAt: Date) {
    withLock {
      state.generation = UUID()
      state.bearerRevision = UUID()
      saveLocked(token: token, userID: userID, expiresAt: expiresAt)
    }
  }

  private static func saveLocked(token: String, userID: String, expiresAt: Date) {
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
    withLock { loadLocked() }
  }

  static func requestAuthorization() -> NativeRequestAuthorization? {
    captureSessionContext().authorization
  }

  /// Also captures an empty store's generation so delayed local cleanup cannot
  /// adopt a login that appears after capture.
  static func captureSessionContext() -> NativeSessionContext {
    withLock {
      let session = loadLocked()
      return NativeSessionContext(
        ownership: NativeSessionOwnership(generation: state.generation),
        authorization: session.map {
          NativeRequestAuthorization(
            session: $0, generation: state.generation, bearerRevision: state.bearerRevision
          )
        }
      )
    }
  }

  static func isCurrent(_ ownership: NativeSessionOwnership) -> Bool {
    withLock {
      guard state.generation == ownership.generation else { return false }
      _ = loadLocked()
      return state.generation == ownership.generation
    }
  }

  /// A pending operation may use a rotated bearer only within its original login.
  static func requestAuthorization(
    ifOwnedBy ownership: NativeSessionOwnership
  ) -> NativeRequestAuthorization? {
    withLock {
      guard state.generation == ownership.generation, let session = loadLocked() else { return nil }
      return NativeRequestAuthorization(
        session: session,
        generation: state.generation,
        bearerRevision: state.bearerRevision
      )
    }
  }

  private static func loadLocked() -> NativeStoredSession? {
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
      clearLocked()
      return nil
    }

    return NativeStoredSession(userID: userID, token: token, expiresAt: expiresAt)
  }

  static func clear() {
    withLock { clearLocked() }
  }

  private static func clearLocked() {
    state.generation = UUID()
    state.bearerRevision = UUID()
    clearToken()
    UserDefaults.standard.removeObject(forKey: fallbackTokenKey)
    UserDefaults.standard.removeObject(forKey: userIDKey)
    UserDefaults.standard.removeObject(forKey: expiresAtKey)
  }

  /// Persists the Better Auth bearer-plugin roll emitted on successful API calls.
  /// Only the still-current request snapshot may rotate the token. Explicit
  /// login/clear or another accepted rotation makes a late header a no-op.
  static func refresh(
    from response: URLResponse,
    authorizedBy authorization: NativeRequestAuthorization
  ) {
    guard
      let httpResponse = response as? HTTPURLResponse,
      let token = httpResponse.value(forHTTPHeaderField: "set-auth-token"),
      !token.isEmpty,
      let captured = authorization.session
    else { return }

    withLock {
      guard
        state.generation == authorization.generation,
        state.bearerRevision == authorization.bearerRevision,
        let stored = loadLocked(),
        stored.userID == captured.userID,
        stored.token == authorization.bearerToken
      else { return }

      // Rotation keeps login ownership, including when the server reuses the
      // token while extending expiry. Fence other responses from this revision.
      state.bearerRevision = UUID()
      saveLocked(
        token: token,
        userID: captured.userID,
        expiresAt: Date().addingTimeInterval(60 * 60 * 24 * 7)
      )
    }
  }

  private static func withLock<T>(_ operation: () -> T) -> T {
    state.lock.lock()
    defer { state.lock.unlock() }
    return operation()
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
