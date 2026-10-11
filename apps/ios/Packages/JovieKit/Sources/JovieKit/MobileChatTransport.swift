import Foundation

public struct MobileChatTransport<Authorizer: MobileChatAuthorizing>: Sendable {
  private struct AuthorizedRequest {
    var request: URLRequest
    let authorization: Authorizer.Authorization
  }

  private let baseURL: URL
  private let session: URLSession
  private let authorizer: Authorizer
  private let decoder: JSONDecoder
  private let encoder: JSONEncoder
  private let requestTimeout: TimeInterval
  private let workspace: String?
  private var isOwned: Bool { authorizer.isOwned }

  public init(
    baseURL: URL,
    session: URLSession,
    authorizer: Authorizer,
    requestTimeout: TimeInterval = 30,
    workspace: String? = nil
  ) {
    self.baseURL = baseURL
    self.session = session
    self.authorizer = authorizer
    self.decoder = JSONDecoder()
    self.encoder = JSONEncoder()
    self.requestTimeout = requestTimeout
    self.workspace = workspace
  }

  public func listConversations(limit: Int = 20) async throws -> [MobileConversationSummary] {
    var queryItems = [URLQueryItem(name: "limit", value: String(limit))]
    appendWorkspaceQuery(to: &queryItems)
    let url = try makeURL(path: "/api/mobile/v1/chat/conversations", queryItems: queryItems)

    let response: MobileConversationListResponse = try await sendJSON(
      request: try await authorizedRequest(url: url, method: "GET"),
      forceRefresh: false
    )
    return response.conversations
  }

