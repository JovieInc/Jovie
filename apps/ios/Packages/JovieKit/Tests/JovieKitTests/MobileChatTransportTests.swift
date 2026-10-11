import Foundation
import JovieKit
import Testing

@Suite(.serialized)
private struct MobileChatTransportTests {
  @Test(arguments: TransportOperation.allCases, [nil, "ov"] as [String?])
  func publicRequestsPreserveWireAndOpaqueRetryOrder(operation: TransportOperation, workspace: String?) async throws {
    let probe = TransportProbe(operation, statuses: [401, 200])
    try await withTransport(probe, workspace: workspace) { client in try await operation.run(client, probe) }
    let callbacks = operation == .stream
    let reacquires = callbacks || operation == .eyesFree
    let first = ["acquire:false:-"] + (callbacks ? ["callback:a"] : []) + ["validate:a", "dispatch:a", "retry:a:false"]
    let second = (reacquires ? ["acquire:true:b"] : []) + (callbacks ? ["callback:b"] : [])
      + ["validate:b", "dispatch:b", "accept:b"] + (callbacks ? ["event"] : [])
    #expect(probe.log == first + second)
    #expect(probe.requests.count == 2)
    for (index, request) in probe.requests.enumerated() {
      #expect(request.url?.path == operation.path)
      #expect(request.httpMethod == (operation.isJSONRead ? "GET" : "POST"))
      #expect(request.timeoutInterval == 30)
      #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer \(index == 0 ? "a" : "b")")
      #expect(request.value(forHTTPHeaderField: "Accept") == (callbacks ? "application/x-ndjson" : "application/json"))
      let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
      var expected: [URLQueryItem] = operation.isJSONRead
        ? [.init(name: "limit", value: operation == .list ? "20" : "37")] : []
      if operation == .before { expected.append(.init(name: "before", value: "cursor /?")) }
      if operation.isJSONRead, let workspace { expected.append(.init(name: "workspace", value: workspace)) }
      #expect(query == expected)
      if !operation.isJSONRead {
        let data = try #require(request.httpBody)
        let body = try JSONDecoder().decode([String: String].self, from: data)
        let common = ["clientTurnId": "ct", "clientMessageId": "cm"]
        let payload = operation == .eyesFree ? ["destination": "notes", "transcript": "hi"] : ["text": "hi", "source": "typed"]
        #expect(body == common.merging(payload) { _, new in new })
        if operation == .eyesFree { #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json") }
      }
    }
  }

  @Test(arguments: [TransportFailure.acquisition, .callback, .validation, .retry], [false, true])
  func boundaryFailuresEscapeExactlyWithoutExtraDispatch(failure: TransportFailure, owned: Bool) async throws {
    let probe = TransportProbe(.stream, statuses: [401], failure: failure, owned: owned)
    try await withTransport(probe) { client in
      await #expect(throws: failure) { try await TransportOperation.stream.run(client, probe) }
    }
    #expect(probe.requests.count == (failure == .retry ? 1 : 0))
    #expect(!probe.log.contains(where: { $0.hasPrefix("accept:") || $0 == "event" }))
  }

  @Test(arguments: TransportOperation.allCases)
  func terminalRetryPreservesItsErrorAndStopsAfterTwoDispatches(operation: TransportOperation) async throws {
    let probe = TransportProbe(operation, statuses: [401])
    try await withTransport(probe) { client in
      await #expect(throws: TransportFailure.terminal) { try await operation.run(client, probe) }
    }
    #expect(probe.requests.count == 2)
    #expect(probe.log.last == "retry:b:true")
    #expect(!probe.log.contains(where: { $0.hasPrefix("accept:") || $0 == "event" }))
  }

  @Test(arguments: [200, 409], [false, true])
  func statusAndDecodingKeepResponseAcceptanceAtItsExistingBoundary(status: Int, malformed: Bool) async throws {
    for operation in [TransportOperation.list, .stream, .eyesFree] {
      let probe = TransportProbe(operation, statuses: [status], body: malformed ? "{" : nil)
      try await withTransport(probe) { client in
        if status == 409 && (operation != .eyesFree || malformed) {
          await #expect(throws: MobileChatClientError.requestFailed(statusCode: 409)) { try await operation.run(client, probe) }
        } else if malformed {
          await #expect(throws: MobileChatClientError.decodingFailed) { try await operation.run(client, probe) }
        } else { try await operation.run(client, probe) }
      }
      #expect(probe.log.contains("accept:a") == (operation == .eyesFree ? !malformed : status == 200))
      if operation == .stream, status == 200, !malformed { #expect(Array(probe.log.suffix(2)) == ["accept:a", "event"]) }
    }
  }

  @Test(arguments: [TransportOperation.list, .stream, .eyesFree], [false, true])
  func urlCancellationRetainsOwnedAndUnownedErrorMapping(operation: TransportOperation, owned: Bool) async throws {
    let probe = TransportProbe(operation, owned: owned, transportCancellation: true)
    try await withTransport(probe) { client in
      if owned { await #expect(throws: CancellationError.self) { try await operation.run(client, probe) } }
      else {
        await #expect(throws: MobileChatClientError.transportFailed(code: URLError.cancelled.rawValue)) {
          try await operation.run(client, probe)
        }
      }
    }
    #expect(probe.requests.count == 1)
    #expect(!probe.log.contains("accept:a"))
  }

  @Test(arguments: [TransportOperation.list, .stream, .eyesFree])
  func ownedCancellationAfterAcceptanceDoesNotBecomeDecodeOrEmptyStreamError(operation: TransportOperation) async throws {
    let competingBody = operation == .list ? "{" : operation == .stream ? "" : nil
    let probe = TransportProbe(operation, body: competingBody, cancelAtAcceptance: true)
    try await withTransport(probe) { client in
      let task = Task { try await operation.run(client, probe) }
      await #expect(throws: CancellationError.self) { try await task.value }
    }
    #expect(probe.log.last == "accept:a")
  }

  @Test(arguments: [false, true])
  func finalUnterminatedCallbackCancellationIsCheckedOnlyForOwnedTransport(owned: Bool) async throws {
    let probe = TransportProbe(.stream, owned: owned, cancelAtEvent: true)
    try await withTransport(probe) { client in
      let task = Task { try await TransportOperation.stream.run(client, probe) }
      if owned { await #expect(throws: CancellationError.self) { try await task.value } }
      else { try await task.value }
    }
    #expect(Array(probe.log.suffix(2)) == ["accept:a", "event"])
  }

  @Test func publicEyesFreeResponseDecodesMissingAndNullOptions() throws {
    for suffix in ["", ",\"conversationId\":null,\"turnId\":null,\"errorCode\":null"] {
      let data = Data(("{\"destination\":\"notes\",\"status\":\"saved\",\"readback\":\"ok\"" + suffix + "}").utf8)
      #expect(try JSONDecoder().decode(EyesFreeCaptureAPIResponse.self, from: data) == transportEyesFreeResponse)
    }
  }
}

private enum TransportFailure: Error, Equatable, Sendable { case acquisition, callback, validation, retry, terminal }
// Reference identity makes this an opaque authorization contract, without Equatable/Hashable conformance.
private final class TransportTicket: Sendable {
  let name: String
  init(_ name: String) { self.name = name }
}
private struct TransportOwnership: Sendable { let ticket: TransportTicket }
private let transportEyesFreeResponse = EyesFreeCaptureAPIResponse(
  destination: "notes", status: "saved", conversationId: nil, turnId: nil, readback: "ok", errorCode: nil
)
private enum TransportOperation: String, CaseIterable, Sendable {
  case list, detail, emptyBefore, before, stream, eyesFree
  var isJSONRead: Bool { self != .stream && self != .eyesFree }
  var path: String {
    "/api/mobile/v1/" + (self == .eyesFree ? "eyes-free-capture" : self == .stream ? "chat/turns" : self == .list ? "chat/conversations" : "chat/conversations/c")
  }
  var response: String {
    switch self {
    case .list: return "{\"conversations\":[]}"
    case .detail, .emptyBefore, .before:
      return "{\"conversation\":{\"id\":\"c\",\"createdAt\":\"now\",\"updatedAt\":\"now\"},\"messages\":[],\"hasMore\":false}"
    case .stream: return "{\"type\":\"assistant.delta\",\"clientTurnId\":\"ct\",\"text\":\"hi\"}"
    case .eyesFree: return "{\"destination\":\"notes\",\"status\":\"saved\",\"readback\":\"ok\"}"
    }
  }
  func run(_ client: MobileChatTransport<TransportAuthorizer>, _ probe: TransportProbe) async throws {
    switch self {
    case .list: #expect(try await client.listConversations().isEmpty)
    case .detail, .emptyBefore, .before:
      let result = self == .detail
        ? try await client.fetchConversation(id: "c", limit: 37)
        : try await client.fetchConversation(id: "c", limit: 37, before: self == .before ? "cursor /?" : "")
      #expect(result.conversation.id == "c" && result.messages.isEmpty && !result.hasMore)
    case .stream:
      let request = MobileChatTurnRequest(conversationId: nil, clientTurnId: "ct", clientMessageId: "cm", text: "hi", source: "typed")
      let result = try await client.sendTurn(request, onAuthorization: { ownership in
        let ticket = try #require(ownership?.ticket)
        probe.checkIdentity(ticket)
        probe.record("callback:\(ticket.name)")
        try probe.check(.callback)
      }, onEvent: { _ in
        probe.record("event")
        if probe.cancelAtEvent { withUnsafeCurrentTask { $0?.cancel() } }
      })
      #expect(result == [.assistantDelta(clientTurnId: "ct", text: "hi")])
    case .eyesFree:
      let request = EyesFreeCaptureAPIRequest(destination: "notes", transcript: "hi", clientTurnId: "ct", clientMessageId: "cm")
      #expect(try await client.submitEyesFreeCapture(request) == transportEyesFreeResponse)
    }
  }
}

private struct TransportAuthorizer: MobileChatAuthorizing {
  let probe: TransportProbe
  var isOwned: Bool { probe.owned }
  func requestAuthorization(forceRefresh: Bool, authorizationOverride: TransportTicket?) async throws -> TransportTicket {
    probe.record("acquire:\(forceRefresh):\(authorizationOverride?.name ?? "-")")
    try probe.check(.acquisition)
    return authorizationOverride ?? probe.a
  }
  func bearerToken(for authorization: TransportTicket) -> String { probe.checkIdentity(authorization); return authorization.name }
  func ownership(for authorization: TransportTicket) -> TransportOwnership? { TransportOwnership(ticket: authorization) }
  func validateDispatch(_ authorization: TransportTicket) throws {
    probe.checkIdentity(authorization)
    probe.record("validate:\(authorization.name)")
    try probe.check(.validation)
  }
  func retryAuthorizationOrTerminal(_ authorization: TransportTicket, retried: Bool) async throws -> TransportTicket {
    probe.checkIdentity(authorization)
    probe.record("retry:\(authorization.name):\(retried)")
    try probe.check(.retry)
    if probe.requests.count >= 2 && !retried { throw TransportFailure.validation }
    if retried { throw TransportFailure.terminal }
    return probe.b
  }
  func acceptSuccessfulResponse(_ response: URLResponse, authorizedBy authorization: TransportTicket) {
    probe.checkIdentity(authorization)
    #expect((response as? HTTPURLResponse)?.value(forHTTPHeaderField: "X-Test-Accept") == "yes")
    probe.record("accept:\(authorization.name)")
    if probe.cancelAtAcceptance { withUnsafeCurrentTask { $0?.cancel() } }
  }
}

private final class TransportProbe: @unchecked Sendable {
  let a = TransportTicket("a"), b = TransportTicket("b")
  let owned: Bool, transportCancellation: Bool, cancelAtAcceptance: Bool, cancelAtEvent: Bool
  private let operation: TransportOperation, statuses: [Int], body: String?, failure: TransportFailure?
  private let lock = NSLock()
  private var trace: [String] = []
  private var captured: [URLRequest] = []
  var log: [String] { lock.withLock { trace } }
  var requests: [URLRequest] { lock.withLock { captured } }
  init(_ operation: TransportOperation, statuses: [Int] = [200], body: String? = nil,
       failure: TransportFailure? = nil, owned: Bool = true, transportCancellation: Bool = false,
       cancelAtAcceptance: Bool = false, cancelAtEvent: Bool = false) {
    self.operation = operation; self.statuses = statuses; self.body = body; self.failure = failure
    self.owned = owned; self.transportCancellation = transportCancellation
    self.cancelAtAcceptance = cancelAtAcceptance; self.cancelAtEvent = cancelAtEvent
  }
  func record(_ entry: String) { lock.withLock { trace.append(entry) } }
  func check(_ stage: TransportFailure) throws { if failure == stage { throw stage } }
  func checkIdentity(_ ticket: TransportTicket) { #expect(ticket === (ticket.name == "a" ? a : b)) }
  func reply(to request: URLRequest) throws -> (HTTPURLResponse, Data) {
    var copy = request
    if copy.httpBody == nil, let stream = copy.httpBodyStream {
      stream.open(); defer { stream.close() }
      var data = Data(), buffer = [UInt8](repeating: 0, count: 1024)
      while true {
        let count = stream.read(&buffer, maxLength: buffer.count)
        if count < 0 { throw stream.streamError ?? TransportFailure.acquisition }
        if count == 0 { break }
        data.append(contentsOf: buffer.prefix(count))
      }
      copy.httpBody = data
    }
    let status = lock.withLock {
      captured.append(copy)
      trace.append("dispatch:\(request.value(forHTTPHeaderField: "Authorization")?.replacingOccurrences(of: "Bearer ", with: "") ?? "missing")")
      return statuses[min(captured.count - 1, statuses.count - 1)]
    }
    if transportCancellation { throw URLError(.cancelled) }
    return (HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                            headerFields: ["X-Test-Accept": "yes"])!, Data((body ?? operation.response).utf8))
  }
}

private final class TransportURLProtocol: URLProtocol {
  private static let lock = NSLock()
  private static var probe: TransportProbe?
  static func install(_ value: TransportProbe?) { lock.withLock { probe = value } }
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    do {
      let probe = try #require(Self.lock.withLock { Self.probe })
      let (response, data) = try probe.reply(to: request)
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch { client?.urlProtocol(self, didFailWithError: error) }
  }
  override func stopLoading() {}
}

private func withTransport(_ probe: TransportProbe, workspace: String? = nil,
                           body: (MobileChatTransport<TransportAuthorizer>) async throws -> Void) async throws {
  TransportURLProtocol.install(probe)
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [TransportURLProtocol.self]
  let session = URLSession(configuration: configuration)
  defer { session.invalidateAndCancel(); TransportURLProtocol.install(nil) }
  try await body(MobileChatTransport(baseURL: URL(string: "https://transport.invalid")!, session: session,
                                   authorizer: TransportAuthorizer(probe: probe), workspace: workspace))
}
