import Foundation

enum IOSPushEnvironment: String, Encodable, Sendable {
  case sandbox
  case production
}

protocol APIClientProtocol: Sendable {
  func fetchMe() async throws -> MobileMeResponse
  func fetchMe(for userID: String, ifOwnedBy ownership: NativeSessionOwnership) async throws -> MobileMeResponse
  func fetchAppleWalletProfilePass() async throws -> Data
  func fetchAudienceHighlights() async throws -> MobileAudienceHighlightsResponse
  func fetchActionLoopInbox() async throws -> MobileActionLoopInboxResponse
  func fetchActionLoopCalendar() async throws -> MobileActionLoopCalendarResponse
  func decideSummerCard(
    cardID: String,
    decision: SummerCardDecision,
    comment: String?
  ) async throws -> SummerCardDecisionResult
}

/// Result of POSTing a Summer card decision; `alreadyDecided` maps the server's 409.
enum SummerCardDecisionResult: Equatable, Sendable {
  case decided
  case alreadyDecided
}

extension APIClientProtocol {
  func fetchMe(for _: String, ifOwnedBy _: NativeSessionOwnership) async throws -> MobileMeResponse {
    try await fetchMe()
  }

  func decideSummerCard(
    cardID _: String,
    decision _: SummerCardDecision,
    comment _: String?
  ) async throws -> SummerCardDecisionResult {
    throw APIClientError.invalidResponse
  }
}

protocol ProfileCompleting: Sendable {
  func completeProfile(
    displayName: String, username: String, for userID: String,
    ifOwnedBy ownership: NativeSessionOwnership
  ) async throws
}

struct APIClient: APIClientProtocol, ProfileCompleting, Sendable {
  private struct ProfileCompletionRequest: Encodable {
    let displayName: String
    let username: String
  }

  private struct ProfileCompletionResponse: Decodable {
    let profileId: String
  }

  private struct ProfileCompletionErrorResponse: Decodable {
    let error: String
  }

  private struct RegisterPushDeviceRequest: Encodable {
    let token: String
    let environment: IOSPushEnvironment
    let timezone: String
  }

  private struct UnregisterPushDeviceRequest: Encodable {
    let token: String
  }

  let baseURL: URL
  let session: URLSession
  let tokenProvider: TokenProviding
  let decoder: JSONDecoder
  let requestTimeout: TimeInterval

  init(
    baseURL: URL,
    session: URLSession = URLSession(configuration: .jovieMobile),
    tokenProvider: TokenProviding,
    requestTimeout: TimeInterval = 15
  ) {
    self.baseURL = baseURL
    self.session = session
    self.tokenProvider = tokenProvider
    self.decoder = JSONDecoder()
    self.requestTimeout = requestTimeout
  }

  func resolveAuthorization(
    forceRefresh: Bool,
    tokenOverride: String?
  ) async throws -> NativeRequestAuthorization {
    if let tokenOverride {
      // A retry token cannot inherit authority from whichever login is current.
      return NativeRequestAuthorization(unmanagedBearerToken: tokenOverride)
    }
    return try await tokenProvider.requestAuthorization(forceRefresh: forceRefresh)
  }

  /// Legacy 401 retries keep the original request fence so a suspended refresh
  /// cannot adopt a replacement login as the terminal owner (JOV-12807).
  func resolveLegacyRequestCredentials(
    forceRefresh: Bool,
    tokenOverride: String?,
    inheritedFence: NativeSessionRequestFence?
  ) async throws -> (
    authorization: NativeRequestAuthorization,
    token: String,
    fence: NativeSessionRequestFence
  ) {
    let authorization = try await resolveAuthorization(
      forceRefresh: forceRefresh, tokenOverride: tokenOverride
    )
    if let tokenOverride, let inheritedFence {
      return (authorization, tokenOverride, inheritedFence)
    }
    let captured = APIClientSessionFence.capture(for: authorization)
    return (authorization, captured.token, captured.fence)
  }

  func fetchMe() async throws -> MobileMeResponse {
    try await sendMeRequest(forceRefresh: false)
  }

  func fetchMe(for userID: String, ifOwnedBy ownership: NativeSessionOwnership) async throws -> MobileMeResponse {
    try await sendMeRequest(forceRefresh: false, ifOwnedBy: ownership, userID: userID)
  }

  func registerPushDevice(
    token: String,
    environment: IOSPushEnvironment,
    timezone: String
  ) async throws {
    try await sendPushDeviceRequest(
      method: "PUT",
      body: RegisterPushDeviceRequest(
        token: token,
        environment: environment,
        timezone: timezone
      ),
      forceRefresh: false
    )
  }

