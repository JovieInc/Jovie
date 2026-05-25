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

struct NativeSessionTokenProvider: TokenProviding {
  private let fallback: any TokenProviding

  init(fallback: any TokenProviding) {
    self.fallback = fallback
  }

  func bearerToken(forceRefresh: Bool) async throws -> String {
    if !forceRefresh, let session = NativeSessionTokenStore.load() {
      return session.token
    }

    do {
      return try await fallback.bearerToken(forceRefresh: forceRefresh)
    } catch {
      if let session = NativeSessionTokenStore.load() {
        return session.token
      }
      throw error
    }
  }
}
