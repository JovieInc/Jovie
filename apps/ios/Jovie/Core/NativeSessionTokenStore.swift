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
  var isManaged: Bool { generation != nil }
  var ownership: NativeSessionOwnership? {
    generation.map { NativeSessionOwnership(generation: $0) }
  }

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
struct NativeSessionOwnership: Hashable, Sendable {
  fileprivate let generation: UUID
}

struct NativeSessionContext: Equatable, Sendable {
  let ownership: NativeSessionOwnership
  let authorization: NativeRequestAuthorization?
}

/// One cleanup may follow rotation/expiry, but never a later explicit intent.
struct NativeSessionCleanupClaim: Equatable, Sendable {
  fileprivate let context: NativeSessionContext
  fileprivate let intent: UUID
}

struct NativeSessionCleanupCompletion: Equatable, Sendable {
  let ownership: NativeSessionOwnership
  fileprivate let intent: UUID
}

struct NativeSessionExpiryReceipt: Equatable, Sendable {
  let ownership: NativeSessionOwnership
  let userID: String?
  fileprivate let originalGeneration: UUID?
  fileprivate let originalRevision: UUID?
}

struct NativeAuthAttempt: Equatable, Sendable {
  fileprivate let intent: UUID
}

struct NativeAuthResolution: Equatable, Sendable {
  enum Outcome: Equatable, Sendable { case persisted, preserved, consumed, unknown }
  enum Origin: Equatable, Sendable { case persistence, cancellation }
  let outcome: Outcome
  let origin: Origin
  let storageWasUntouched: Bool
  let ownership: NativeSessionOwnership
  let cleanupUserID: String?
  fileprivate let intent: UUID
  fileprivate let delivery = UUID()
}

/// Only the raw Security calls are replaceable; classification always runs here.
struct NativeSessionSecurityOperations: Sendable {
  var delete: @Sendable (CFDictionary) -> OSStatus
  var add: @Sendable (CFDictionary) -> OSStatus
  var copy: @Sendable (CFDictionary) -> (OSStatus, Data?)
  static let live = Self(
    delete: { SecItemDelete($0) }, add: { SecItemAdd($0, nil) },
    copy: { query in
      var item: CFTypeRef?
      let status = SecItemCopyMatching(query, &item)
      return (status, item as? Data)
    }
  )
}

enum NativeSessionRequestError: Error, Equatable {
  case expired(NativeSessionExpiryReceipt)
  case superseded
}

enum NativeSessionTokenStore {
  /// Every complete Keychain + metadata operation uses this same lock. Locked
  /// helpers never call a public operation, so expiry cleanup cannot re-enter it.
  private final class State: @unchecked Sendable {
    let lock = NSLock()
    var generation = UUID()
    var bearerRevision = UUID()
    var intent = UUID()
    var expiryReceipt: NativeSessionExpiryReceipt?
    var pendingAuth: UUID?
    var delivery: UUID?
    var security = NativeSessionSecurityOperations.live
  }

  private static let state = State()
  private static let service = NativeAuthPlatform.service
  private static let account = "nativeSessionToken"
  private static let fallbackTokenKey = NativeAuthPlatform.storagePrefix + ".nativeSession.token"
  private static let userIDKey = NativeAuthPlatform.storagePrefix + ".nativeSession.userID"
  private static let expiresAtKey = NativeAuthPlatform.storagePrefix + ".nativeSession.expiresAt"
  private static let expiryLeeway: TimeInterval = 30

  private static var defaultsLocked: UserDefaults { NativeAuthPlatform.defaults }

#if DEBUG
  /// Hold the test isolation lease; restore only after all owned tasks finish.
  static func replaceDefaultsForTesting(_ defaults: UserDefaults?) -> UserDefaults? {
    withLock { NativeAuthPlatform.replaceDefaultsForTesting(defaults) }
  }
#endif

  static func save(token: String, userID: String, expiresAt: Date) {
    withLock {
      state.intent = UUID()
      state.pendingAuth = nil
      state.delivery = nil
      state.generation = UUID()
      state.bearerRevision = UUID()
      state.expiryReceipt = nil
      saveLocked(token: token, userID: userID, expiresAt: expiresAt)
    }
  }

