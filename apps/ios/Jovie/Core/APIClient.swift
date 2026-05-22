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

  func fetchMe() async throws -> MobileMeResponse {
    try await sendMeRequest(forceRefresh: false)
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
      throw APIClientError.invalidResponse
    }

    if httpResponse.statusCode == 401, !forceRefresh {
      return try await sendMeRequest(forceRefresh: true)
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      throw APIClientError.requestFailed(statusCode: httpResponse.statusCode)
    }

    do {
      return try decoder.decode(MobileMeResponse.self, from: data)
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
