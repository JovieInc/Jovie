import Foundation
import JovieKit

protocol MobileChatClientProtocol: Sendable {
  func listConversations(limit: Int) async throws -> [MobileConversationSummary]
  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse
  func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent]
  func submitEyesFreeCapture(
    _ request: EyesFreeCaptureAPIRequest
  ) async throws -> EyesFreeCaptureAPIResponse
}

extension MobileChatClientProtocol {
  func fetchConversation(id: String, limit: Int) async throws -> MobileConversationDetailResponse {
    try await fetchConversation(id: id, limit: limit, before: nil)
  }

  func sendTurn(_ request: MobileChatTurnRequest) async throws -> [MobileChatStreamEvent] {
    try await sendTurn(request, onEvent: nil)
  }

  func submitEyesFreeCapture(
    _ request: EyesFreeCaptureAPIRequest
  ) async throws -> EyesFreeCaptureAPIResponse {
    throw MobileChatClientError.invalidResponse
  }
}

struct MobileChatClient: MobileChatClientProtocol, Sendable {
  private let baseURL: URL
  private let session: URLSession
  private let tokenProvider: TokenProviding
  private let decoder: JSONDecoder
  private let encoder: JSONEncoder
  private let requestTimeout: TimeInterval
  private let workspace: MobileWorkspaceMode

  init(
    baseURL: URL,
    session: URLSession = URLSession(configuration: .jovieMobile),
    tokenProvider: TokenProviding,
    requestTimeout: TimeInterval = 30,
    workspace: MobileWorkspaceMode = .jovie
  ) {
    self.baseURL = baseURL
    self.session = session
    self.tokenProvider = tokenProvider
    self.decoder = JSONDecoder()
    self.encoder = JSONEncoder()
    self.requestTimeout = requestTimeout
    self.workspace = workspace
  }

  func listConversations(limit: Int = 20) async throws -> [MobileConversationSummary] {
    var queryItems = [URLQueryItem(name: "limit", value: String(limit))]
    appendWorkspaceQuery(to: &queryItems)
    let url = try makeURL(path: "/api/mobile/v1/chat/conversations", queryItems: queryItems)

    let response: MobileConversationListResponse = try await sendJSON(
      request: try await authorizedRequest(url: url, method: "GET"),
      forceRefresh: false
    )
    return response.conversations
  }

  func fetchConversation(
    id: String,
    limit: Int = ChatTranscriptWindow.initialMessageLimit,
    before: String? = nil
  ) async throws -> MobileConversationDetailResponse {
    var queryItems = [URLQueryItem(name: "limit", value: String(limit))]
    if let before, !before.isEmpty {
      queryItems.append(URLQueryItem(name: "before", value: before))
    }
    appendWorkspaceQuery(to: &queryItems)
    let url = try makeURL(
      path: "/api/mobile/v1/chat/conversations/\(id)",
      queryItems: queryItems
    )

    return try await sendJSON(
      request: try await authorizedRequest(url: url, method: "GET"),
      forceRefresh: false
    )
  }

