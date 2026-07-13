import Foundation

enum APIClientError: Error, Equatable, LocalizedError {
  case decodingFailed
  case invalidResponse
  case missingToken
  case transportFailed(code: Int)
  case requestFailed(statusCode: Int)

  var errorDescription: String? {
    switch self {
    case .decodingFailed:
      return "The server response could not be decoded."
    case .invalidResponse:
      return "The server returned an invalid response."
    case .missingToken:
      return "No Clerk session token is available."
    case let .transportFailed(code):
      return "The network request failed with code \(code)."
    case let .requestFailed(statusCode):
      return "The request failed with status code \(statusCode)."
    }
  }
}

protocol TokenProviding: Sendable {
  func bearerToken(forceRefresh: Bool) async throws -> String
}

protocol APIClientProtocol: Sendable {
  func fetchMe() async throws -> MobileMeResponse
  func fetchAppleWalletProfilePass() async throws -> Data
  func fetchAudienceHighlights() async throws -> MobileAudienceHighlightsResponse
  func fetchActionLoopInbox() async throws -> MobileActionLoopInboxResponse
  func fetchActionLoopCalendar() async throws -> MobileActionLoopCalendarResponse
}

struct APIClient: APIClientProtocol, Sendable {
  private let baseURL: URL
  private let session: URLSession
  private let tokenProvider: TokenProviding
  private let decoder: JSONDecoder
  private let requestTimeout: TimeInterval

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

  /**
   * Refresh the stored native session token + expiry from the bearer
   * plugin's `set-auth-token` response header (Clerk → Better Auth
   * migration, eng row 31). The server emits this header when the session
   * cookie rolls (per `updateAge`); the iOS client never needs to force a
   * refresh — every API call that returns the header updates Keychain
   * in-place. Returns silently when the header is absent (no roll this
   * call) or malformed (kept token stays authoritative).
   */
  private func refreshStoredSessionFromResponse(
    _ response: URLResponse,
    expectedUserID: String? = nil
  ) {
    guard let httpResponse = response as? HTTPURLResponse else { return }
    guard let newToken = httpResponse.value(forHTTPHeaderField: "set-auth-token"),
          newToken.isEmpty == false
    else { return }

    let stored = NativeSessionTokenStore.load()
    let userID = expectedUserID ?? stored?.userID ?? ""
    guard userID.isEmpty == false else { return }

    // Preserve the existing expiry if the server doesn't send a new one;
    // BA's session.expiresIn (7 days) is the source of truth, and the
    // header doesn't currently carry a new expiry — we extend the existing
    // expiry by 7 days from now to match the server's roll cadence.
    let newExpiry = Date().addingTimeInterval(60 * 60 * 24 * 7)
    NativeSessionTokenStore.save(token: newToken, userID: userID, expiresAt: newExpiry)
  }

  /**
   * Terminal 401 path (eng row 31): a 401 even after `forceRefresh` means
   * the session is revoked or expired beyond client-side refresh. Clear
   * Keychain so the next launch shows the signed-out state. The caller is
   * responsible for surfacing the sign-in screen.
   */
  private func handleTerminalUnauthorized() {
    NativeSessionTokenStore.clear()
    MobileAuthDiagnostics.record("native_session_cleared_terminal_401")
  }

  func fetchMe() async throws -> MobileMeResponse {
    try await sendMeRequest(forceRefresh: false)
  }

  func fetchAppleWalletProfilePass() async throws -> Data {
    try await sendAppleWalletProfilePassRequest(forceRefresh: false)
  }

  func fetchAudienceHighlights() async throws -> MobileAudienceHighlightsResponse {
    try await sendAudienceHighlightsRequest(forceRefresh: false)
  }

  func fetchActionLoopInbox() async throws -> MobileActionLoopInboxResponse {
    try await sendActionLoopInboxRequest(forceRefresh: false)
  }

  func fetchActionLoopCalendar() async throws -> MobileActionLoopCalendarResponse {
    try await sendActionLoopCalendarRequest(forceRefresh: false)
  }