  private struct WriteResult { let deleted: OSStatus; let added: OSStatus }

  @discardableResult
  private static func saveLocked(token: String, userID: String, expiresAt: Date) -> WriteResult {
    let data = Data(token.utf8)
    let deleted = clearToken()

    var addQuery = baseQuery()
    addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    addQuery[kSecValueData as String] = data
    let status = state.security.add(addQuery as CFDictionary)

    if status == errSecSuccess {
      defaultsLocked.removeObject(forKey: fallbackTokenKey)
      defaultsLocked.set(userID, forKey: userIDKey)
      defaultsLocked.set(expiresAt.timeIntervalSince1970, forKey: expiresAtKey)
      return WriteResult(deleted: deleted, added: status)
    }

#if targetEnvironment(simulator)
    if status == errSecMissingEntitlement {
      defaultsLocked.set(token, forKey: fallbackTokenKey)
      defaultsLocked.set(userID, forKey: userIDKey)
      defaultsLocked.set(expiresAt.timeIntervalSince1970, forKey: expiresAtKey)
    }
#endif
    return WriteResult(deleted: deleted, added: status)
  }

  // Accepted typed returns share the same intent as logout; passive expiry and
  // bearer rotation never supersede an accepted return.
  static func beginAuthAttempt() -> NativeAuthAttempt {
    withLock {
      state.intent = UUID()
      state.pendingAuth = state.intent
      state.delivery = nil
      return NativeAuthAttempt(intent: state.intent)
    }
  }

  static var hasPendingAuth: Bool { withLock { state.pendingAuth == state.intent } }

  @discardableResult
  static func performIfNoPendingAuth(_ operation: () -> Void) -> Bool {
    withLock {
      guard state.pendingAuth != state.intent else { return false }
      operation()
      return true
    }
  }

  private static func isCurrentLocked(_ attempt: NativeAuthAttempt) -> Bool {
    state.intent == attempt.intent && state.pendingAuth == attempt.intent
  }

  @discardableResult
  static func performIfCurrent(_ attempt: NativeAuthAttempt, _ operation: () -> Void) -> Bool {
    withLock {
      guard isCurrentLocked(attempt) else { return false }
      operation()
      return true
    }
  }

  static func commit(_ attempt: NativeAuthAttempt, session: NativeStoredSession) -> NativeAuthResolution? {
    withLock {
      guard isCurrentLocked(attempt) else { return nil }
      let before = storageSnapshotLocked()
      if Task.isCancelled { return cancelAuthLocked(before) }
      guard before.readable else { return resolveAuthLocked(.unknown, userID: nil, untouched: true) }
      // This is the last cancellation check. Once delete/add starts, read back
      // and hand off its real outcome even if the caller becomes cancelled.
      if Task.isCancelled { return cancelAuthLocked(before) }
      let write = saveLocked(token: session.token, userID: session.userID, expiresAt: session.expiresAt)
      let after = storageSnapshotLocked()
      var persisted = write.added == errSecSuccess && after.backend == .keychain
#if targetEnvironment(simulator)
      persisted = persisted || (write.added == errSecMissingEntitlement && after.backend == .fallback)
#endif
      if persisted, let stored = after.session, stored.userID == session.userID,
         stored.token == session.token, after.expiry == session.expiresAt.timeIntervalSince1970 {
        advanceGenerationLocked()
        return resolveAuthLocked(.persisted, userID: nil)
      }
      if before == after, before.validSession != nil {
        return resolveAuthLocked(.preserved, userID: nil)
      }
      if after.readable, after.status == errSecItemNotFound, after.fallback == nil {
        let receipt = currentReceiptLocked()
        if receipt == nil { advanceGenerationLocked() }
        clearMetadataLocked()
        return resolveAuthLocked(.consumed, userID: before.userID ?? receipt?.userID)
      }
      // Mixed/readback-unknown bytes are not evidence for another deletion.
      fenceMetadataLocked()
      return resolveAuthLocked(.unknown, userID: nil)
    }
  }

