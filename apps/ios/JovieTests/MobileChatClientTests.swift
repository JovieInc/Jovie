import Foundation
import JovieKit
import Testing
@testable import Jovie

/// Keychain session store is process-wide. Parallel Swift Testing cases that
/// seed it will clobber each other and flake merge-group iOS tests.
actor NativeSessionTokenStoreTestLock {
  static let shared = NativeSessionTokenStoreTestLock()

  private var isHeld = false
  private var waiters: [CheckedContinuation<Void, Never>] = []

  func withExclusive<T: Sendable>(_ body: @Sendable () async throws -> T) async rethrows -> T {
    await acquire()
    defer { release() }
    return try await body()
  }

  private func acquire() async {
    guard isHeld else {
      isHeld = true
      return
    }

    await withCheckedContinuation { continuation in
      waiters.append(continuation)
    }
  }

  private func release() {
    if waiters.isEmpty {
      isHeld = false
      return
    }

    waiters.removeFirst().resume()
  }
}

func withNativeSessionTokenStoreTestIsolation<T: Sendable>(
  _ body: @Sendable () async throws -> T
) async rethrows -> T {
  try await NativeSessionTokenStoreTestLock.shared.withExclusive {
    NativeSessionTokenStore.clear()
    defer { NativeSessionTokenStore.clear() }
    return try await body()
  }
}

private actor NativeSessionTokenStoreTestObservation {
  struct Record: Equatable, Sendable {
    let savedToken: String
    let loadedToken: String?
  }

  private var activeSections = 0
  private var maxActiveSections = 0
  private var records: [Record] = []

  func beginSection() {
    activeSections += 1
    maxActiveSections = max(maxActiveSections, activeSections)
  }

  func endSection(savedToken: String, loadedToken: String?) {
    records.append(Record(savedToken: savedToken, loadedToken: loadedToken))
    activeSections -= 1
  }

  func result() -> (maxActiveSections: Int, records: [Record]) {
    (maxActiveSections, records)
  }
}

private actor NativeSessionTokenStoreTestGate {
  private var isOpen = false
  private var waiters: [CheckedContinuation<Void, Never>] = []

  func wait() async {
    guard !isOpen else { return }
    await withCheckedContinuation { continuation in
      waiters.append(continuation)
    }
  }

  func open() {
    guard !isOpen else { return }
    isOpen = true
    waiters.forEach { $0.resume() }
    waiters.removeAll()
  }
}

@Suite(.serialized)
struct NativeSessionTokenStoreTestLockTests {
  @Test func serializesConcurrentAsyncCriticalSectionsWithoutStoreClobbering() async {
    let observation = NativeSessionTokenStoreTestObservation()
    let tokens = ["first-critical-section", "second-critical-section"]
    let firstEntered = NativeSessionTokenStoreTestGate()
    let releaseFirst = NativeSessionTokenStoreTestGate()

    await withTaskGroup(of: Void.self) { group in
      group.addTask {
        await NativeSessionTokenStoreTestLock.shared.withExclusive {
          await observation.beginSection()
          NativeSessionTokenStore.save(
            token: tokens[0],
            userID: tokens[0],
            expiresAt: Date().addingTimeInterval(60 * 60)
          )
          await firstEntered.open()
          await releaseFirst.wait()
          let loadedToken = NativeSessionTokenStore.load()?.token
          await observation.endSection(savedToken: tokens[0], loadedToken: loadedToken)
        }
      }

      await firstEntered.wait()
      group.addTask {
        await NativeSessionTokenStoreTestLock.shared.withExclusive {
          await observation.beginSection()
          NativeSessionTokenStore.save(
            token: tokens[1],
            userID: tokens[1],
            expiresAt: Date().addingTimeInterval(60 * 60)
          )
          let loadedToken = NativeSessionTokenStore.load()?.token
          await observation.endSection(savedToken: tokens[1], loadedToken: loadedToken)
        }
      }

      // Give a broken pass-through actor enough time to enter the second
      // section while the first one is deliberately suspended.
      try? await Task.sleep(for: .milliseconds(50))
      let beforeRelease = await observation.result()
      #expect(beforeRelease.maxActiveSections == 1)
      #expect(beforeRelease.records.isEmpty)
      await releaseFirst.open()
    }

    let result = await observation.result()
    #expect(result.maxActiveSections == 1)
    #expect(result.records.count == tokens.count)
    #expect(result.records.map(\.savedToken).sorted() == tokens.sorted())
    #expect(result.records.map(\.loadedToken).compactMap { $0 }.sorted() == tokens.sorted())

    await NativeSessionTokenStoreTestLock.shared.withExclusive {
      NativeSessionTokenStore.clear()
    }
  }

  @Test func serializesFixtureAndTerminalClearAcrossTestSuites() async {
    let firstEntered = NativeSessionTokenStoreTestGate()
    let releaseFirst = NativeSessionTokenStoreTestGate()

    await withTaskGroup(of: Void.self) { group in
      group.addTask {
        await NativeSessionTokenStoreTestLock.shared.withExclusive {
          NativeSessionTokenStore.save(
            token: "fixture-token",
            userID: "fixture-user",
            expiresAt: Date().addingTimeInterval(60 * 60)
          )
          await firstEntered.open()
          await releaseFirst.wait()
          #expect(NativeSessionTokenStore.load()?.token == "fixture-token")
        }
      }

      await firstEntered.wait()
      group.addTask {
        await NativeSessionTokenStoreTestLock.shared.withExclusive {
          NativeSessionTokenStore.clear()
        }
      }

      // A broken or omitted test lock lets the terminal-unauthorized fixture
      // clear the first suite's token while its async request is suspended.
      try? await Task.sleep(for: .milliseconds(50))
      #expect(NativeSessionTokenStore.load()?.token == "fixture-token")
      await releaseFirst.open()
    }

    await NativeSessionTokenStoreTestLock.shared.withExclusive {
      NativeSessionTokenStore.clear()
    }
  }
}

