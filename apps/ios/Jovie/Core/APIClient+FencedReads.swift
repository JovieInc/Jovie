import Foundation

extension APIClient {
  func sendAppleWalletProfilePassRequest(
    forceRefresh: Bool,
    tokenOverride: String? = nil,
    inheritedFence: NativeSessionRequestFence? = nil
  ) async throws -> Data {
    let (authorization, token, sessionFence) = try await resolveLegacyRequestCredentials(
      forceRefresh: forceRefresh,
      tokenOverride: tokenOverride,
      inheritedFence: inheritedFence
    )
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
      let refreshed = try await APIClientSessionFence.refreshOrDiscard(
        after: token, fence: sessionFence, provider: tokenProvider
      )
      return try await sendAppleWalletProfilePassRequest(
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

    return data
  }

  func sendAudienceHighlightsRequest(
    forceRefresh: Bool,
    tokenOverride: String? = nil,
    inheritedFence: NativeSessionRequestFence? = nil
  ) async throws -> MobileAudienceHighlightsResponse {
    let (authorization, token, sessionFence) = try await resolveLegacyRequestCredentials(
      forceRefresh: forceRefresh,
      tokenOverride: tokenOverride,
      inheritedFence: inheritedFence
    )
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
      let refreshed = try await APIClientSessionFence.refreshOrDiscard(
        after: token, fence: sessionFence, provider: tokenProvider
      )
      return try await sendAudienceHighlightsRequest(
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

    do {
      return try decoder.decode(MobileAudienceHighlightsResponse.self, from: data)
    } catch {
      throw APIClientError.decodingFailed
    }
  }

  func sendActionLoopInboxRequest(
    workspace: MobileWorkspaceMode,
    forceRefresh: Bool,
    tokenOverride: String? = nil,
    inheritedFence: NativeSessionRequestFence? = nil
  ) async throws -> MobileActionLoopInboxResponse {
    let (authorization, token, sessionFence) = try await resolveLegacyRequestCredentials(
      forceRefresh: forceRefresh,
      tokenOverride: tokenOverride,
      inheritedFence: inheritedFence
    )
    var components = URLComponents(
      url: baseURL.appending(path: "/api/mobile/v1/inbox"),
      resolvingAgainstBaseURL: false
    )
    if workspace == .ovie {
      components?.queryItems = [URLQueryItem(name: "workspace", value: workspace.rawValue)]
    }
    guard let url = components?.url else {
      throw APIClientError.invalidResponse
    }
    var request = URLRequest(url: url)
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
      let refreshed = try await APIClientSessionFence.refreshOrDiscard(
        after: token, fence: sessionFence, provider: tokenProvider
      )
      return try await sendActionLoopInboxRequest(
        workspace: workspace,
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

    do {
      return try decoder.decode(MobileActionLoopInboxResponse.self, from: data)
    } catch {
      throw APIClientError.decodingFailed
    }
  }

  func sendActionLoopCalendarRequest(
    forceRefresh: Bool,
    tokenOverride: String? = nil,
    inheritedFence: NativeSessionRequestFence? = nil
  ) async throws -> MobileActionLoopCalendarResponse {
    let (authorization, token, sessionFence) = try await resolveLegacyRequestCredentials(
      forceRefresh: forceRefresh,
      tokenOverride: tokenOverride,
      inheritedFence: inheritedFence
    )
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
      let refreshed = try await APIClientSessionFence.refreshOrDiscard(
        after: token, fence: sessionFence, provider: tokenProvider
      )
      return try await sendActionLoopCalendarRequest(
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

    do {
      return try decoder.decode(MobileActionLoopCalendarResponse.self, from: data)
    } catch {
      throw APIClientError.decodingFailed
    }
  }
}
