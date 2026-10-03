import Foundation
import Testing
@testable import Jovie

actor MutableAPIClient: APIClientProtocol {
  var mode: Mode

  enum Mode {
    case success(MobileMeResponse)
    case failure(Error)
  }

  init(mode: Mode) {
    self.mode = mode
  }

  func fetchMe() async throws -> MobileMeResponse {
    switch mode {
    case let .success(response):
      return response
    case let .failure(error):
      throw error
    }
  }

  func fetchAppleWalletProfilePass() async throws -> Data {
    Data()
  }

  func fetchAudienceHighlights() async throws -> MobileAudienceHighlightsResponse {
    .preview
  }

  func fetchActionLoopInbox() async throws -> MobileActionLoopInboxResponse {
    .preview
  }

  func fetchActionLoopCalendar() async throws -> MobileActionLoopCalendarResponse {
    .preview
  }

  func updateMode(_ mode: Mode) {
    self.mode = mode
  }
}

struct MeRepositoryTests {
  @Test func returnsFreshDataAndCachesIt() async throws {
    let defaults = UserDefaults(suiteName: "MeRepositoryTests-A")!
    defaults.removePersistentDomain(forName: "MeRepositoryTests-A")
    let cache = MeCache(defaults: defaults)
    let apiClient = MutableAPIClient(mode: .success(.previewReady))
    let repository = MeRepository(apiClient: apiClient, cache: cache)

    let result = try await repository.loadMe(for: "user_123")

    #expect(result.isStale == false)
    #expect(result.response == .previewReady)
    let cached = await cache.load(for: "user_123")
    #expect(cached?.response == .previewReady)
  }

  @Test func returnsStaleSnapshotWhenNetworkFails() async throws {
    let defaults = UserDefaults(suiteName: "MeRepositoryTests-B")!
    defaults.removePersistentDomain(forName: "MeRepositoryTests-B")
    let cache = MeCache(defaults: defaults)
    let liveClient = MutableAPIClient(mode: .success(.previewReady))
    let repository = MeRepository(apiClient: liveClient, cache: cache)

    _ = try await repository.loadMe(for: "user_456")
    await liveClient.updateMode(.failure(APIClientError.requestFailed(statusCode: 500)))

    let staleResult = try await repository.loadMe(for: "user_456")

    #expect(staleResult.isStale == true)
    #expect(staleResult.response == .previewReady)
  }

  @Test func authFailuresRethrowInsteadOfReturningStaleCache() async throws {
    let defaults = UserDefaults(suiteName: "MeRepositoryTests-F")!
    defaults.removePersistentDomain(forName: "MeRepositoryTests-F")
    let cache = MeCache(defaults: defaults)
    let apiClient = MutableAPIClient(mode: .success(.previewReady))
    let repository = MeRepository(apiClient: apiClient, cache: cache)

    let first = try await repository.loadMe(for: "user_auth")
    #expect(first.isStale == false)
    #expect(first.response == .previewReady)

    await apiClient.updateMode(.failure(APIClientError.requestFailed(statusCode: 401)))
    await #expect(throws: APIClientError.requestFailed(statusCode: 401)) {
      try await repository.loadMe(for: "user_auth")
    }

    await apiClient.updateMode(.failure(APIClientError.missingToken))
    await #expect(throws: APIClientError.missingToken) {
      try await repository.loadMe(for: "user_auth")
    }

    await apiClient.updateMode(.failure(APIClientError.requestFailed(statusCode: 500)))
    let stale = try await repository.loadMe(for: "user_auth")
    #expect(stale.isStale == true)
    #expect(stale.response == .previewReady)
  }

  @Test func cachedSnapshotReturnsNilBeforeFirstLoad() async throws {
    let defaults = UserDefaults(suiteName: "MeRepositoryTests-D")!
    defaults.removePersistentDomain(forName: "MeRepositoryTests-D")
    let cache = MeCache(defaults: defaults)
    let apiClient = MutableAPIClient(mode: .success(.previewReady))
    let repository = MeRepository(apiClient: apiClient, cache: cache)

    #expect(await repository.cachedSnapshot(for: "user_d") == nil)
  }

  @Test func cachedSnapshotReturnsPersistedResponseWithoutNetwork() async throws {
    let defaults = UserDefaults(suiteName: "MeRepositoryTests-E")!
    defaults.removePersistentDomain(forName: "MeRepositoryTests-E")
    let cache = MeCache(defaults: defaults)
    let apiClient = MutableAPIClient(mode: .success(.previewReady))
    let repository = MeRepository(apiClient: apiClient, cache: cache)

    _ = try await repository.loadMe(for: "user_e")
    // Network now fails — cachedSnapshot must still return the persisted copy.
    await apiClient.updateMode(.failure(APIClientError.requestFailed(statusCode: 500)))

    #expect(await repository.cachedSnapshot(for: "user_e") == .previewReady)
  }

  @Test func clearCachedUserRemovesSnapshot() async throws {
    let defaults = UserDefaults(suiteName: "MeRepositoryTests-C")!
    defaults.removePersistentDomain(forName: "MeRepositoryTests-C")
    let cache = MeCache(defaults: defaults)
    let apiClient = MutableAPIClient(mode: .success(.previewReady))
    let repository = MeRepository(apiClient: apiClient, cache: cache)

    _ = try await repository.loadMe(for: "user_789")
    await repository.clearCachedUser("user_789")

    #expect(await cache.load(for: "user_789") == nil)
  }
}

func ownedProfileExpiryReceipt(_ authorization: NativeRequestAuthorization) throws -> NativeSessionExpiryReceipt {
  try nativeExpiryReceipt {
    try NativeSessionTokenStore.resolveUnauthorized(authorizedBy: authorization, allowRetry: false)
  }
}