private actor MockChatTokenProvider: TokenProviding {
  private var forceRefreshValues: [Bool] = []
  private let tokens: [String]

  init(tokens: [String]) {
    self.tokens = tokens
  }

  func bearerToken(forceRefresh: Bool) async throws -> String {
    forceRefreshValues.append(forceRefresh)
    let index = min(forceRefreshValues.count - 1, tokens.count - 1)
    return tokens[index]
  }

  func recordedForceRefreshValues() -> [Bool] {
    forceRefreshValues
  }
}

private final class MockChatURLProtocol: URLProtocol {
  static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    guard let handler = Self.requestHandler else {
      client?.urlProtocol(
        self,
        didFailWithError: NSError(domain: "MockChatURLProtocol", code: -1)
      )
      return
    }

    do {
      let (response, data) = try handler(request)
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}

private final class RequestRecorder: @unchecked Sendable {
  private let lock = NSLock()
  private var request: URLRequest?

  func record(_ request: URLRequest) {
    lock.lock()
    defer { lock.unlock() }
    self.request = request
  }

  func recordedRequest() -> URLRequest? {
    lock.lock()
    defer { lock.unlock() }
    return request
  }
}

@Suite(.serialized)
struct MobileChatClientTests {
  private func makeSession() -> URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockChatURLProtocol.self]
    return URLSession(configuration: configuration)
  }

  private func makeClient(
    tokenProvider: TokenProviding = MockChatTokenProvider(tokens: ["chat-token"])
  ) -> MobileChatClient {
    MobileChatClient(
      baseURL: URL(string: "https://jov.ie")!,
      session: makeSession(),
      tokenProvider: tokenProvider,
      requestTimeout: 7
    )
  }

  private func makeTurnRequest() -> MobileChatTurnRequest {
    MobileChatTurnRequest(
      conversationId: nil,
      clientTurnId: "client_turn_1",
      clientMessageId: "client_message_1",
      text: "What should I do next?",
      source: "ios"
    )
  }

  private func makeResponse(for request: URLRequest, statusCode: Int = 200) -> HTTPURLResponse {
    HTTPURLResponse(
      url: request.url!,
      statusCode: statusCode,
      httpVersion: nil,
      headerFields: nil
    )!
  }

  enum RefreshRequest: CaseIterable, Sendable {
    case list, detail, stream, eyesFree, eyesFreeConflict

    var data: Data {
      switch self {
      case .list:
        return Data(#"{"conversations":[]}"#.utf8)
      case .detail:
        return Data(#"{"conversation":{"id":"conv_1","title":"Test","createdAt":"2026-06-01","updatedAt":"2026-06-01"},"messages":[],"hasMore":false}"#.utf8)
      case .stream:
        return Data(#"{"type":"assistant.delta","clientTurnId":"client_turn_1","text":"Hello"}"#.utf8)
      case .eyesFree, .eyesFreeConflict:
        return Data(#"{"destination":"summer","status":"accepted","readback":"Captured"}"#.utf8)
      }
    }
  }

  enum ResponseSessionChange: CaseIterable, Sendable {
    case none, login, rotation
  }

  @Test(arguments: RefreshRequest.allCases, ResponseSessionChange.allCases)
  func successHeaderRequiresTheDispatchedSession(
    operation: RefreshRequest,
    sessionChange: ResponseSessionChange
  ) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded() + 3_600)
      NativeSessionTokenStore.save(token: "request-a", userID: "user-a", expiresAt: expiry)
      let parallel = try #require(NativeSessionTokenStore.requestAuthorization())
      MockChatURLProtocol.requestHandler = { request in
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer request-a")
        // The request has captured A; change storage before delivering its response.
        if sessionChange == .login {
          NativeSessionTokenStore.save(token: "login-b", userID: "user-b", expiresAt: expiry)
        } else if sessionChange == .rotation {
          let earlier = HTTPURLResponse(
            url: request.url!, statusCode: 200, httpVersion: nil,
            headerFields: ["set-auth-token": "parallel-roll"]
          )!
          NativeSessionTokenStore.refresh(from: earlier, authorizedBy: parallel)
        }
        let response = HTTPURLResponse(
          url: request.url!,
          statusCode: operation == .eyesFreeConflict ? 409 : 200,
          httpVersion: nil,
          headerFields: ["set-auth-token": "rolled-a"]
        )!
        return (response, operation.data)
      }
      defer { MockChatURLProtocol.requestHandler = nil }

      let client = makeClient(tokenProvider: NativeSessionTokenProvider())
      switch operation {
      case .list:
        #expect(try await client.listConversations().isEmpty)
      case .detail:
        #expect(try await client.fetchConversation(id: "conv_1", limit: 20).conversation.id == "conv_1")
      case .stream:
        #expect(try await client.sendTurn(makeTurnRequest()) == [
          .assistantDelta(clientTurnId: "client_turn_1", text: "Hello"),
        ])
      case .eyesFree, .eyesFreeConflict:
        let response = try await client.submitEyesFreeCapture(EyesFreeCaptureAPIRequest(
          destination: "summer", transcript: "Capture this",
          clientTurnId: "turn_1234", clientMessageId: "msg_1234"
        ))
        #expect(response.readback == "Captured")
      }

      let stored = try #require(NativeSessionTokenStore.load())
      if sessionChange == .login {
        #expect(stored == NativeStoredSession(userID: "user-b", token: "login-b", expiresAt: expiry))
      } else {
        #expect(stored.userID == "user-a")
        #expect(stored.token == (sessionChange == .rotation ? "parallel-roll" : "rolled-a"))
        #expect(stored.expiresAt > expiry)
      }
    }
  }

  @Test func parsesChatStreamEvents() async throws {
    let requestRecorder = RequestRecorder()
    let tokenProvider = MockChatTokenProvider(tokens: ["chat-token"])
    MockChatURLProtocol.requestHandler = { request in
      requestRecorder.record(request)

      let ndjson = """
      {"type":"turn.reserved","conversationId":"conv_1","turnId":"turn_1","clientTurnId":"client_turn_1","eveWorkId":"ini_eve_1"}
      {"type":"turn.state","clientTurnId":"client_turn_1","state":"queued","eveWorkId":"ini_eve_1"}
      {"type":"assistant.delta","clientTurnId":"client_turn_1","text":"Hel"}
      {"type":"ignored.event","clientTurnId":"client_turn_1"}
      {"type":"assistant.completed","clientTurnId":"client_turn_1","conversationId":"conv_1","turnId":"turn_1","text":"Hello"}
      {"type":"web.handoff","clientTurnId":"client_turn_1","conversationId":"conv_1","url":"/settings","summary":"Continue on web"}
      {"type":"error","errorCode":"RATE_LIMITED","message":"Slow down"}
      """

      return (makeResponse(for: request), Data(ndjson.utf8))
    }

    let client = makeClient(tokenProvider: tokenProvider)
    let events = try await client.sendTurn(makeTurnRequest())
    let request = try #require(requestRecorder.recordedRequest())

    #expect(request.url?.path == "/api/mobile/v1/chat/turns")
    #expect(request.httpMethod == "POST")
    #expect(request.timeoutInterval == 7)
    #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer chat-token")
    #expect(request.value(forHTTPHeaderField: "Accept") == "application/x-ndjson")

    #expect(events == [
      .turnReserved(conversationId: "conv_1", turnId: "turn_1", clientTurnId: "client_turn_1"),
      .turnState(clientTurnId: "client_turn_1", state: "queued", eveWorkId: "ini_eve_1"),
      .assistantDelta(clientTurnId: "client_turn_1", text: "Hel"),
      .assistantCompleted(
        clientTurnId: "client_turn_1",
        conversationId: "conv_1",
        turnId: "turn_1",
        text: "Hello"
      ),
      .webHandoff(
        clientTurnId: "client_turn_1",
        conversationId: "conv_1",
        url: URL(string: "https://jov.ie/settings")!,
        summary: "Continue on web"
      ),
      .error(code: "RATE_LIMITED", message: "Slow down"),
    ])
    #expect(await tokenProvider.recordedForceRefreshValues() == [false])
  }

  @Test func mapsMalformedChatStreamToDecodingFailed() async throws {
    MockChatURLProtocol.requestHandler = { request in
      (makeResponse(for: request), Data("{".utf8))
    }

    let client = makeClient()

    await #expect(throws: MobileChatClientError.decodingFailed) {
      _ = try await client.sendTurn(makeTurnRequest())
    }
  }

  @Test func mapsEmptyChatStreamToStreamFailed() async throws {
    MockChatURLProtocol.requestHandler = { request in
      (makeResponse(for: request), Data())
    }

    let client = makeClient()

    await #expect(throws: MobileChatClientError.streamFailed(message: "Native chat returned no events.")) {
      _ = try await client.sendTurn(makeTurnRequest())
    }
  }

  @Test func listConversationsReturnsDecodedSummaries() async throws {
    let requestRecorder = RequestRecorder()
    MockChatURLProtocol.requestHandler = { request in
      requestRecorder.record(request)
      let payload = MobileConversationListResponse(conversations: [
        MobileConversationSummary(
          id: "conv_1",
          title: "Launch plan",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
          latestMessageRole: "assistant",
          latestTurnStatus: "completed"
        ),
      ])
      return (makeResponse(for: request), try JSONEncoder().encode(payload))
    }

    let client = makeClient()
    let conversations = try await client.listConversations(limit: 20)
    let request = try #require(requestRecorder.recordedRequest())

    #expect(request.url?.path == "/api/mobile/v1/chat/conversations")
    #expect(request.url?.query?.contains("limit=20") == true)
    #expect(request.httpMethod == "GET")
    #expect(conversations.map(\.id) == ["conv_1"])
  }

  @Test func fetchConversationReturnsDecodedDetail() async throws {
    let requestRecorder = RequestRecorder()
    MockChatURLProtocol.requestHandler = { request in
      requestRecorder.record(request)
      let payload = MobileConversationDetailResponse(
        conversation: MobileConversationRecord(
          id: "conv_1",
          title: "Launch plan",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z"
        ),
        messages: [],
        hasMore: false
      )
      return (makeResponse(for: request), try JSONEncoder().encode(payload))
    }

    let client = makeClient()
    let detail = try await client.fetchConversation(id: "conv_1", limit: 100)
    let request = try #require(requestRecorder.recordedRequest())

    #expect(request.url?.path == "/api/mobile/v1/chat/conversations/conv_1")
    #expect(request.url?.query?.contains("limit=100") == true)
    #expect(request.url?.query?.contains("before=") == false)
    #expect(detail.conversation.id == "conv_1")
    #expect(detail.hasMore == false)
  }

  @Test func fetchConversationIncludesBeforeCursorForOlderWindow() async throws {
    let requestRecorder = RequestRecorder()
    MockChatURLProtocol.requestHandler = { request in
      requestRecorder.record(request)
      let payload = MobileConversationDetailResponse(
        conversation: MobileConversationRecord(
          id: "conv_1",
          title: "Launch plan",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z"
        ),
        messages: [],
        hasMore: true
      )
      return (makeResponse(for: request), try JSONEncoder().encode(payload))
    }

    let client = makeClient()
    _ = try await client.fetchConversation(
      id: "conv_1",
      limit: ChatTranscriptWindow.initialMessageLimit,
      before: "2026-06-01T00:00:00.000Z"
    )
    let request = try #require(requestRecorder.recordedRequest())

    let query = request.url?.query ?? ""
    #expect(query.contains("limit=40"))
    #expect(query.contains("before="))
    #expect(query.contains("2026-06-01"))
  }

  @Test func sendTurnRetriesWithFreshTokenAfterUnauthorized() async throws {
    let tokenProvider = MockChatTokenProvider(tokens: ["stale-chat-token", "fresh-chat-token"])
    var requestCount = 0

    MockChatURLProtocol.requestHandler = { request in
      requestCount += 1
      if requestCount == 1 {
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer stale-chat-token")
        return (makeResponse(for: request, statusCode: 401), Data())
      }

      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer fresh-chat-token")
      let ndjson = """
      {"type":"assistant.completed","clientTurnId":"client_turn_1","conversationId":"conv_1","turnId":"turn_1","text":"Hello"}
      """
      return (makeResponse(for: request), Data(ndjson.utf8))
    }

    let client = makeClient(tokenProvider: tokenProvider)

    let events = try await client.sendTurn(makeTurnRequest())

    #expect(events == [
      .assistantCompleted(
        clientTurnId: "client_turn_1",
        conversationId: "conv_1",
        turnId: "turn_1",
        text: "Hello"
      ),
    ])
    #expect(await tokenProvider.recordedForceRefreshValues() == [false, true])
  }

  @Test func listConversationsRetriesWithFreshTokenAfterUnauthorized() async throws {
    let tokenProvider = MockChatTokenProvider(tokens: ["stale-chat-token", "fresh-chat-token"])
    var requestCount = 0

    MockChatURLProtocol.requestHandler = { request in
      requestCount += 1
      if requestCount == 1 {
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer stale-chat-token")
        return (makeResponse(for: request, statusCode: 401), Data())
      }

      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer fresh-chat-token")
      let payload = MobileConversationListResponse(conversations: [])
      return (makeResponse(for: request), try JSONEncoder().encode(payload))
    }

    let client = makeClient(tokenProvider: tokenProvider)
    let conversations = try await client.listConversations(limit: 20)

    #expect(conversations.isEmpty)
    #expect(await tokenProvider.recordedForceRefreshValues() == [false, true])
  }

  @Test func listConversationsDoesNotRetryUnauthorizedWhenTokenCannotRefresh() async throws {
    try await NativeSessionTokenStoreTestLock.shared.withExclusive {
      NativeSessionTokenStore.clear()
      defer { NativeSessionTokenStore.clear() }
      NativeSessionTokenStore.save(
        token: "stale-native-token",
        userID: "user_chat_401",
        expiresAt: Date().addingTimeInterval(60 * 60)
      )
      #expect(NativeSessionTokenStore.load()?.token == "stale-native-token")

      var requestCount = 0
      MockChatURLProtocol.requestHandler = { request in
        requestCount += 1
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer stale-native-token")
        return (makeResponse(for: request, statusCode: 401), Data())
      }

      let client = MobileChatClient(
        baseURL: URL(string: "https://jov.ie")!,
        session: makeSession(),
        tokenProvider: NativeSessionTokenProvider()
      )

      await #expect(throws: MobileChatClientError.requestFailed(statusCode: 401)) {
        _ = try await client.listConversations(limit: 20)
      }
      #expect(requestCount == 1)
      #expect(NativeSessionTokenStore.load() == nil)
    }
  }

  @Test func sendTurnDoesNotRetryUnauthorizedWhenTokenCannotRefresh() async throws {
    try await NativeSessionTokenStoreTestLock.shared.withExclusive {
      NativeSessionTokenStore.clear()
      defer { NativeSessionTokenStore.clear() }
      NativeSessionTokenStore.save(
        token: "stale-native-token",
        userID: "user_sendturn_401",
        expiresAt: Date().addingTimeInterval(60 * 60)
      )
      #expect(NativeSessionTokenStore.load()?.token == "stale-native-token")

      var requestCount = 0
      MockChatURLProtocol.requestHandler = { request in
        requestCount += 1
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer stale-native-token")
        return (makeResponse(for: request, statusCode: 401), Data())
      }

      let client = MobileChatClient(
        baseURL: URL(string: "https://jov.ie")!,
        session: makeSession(),
        tokenProvider: NativeSessionTokenProvider()
      )

      await #expect(throws: MobileChatClientError.requestFailed(statusCode: 401)) {
        _ = try await client.sendTurn(makeTurnRequest())
      }
      #expect(requestCount == 1)
      #expect(NativeSessionTokenStore.load() == nil)
    }
  }

  @Test func sendTurnMapsNonSuccessStatusToRequestFailed() async throws {
    MockChatURLProtocol.requestHandler = { request in
      (makeResponse(for: request, statusCode: 500), Data())
    }

    let client = makeClient()

    await #expect(throws: MobileChatClientError.requestFailed(statusCode: 500)) {
      _ = try await client.sendTurn(makeTurnRequest())
    }
  }

  @Test func sendTurnMapsURLErrorToTransportFailed() async throws {
    MockChatURLProtocol.requestHandler = { _ in
      throw URLError(.notConnectedToInternet)
    }

    let client = makeClient()

    await #expect(
      throws: MobileChatClientError.transportFailed(code: URLError.notConnectedToInternet.rawValue)
    ) {
      _ = try await client.sendTurn(makeTurnRequest())
    }
  }

  @Test func cachedChatSnapshotRoundTripsThroughChatCache() async {
    let cache = ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-cache")!)
    await cache.remove(for: "user_chat_cache")

    let snapshot = CachedChatSnapshot(
      conversations: [
        MobileConversationSummary(
          id: "conv_1",
          title: "Launch plan",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
          latestMessageRole: "assistant",
          latestTurnStatus: "completed"
        ),
      ],
      messagesByConversationID: [
        "conv_1": [
          MobileConversationMessage(
            id: "msg_1",
            role: "assistant",
            content: "Hello from Jovie",
            clientMessageId: "client_1",
            turnId: "turn_1",
            turnStatus: "completed",
            createdAt: "2026-06-02T00:00:00.000Z",
            requiresWebHandoff: false
          ),
        ],
      ],
      cachedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )

    await cache.store(snapshot, for: "user_chat_cache")
    let loaded = await cache.load(for: "user_chat_cache")

    #expect(loaded == snapshot)
  }

  @Test func ovieChatCacheDoesNotCollideWithArtistCache() async {
    let cache = ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-cache-ws")!)
    await cache.remove(for: "user_ws")
    func snapshot(_ id: String, _ title: String) -> CachedChatSnapshot {
      CachedChatSnapshot(
        conversations: [
          MobileConversationSummary(
            id: id,
            title: title,
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
            latestMessageRole: "assistant",
            latestTurnStatus: "completed"
          ),
        ],
        messagesByConversationID: [:],
        cachedAt: Date(timeIntervalSince1970: 1_700_000_000)
      )
    }
    let artist = snapshot("conv_artist", "Launch plan")
    let ovie = snapshot("conv_ov", "OV | Summer")
    await cache.store(artist, for: "user_ws", workspace: .jovie)
    await cache.store(ovie, for: "user_ws", workspace: .ovie)
    #expect(await cache.load(for: "user_ws", workspace: .jovie) == artist)
    #expect(await cache.load(for: "user_ws", workspace: .ovie) == ovie)
  }

  @Test func turnRequestEncodesChatModeOnlyWhenOvie() throws {
    func json(_ request: MobileChatTurnRequest) throws -> [String: Any] {
      let data = try JSONEncoder().encode(request)
      return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }
    let artist = try json(
      MobileChatTurnRequest(
        conversationId: nil,
        clientTurnId: "client_turn_1",
        clientMessageId: "client_message_1",
        text: "What should I do next?",
        source: "typed"
      )
    )
    let ovie = try json(
      MobileChatTurnRequest(
        conversationId: nil,
        clientTurnId: "client_turn_1",
        clientMessageId: "client_message_1",
        text: "Need a taste decision",
        source: "typed",
        chatMode: "ov"
      )
    )
    #expect(artist["chatMode"] == nil)
    #expect(ovie["chatMode"] as? String == "ov")
  }

  @Test func eyesFreeRequestEncodesClosedDestination() throws {
    let data = try JSONEncoder().encode(
      EyesFreeCaptureAPIRequest(
        destination: "summer",
        transcript: "what is blocked",
        clientTurnId: "turn_1234",
        clientMessageId: "msg_1234"
      )
    )
    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    #expect(json?["destination"] as? String == "summer")
    #expect(json?["transcript"] as? String == "what is blocked")
    #expect(json?["clientTurnId"] as? String == "turn_1234")
  }
}

