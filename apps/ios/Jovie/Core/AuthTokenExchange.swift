import Foundation

enum NativeAuthExchangeError: Error, Equatable, LocalizedError {
  case decodingFailed
  case invalidResponse
  case rejectedBeforeConsume(reason: String)
  case requestFailed(statusCode: Int, reason: String? = nil)
  case transportFailed(code: Int)

  var errorDescription: String? {
    switch self {
    case .decodingFailed:
      return "The auth response could not be decoded."
    case .invalidResponse:
      return "The auth server returned an invalid response."
    case .rejectedBeforeConsume:
      return "This sign-in link could not be completed. Try signing in again."
    case let .requestFailed(statusCode, reason):
      if let reason, !reason.isEmpty {
        return "The auth exchange failed with status code \(statusCode) (\(reason))."
      }
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
        codeVerifier: authReturn.codeVerifier,
        nativeAttempt: authReturn.nativeAttempt
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
      // The route returns a typed `reason` for handled rejections
      // (missing/expired/wrong_verifier/ott_missing/ott_invalid/…). Carry it
      // through so a bare "401" in telemetry is attributable (JOV-4853).
      let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
      let reason = Self.exchangeFailureReason(from: object)
      MobileAuthDiagnostics.record(
        "native_exchange_failed",
        detail: "status=\(httpResponse.statusCode)\(reason.map { " reason=\($0)" } ?? "")"
      )
      if httpResponse.statusCode == 401,
         object?["exchangePhase"] as? String == "preconsume",
         let rawReason = object?["reason"] as? String,
         ["missing", "wrong_code", "wrong_client", "wrong_state", "wrong_attempt", "wrong_verifier", "expired", "replayed"]
           .contains(rawReason) {
        throw NativeAuthExchangeError.rejectedBeforeConsume(reason: rawReason)
      }
      throw NativeAuthExchangeError.requestFailed(
        statusCode: httpResponse.statusCode,
        reason: reason
      )
    }

    do {
      MobileAuthDiagnostics.record("native_exchange_succeeded")
      return try decoder.decode(NativeAuthExchangeResponse.self, from: data)
    } catch {
      MobileAuthDiagnostics.record("native_exchange_decode_failed")
      throw NativeAuthExchangeError.decodingFailed
    }
  }

  private static func exchangeFailureReason(from object: [String: Any]?) -> String? {
    guard let object,
      let reason = (object["reason"] as? String)?
        .trimmingCharacters(in: .whitespacesAndNewlines),
      !reason.isEmpty
    else {
      return nil
    }

    return reason
  }
}

private struct NativeAuthExchangeRequest: Encodable {
  let client: String
  let code: String
  let state: String
  let codeVerifier: String
  let nativeAttempt: String?
}
