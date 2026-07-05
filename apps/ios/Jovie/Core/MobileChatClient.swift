import Foundation

protocol MobileChatClientProtocol: Sendable {
  func listConversations(limit: Int) async throws -> [MobileConversationSummary]
  func fetchConversation(id: String, limit: Int) async throws -> MobileConversationDetailResponse
  func sendTurn(_ request: MobileChatTurnRequest) async throws -> [MobileChatStreamEvent]
}

struct MobileChatClient: MobileChatClientProtocol, Sendable {
  private let baseURL: URL
  private let session: URLSession
  private let tokenProvider: TokenProviding
  private let decoder: JSONDecoder
  private let encoder: JSONEncoder
  private let requestTimeout: TimeInterval

  init(
    baseURL: URL,
    session: URLSession = URLSession(configuration: .jovieMobile),
    tokenProvider: TokenProviding,
    requestTimeout: TimeInterval = 30
  ) {
    self.baseURL = baseURL
    self.session = session
    self.tokenProvider = tokenProvider
    self.decoder = JSONDecoder()
    self.encoder = JSONEncoder()
    self.requestTimeout = requestTimeout
  }

  func listConversations(limit: Int = 20) async throws -> [MobileConversationSummary] {
    var components = URLComponents(
      url: baseURL.appending(path: "/api/mobile/v1/chat/conversations"),
      resolvingAgainstBaseURL: false
    )
    components?.queryItems = [URLQueryItem(name: "limit", value: String(limit))]
    guard let url = components?.url else {
      throw MobileChatClientError.invalidResponse
    }

    let response: MobileConversationListResponse = try await sendJSON(
      request: try await authorizedRequest(url: url, method: "GET"),
      forceRefresh: false
    )
    return response.conversations
  }

  func fetchConversation(id: String, limit: Int = 100) async throws -> MobileConversationDetailResponse {
    var components = URLComponents(
      url: baseURL.appending(path: "/api/mobile/v1/chat/conversations/\(id)"),
      resolvingAgainstBaseURL: false
    )
    components?.queryItems = [URLQueryItem(name: "limit", value: String(limit))]
    guard let url = components?.url else {
      throw MobileChatClientError.invalidResponse
    }

    return try await sendJSON(
      request: try await authorizedRequest(url: url, method: "GET"),
      forceRefresh: false
    )
  }

  func sendTurn(_ request: MobileChatTurnRequest) async throws -> [MobileChatStreamEvent] {
    var urlRequest = try await authorizedRequest(
      url: baseURL.appending(path: "/api/mobile/v1/chat/turns"),
      method: "POST"
    )
    urlRequest.setValue("application/x-ndjson", forHTTPHeaderField: "Accept")
    urlRequest.httpBody = try encoder.encode(request)

    let (data, response) = try await performData(for: urlRequest)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw MobileChatClientError.invalidResponse
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw MobileChatClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    return try parseStreamEvents(from: data)
  }

  private func authorizedRequest(url: URL, method: String) async throws -> URLRequest {
    let token = try await tokenProvider.bearerToken(forceRefresh: false)
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = requestTimeout
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return request
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
      var refreshed = request
      let token = try await tokenProvider.bearerToken(forceRefresh: true)
      refreshed.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      return try await sendJSON(request: refreshed, forceRefresh: true)
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw MobileChatClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

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

  private func parseStreamEvents(from data: Data) throws -> [MobileChatStreamEvent] {
    guard let raw = String(data: data, encoding: .utf8) else {
      throw MobileChatClientError.decodingFailed
    }

    var events: [MobileChatStreamEvent] = []

    for line in raw.split(whereSeparator: \.isNewline) {
      let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty else { continue }
      guard let lineData = trimmed.data(using: .utf8) else {
        throw MobileChatClientError.decodingFailed
      }

      let jsonObject: Any
      do {
        jsonObject = try JSONSerialization.jsonObject(with: lineData)
      } catch {
        throw MobileChatClientError.decodingFailed
      }

      guard let json = jsonObject as? [String: Any],
            let type = json["type"] as? String else {
        throw MobileChatClientError.decodingFailed
      }

      switch type {
      case "turn.reserved":
        guard
          let conversationId = json["conversationId"] as? String,
          let turnId = json["turnId"] as? String,
          let clientTurnId = json["clientTurnId"] as? String
        else { throw MobileChatClientError.decodingFailed }
        events.append(.turnReserved(
          conversationId: conversationId,
          turnId: turnId,
          clientTurnId: clientTurnId
        ))

      case "assistant.delta":
        guard
          let clientTurnId = json["clientTurnId"] as? String,
          let text = json["text"] as? String
        else { throw MobileChatClientError.decodingFailed }
        events.append(.assistantDelta(clientTurnId: clientTurnId, text: text))

      case "assistant.completed":
        guard
          let clientTurnId = json["clientTurnId"] as? String,
          let conversationId = json["conversationId"] as? String,
          let turnId = json["turnId"] as? String,
          let text = json["text"] as? String
        else { throw MobileChatClientError.decodingFailed }
        events.append(.assistantCompleted(
          clientTurnId: clientTurnId,
          conversationId: conversationId,
          turnId: turnId,
          text: text
        ))

      case "web.handoff":
        guard
          let clientTurnId = json["clientTurnId"] as? String,
          let conversationId = json["conversationId"] as? String,
          let urlString = json["url"] as? String,
          let summary = json["summary"] as? String,
          let url = URL(string: urlString, relativeTo: baseURL)?.absoluteURL
        else { throw MobileChatClientError.decodingFailed }
        events.append(.webHandoff(
          clientTurnId: clientTurnId,
          conversationId: conversationId,
          url: url,
          summary: summary
        ))

      case "error":
        let code = json["errorCode"] as? String ?? "UNKNOWN"
        let message = json["message"] as? String ?? "Native chat failed."
        events.append(.error(code: code, message: message))

      default:
        continue
      }
    }

    if events.isEmpty {
      throw MobileChatClientError.streamFailed(message: "Native chat returned no events.")
    }

    return events
  }
}