  func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)? = nil
  ) async throws -> [MobileChatStreamEvent] {
    try await sendTurn(request, forceRefresh: false, onEvent: onEvent)
  }

  private func sendTurn(
    _ request: MobileChatTurnRequest,
    forceRefresh: Bool,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?,
    tokenOverride: String? = nil
  ) async throws -> [MobileChatStreamEvent] {
    var urlRequest = try await authorizedRequest(
      url: baseURL.appending(path: "/api/mobile/v1/chat/turns"),
      method: "POST",
      forceRefresh: forceRefresh,
      tokenOverride: tokenOverride
    )
    urlRequest.setValue("application/x-ndjson", forHTTPHeaderField: "Accept")
    urlRequest.httpBody = try encoder.encode(request)

    let (bytes, response) = try await performBytes(for: urlRequest)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw MobileChatClientError.invalidResponse
    }

    if httpResponse.statusCode == 401, !forceRefresh {
      let token = try await retryTokenOrTerminal(after: failedBearerToken(from: urlRequest))
      return try await sendTurn(
        request,
        forceRefresh: true,
        onEvent: onEvent,
        tokenOverride: token
      )
    }
    if httpResponse.statusCode == 401 {
      NativeSessionTokenStore.clear()
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw MobileChatClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    NativeSessionTokenStore.refresh(from: response)
    return try await readStreamEvents(from: bytes, onEvent: onEvent)
  }

  func submitEyesFreeCapture(
    _ request: EyesFreeCaptureAPIRequest
  ) async throws -> EyesFreeCaptureAPIResponse {
    try await submitEyesFreeCapture(request, forceRefresh: false)
  }

  private func submitEyesFreeCapture(
    _ request: EyesFreeCaptureAPIRequest,
    forceRefresh: Bool,
    tokenOverride: String? = nil
  ) async throws -> EyesFreeCaptureAPIResponse {
    var urlRequest = try await authorizedRequest(
      url: baseURL.appending(path: "/api/mobile/v1/eyes-free-capture"),
      method: "POST",
      forceRefresh: forceRefresh,
      tokenOverride: tokenOverride
    )
    urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
    urlRequest.httpBody = try encoder.encode(request)

    let (data, response) = try await performData(for: urlRequest)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw MobileChatClientError.invalidResponse
    }

    if httpResponse.statusCode == 401, !forceRefresh {
      let token = try await retryTokenOrTerminal(after: failedBearerToken(from: urlRequest))
      return try await submitEyesFreeCapture(
        request,
        forceRefresh: true,
        tokenOverride: token
      )
    }
    if httpResponse.statusCode == 401 {
      NativeSessionTokenStore.clear()
      throw MobileChatClientError.requestFailed(statusCode: 401)
    }

    if (200 ... 409).contains(httpResponse.statusCode),
       let decoded = try? decoder.decode(EyesFreeCaptureAPIResponse.self, from: data)
    {
      NativeSessionTokenStore.refresh(from: response)
      return decoded
    }
    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw MobileChatClientError.requestFailed(statusCode: httpResponse.statusCode)
    }
    throw MobileChatClientError.decodingFailed
  }

  private func appendWorkspaceQuery(to queryItems: inout [URLQueryItem]) {
    guard workspace == .ovie else { return }
    queryItems.append(URLQueryItem(name: "workspace", value: workspace.rawValue))
  }

  private func makeURL(path: String, queryItems: [URLQueryItem]) throws -> URL {
    var components = URLComponents(
      url: baseURL.appending(path: path),
      resolvingAgainstBaseURL: false
    )
    if !queryItems.isEmpty {
      components?.queryItems = queryItems
    }
    guard let url = components?.url else {
      throw MobileChatClientError.invalidResponse
    }
    return url
  }

  private func authorizedRequest(
    url: URL,
    method: String,
    forceRefresh: Bool = false,
    tokenOverride: String? = nil
  ) async throws -> URLRequest {
    let token: String
    if let tokenOverride {
      token = tokenOverride
    } else {
      token = try await tokenProvider.bearerToken(forceRefresh: forceRefresh)
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return request
  }

  private func failedBearerToken(from request: URLRequest) -> String {
    guard
      let value = request.value(forHTTPHeaderField: "Authorization"),
      value.hasPrefix("Bearer ")
    else {
      return ""
    }
    return String(value.dropFirst("Bearer ".count))
  }

  private func retryTokenOrTerminal(after failedToken: String) async throws -> String {
    do {
      return try await tokenProvider.refreshedBearerToken(after: failedToken)
    } catch APIClientError.missingToken {
      NativeSessionTokenStore.clear()
      throw MobileChatClientError.requestFailed(statusCode: 401)
    }
  }

  private func sendJSON<Response: Decodable>(
    request: URLRequest,
    forceRefresh: Bool
  ) async throws -> Response {
    let (data, response) = try await performData(for: request)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw MobileChatClientError.invalidResponse
    }

    if httpResponse.statusCode == 401, !forceRefresh {
      let token = try await retryTokenOrTerminal(after: failedBearerToken(from: request))
      var refreshed = request
      refreshed.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      return try await sendJSON(request: refreshed, forceRefresh: true)
    }

    if httpResponse.statusCode == 401 {
      NativeSessionTokenStore.clear()
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw MobileChatClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    NativeSessionTokenStore.refresh(from: response)

    do {
      return try decoder.decode(Response.self, from: data)
    } catch {
      throw MobileChatClientError.decodingFailed
    }
  }

  private func performData(for request: URLRequest) async throws -> (Data, URLResponse) {
    do {
      return try await session.data(for: request)
    } catch let error as URLError {
      throw MobileChatClientError.transportFailed(code: error.code.rawValue)
    } catch {
      throw MobileChatClientError.invalidResponse
    }
  }

  private func performBytes(for request: URLRequest) async throws -> (URLSession.AsyncBytes, URLResponse) {
    do {
      return try await session.bytes(for: request)
    } catch let error as URLError {
      throw MobileChatClientError.transportFailed(code: error.code.rawValue)
    } catch {
      throw MobileChatClientError.invalidResponse
    }
  }

  private func readStreamEvents(
    from bytes: URLSession.AsyncBytes,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    var leftover = Data()
    var events: [MobileChatStreamEvent] = []
    var batch = Data()
    batch.reserveCapacity(256)

    do {
      for try await byte in bytes {
        batch.append(byte)
        guard byte == UInt8(ascii: "\n") else { continue }
        try await publish(
          MobileChatNDJSONParser.consume(
            chunk: batch,
            leftover: &leftover,
            baseURL: baseURL
          ),
          into: &events,
          onEvent: onEvent
        )
        batch.removeAll(keepingCapacity: true)
      }

      if !batch.isEmpty {
        try await publish(
          MobileChatNDJSONParser.consume(
            chunk: batch,
            leftover: &leftover,
            baseURL: baseURL
          ),
          into: &events,
          onEvent: onEvent
        )
      }

      try await publish(
        MobileChatNDJSONParser.finish(leftover: &leftover, baseURL: baseURL),
        into: &events,
        onEvent: onEvent
      )
    } catch let error as MobileChatClientError {
      throw error
    } catch let error as URLError {
      throw MobileChatClientError.transportFailed(code: error.code.rawValue)
    } catch {
      throw MobileChatClientError.invalidResponse
    }

    if events.isEmpty {
      throw MobileChatClientError.streamFailed(message: "Native chat returned no events.")
    }

    return events
  }

  private func publish(
    _ parsed: [MobileChatStreamEvent],
    into events: inout [MobileChatStreamEvent],
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async {
    for event in parsed {
      events.append(event)
      if let onEvent {
        await onEvent(event)
      }
    }
  }
}
