import Foundation
import JovieKit

protocol MobileChatClientProtocol: Sendable {
  func listConversations(limit: Int) async throws -> [MobileConversationSummary]
  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse
  func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent]
  func sendTurn(
    _ request: MobileChatTurnRequest,
    onAuthorization: (@MainActor @Sendable (NativeSessionOwnership?) async throws -> Void)?,
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

  func sendTurn(
    _ request: MobileChatTurnRequest,
    onAuthorization: (@MainActor @Sendable (NativeSessionOwnership?) async throws -> Void)?,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    try await onAuthorization?(nil)
    try Task.checkCancellation()
    return try await sendTurn(request, onEvent: onEvent)
  }

  func submitEyesFreeCapture(
    _ request: EyesFreeCaptureAPIRequest
  ) async throws -> EyesFreeCaptureAPIResponse {
    throw MobileChatClientError.invalidResponse
  }
}

struct MobileChatClient: MobileChatClientProtocol, Sendable {
  private struct AuthorizedRequest {
    var request: URLRequest
    let authorization: NativeRequestAuthorization
  }

  private let baseURL: URL
  private let session: URLSession
  private let tokenProvider: TokenProviding
  private let decoder: JSONDecoder
  private let encoder: JSONEncoder
  private let requestTimeout: TimeInterval
  private let workspace: MobileWorkspaceMode
  private let identity: NativeChatIdentity?
  private var isOwned: Bool { identity?.ownership != nil }

  init(
    baseURL: URL,
    session: URLSession = URLSession(configuration: .jovieMobile),
    tokenProvider: TokenProviding,
    requestTimeout: TimeInterval = 30,
    workspace: MobileWorkspaceMode = .jovie,
    identity: NativeChatIdentity? = nil
  ) {
    self.baseURL = baseURL
    self.session = session
    self.tokenProvider = tokenProvider
    self.decoder = JSONDecoder()
    self.encoder = JSONEncoder()
    self.requestTimeout = requestTimeout
    self.workspace = identity?.workspace ?? workspace
    self.identity = identity
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
    try await sendTurn(request, onAuthorization: nil, onEvent: onEvent)
  }

  func sendTurn(
    _ request: MobileChatTurnRequest,
    onAuthorization: (@MainActor @Sendable (NativeSessionOwnership?) async throws -> Void)?,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    try await sendTurn(request, forceRefresh: false, onAuthorization: onAuthorization, onEvent: onEvent)
  }

  private func sendTurn(
    _ request: MobileChatTurnRequest,
    forceRefresh: Bool,
    onAuthorization: (@MainActor @Sendable (NativeSessionOwnership?) async throws -> Void)?,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?,
    authorizationOverride: NativeRequestAuthorization? = nil
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

    try await onAuthorization?(authorized.authorization.ownership)
    try validateDispatch(authorized.authorization)
    let (bytes, response) = try await performBytes(for: urlRequest)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw MobileChatClientError.invalidResponse
    }

    if httpResponse.statusCode == 401 {
      let retry = try await retryAuthorizationOrTerminal(authorized.authorization, retried: forceRefresh)
      return try await sendTurn(
        request, forceRefresh: true, onAuthorization: onAuthorization,
        onEvent: onEvent, authorizationOverride: retry
      )
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw MobileChatClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    NativeSessionTokenStore.refresh(from: response, authorizedBy: authorized.authorization)
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
    authorizationOverride: NativeRequestAuthorization? = nil
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

    try validateDispatch(authorized.authorization)
    let (data, response) = try await performData(for: urlRequest)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw MobileChatClientError.invalidResponse
    }

    if httpResponse.statusCode == 401 {
      let retry = try await retryAuthorizationOrTerminal(authorized.authorization, retried: forceRefresh)
      return try await submitEyesFreeCapture(request, forceRefresh: true, authorizationOverride: retry)
    }

    if (200 ... 409).contains(httpResponse.statusCode),
       let decoded = try? decoder.decode(EyesFreeCaptureAPIResponse.self, from: data)
    {
      NativeSessionTokenStore.refresh(from: response, authorizedBy: authorized.authorization)
      if isOwned { try Task.checkCancellation() }
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
    authorizationOverride: NativeRequestAuthorization? = nil
  ) async throws -> AuthorizedRequest {
    let authorization: NativeRequestAuthorization
    if isOwned { try Task.checkCancellation() }
    if let authorizationOverride {
      authorization = authorizationOverride
    } else if let identity, let ownership = identity.ownership {
      authorization = try await tokenProvider.ownedRequestAuthorization(for: identity.userID, ifOwnedBy: ownership)
    } else {
      authorization = try await tokenProvider.requestAuthorization(forceRefresh: forceRefresh)
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(authorization.bearerToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return AuthorizedRequest(request: request, authorization: authorization)
  }

  private func validateDispatch(_ authorization: NativeRequestAuthorization) throws {
    guard let identity, let ownership = identity.ownership else { return }
    try Task.checkCancellation()
    if authorization.isManaged {
      guard authorization.ownership == ownership else { throw NativeSessionRequestError.superseded }
    }
    // The immutable login also fences unmanaged providers; never adopt its newer bearer.
    _ = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: ownership, for: identity.userID)
  }

  private func retryAuthorizationOrTerminal(
    _ authorization: NativeRequestAuthorization, retried: Bool
  ) async throws -> NativeRequestAuthorization {
    if isOwned, authorization.isManaged {
      return try NativeSessionTokenStore.resolveUnauthorized(authorizedBy: authorization, allowRetry: !retried)
    }
    do {
      guard !retried else { throw APIClientError.missingToken }
      return NativeRequestAuthorization(
        unmanagedBearerToken: try await tokenProvider.refreshedBearerToken(after: authorization.bearerToken)
      )
    } catch APIClientError.missingToken {
      if !isOwned { NativeSessionTokenStore.clear() }
      throw MobileChatClientError.requestFailed(statusCode: 401)
    }
  }

  private func sendJSON<Response: Decodable>(
    request: AuthorizedRequest,
    forceRefresh: Bool
  ) async throws -> Response {
    try validateDispatch(request.authorization)
    let (data, response) = try await performData(for: request.request)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw MobileChatClientError.invalidResponse
    }

    if httpResponse.statusCode == 401 {
      let retry = try await retryAuthorizationOrTerminal(request.authorization, retried: forceRefresh)
      var refreshed = request.request
      refreshed.setValue("Bearer \(retry.bearerToken)", forHTTPHeaderField: "Authorization")
      return try await sendJSON(
        request: AuthorizedRequest(request: refreshed, authorization: retry), forceRefresh: true
      )
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw MobileChatClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    NativeSessionTokenStore.refresh(from: response, authorizedBy: request.authorization)

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
