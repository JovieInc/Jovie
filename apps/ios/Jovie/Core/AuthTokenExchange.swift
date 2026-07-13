import Foundation

enum NativeAuthExchangeError: Error, Equatable, LocalizedError {
  case decodingFailed
  case invalidResponse
  case requestFailed(statusCode: Int)
  case transportFailed(code: Int)

  var errorDescription: String? {
    switch self {
    case .decodingFailed:
      return "The auth response could not be decoded."
    case .invalidResponse:
      return "The auth server returned an invalid response."
    case let .requestFailed(statusCode):
      return "The auth exchange failed with status code \(statusCode)."
    case let .transportFailed(code):
      return "The auth exchange network request failed with code \(code)."
    }
  }
}

struct NativeAuthExchangeResponse: Decodable, Equatable {
  let ticket: String?
  let sessionToken: String?
  let sessionId: String?
  let userId: String?
  let returnTo: String
  let expiresInSeconds: Int
}

struct NativeAuthExchangeClient: Sendable {
  private let baseURL: URL
  private let session: URLSession
  private let decoder: JSONDecoder
  private let encoder: JSONEncoder
  private let requestTimeout: TimeInterval

  init(
    baseURL: URL,
    session: URLSession = URLSession(configuration: .jovieMobile),
    requestTimeout: TimeInterval = 15
  ) {
    self.baseURL = baseURL
    self.session = session
    self.decoder = JSONDecoder()
    self.encoder = JSONEncoder()
    self.requestTimeout = requestTimeout
  }

  func exchange(_ authReturn: MobileAuthReturn) async throws -> NativeAuthExchangeResponse {
    var request = URLRequest(url: baseURL.appending(path: "/api/auth/native/exchange"))
    request.httpMethod = "POST"
    request.timeoutInterval = requestTimeout
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try encoder.encode(
      NativeAuthExchangeRequest(
        client: "ios",
        code: authReturn.code,
        state: authReturn.state,
        codeVerifier: authReturn.codeVerifier
      )
    )

    let data: Data
    let response: URLResponse

    do {
      (data, response) = try await session.data(for: request)
    } catch let error as URLError {
      throw NativeAuthExchangeError.transportFailed(code: error.code.rawValue)
    } catch {
      throw NativeAuthExchangeError.invalidResponse
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      MobileAuthDiagnostics.record("native_exchange_invalid_response")
      throw NativeAuthExchangeError.invalidResponse
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      MobileAuthDiagnostics.record(
        "native_exchange_failed",
        detail: "status=\(httpResponse.statusCode)"
      )
      throw NativeAuthExchangeError.requestFailed(statusCode: httpResponse.statusCode)
    }

    do {
      MobileAuthDiagnostics.record("native_exchange_succeeded")
      return try decoder.decode(NativeAuthExchangeResponse.self, from: data)
    } catch {
      MobileAuthDiagnostics.record("native_exchange_decode_failed")
      throw NativeAuthExchangeError.decodingFailed
    }
  }
}

private struct NativeAuthExchangeRequest: Encodable {
  let client: String
  let code: String
  let state: String
  let codeVerifier: String
}
