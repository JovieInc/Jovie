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

struct NativeChatAuthorization: MobileChatAuthorizing {
  typealias Authorization = NativeRequestAuthorization
  typealias Ownership = NativeSessionOwnership

  private let tokenProvider: TokenProviding
  private let identity: NativeChatIdentity?
  var isOwned: Bool { identity?.ownership != nil }

  init(tokenProvider: TokenProviding, identity: NativeChatIdentity?) {
    self.tokenProvider = tokenProvider
    self.identity = identity
  }

  func requestAuthorization(
    forceRefresh: Bool, authorizationOverride: NativeRequestAuthorization?
  ) async throws -> NativeRequestAuthorization {
    let authorization: NativeRequestAuthorization
    if isOwned { try Task.checkCancellation() }
    if let authorizationOverride {
      authorization = authorizationOverride
    } else if let identity, let ownership = identity.ownership {
      authorization = try await tokenProvider.ownedRequestAuthorization(for: identity.userID, ifOwnedBy: ownership)
    } else {
      authorization = try await tokenProvider.requestAuthorization(forceRefresh: forceRefresh)
    }
    return authorization
  }

  func bearerToken(for authorization: NativeRequestAuthorization) -> String {
    authorization.bearerToken
  }

  func ownership(for authorization: NativeRequestAuthorization) -> NativeSessionOwnership? {
    authorization.ownership
  }

  func validateDispatch(_ authorization: NativeRequestAuthorization) throws {
    guard let identity, let ownership = identity.ownership else { return }
    try Task.checkCancellation()
    if authorization.isManaged {
      guard authorization.ownership == ownership else { throw NativeSessionRequestError.superseded }
    }
    // The immutable login also fences unmanaged providers; never adopt its newer bearer.
    _ = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: ownership, for: identity.userID)
  }

  func retryAuthorizationOrTerminal(
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

  func acceptSuccessfulResponse(_ response: URLResponse, authorizedBy authorization: NativeRequestAuthorization) {
    NativeSessionTokenStore.refresh(from: response, authorizedBy: authorization)
  }
}

typealias MobileChatClient = MobileChatTransport<NativeChatAuthorization>

extension MobileChatTransport: MobileChatClientProtocol where Authorizer == NativeChatAuthorization {}

extension MobileChatTransport where Authorizer == NativeChatAuthorization {
  init(
    baseURL: URL,
    session: URLSession = URLSession(configuration: .jovieMobile),
    tokenProvider: TokenProviding,
    requestTimeout: TimeInterval = 30,
    workspace: MobileWorkspaceMode = .jovie,
    identity: NativeChatIdentity? = nil
  ) {
    let workspace = identity?.workspace ?? workspace
    self.init(
      baseURL: baseURL, session: session,
      authorizer: NativeChatAuthorization(tokenProvider: tokenProvider, identity: identity),
      requestTimeout: requestTimeout, workspace: workspace == .ovie ? workspace.rawValue : nil
    )
  }

  func fetchConversation(
    id: String, before: String? = nil
  ) async throws -> MobileConversationDetailResponse {
    try await fetchConversation(id: id, limit: ChatTranscriptWindow.initialMessageLimit, before: before)
  }
}