  /// Cancellation/disappearance can finish a still-pending exchange even when
  /// its network dependency ignores cancellation and never returns.
  static func cancelAuthAttempt(_ attempt: NativeAuthAttempt) -> NativeAuthResolution? {
    withLock {
      guard isCurrentLocked(attempt) else { return nil }
      return cancelAuthLocked(storageSnapshotLocked())
    }
  }

  private static func cancelAuthLocked(_ snapshot: StorageSnapshot) -> NativeAuthResolution {
    if snapshot.readable, let session = snapshot.session,
       session.expiresAt.timeIntervalSinceNow <= expiryLeeway {
      _ = expireLocked(userID: session.userID)
    }
    return resolveAuthLocked(snapshot.validSession == nil ? .unknown : .preserved,
      userID: nil, origin: .cancellation, untouched: true)
  }

  /// Genuine exchange failure consumes the lease into the existing cleanup
  /// pipeline. Its pending phase ends only when that owned cleanup finishes.
  static func claimCleanup(for attempt: NativeAuthAttempt) -> NativeSessionCleanupClaim? {
    withLock {
      guard isCurrentLocked(attempt), !Task.isCancelled else { return nil }
      let context = captureSessionContextLocked()
      // Failed B must join A's existing expiry, not clear away its authority.
      guard currentReceiptLocked() == nil else { return nil }
      state.intent = UUID()
      state.pendingAuth = state.intent
      state.delivery = nil
      return NativeSessionCleanupClaim(context: context, intent: state.intent)
    }
  }

  static func finishAuthCleanup(_ completion: NativeSessionCleanupCompletion) {
    withLock {
      guard state.intent == completion.intent else { return }
      state.pendingAuth = nil
    }
  }

  private static func resolveAuthLocked(
    _ outcome: NativeAuthResolution.Outcome, userID: String?,
    origin: NativeAuthResolution.Origin = .persistence, untouched: Bool = false
  ) -> NativeAuthResolution {
    state.intent = UUID()
    state.pendingAuth = nil
    let result = NativeAuthResolution(outcome: outcome, origin: origin, storageWasUntouched: untouched,
      ownership: NativeSessionOwnership(generation: state.generation), cleanupUserID: userID,
      intent: state.intent)
    state.delivery = result.delivery
    return result
  }

  private static func isCurrentLocked(_ result: NativeAuthResolution) -> Bool {
    state.intent == result.intent && (state.generation == result.ownership.generation ||
      currentReceiptLocked()?.originalGeneration == result.ownership.generation)
  }

  /// One dispatch; the reusable result guard below does not grant a second one.
  /// The synchronous body must not call back into this store.
  @discardableResult
  static func consume(
    _ result: NativeAuthResolution,
    _ operation: (NativeStoredSession?, NativeSessionExpiryReceipt?) -> Void
  ) -> Bool {
    withLock {
      guard state.delivery == result.delivery, isCurrentLocked(result) else { return false }
      state.delivery = nil
      let session = result.outcome == .persisted || result.outcome == .preserved ? loadLocked() : nil
      operation(session, currentReceiptLocked())
      return true
    }
  }

  @discardableResult
  static func performIfCurrent(_ result: NativeAuthResolution, _ operation: () -> Void) -> Bool {
    withLock {
      guard isCurrentLocked(result) else { return false }
      operation()
      return true
    }
  }

  /// All ordinary profile presentation observes pending intent atomically.
  @discardableResult
  static func performProfileMutation(
    ownedBy ownership: NativeSessionOwnership, result: NativeAuthResolution? = nil,
    _ operation: () -> Void
  ) -> Bool {
    withLock {
      guard state.pendingAuth != state.intent else { return false }
      if let result, !isCurrentLocked(result) { return false }
      guard state.generation == ownership.generation ||
        currentReceiptLocked()?.originalGeneration == ownership.generation else { return false }
      operation()
      return true
    }
  }

  /// Receipt cleanup keeps its authority during pending auth, but presentation
  /// belongs to that pending attempt. No ownership is manufactured by a clear.
  @discardableResult
  static func performIfCurrent(
    _ receipt: NativeSessionExpiryReceipt, _ operation: (Bool) -> Void
  ) -> Bool {
    withLock {
      guard currentReceiptLocked() == receipt else { return false }
      operation(state.pendingAuth == state.intent)
      return true
    }
  }