  /// Push lifecycle work keeps the authorization captured by its owner and
  /// never retries with credentials from a later login.
  func registerPushDevice(
    token: String,
    environment: IOSPushEnvironment,
    timezone: String,
    authorization: NativeRequestAuthorization
  ) async throws {
    try await sendPushDeviceRequest(
      method: "PUT",
      body: RegisterPushDeviceRequest(
        token: token,
        environment: environment,
        timezone: timezone
      ),
      forceRefresh: false,
      pinnedAuthorization: authorization
    )
  }

  func unregisterPushDevice(token: String) async throws {
    try await sendPushDeviceRequest(
      method: "DELETE",
      body: UnregisterPushDeviceRequest(token: token),
      forceRefresh: false
    )
  }

  func unregisterPushDevice(
    token: String,
    authorization: NativeRequestAuthorization
  ) async throws {
    try await sendPushDeviceRequest(
      method: "DELETE",
      body: UnregisterPushDeviceRequest(token: token),
      forceRefresh: false,
      pinnedAuthorization: authorization
    )
  }

  func fetchAppleWalletProfilePass() async throws -> Data {
    try await sendAppleWalletProfilePassRequest(forceRefresh: false)
  }

  func fetchAudienceHighlights() async throws -> MobileAudienceHighlightsResponse {
    try await sendAudienceHighlightsRequest(forceRefresh: false)
  }

  func fetchActionLoopInbox() async throws -> MobileActionLoopInboxResponse {
    try await fetchActionLoopInbox(workspace: .jovie)
  }

  func fetchActionLoopInbox(workspace: MobileWorkspaceMode) async throws -> MobileActionLoopInboxResponse {
    try await sendActionLoopInboxRequest(workspace: workspace, forceRefresh: false)
  }

  func fetchActionLoopCalendar() async throws -> MobileActionLoopCalendarResponse {
    try await sendActionLoopCalendarRequest(forceRefresh: false)
  }

  func decideSummerCard(
    cardID: String,
    decision: SummerCardDecision,
    comment: String?
  ) async throws -> SummerCardDecisionResult {
    try await sendSummerCardDecisionRequest(
      cardID: cardID,
      decision: decision,
      comment: comment,
      forceRefresh: false
    )
  }

  private func sendPushDeviceRequest<Body: Encodable>(
    method: String,
    body: Body,
    forceRefresh: Bool,
    tokenOverride: String? = nil,
    pinnedAuthorization: NativeRequestAuthorization? = nil,
    inheritedFence: NativeSessionRequestFence? = nil
  ) async throws {
    let authorization: NativeRequestAuthorization
    let token: String
    let sessionFence: NativeSessionRequestFence
    if let pinnedAuthorization {
      authorization = pinnedAuthorization
      (token, sessionFence) = APIClientSessionFence.capture(for: authorization)
    } else {
      (authorization, token, sessionFence) = try await resolveLegacyRequestCredentials(
        forceRefresh: forceRefresh,
        tokenOverride: tokenOverride,
        inheritedFence: inheritedFence
      )
    }
    var request = URLRequest(url: baseURL.appending(path: "/api/mobile/v1/push-devices"))
    request.httpMethod = method
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(body)

    let response: URLResponse
    do {
      (_, response) = try await session.data(for: request)
    } catch let error as URLError {
      throw APIClientError.transportFailed(code: error.code.rawValue)
    } catch {
      throw APIClientError.invalidResponse
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      throw APIClientError.invalidResponse
    }
    if httpResponse.statusCode == 401, pinnedAuthorization != nil {
      // Best-effort push cleanup cannot invalidate the current app session.
      throw APIClientError.requestFailed(statusCode: 401)
    }
    if httpResponse.statusCode == 401, !forceRefresh {
      let refreshed = try await APIClientSessionFence.refreshOrDiscard(
        after: token, fence: sessionFence, provider: tokenProvider
      )
      return try await sendPushDeviceRequest(
        method: method,
        body: body,
        forceRefresh: true,
        tokenOverride: refreshed.token,
        inheritedFence: refreshed.fence
      )
    }
    if httpResponse.statusCode == 401, forceRefresh {
      APIClientSessionFence.terminalIfCurrent(sessionFence)
    }
    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw APIClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    NativeSessionTokenStore.refresh(from: response, authorizedBy: authorization)
  }

  private struct SummerCardDecisionRequest: Encodable {
    let decision: String
    let comment: String?
  }