  private func sendMeRequest(forceRefresh: Bool) async throws -> MobileMeResponse {
    let token = try await tokenProvider.bearerToken(forceRefresh: forceRefresh)
    var request = URLRequest(url: baseURL.appending(path: "/api/mobile/v1/me"))
    request.httpMethod = "GET"
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    let data: Data
    let response: URLResponse

    do {
      (data, response) = try await session.data(for: request)
    } catch let error as URLError {
      throw APIClientError.transportFailed(code: error.code.rawValue)
    } catch {
      throw APIClientError.invalidResponse
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      MobileAuthDiagnostics.record("mobile_me_invalid_response")
      throw APIClientError.invalidResponse
    }

    if httpResponse.statusCode == 401, !forceRefresh {
      MobileAuthDiagnostics.record("mobile_me_retrying", detail: "status=401")
      return try await sendMeRequest(forceRefresh: true)
    }
    if httpResponse.statusCode == 401, forceRefresh {
      handleTerminalUnauthorized()
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      MobileAuthDiagnostics.record(
        "mobile_me_failed",
        detail: "status=\(httpResponse.statusCode)"
      )
      throw APIClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    refreshStoredSessionFromResponse(response)

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

  private func sendAppleWalletProfilePassRequest(forceRefresh: Bool) async throws -> Data {
    let token = try await tokenProvider.bearerToken(forceRefresh: forceRefresh)
    var request = URLRequest(url: baseURL.appending(path: "/api/wallet/apple/profile-pass"))
    request.httpMethod = "GET"
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/vnd.apple.pkpass", forHTTPHeaderField: "Accept")

    let data: Data
    let response: URLResponse

    do {
      (data, response) = try await session.data(for: request)
    } catch let error as URLError {
      throw APIClientError.transportFailed(code: error.code.rawValue)
    } catch {
      throw APIClientError.invalidResponse
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      throw APIClientError.invalidResponse
    }

    if httpResponse.statusCode == 401, !forceRefresh {
      return try await sendAppleWalletProfilePassRequest(forceRefresh: true)
    }
    if httpResponse.statusCode == 401, forceRefresh {
      handleTerminalUnauthorized()
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw APIClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    refreshStoredSessionFromResponse(response)

    return data
  }

  private func sendAudienceHighlightsRequest(
    forceRefresh: Bool
  ) async throws -> MobileAudienceHighlightsResponse {
    let token = try await tokenProvider.bearerToken(forceRefresh: forceRefresh)
    var request = URLRequest(
      url: baseURL.appending(path: "/api/mobile/v1/audience/highlights")
    )
    request.httpMethod = "GET"
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    let data: Data
    let response: URLResponse

    do {
      (data, response) = try await session.data(for: request)
    } catch let error as URLError {
      throw APIClientError.transportFailed(code: error.code.rawValue)
    } catch {
      throw APIClientError.invalidResponse
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      throw APIClientError.invalidResponse
    }

    if httpResponse.statusCode == 401, !forceRefresh {
      return try await sendAudienceHighlightsRequest(forceRefresh: true)
    }
    if httpResponse.statusCode == 401, forceRefresh {
      handleTerminalUnauthorized()
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw APIClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    refreshStoredSessionFromResponse(response)

    do {
      return try decoder.decode(MobileAudienceHighlightsResponse.self, from: data)
    } catch {
      throw APIClientError.decodingFailed
    }
  }

  private func sendActionLoopInboxRequest(
    forceRefresh: Bool
  ) async throws -> MobileActionLoopInboxResponse {
    let token = try await tokenProvider.bearerToken(forceRefresh: forceRefresh)
    var request = URLRequest(url: baseURL.appending(path: "/api/mobile/v1/inbox"))
    request.httpMethod = "GET"
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    let data: Data
    let response: URLResponse

    do {
      (data, response) = try await session.data(for: request)
    } catch let error as URLError {
      throw APIClientError.transportFailed(code: error.code.rawValue)
    } catch {
      throw APIClientError.invalidResponse
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      throw APIClientError.invalidResponse
    }

    if httpResponse.statusCode == 401, !forceRefresh {
      return try await sendActionLoopInboxRequest(forceRefresh: true)
    }
    if httpResponse.statusCode == 401, forceRefresh {
      handleTerminalUnauthorized()
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw APIClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    refreshStoredSessionFromResponse(response)

    do {
      return try decoder.decode(MobileActionLoopInboxResponse.self, from: data)
    } catch {
      throw APIClientError.decodingFailed
    }
  }

  private func sendActionLoopCalendarRequest(
    forceRefresh: Bool
  ) async throws -> MobileActionLoopCalendarResponse {
    let token = try await tokenProvider.bearerToken(forceRefresh: forceRefresh)
    var request = URLRequest(url: baseURL.appending(path: "/api/mobile/v1/calendar"))
    request.httpMethod = "GET"
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    let data: Data
    let response: URLResponse

    do {
      (data, response) = try await session.data(for: request)
    } catch let error as URLError {
      throw APIClientError.transportFailed(code: error.code.rawValue)
    } catch {
      throw APIClientError.invalidResponse
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      throw APIClientError.invalidResponse
    }

    if httpResponse.statusCode == 401, !forceRefresh {
      return try await sendActionLoopCalendarRequest(forceRefresh: true)
    }
    if httpResponse.statusCode == 401, forceRefresh {
      handleTerminalUnauthorized()
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw APIClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    refreshStoredSessionFromResponse(response)

    do {
      return try decoder.decode(MobileActionLoopCalendarResponse.self, from: data)
    } catch {
      throw APIClientError.decodingFailed
    }
  }
}

extension URLSessionConfiguration {
  static var jovieMobile: URLSessionConfiguration {
    let configuration = URLSessionConfiguration.default
    configuration.timeoutIntervalForRequest = 15
    configuration.timeoutIntervalForResource = 30
    configuration.waitsForConnectivity = false
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    return configuration
  }
}