  // Tests hold NativeSessionTokenStoreTestLock across replacement and restore.
  // These raw synchronous callbacks must never re-enter the store.
  static func replaceSecurityOperationsForTesting(
    _ operations: NativeSessionSecurityOperations
  ) -> NativeSessionSecurityOperations {
    withLock {
      let previous = state.security
      state.security = operations
      return previous
    }
  }

  private struct StorageSnapshot: Equatable {
    enum Backend { case keychain, fallback }
    let status: OSStatus
    let data: Data?
    let userID: String?
    let expiry: Double?
    let fallback: String?
    var readable: Bool {
#if targetEnvironment(simulator)
      (status == errSecSuccess && data != nil) || status == errSecItemNotFound || status == errSecMissingEntitlement
#else
      (status == errSecSuccess && data != nil) || status == errSecItemNotFound
#endif
    }
    var backend: Backend? {
      if status == errSecSuccess { return .keychain }
#if targetEnvironment(simulator)
      if readable, fallback != nil { return .fallback }
#endif
      return nil
    }
    var session: NativeStoredSession? {
      guard readable, let backend, let userID, !userID.isEmpty, let expiry, expiry.isFinite else { return nil }
      let token = backend == .keychain ? data.flatMap { String(data: $0, encoding: .utf8) } : fallback
      guard let token, !token.isEmpty else { return nil }
      return NativeStoredSession(userID: userID, token: token, expiresAt: Date(timeIntervalSince1970: expiry))
    }
    var validSession: NativeStoredSession? {
      guard let session, session.expiresAt.timeIntervalSinceNow > expiryLeeway else { return nil }
      return session
    }
  }

  private static func storageSnapshotLocked() -> StorageSnapshot {
    let (status, data) = copyToken()
#if targetEnvironment(simulator)
    let fallback = defaultsLocked.string(forKey: fallbackTokenKey)
#else
    let fallback: String? = nil
#endif
    return StorageSnapshot(status: status, data: data,
      userID: defaultsLocked.string(forKey: userIDKey),
      expiry: defaultsLocked.object(forKey: expiresAtKey) as? Double,
      fallback: fallback)
  }

  private static func advanceGenerationLocked() {
    state.generation = UUID()
    state.bearerRevision = UUID()
    state.expiryReceipt = nil
  }

  private static func fenceMetadataLocked() {
    advanceGenerationLocked()
    clearMetadataLocked()
  }

  private static func clearMetadataLocked() {
    defaultsLocked.removeObject(forKey: userIDKey)
    defaultsLocked.removeObject(forKey: expiresAtKey)
  }

  static func load() -> NativeStoredSession? {
    withLock { loadLocked() }
  }

  static func requestAuthorization() -> NativeRequestAuthorization? {
    captureSessionContext().authorization
  }

  /// Capture before an asynchronous profile load, without expiring its owner.
  static func captureOwnership() -> NativeSessionOwnership {
    withLock { NativeSessionOwnership(generation: state.generation) }
  }

  static func captureOwnership(for userID: String) -> NativeSessionOwnership? {
    withLock {
      guard matchesUserLocked(userID) else { return nil }
      return NativeSessionOwnership(generation: state.generation)
    }
  }

  private static func matchesUserLocked(_ userID: String) -> Bool {
    let storedUserID = defaultsLocked.string(forKey: userIDKey)
      ?? currentReceiptLocked()?.userID
    return storedUserID == nil || storedUserID == userID
  }

  static func ownedRequestAuthorization(
    ifOwnedBy ownership: NativeSessionOwnership, for userID: String? = nil
  ) throws -> NativeRequestAuthorization {
    try withLock {
      // A delayed profile callback must not label another user's response/cache.
      if let userID, !matchesUserLocked(userID) {
        throw NativeSessionRequestError.superseded
      }
      guard state.generation == ownership.generation else {
        if let receipt = currentReceiptLocked(),
           receipt.originalGeneration == ownership.generation
        {
          throw NativeSessionRequestError.expired(receipt)
        }
        throw NativeSessionRequestError.superseded
      }
      guard let session = loadLocked() else {
        let receipt = currentReceiptLocked() ?? NativeSessionExpiryReceipt(
          ownership: NativeSessionOwnership(generation: state.generation), userID: nil,
          originalGeneration: nil, originalRevision: nil
        )
        state.expiryReceipt = receipt
        throw NativeSessionRequestError.expired(receipt)
      }
      return NativeRequestAuthorization(
        session: session, generation: state.generation, bearerRevision: state.bearerRevision
      )
    }
  }