  public func fetchConversation(
    id: String,
    limit: Int,
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

  public func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)? = nil
  ) async throws -> [MobileChatStreamEvent] {
    try await sendTurn(request, onAuthorization: nil, onEvent: onEvent)
  }

  public func sendTurn(
    _ request: MobileChatTurnRequest,
    onAuthorization: (@MainActor @Sendable (Authorizer.Ownership?) async throws -> Void)?,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    try await sendTurn(request, forceRefresh: false, onAuthorization: onAuthorization, onEvent: onEvent)
  }

  private func sendTurn(
    _ request: MobileChatTurnRequest,
    forceRefresh: Bool,
    onAuthorization: (@MainActor @Sendable (Authorizer.Ownership?) async throws -> Void)?,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?,
    authorizationOverride: Authorizer.Authorization? = nil
  ) async throws -> [MobileChatStreamEvent] {
    let authorized = try await authorizedRequest(
      url: baseURL.appending(path: "/api/mobile/v1/chat/turns"),
      method: "POST",
      forceRefresh: forceRefresh,
      authorizationOverride: authorizationOverride
    )
    var urlRequest = authorized.request
    urlRequest.setValue("application/x-ndjson", forHTTPHeaderField: "Accept")
    urlRequest.httpBody = try encoder.encode(request)

    try await onAuthorization?(authorizer.ownership(for: authorized.authorization))
    try authorizer.validateDispatch(authorized.authorization)
    let (bytes, response) = try await performBytes(for: urlRequest)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw MobileChatClientError.invalidResponse
    }

    if httpResponse.statusCode == 401 {
      let retry = try await authorizer.retryAuthorizationOrTerminal(authorized.authorization, retried: forceRefresh)
      return try await sendTurn(
        request, forceRefresh: true, onAuthorization: onAuthorization,
        onEvent: onEvent, authorizationOverride: retry
      )
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw MobileChatClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    authorizer.acceptSuccessfulResponse(response, authorizedBy: authorized.authorization)
    return try await readStreamEvents(from: bytes, onEvent: onEvent)
  }

  public func submitEyesFreeCapture(
    _ request: EyesFreeCaptureAPIRequest
  ) async throws -> EyesFreeCaptureAPIResponse {
    try await submitEyesFreeCapture(request, forceRefresh: false)
  }

  private func submitEyesFreeCapture(
    _ request: EyesFreeCaptureAPIRequest,
    forceRefresh: Bool,
    authorizationOverride: Authorizer.Authorization? = nil
  ) async throws -> EyesFreeCaptureAPIResponse {
    let authorized = try await authorizedRequest(
      url: baseURL.appending(path: "/api/mobile/v1/eyes-free-capture"),
      method: "POST",
      forceRefresh: forceRefresh,
      authorizationOverride: authorizationOverride
    )
    var urlRequest = authorized.request
    urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
    urlRequest.httpBody = try encoder.encode(request)

    try authorizer.validateDispatch(authorized.authorization)
    let (data, response) = try await performData(for: urlRequest)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw MobileChatClientError.invalidResponse
    }

    if httpResponse.statusCode == 401 {
      let retry = try await authorizer.retryAuthorizationOrTerminal(authorized.authorization, retried: forceRefresh)
      return try await submitEyesFreeCapture(request, forceRefresh: true, authorizationOverride: retry)
    }

    if (200 ... 409).contains(httpResponse.statusCode),
       let decoded = try? decoder.decode(EyesFreeCaptureAPIResponse.self, from: data)
    {
      authorizer.acceptSuccessfulResponse(response, authorizedBy: authorized.authorization)
      if isOwned { try Task.checkCancellation() }
      return decoded
    }
    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw MobileChatClientError.requestFailed(statusCode: httpResponse.statusCode)
    }
    throw MobileChatClientError.decodingFailed
  }

  private func appendWorkspaceQuery(to queryItems: inout [URLQueryItem]) {
    guard let workspace else { return }
    queryItems.append(URLQueryItem(name: "workspace", value: workspace))
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
    authorizationOverride: Authorizer.Authorization? = nil
  ) async throws -> AuthorizedRequest {
    let authorization = try await authorizer.requestAuthorization(
      forceRefresh: forceRefresh, authorizationOverride: authorizationOverride
    )
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(authorizer.bearerToken(for: authorization))", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return AuthorizedRequest(request: request, authorization: authorization)
  }

  private func sendJSON<Response: Decodable>(
    request: AuthorizedRequest,
    forceRefresh: Bool
  ) async throws -> Response {
    try authorizer.validateDispatch(request.authorization)
    let (data, response) = try await performData(for: request.request)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw MobileChatClientError.invalidResponse
    }

    if httpResponse.statusCode == 401 {
      let retry = try await authorizer.retryAuthorizationOrTerminal(request.authorization, retried: forceRefresh)
      var refreshed = request.request
      refreshed.setValue("Bearer \(authorizer.bearerToken(for: retry))", forHTTPHeaderField: "Authorization")
      return try await sendJSON(
        request: AuthorizedRequest(request: refreshed, authorization: retry), forceRefresh: true
      )
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw MobileChatClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    authorizer.acceptSuccessfulResponse(response, authorizedBy: request.authorization)

    if isOwned { try Task.checkCancellation() }
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
      if isOwned, error.code == .cancelled { throw CancellationError() }
      throw MobileChatClientError.transportFailed(code: error.code.rawValue)
    } catch {
      if isOwned, error is CancellationError { throw error }
      throw MobileChatClientError.invalidResponse
    }
  }

  private func performBytes(for request: URLRequest) async throws -> (URLSession.AsyncBytes, URLResponse) {
    do {
      return try await session.bytes(for: request)
    } catch let error as URLError {
      if isOwned, error.code == .cancelled { throw CancellationError() }
      throw MobileChatClientError.transportFailed(code: error.code.rawValue)
    } catch {
      if isOwned, error is CancellationError { throw error }
      throw MobileChatClientError.invalidResponse
    }
  }

  private func readStreamEvents(
    from bytes: URLSession.AsyncBytes,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    let events: [MobileChatStreamEvent]

    do {
      events = try await MobileChatNDJSONReader.read(
        from: bytes,
        baseURL: baseURL,
        checkingTaskCancellation: isOwned,
        onEvent: onEvent
      )
    } catch let error as MobileChatClientError {
      throw error
    } catch let error as URLError {
      if isOwned, error.code == .cancelled { throw CancellationError() }
      throw MobileChatClientError.transportFailed(code: error.code.rawValue)
    } catch {
      if isOwned, error is CancellationError { throw error }
      throw MobileChatClientError.invalidResponse
    }

    if isOwned { try Task.checkCancellation() }
    if events.isEmpty {
      throw MobileChatClientError.streamFailed(message: "Native chat returned no events.")
    }

    return events
  }
}
