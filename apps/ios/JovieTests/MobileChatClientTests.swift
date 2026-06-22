import Foundation
import Testing
@testable import Jovie

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
    tokenProvider: MockChatTokenProvider = MockChatTokenProvider(tokens: ["chat-token"])
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

  @Test func parsesChatStreamEvents() async throws {
    let requestRecorder = RequestRecorder()
    let tokenProvider = MockChatTokenProvider(tokens: ["chat-token"])
    MockChatURLProtocol.requestHandler = { request in
      requestRecorder.record(request)

      let ndjson = """
      {"type":"turn.reserved","conversationId":"conv_1","turnId":"turn_1","clientTurnId":"client_turn_1"}
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
}