  /// A rejected request may retry a different bearer only within its own login.
  /// Parallel failures reuse only the receipt for the exact rejected revision.
  static func resolveUnauthorized(
    authorizedBy authorization: NativeRequestAuthorization,
    allowRetry: Bool
  ) throws -> NativeRequestAuthorization {
    try withLock {
      guard let generation = authorization.generation,
            let revision = authorization.bearerRevision, let captured = authorization.session
      else { throw NativeSessionRequestError.superseded }
      guard state.generation == generation else {
        if let receipt = currentReceiptLocked(),
           receipt.originalGeneration == generation, receipt.originalRevision == revision,
           receipt.userID == captured.userID
        {
          throw NativeSessionRequestError.expired(receipt)
        }
        throw NativeSessionRequestError.superseded
      }
      guard let stored = loadLocked() else {
        if let receipt = currentReceiptLocked(), receipt.originalGeneration == generation,
           receipt.originalRevision == revision, receipt.userID == captured.userID
        {
          throw NativeSessionRequestError.expired(receipt)
        }
        throw NativeSessionRequestError.superseded
      }
      guard stored.userID == captured.userID else { throw NativeSessionRequestError.superseded }
      if state.bearerRevision == revision, stored.token == authorization.bearerToken {
        throw NativeSessionRequestError.expired(expireLocked(userID: stored.userID))
      }
      guard allowRetry, stored.token != authorization.bearerToken else {
        throw NativeSessionRequestError.superseded
      }
      return NativeRequestAuthorization(
        session: stored, generation: state.generation, bearerRevision: state.bearerRevision
      )
    }
  }

  private static func currentReceiptLocked() -> NativeSessionExpiryReceipt? {
    guard state.expiryReceipt?.ownership.generation == state.generation else { return nil }
    return state.expiryReceipt
  }

  private static func expireLocked(userID: String) -> NativeSessionExpiryReceipt {
    let generation = state.generation
    let revision = state.bearerRevision
    clearLocked()
    let receipt = NativeSessionExpiryReceipt(
      ownership: NativeSessionOwnership(generation: state.generation), userID: userID,
      originalGeneration: generation, originalRevision: revision
    )
    state.expiryReceipt = receipt
    return receipt
  }

  /// Also captures an empty store's generation so delayed local cleanup cannot
  /// adopt a login that appears after capture.
  static func captureSessionContext() -> NativeSessionContext {
    withLock { captureSessionContextLocked() }
  }

