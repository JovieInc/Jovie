import Foundation

enum APIClientError: Error, Equatable, LocalizedError {
  case decodingFailed
  case invalidResponse
  case missingToken
  case transportFailed(code: Int)
  case requestFailed(statusCode: Int)
  case profileCompletionFailed(statusCode: Int, message: String)

  var errorDescription: String? {
    switch self {
    case .decodingFailed:
      return "The server response could not be decoded."
    case .invalidResponse:
      return "The server returned an invalid response."
    case .missingToken:
      return "No Better Auth session token is available."
    case let .transportFailed(code):
      return "The network request failed with code \(code)."
    case let .requestFailed(statusCode):
      return "The request failed with status code \(statusCode)."
    case let .profileCompletionFailed(_, message):
      return message
    }
  }
}

protocol TokenProviding: Sendable {
  func bearerToken(forceRefresh: Bool) async throws -> String
  func requestAuthorization(forceRefresh: Bool) async throws -> NativeRequestAuthorization
  func ownedRequestAuthorization(for userID: String, ifOwnedBy ownership: NativeSessionOwnership) async throws
    -> NativeRequestAuthorization
}

extension TokenProviding {
  func ownedRequestAuthorization(for _: String, ifOwnedBy _: NativeSessionOwnership) async throws
    -> NativeRequestAuthorization
  {
    NativeRequestAuthorization(unmanagedBearerToken: try await bearerToken(forceRefresh: false))
  }

  func requestAuthorization(forceRefresh: Bool) async throws -> NativeRequestAuthorization {
    NativeRequestAuthorization(
      unmanagedBearerToken: try await bearerToken(forceRefresh: forceRefresh)
    )
  }

  /// Throws `missingToken` when force-refresh cannot mint a different token.
  func refreshedBearerToken(after failedToken: String) async throws -> String {
    let token = try await bearerToken(forceRefresh: true)
    guard token != failedToken else {
      throw APIClientError.missingToken
    }
    return token
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