extension MobileChatClientTests {
  private func perform(_ operation: RefreshRequest, on client: MobileChatClient) async throws {
    switch operation {
    case .list: #expect(try await client.listConversations().isEmpty)
    case .detail: #expect(try await client.fetchConversation(id: "conv_1", before: "older").conversation.id == "conv_1")
    case .stream: #expect(try await client.sendTurn(makeTurnRequest()).count == 1)
    case .eyesFree, .eyesFreeConflict:
      #expect(try await client.submitEyesFreeCapture(EyesFreeCaptureAPIRequest(
        destination: "summer", transcript: "Capture this", clientTurnId: "turn_1234", clientMessageId: "msg_1234"
      )).readback == "Captured")
    }
  }

  @Test(arguments: RefreshRequest.allCases,
        ["current", "new-user", "same-login", "retry-success", "retry-rejected", "retry-revised", "same-bearer", "cancel"])
  func ownedChatUsesOnlyTheDispatchedAuthority(operation: RefreshRequest, outcome: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "t0", userID: "a", expiresAt: .distantFuture)
      let owner = NativeSessionTokenStore.captureOwnership()
      let first = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: owner)
      var requests = 0
      var preserved = NativeSessionTokenStore.captureSessionContext()
      MockChatURLProtocol.requestHandler = { request in
        requests += 1
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer \(requests == 1 ? "t0" : "t1")")
        if operation == .list || operation == .detail {
          #expect(request.url?.query?.contains("workspace=ov") == true)
        }
        let response: (Int, String?) -> HTTPURLResponse = { status, token in
          HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                          headerFields: token.map { ["set-auth-token": $0] })!
        }
        if outcome == "cancel" { throw URLError(.cancelled) }
        if requests == 1 {
          switch outcome {
          case "new-user", "same-login":
            NativeSessionTokenStore.save(token: outcome == "same-login" ? "t0" : "b",
                                        userID: outcome == "same-login" ? "a" : "b", expiresAt: .distantFuture)
          case "retry-success", "retry-rejected", "retry-revised", "same-bearer":
            NativeSessionTokenStore.refresh(
              from: response(200, outcome == "same-bearer" ? "t0" : "t1"), authorizedBy: first
            )
          default: break
          }
        } else if outcome == "retry-success" {
          return (response(operation == .eyesFreeConflict ? 409 : 200, "t2"), operation.data)
        } else if outcome == "retry-revised" {
          let retry = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: owner)
          NativeSessionTokenStore.refresh(from: response(200, "t2"), authorizedBy: retry)
        }
        preserved = NativeSessionTokenStore.captureSessionContext()
        return (response(401, nil), Data())
      }
      defer { MockChatURLProtocol.requestHandler = nil }
      let client = MobileChatClient(
        baseURL: URL(string: "https://jov.ie")!, session: makeSession(), tokenProvider: NativeSessionTokenProvider(),
        identity: NativeChatIdentity(userID: "a", ownership: owner, workspace: .ovie)
      )
      if outcome == "retry-success" {
        try await perform(operation, on: client)
        #expect(NativeSessionTokenStore.load()?.token == "t2")
        #expect(NativeSessionTokenStore.captureOwnership() == owner)
      } else if outcome == "current" || outcome == "retry-rejected" {
        do {
          try await perform(operation, on: client)
          Issue.record("A current rejected bearer must produce an expiry receipt")
        } catch let NativeSessionRequestError.expired(receipt) {
          #expect(receipt.userID == "a")
          #expect(receipt.ownership == NativeSessionTokenStore.captureOwnership())
          #expect(NativeSessionTokenStore.load() == nil)
        }
      } else if outcome == "cancel" {
        await #expect(throws: CancellationError.self) { try await perform(operation, on: client) }
        #expect(NativeSessionTokenStore.captureSessionContext() == preserved)
      } else {
        await #expect(throws: NativeSessionRequestError.superseded) { try await perform(operation, on: client) }
        #expect(NativeSessionTokenStore.captureSessionContext() == preserved)
      }
      #expect(requests == (outcome.hasPrefix("retry-") ? 2 : 1))
    }
  }

  @Test(arguments: RefreshRequest.allCases, [false, true])
  func ownedChatCannotAcquireAReplacement(operation: RefreshRequest, sameLogin: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: .distantFuture)
      let identity = NativeChatIdentity(userID: "a", ownership: NativeSessionTokenStore.captureOwnership(), workspace: .jovie)
      NativeSessionTokenStore.save(token: sameLogin ? "a" : "b", userID: sameLogin ? "a" : "b", expiresAt: .distantFuture)
      let preserved = NativeSessionTokenStore.captureSessionContext()
      let recorder = RequestRecorder()
      MockChatURLProtocol.requestHandler = { request in recorder.record(request); throw URLError(.badServerResponse) }
      defer { MockChatURLProtocol.requestHandler = nil }
      let client = MobileChatClient(baseURL: URL(string: "https://jov.ie")!, session: makeSession(),
                                    tokenProvider: NativeSessionTokenProvider(), identity: identity)
      await #expect(throws: NativeSessionRequestError.superseded) { try await perform(operation, on: client) }
      #expect(recorder.recordedRequest() == nil)
      #expect(NativeSessionTokenStore.captureSessionContext() == preserved)
    }
  }

  @Test(arguments: RefreshRequest.allCases, [false, true])
  func ownedChatUnmanagedRetryCannotMutateNativeSession(operation: RefreshRequest, succeed: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "t0", userID: "a", expiresAt: .distantFuture)
      let preserved = NativeSessionTokenStore.captureSessionContext()
      let provider = MockChatTokenProvider(tokens: ["t0", "t1"])
      var requests = 0
      MockChatURLProtocol.requestHandler = { request in
        requests += 1
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer \(requests == 1 ? "t0" : "t1")")
        let successStatus = operation == .eyesFreeConflict ? 409 : 200
        return (HTTPURLResponse(url: request.url!, statusCode: requests == 2 && succeed ? successStatus : 401,
                                httpVersion: nil, headerFields: ["set-auth-token": "unmanaged"])!, operation.data)
      }
      defer { MockChatURLProtocol.requestHandler = nil }
      let client = MobileChatClient(baseURL: URL(string: "https://jov.ie")!, session: makeSession(), tokenProvider: provider,
                                    identity: NativeChatIdentity(userID: "a", ownership: preserved.ownership, workspace: .jovie))
      if succeed { try await perform(operation, on: client) }
      else {
        await #expect(throws: MobileChatClientError.requestFailed(statusCode: 401)) { try await perform(operation, on: client) }
      }
      #expect(requests == 2)
      #expect(await provider.recordedForceRefreshValues() == [false, true])
      #expect(NativeSessionTokenStore.captureSessionContext() == preserved)
    }
  }

  @Test func ownedStreamCancellationAfterPublishingDoesNotBecomeInvalidResponse() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: .distantFuture)
      let preserved = NativeSessionTokenStore.captureSessionContext()
      MockChatURLProtocol.requestHandler = { request in
        (makeResponse(for: request), RefreshRequest.stream.data + Data("\n".utf8))
      }
      defer { MockChatURLProtocol.requestHandler = nil }
      let client = MobileChatClient(baseURL: URL(string: "https://jov.ie")!, session: makeSession(),
        tokenProvider: NativeSessionTokenProvider(),
        identity: NativeChatIdentity(userID: "a", ownership: preserved.ownership, workspace: .jovie))
      let task = Task {
        try await client.sendTurn(makeTurnRequest(), onEvent: { event in
          #expect(event == .assistantDelta(clientTurnId: "client_turn_1", text: "Hello"))
          withUnsafeCurrentTask { $0?.cancel() }
        })
      }
      await #expect(throws: CancellationError.self) { try await task.value }
      #expect(NativeSessionTokenStore.captureSessionContext() == preserved)
    }
  }

  @Test(arguments: [400, 403, 404, 409])
  func ownedEyesFreeStillDecodesApplicationResponsesWhileStreamRejects(status: Int) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: .distantFuture)
      let preserved = NativeSessionTokenStore.captureSessionContext()
      MockChatURLProtocol.requestHandler = { request in
        (makeResponse(for: request, statusCode: status), RefreshRequest.eyesFree.data)
      }
      defer { MockChatURLProtocol.requestHandler = nil }
      let client = MobileChatClient(baseURL: URL(string: "https://jov.ie")!, session: makeSession(),
        tokenProvider: NativeSessionTokenProvider(),
        identity: NativeChatIdentity(userID: "a", ownership: preserved.ownership, workspace: .jovie))
      try await perform(.eyesFree, on: client)
      await #expect(throws: MobileChatClientError.requestFailed(statusCode: status)) {
        try await client.sendTurn(makeTurnRequest())
      }
      #expect(NativeSessionTokenStore.captureOwnership() == preserved.ownership)
    }
  }

  @Test(arguments: ["retry", "cancel", "replacement", "unmanaged-replacement"])
  func streamAuthorizationCallbackPrecedesEveryDispatchAndEvent(outcome: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "t0", userID: "a", expiresAt: .distantFuture)
      let owner = NativeSessionTokenStore.captureOwnership()
      let first = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: owner)
      let calls = AuthorizationRecorder()
      MockChatURLProtocol.requestHandler = { request in
        let count = calls.dispatched()
        if count == 1 {
          NativeSessionTokenStore.refresh(from: HTTPURLResponse(url: request.url!, statusCode: 200,
                                          httpVersion: nil, headerFields: ["set-auth-token": "t1"])!, authorizedBy: first)
        }
        return (makeResponse(for: request, statusCode: count == 1 ? 401 : 200), RefreshRequest.stream.data)
      }
      defer { MockChatURLProtocol.requestHandler = nil }
      let provider: any TokenProviding = outcome == "unmanaged-replacement"
        ? MockChatTokenProvider(tokens: ["t0"]) : NativeSessionTokenProvider()
      let client: any MobileChatClientProtocol = MobileChatClient(
        baseURL: URL(string: "https://jov.ie")!, session: makeSession(), tokenProvider: provider,
        identity: NativeChatIdentity(userID: "a", ownership: owner, workspace: .jovie)
      )
      let send = {
        try await client.sendTurn(makeTurnRequest(), onAuthorization: { captured in
          #expect(captured == (outcome == "unmanaged-replacement" ? nil : owner))
          calls.authorized()
          if outcome == "cancel" { throw CancellationError() }
          if outcome.hasSuffix("replacement") { NativeSessionTokenStore.save(token: "b", userID: "b", expiresAt: .distantFuture) }
        }, onEvent: { _ in #expect(calls.counts() == [2, 2]) })
      }
      if outcome == "retry" { #expect(try await send().count == 1) }
      else if outcome == "cancel" { await #expect(throws: CancellationError.self) { try await send() } }
      else { await #expect(throws: NativeSessionRequestError.superseded) { try await send() } }
      #expect(calls.counts() == (outcome == "retry" ? [2, 2] : [1, 0]))
      if outcome.hasSuffix("replacement") { #expect(NativeSessionTokenStore.load()?.token == "b") }
    }
  }
}

private final class AuthorizationRecorder: @unchecked Sendable {
  private let lock = NSLock()
  private var authorizations = 0
  private var dispatches = 0
  func authorized() { lock.lock(); defer { lock.unlock() }; authorizations += 1 }
  func dispatched() -> Int {
    lock.lock(); defer { lock.unlock() }
    dispatches += 1
    #expect(authorizations == dispatches)
    return dispatches
  }
  func counts() -> [Int] { lock.lock(); defer { lock.unlock() }; return [authorizations, dispatches] }
}

@Suite(.serialized)
struct NativeSessionRefreshTests {
  private func response(token: String?) -> HTTPURLResponse {
    HTTPURLResponse(
      url: URL(string: "https://jov.ie/api/mobile/v1/me")!,
      statusCode: 200,
      httpVersion: nil,
      headerFields: token.map { ["set-auth-token": $0] }
    )!
  }

  @Test(arguments: [false, true])
  func explicitLoginFencesOldHeadersEvenWhenIdentityAndBearerAreReused(sameLogin: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let expiry = Date().addingTimeInterval(3_600)
      NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: expiry)
      let oldRequest = try #require(NativeSessionTokenStore.requestAuthorization())
      NativeSessionTokenStore.save(
        token: sameLogin ? "a" : "b", userID: sameLogin ? "a" : "b", expiresAt: expiry
      )
      let newRequest = try #require(NativeSessionTokenStore.requestAuthorization())
      let before = NativeSessionTokenStore.load()
      #expect(newRequest != oldRequest)

      NativeSessionTokenStore.refresh(from: response(token: "late-a"), authorizedBy: oldRequest)

      #expect(NativeSessionTokenStore.load() == before)
      #expect(NativeSessionTokenStore.requestAuthorization() == newRequest)
    }
  }

  @Test func clearedSessionCannotBeResurrectedByAResponse() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: Date().addingTimeInterval(3_600))
      let request = try #require(NativeSessionTokenStore.requestAuthorization())
      NativeSessionTokenStore.clear()
      NativeSessionTokenStore.refresh(from: response(token: "late-a"), authorizedBy: request)
      #expect(NativeSessionTokenStore.load() == nil)
      #expect(NativeSessionTokenStore.requestAuthorization() == nil)
    }
  }

  @Test func parallelOldBearerCannotOverwriteARotationOrAnABA() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "t0", userID: "a", expiresAt: Date().addingTimeInterval(3_600))
      let first = try #require(NativeSessionTokenStore.requestAuthorization())
      let parallel = try #require(NativeSessionTokenStore.requestAuthorization())
      #expect(first == parallel)
      NativeSessionTokenStore.refresh(from: response(token: "t1"), authorizedBy: first)
      let rotated = try #require(NativeSessionTokenStore.requestAuthorization())
      #expect(rotated.bearerToken == "t1")
      NativeSessionTokenStore.refresh(from: response(token: "late-t0"), authorizedBy: parallel)
      #expect(NativeSessionTokenStore.requestAuthorization() == rotated)

      // Token equality alone would let the first request overwrite this newer revision.
      NativeSessionTokenStore.refresh(from: response(token: "t0"), authorizedBy: rotated)
      let returnedToT0 = try #require(NativeSessionTokenStore.requestAuthorization())
      NativeSessionTokenStore.refresh(from: response(token: "late-again"), authorizedBy: first)
      #expect(NativeSessionTokenStore.requestAuthorization() == returnedToT0)
      #expect(returnedToT0.bearerToken == "t0")
    }
  }

  @Test func absentEmptyAndUnmanagedHeadersDoNotChangeTheSession() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: Date().addingTimeInterval(3_600))
      let request = try #require(NativeSessionTokenStore.requestAuthorization())
      NativeSessionTokenStore.refresh(from: response(token: nil), authorizedBy: request)
      NativeSessionTokenStore.refresh(from: response(token: ""), authorizedBy: request)
      NativeSessionTokenStore.refresh(
        from: response(token: "unmanaged"),
        authorizedBy: NativeRequestAuthorization(unmanagedBearerToken: "a")
      )
      #expect(NativeSessionTokenStore.requestAuthorization() == request)
    }
  }

  @Test func nativeProviderCapturesPerRequestAndStillRejectsForceRefresh() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let provider: TokenProviding = NativeSessionTokenProvider()
      await #expect(throws: APIClientError.missingToken) {
        _ = try await provider.requestAuthorization(forceRefresh: false)
      }
      NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: Date().addingTimeInterval(3_600))
      let first = try await provider.requestAuthorization(forceRefresh: false)
      NativeSessionTokenStore.save(token: "b", userID: "b", expiresAt: Date().addingTimeInterval(3_600))
      let second = try await provider.requestAuthorization(forceRefresh: false)
      #expect(first.bearerToken == "a")
      #expect(second.bearerToken == "b")
      await #expect(throws: APIClientError.missingToken) {
        _ = try await provider.requestAuthorization(forceRefresh: true)
      }
      #expect(NativeSessionTokenStore.requestAuthorization() == second)

      NativeSessionTokenStore.save(token: "expired", userID: "a", expiresAt: .distantPast)
      #expect(NativeSessionTokenStore.requestAuthorization() == nil)
      #expect(NativeSessionTokenStore.load() == nil)
    }
  }

  @Test func concurrentStoreOperationsNeverExposeMixedTokenAndMetadata() async {
    await withNativeSessionTokenStoreTestIsolation {
      await withTaskGroup(of: Void.self) { group in
        for index in 0..<24 {
          group.addTask {
            let value = "session-\(index)"
            let expiry = Date(timeIntervalSince1970: 4_102_444_800 + Double(index))
            NativeSessionTokenStore.save(token: value, userID: value, expiresAt: expiry)
            if let stored = NativeSessionTokenStore.load() {
              #expect(stored.token == stored.userID)
              let storedIndex = Int(stored.userID.dropFirst("session-".count))
              #expect(storedIndex != nil)
              #expect(stored.expiresAt.timeIntervalSince1970 == 4_102_444_800 + Double(storedIndex ?? -1))
            }
            if index.isMultiple(of: 3) { NativeSessionTokenStore.clear() }
          }
        }
      }
    }
  }
}