  private static func captureSessionContextLocked() -> NativeSessionContext {
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

  static func claimOrdinaryCleanup() -> NativeSessionCleanupClaim? {
    withLock {
      guard state.pendingAuth != state.intent else { return nil }
      return NativeSessionCleanupClaim(context: captureSessionContextLocked(), intent: state.intent)
    }
  }

  static func claimCleanup(invalidatingAuthIntent: Bool = false) -> NativeSessionCleanupClaim {
    withLock {
      if invalidatingAuthIntent {
        state.intent = UUID()
        state.pendingAuth = nil
        state.delivery = nil
      }
      return NativeSessionCleanupClaim(context: captureSessionContextLocked(), intent: state.intent)
    }
  }

  private static func isCurrentLocked(_ claim: NativeSessionCleanupClaim) -> Bool {
    state.intent == claim.intent && (
      state.generation == claim.context.ownership.generation ||
        currentReceiptLocked()?.originalGeneration == claim.context.ownership.generation
    )
  }

  /// A valid empty context differs from a superseded claim (nil).
  static func captureSessionContext(for claim: NativeSessionCleanupClaim) -> NativeSessionContext? {
    withLock {
      guard isCurrentLocked(claim) else { return nil }
      return captureSessionContextLocked()
    }
  }

  /// Synchronous mutations only; the closure must not re-enter the store.
  @discardableResult
  static func performIfCurrent(
    _ claim: NativeSessionCleanupClaim, _ operation: (NativeSessionContext) -> Void
  ) -> Bool {
    withLock {
      guard isCurrentLocked(claim) else { return false }
      operation(captureSessionContextLocked())
      return true
    }
  }

  static func completeCleanup(_ claim: NativeSessionCleanupClaim) -> NativeSessionCleanupCompletion? {
    withLock {
      guard isCurrentLocked(claim) else { return nil }
      // Even initially empty claims advance generation and discard receipt lineage.
      clearLocked()
      return NativeSessionCleanupCompletion(
        ownership: NativeSessionOwnership(generation: state.generation), intent: state.intent
      )
    }
  }

  @discardableResult
  static func performIfCurrent(
    _ completion: NativeSessionCleanupCompletion, _ operation: () -> Void
  ) -> Bool {
    withLock {
      guard state.intent == completion.intent,
            state.generation == completion.ownership.generation else { return false }
      operation()
      return true
    }
  }

  static func isCurrent(_ ownership: NativeSessionOwnership) -> Bool {
    withLock {
      guard state.generation == ownership.generation else { return false }
      _ = loadLocked()
      return state.generation == ownership.generation
    }
  }

  /// Presentation may continue after passive expiry until that exact empty
  /// generation is replaced or explicitly cleared. This grants no authorization
  /// and leaves the existing client/terminal path responsible for expiry.
  static func canContinueProfileLoad(ownedBy ownership: NativeSessionOwnership) -> Bool {
    withLock {
      state.generation == ownership.generation || (
        currentReceiptLocked()?.originalGeneration == ownership.generation
      )
    }
  }

  /// Keeps a synchronous local mutation atomic with login replacement/clear.
  /// The operation must not await or re-enter any token-store API.
  @discardableResult
  static func performIfCurrent(
    _ ownership: NativeSessionOwnership,
    _ operation: () -> Void
  ) -> Bool {
    withLock {
      guard state.generation == ownership.generation else { return false }
      operation()
      return true
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
      let userID = defaultsLocked.string(forKey: userIDKey),
      let token = loadToken()
    else {
      return nil
    }

    let expiresAt = Date(
      timeIntervalSince1970: defaultsLocked.double(forKey: expiresAtKey)
    )

    guard expiresAt.timeIntervalSinceNow > expiryLeeway else {
      _ = expireLocked(userID: userID)
      return nil
    }

    return NativeStoredSession(userID: userID, token: token, expiresAt: expiresAt)
  }

  static func clear() {
    withLock {
      state.intent = UUID()
      state.pendingAuth = nil
      state.delivery = nil
      clearLocked()
    }
  }

  private static func clearLocked() {
    state.generation = UUID()
    state.bearerRevision = UUID()
    state.expiryReceipt = nil
    clearToken()
    defaultsLocked.removeObject(forKey: fallbackTokenKey)
    defaultsLocked.removeObject(forKey: userIDKey)
    defaultsLocked.removeObject(forKey: expiresAtKey)
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

  private static func withLock<T>(_ operation: () throws -> T) rethrows -> T {
    state.lock.lock()
    defer { state.lock.unlock() }
    return try operation()
  }

  private static func loadToken() -> String? {
    let (status, data) = copyToken()
    guard status == errSecSuccess else {
#if targetEnvironment(simulator)
      return defaultsLocked.string(forKey: fallbackTokenKey)
#else
      return nil
#endif
    }

    guard let data else {
      return nil
    }

    return String(data: data, encoding: .utf8)
  }

  private static func copyToken() -> (OSStatus, Data?) {
    var query = baseQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    return state.security.copy(query as CFDictionary)
  }

  @discardableResult
  private static func clearToken() -> OSStatus {
    state.security.delete(baseQuery() as CFDictionary)
  }

  private static func baseQuery() -> [String: Any] {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
#if os(macOS)
    query[kSecUseDataProtectionKeychain as String] = true
#endif
    return query
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
