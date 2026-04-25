import Foundation

enum APIClientError: Error, Equatable, LocalizedError {
  case invalidResponse
  case missingToken
  case requestFailed(statusCode: Int)

  var errorDescription: String? {
    switch self {
    case .invalidResponse:
      return "The server returned an invalid response."
    case .missingToken:
      return "No Clerk session token is available."
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
}

struct APIClient: APIClientProtocol, Sendable {
  private let baseURL: URL
  private let session: URLSession
  private let tokenProvider: TokenProviding
  private let decoder: JSONDecoder

  init(
    baseURL: URL,
    session: URLSession = .shared,
    tokenProvider: TokenProviding
  ) {
    self.baseURL = baseURL
    self.session = session
    self.tokenProvider = tokenProvider
    self.decoder = JSONDecoder()
  }

  func fetchMe() async throws -> MobileMeResponse {
    try await sendMeRequest(forceRefresh: false)
  }

  private func sendMeRequest(forceRefresh: Bool) async throws -> MobileMeResponse {
    let token = try await tokenProvider.bearerToken(forceRefresh: forceRefresh)
    var request = URLRequest(url: baseURL.appending(path: "/api/mobile/v1/me"))
    request.httpMethod = "GET"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw APIClientError.invalidResponse
    }

    if httpResponse.statusCode == 401, !forceRefresh {
      return try await sendMeRequest(forceRefresh: true)
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw APIClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    return try decoder.decode(MobileMeResponse.self, from: data)
  }
}