func nativeExpiryReceipt(
  from operation: () throws -> NativeRequestAuthorization
) throws -> NativeSessionExpiryReceipt {
  do {
    _ = try operation()
    Issue.record("Expected a native expiry receipt")
    throw APIClientError.invalidResponse
  } catch let NativeSessionRequestError.expired(receipt) {
    return receipt
  }
}

extension NativeSessionRefreshTests {
  @Test(arguments: ["unauthorized", "passive", "acquisition"])
  func ownedExpiryKeepsOneReceiptAcrossReadersAndParallelFailures(source: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: .distantFuture)
      let owner = NativeSessionTokenStore.captureOwnership()
      let authorization = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: owner)
      if source != "unauthorized" {
        UserDefaults.standard.set(1.0, forKey: "ie.jov.Jovie.nativeSession.expiresAt")
        #expect(NativeSessionTokenStore.captureOwnership() == owner)
        if source == "passive" { #expect(NativeSessionTokenStore.load() == nil) }
      }
      let receipt = try nativeExpiryReceipt {
        if source == "unauthorized" {
          return try NativeSessionTokenStore.resolveUnauthorized(
            authorizedBy: authorization, allowRetry: true
          )
        }
        return try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: owner)
      }
      #expect(receipt.userID == "a")
      #expect(receipt.ownership != owner)
      #expect(NativeSessionTokenStore.captureOwnership() == receipt.ownership)
      #expect(try nativeExpiryReceipt {
        try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: owner)
      } == receipt)
      #expect(try nativeExpiryReceipt {
        try NativeSessionTokenStore.resolveUnauthorized(authorizedBy: authorization, allowRetry: true)
      } == receipt)
      #expect(try nativeExpiryReceipt {
        try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: receipt.ownership)
      } == receipt)
      #expect(NativeSessionTokenStore.requestAuthorization() == nil)
      #expect(NativeSessionTokenStore.captureOwnership() == receipt.ownership)
    }
  }

  @Test(arguments: ["clear", "same-login", "later-expiry"])
  func anOldRequestCannotAdoptAnotherEmptyOrReplacementState(change: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: .distantFuture)
      let owner = NativeSessionTokenStore.captureOwnership()
      let authorization = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: owner)
      _ = try nativeExpiryReceipt {
        try NativeSessionTokenStore.resolveUnauthorized(authorizedBy: authorization, allowRetry: true)
      }
      if change == "clear" {
        NativeSessionTokenStore.clear()
      } else {
        NativeSessionTokenStore.save(token: "a", userID: "a", expiresAt: .distantFuture)
        if change == "later-expiry" {
          UserDefaults.standard.set(1.0, forKey: "ie.jov.Jovie.nativeSession.expiresAt")
          #expect(NativeSessionTokenStore.load() == nil)
        }
      }
      let replacement = NativeSessionTokenStore.captureSessionContext()
      #expect(throws: NativeSessionRequestError.superseded) {
        try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: owner)
      }
      #expect(throws: NativeSessionRequestError.superseded) {
        try NativeSessionTokenStore.resolveUnauthorized(authorizedBy: authorization, allowRetry: true)
      }
      #expect(NativeSessionTokenStore.captureSessionContext() == replacement)
    }
  }

  @Test func missingAcquisitionUsesTheObservedEmptyGenerationUntilExplicitClear() async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      let emptyOwner = NativeSessionTokenStore.captureOwnership()
      let receipt = try nativeExpiryReceipt {
        try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: emptyOwner)
      }
      #expect(receipt.ownership == emptyOwner)
      #expect(receipt.userID == nil)
      #expect(try nativeExpiryReceipt {
        try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: emptyOwner)
      } == receipt)
      NativeSessionTokenStore.clear()
      #expect(throws: NativeSessionRequestError.superseded) {
        try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: emptyOwner)
      }
    }
  }

  @Test(arguments: [false, true])
  func revisedBearerCannotBeClearedByOldOrRetriedRejection(sameBearer: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation {
      NativeSessionTokenStore.save(token: "t0", userID: "a", expiresAt: .distantFuture)
      let owner = NativeSessionTokenStore.captureOwnership()
      let first = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: owner)
      NativeSessionTokenStore.refresh(from: response(token: sameBearer ? "t0" : "t1"), authorizedBy: first)
      var rejected = first
      if !sameBearer {
        rejected = try NativeSessionTokenStore.resolveUnauthorized(authorizedBy: first, allowRetry: true)
        #expect(rejected.bearerToken == "t1")
        NativeSessionTokenStore.refresh(from: response(token: "t0"), authorizedBy: rejected)
      }
      let current = NativeSessionTokenStore.captureSessionContext()
      #expect(throws: NativeSessionRequestError.superseded) {
        try NativeSessionTokenStore.resolveUnauthorized(authorizedBy: rejected, allowRetry: sameBearer)
      }
      #expect(throws: NativeSessionRequestError.superseded) {
        try NativeSessionTokenStore.resolveUnauthorized(
          authorizedBy: NativeRequestAuthorization(unmanagedBearerToken: "t0"), allowRetry: true
        )
      }
      #expect(NativeSessionTokenStore.captureSessionContext() == current)
    }
  }
}