  private func sendSummerCardDecisionRequest(
    cardID: String,
    decision: SummerCardDecision,
    comment: String?,
    forceRefresh: Bool,
    tokenOverride: String? = nil,
    inheritedFence: NativeSessionRequestFence? = nil
  ) async throws -> SummerCardDecisionResult {
    let (authorization, token, sessionFence) = try await resolveLegacyRequestCredentials(
      forceRefresh: forceRefresh,
      tokenOverride: tokenOverride,
      inheritedFence: inheritedFence
    )
    var request = URLRequest(
      url: baseURL.appending(path: "/api/ovie/summer-cards/\(cardID)/decision")
    )
    request.httpMethod = "POST"
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(
      SummerCardDecisionRequest(decision: decision.rawValue, comment: comment)
    )

    let response: URLResponse
    do {
      (_, response) = try await session.data(for: request)
    } catch let error as URLError {
      throw APIClientError.transportFailed(code: error.code.rawValue)
    } catch {
      throw APIClientError.invalidResponse
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      throw APIClientError.invalidResponse
    }

    if httpResponse.statusCode == 401 {
      if forceRefresh {
        APIClientSessionFence.terminalIfCurrent(sessionFence)
        throw APIClientError.requestFailed(statusCode: 401)
      }
      let refreshed = try await APIClientSessionFence.refreshOrDiscard(
        after: token, fence: sessionFence, provider: tokenProvider
      )
      return try await sendSummerCardDecisionRequest(
        cardID: cardID,
        decision: decision,
        comment: comment,
        forceRefresh: true,
        tokenOverride: refreshed.token,
        inheritedFence: refreshed.fence
      )
    }

    if httpResponse.statusCode == 409 {
      NativeSessionTokenStore.refresh(from: response, authorizedBy: authorization)
      return .alreadyDecided
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw APIClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    NativeSessionTokenStore.refresh(from: response, authorizedBy: authorization)
    return .decided
  }

  func completeProfile(displayName: String, username: String) async throws {
    try await sendProfileCompletionRequest(
      displayName: displayName,
      username: username,
      forceRefresh: false
    )
  }

  func completeProfile(
    displayName: String, username: String, for userID: String,
    ifOwnedBy ownership: NativeSessionOwnership
  ) async throws {
    try await sendProfileCompletionRequest(
      displayName: displayName, username: username, forceRefresh: false,
      ownership: ownership, userID: userID
    )
  }

  private func sendProfileCompletionRequest(
    displayName: String,
    username: String,
    forceRefresh: Bool,
    tokenOverride: String? = nil,
    ownership: NativeSessionOwnership? = nil,
    userID: String? = nil,
    authorizationOverride: NativeRequestAuthorization? = nil,
    inheritedFence: NativeSessionRequestFence? = nil
  ) async throws {
    let authorization: NativeRequestAuthorization
    let token: String
    let sessionFence: NativeSessionRequestFence
    if let authorizationOverride {
      authorization = authorizationOverride
      (token, sessionFence) = APIClientSessionFence.capture(for: authorization)
    } else if let ownership, let userID {
      try Task.checkCancellation()
      authorization = try await tokenProvider.ownedRequestAuthorization(for: userID, ifOwnedBy: ownership)
      (token, sessionFence) = APIClientSessionFence.capture(for: authorization)
    } else {
      (authorization, token, sessionFence) = try await resolveLegacyRequestCredentials(
        forceRefresh: forceRefresh,
        tokenOverride: tokenOverride,
        inheritedFence: inheritedFence
      )
    }
    func validateOwner() throws {
      guard let ownership else { return }
      guard authorization.ownership == ownership, let userID else {
        throw NativeSessionRequestError.superseded
      }
      _ = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: ownership, for: userID)
    }
    var request = URLRequest(
      url: baseURL.appending(path: "/api/mobile/v1/profile/complete")
    )
    request.httpMethod = "POST"
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(
      ProfileCompletionRequest(displayName: displayName, username: username)
    )

    let data: Data
    let response: URLResponse
    try validateOwner()
    if ownership != nil { try Task.checkCancellation() }
    do {
      (data, response) = try await session.data(for: request)
    } catch let error as URLError {
      if ownership != nil, error.code == .cancelled { throw CancellationError() }
      try validateOwner()
      throw APIClientError.transportFailed(code: error.code.rawValue)
    } catch {
      if ownership != nil, error is CancellationError { throw error }
      try validateOwner()
      throw APIClientError.invalidResponse
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      try validateOwner()
      if ownership != nil { try Task.checkCancellation() }
      throw APIClientError.invalidResponse
    }
    if httpResponse.statusCode == 401, let ownership {
      // Rejection belongs to the bearer sent. A later login cannot supply a retry.
      let retry = try NativeSessionTokenStore.resolveUnauthorized(
        authorizedBy: authorization, allowRetry: !forceRefresh
      )
      return try await sendProfileCompletionRequest(
        displayName: displayName, username: username, forceRefresh: true,
        ownership: ownership, userID: userID, authorizationOverride: retry
      )
    }
    try validateOwner()
    if ownership != nil { try Task.checkCancellation() }
    if httpResponse.statusCode == 401, !forceRefresh {
      let refreshed = try await APIClientSessionFence.refreshOrDiscard(
        after: token, fence: sessionFence, provider: tokenProvider
      )
      return try await sendProfileCompletionRequest(
        displayName: displayName,
        username: username,
        forceRefresh: true,
        tokenOverride: refreshed.token,
        inheritedFence: refreshed.fence
      )
    }
    if httpResponse.statusCode == 401, forceRefresh {
      APIClientSessionFence.terminalIfCurrent(sessionFence)
      throw APIClientError.requestFailed(statusCode: 401)
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      let message = (try? decoder.decode(ProfileCompletionErrorResponse.self, from: data).error)
        ?? "Couldn't complete your profile. Try again."
      throw APIClientError.profileCompletionFailed(
        statusCode: httpResponse.statusCode,
        message: message
      )
    }

    NativeSessionTokenStore.refresh(from: response, authorizedBy: authorization)
    guard (try? decoder.decode(ProfileCompletionResponse.self, from: data)) != nil else {
      throw APIClientError.decodingFailed
    }
  }