struct PausedMeCache: MeCaching {
  enum Phase: CaseIterable, Sendable { case write, fallback }
  let base: MeCache
  let gate: ProfileLoadGate
  let phase: Phase
  func load(for userID: String) async -> CachedMeSnapshot? {
    let snapshot = await base.load(for: userID)
    if phase == .fallback { _ = await gate.wait() }
    return snapshot
  }
  func store(_ response: MobileMeResponse, for userID: String) async {
    if phase == .write { _ = await gate.wait() }
    await base.store(response, for: userID)
  }
  func store(_ response: MobileMeResponse, for userID: String, ifOwnedBy owner: NativeSessionOwnership) async -> Bool {
    if phase == .write { _ = await gate.wait() }
    return await base.store(response, for: userID, ifOwnedBy: owner)
  }
  func remove(for userID: String) async { await base.remove(for: userID) }
  func remove(for userID: String, ifOwnedBy owner: NativeSessionOwnership) async {
    await base.remove(for: userID, ifOwnedBy: owner)
  }
}

extension MeRepositoryTests {
  enum OwnedFailure: CaseIterable, Sendable { case expiry, superseded, cancellation, transport }

  @Test(arguments: OwnedFailure.allCases)
  func ownedTerminalAndAbandonedResultsBypassWarmCache(failure: OwnedFailure) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "a", userID: "same-user", expiresAt: .distantFuture)
      let authorization = try #require(NativeSessionTokenStore.requestAuthorization())
      let owner = NativeSessionTokenStore.captureOwnership()
      let suite = "OwnedMeFailures-\(UUID().uuidString)"
      let defaults = UserDefaults(suiteName: suite)!
      defer { defaults.removePersistentDomain(forName: suite) }
      let cache = MeCache(defaults: defaults)
      await cache.store(.previewReady, for: "same-user")
      let error: Error
      switch failure {
      case .expiry: error = NativeSessionRequestError.expired(try ownedProfileExpiryReceipt(authorization))
      case .superseded: error = NativeSessionRequestError.superseded
      case .cancellation: error = CancellationError()
      case .transport: error = APIClientError.transportFailed(code: -1009)
      }
      let repository = MeRepository(apiClient: MutableAPIClient(mode: .failure(error)), cache: cache)
      do {
        let result = try await repository.loadMe(for: "same-user", ifOwnedBy: owner)
        #expect(failure == .transport)
        #expect(result == MeRepositoryResult(response: .previewReady, isStale: true))
      } catch let received {
        if failure == .cancellation { #expect(received is CancellationError) }
        else { #expect(received as? NativeSessionRequestError == error as? NativeSessionRequestError) }
        #expect(failure != .transport)
      }
      #expect(await cache.load(for: "same-user")?.response == .previewReady)
    }
  }

  enum WhileCacheSuspended: CaseIterable, Sendable { case current, replacement, passiveExpiry }

  @Test(arguments: PausedMeCache.Phase.allCases, WhileCacheSuspended.allCases)
  func ownedRepositoryRechecksAtActualCacheWriteAndAfterFallback(
    phase: PausedMeCache.Phase, change: WhileCacheSuspended
  ) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "same-token", userID: "same-user", expiresAt: .distantFuture)
      let owner = NativeSessionTokenStore.captureOwnership()
      let suite = "OwnedMeSink-\(UUID().uuidString)"
      let defaults = UserDefaults(suiteName: suite)!
      defer { defaults.removePersistentDomain(forName: suite) }
      let cache = MeCache(defaults: defaults)
      await cache.store(.previewNeedsOnboarding, for: "same-user")
      let gate = ProfileLoadGate()
      let mode: MutableAPIClient.Mode = phase == .write ? .success(.previewReady)
        : .failure(APIClientError.transportFailed(code: -1009))
      let repository = MeRepository(
        apiClient: MutableAPIClient(mode: mode), cache: PausedMeCache(base: cache, gate: gate, phase: phase)
      )
      let task = Task { () -> Result<MeRepositoryResult, Error> in
        let result: Result<MeRepositoryResult, Error>
        do { result = .success(try await repository.loadMe(for: "same-user", ifOwnedBy: owner)) }
        catch { result = .failure(error) }
        await gate.ownerFinished()
        return result
      }
      #expect(await gate.waitUntilEntered(), "The real repository must reach its cache boundary")
      if change == .replacement {
        NativeSessionTokenStore.save(token: "same-token", userID: "same-user", expiresAt: .distantFuture)
        await cache.store(.previewNeedsOnboarding, for: "same-user")
      } else if change == .passiveExpiry {
        UserDefaults.standard.set(1, forKey: "ie.jov.Jovie.nativeSession.expiresAt")
        #expect(NativeSessionTokenStore.load() == nil)
      }
      let context = NativeSessionTokenStore.captureSessionContext()
      await gate.complete(true)
      let result = await task.value
      switch result {
      case let .success(value):
        #expect(change == .current)
        #expect(value.isStale == (phase == .fallback))
      case let .failure(error):
        if change == .passiveExpiry {
          guard case let .expired(receipt)? = error as? NativeSessionRequestError else {
            Issue.record("Passive expiry must retain its exact receipt"); return
          }
          #expect(receipt.ownership == context.ownership)
        } else { #expect(error as? NativeSessionRequestError == .superseded) }
        #expect(change != .current)
      }
      let expected: MobileMeResponse = change == .current && phase == .write ? .previewReady : .previewNeedsOnboarding
      #expect(await cache.load(for: "same-user")?.response == expected)
      #expect(await MeCache(defaults: defaults).load(for: "same-user")?.response == expected)
      #expect(NativeSessionTokenStore.captureSessionContext() == context)
    }
  }
}