  private func sendMeRequest(
    forceRefresh: Bool,
    tokenOverride: String? = nil,
    ifOwnedBy ownership: NativeSessionOwnership? = nil,
    userID: String? = nil,
    authorizationOverride: NativeRequestAuthorization? = nil,
    inheritedFence: NativeSessionRequestFence? = nil
  ) async throws -> MobileMeResponse {
    let authorization: NativeRequestAuthorization
    let token: String
    let sessionFence: NativeSessionRequestFence
    if let authorizationOverride {
      authorization = authorizationOverride
      (token, sessionFence) = APIClientSessionFence.capture(for: authorization)
    } else if let ownership {
      guard let userID else { throw NativeSessionRequestError.superseded }
      try Task.checkCancellation()
      authorization = try await tokenProvider.ownedRequestAuthorization(for: userID, ifOwnedBy: ownership)
      (token, sessionFence) = APIClientSessionFence.capture(for: authorization)
    } else {
      (authorization, token, sessionFence) = try await resolveLegacyRequestCredentials(
        forceRefresh: forceRefresh,
        tokenOverride: tokenOverride,
        inheritedFence: inheritedFence
      )
    }
    var request = URLRequest(url: baseURL.appending(path: "/api/mobile/v1/me"))
    request.httpMethod = "GET"
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(
      "waitlist_pending",
      forHTTPHeaderField: "X-Jovie-Mobile-Capabilities"
    )

    let data: Data
    let response: URLResponse

    do {
      (data, response) = try await session.data(for: request)
    } catch let error as URLError {
      if ownership != nil, error.code == .cancelled { throw CancellationError() }
      throw APIClientError.transportFailed(code: error.code.rawValue)
    } catch {
      if ownership != nil, error is CancellationError { throw error }
      throw APIClientError.invalidResponse
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      MobileAuthDiagnostics.record("mobile_me_invalid_response")
      throw APIClientError.invalidResponse
    }

    if httpResponse.statusCode == 401, let ownership {
      let retry: NativeRequestAuthorization
      if authorization.isManaged {
        retry = try NativeSessionTokenStore.resolveUnauthorized(
          authorizedBy: authorization, allowRetry: !forceRefresh
        )
      } else {
        guard !forceRefresh else { throw APIClientError.requestFailed(statusCode: 401) }
        retry = NativeRequestAuthorization(
          unmanagedBearerToken: try await tokenProvider.refreshedBearerToken(after: token)
        )
      }
      return try await sendMeRequest(
        forceRefresh: true, ifOwnedBy: ownership, userID: userID, authorizationOverride: retry
      )
    }

    if httpResponse.statusCode == 401, !forceRefresh {
      let refreshed = try await APIClientSessionFence.refreshOrDiscard(
        after: token, fence: sessionFence, provider: tokenProvider
      )
      MobileAuthDiagnostics.record("mobile_me_retrying", detail: "status=401")
      return try await sendMeRequest(
        forceRefresh: true,
        tokenOverride: refreshed.token,
        inheritedFence: refreshed.fence
      )
    }
    if httpResponse.statusCode == 401, forceRefresh {
      APIClientSessionFence.terminalIfCurrent(sessionFence)
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      MobileAuthDiagnostics.record(
        "mobile_me_failed",
        detail: "status=\(httpResponse.statusCode)"
      )
      throw APIClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    NativeSessionTokenStore.refresh(from: response, authorizedBy: authorization)

    if ownership != nil { try Task.checkCancellation() }

    do {
      MobileAuthDiagnostics.record(
        "mobile_me_succeeded",
        detail: "status=\(httpResponse.statusCode)"
      )
      return try decoder.decode(MobileMeResponse.self, from: data)
    } catch {
      MobileAuthDiagnostics.record("mobile_me_decode_failed")
      throw APIClientError.decodingFailed
    }
  }
}
