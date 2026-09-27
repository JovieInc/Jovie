import AppKit
import AuthenticationServices
import Foundation

/// WebAuthn assertion options from Better Auth's
/// `GET /api/auth/passkey/generate-authenticate-options`.
struct PasskeyAssertionOptions: Decodable, Equatable, Sendable {
  struct AllowedCredential: Decodable, Equatable, Sendable {
    let id: String
  }

  let challenge: String
  let rpId: String?
  let allowCredentials: [AllowedCredential]?
  let userVerification: String?
}

/// Raw platform assertion returned by `ASAuthorizationController`.
struct PasskeyAssertion: Equatable, Sendable {
  let credentialID: Data
  let clientDataJSON: Data
  let authenticatorData: Data
  let signature: Data
  let userHandle: Data?
}

enum Base64URL {
  static func encode(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  static func decode(_ value: String) -> Data? {
    var base64 = value
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    let remainder = base64.count % 4
    if remainder == 1 { return nil }
    if remainder > 0 {
      base64 += String(repeating: "=", count: 4 - remainder)
    }
    return Data(base64Encoded: base64)
  }
}

/// Body for `POST /api/auth/passkey/verify-authentication`: a WebAuthn
/// `AuthenticationResponseJSON` wrapped in `{ response }`, the shape
/// `@better-auth/passkey` hands to SimpleWebAuthn.
struct PasskeyVerificationBody: Encodable, Equatable {
  struct Credential: Encodable, Equatable {
    struct Response: Encodable, Equatable {
      let clientDataJSON: String
      let authenticatorData: String
      let signature: String
      let userHandle: String?
    }

    struct ClientExtensionResults: Encodable, Equatable {}

    let id: String
    let rawId: String
    let type = "public-key"
    let response: Response
    let clientExtensionResults = ClientExtensionResults()
    let authenticatorAttachment = "platform"
  }

  let response: Credential

  init(assertion: PasskeyAssertion) {
    let id = Base64URL.encode(assertion.credentialID)
    response = Credential(
      id: id,
      rawId: id,
      response: .init(
        clientDataJSON: Base64URL.encode(assertion.clientDataJSON),
        authenticatorData: Base64URL.encode(assertion.authenticatorData),
        signature: Base64URL.encode(assertion.signature),
        userHandle: assertion.userHandle.map(Base64URL.encode)
      )
    )
  }
}

struct PasskeySignInResult: Equatable, Sendable {
  let userID: String
  let token: String
  let expiresAt: Date
}

enum PasskeySignInError: Error, Equatable, LocalizedError {
  case invalidOptions
  case requestFailed(step: String, statusCode: Int)
  case transportFailed(step: String, code: Int)
  case invalidResponse(step: String)
  case cancelled
  case authorizationFailed(code: Int, message: String)

  var errorDescription: String? {
    switch self {
    case .invalidOptions:
      return "The server sent passkey options this Mac can't use."
    case let .requestFailed(step, statusCode):
      return "Passkey \(step) failed with status \(statusCode)."
    case let .transportFailed(step, code):
      return "Passkey \(step) network request failed (\(code))."
    case let .invalidResponse(step):
      return "Passkey \(step) returned an invalid response."
    case .cancelled:
      return "Sign-in was cancelled."
    case let .authorizationFailed(code, message):
      return "macOS refused the passkey request (\(code)): \(message)"
    }
  }
}

/// Better Auth passkey ceremony over HTTP. The challenge lives in the signed
/// `better-auth-passkey` cookie, so options and verify must share one cookie
/// jar; a dedicated ephemeral session keeps it out of shared storage.
struct PasskeyAuthClient: Sendable {
  private let baseURL: URL
  private let session: URLSession

  init(baseURL: URL) {
    self.baseURL = baseURL
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 15
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    session = URLSession(configuration: configuration)
  }

  /// WebAuthn origin the server verifies `clientDataJSON` against. macOS
  /// stamps `https://<rpId>` for an app with a `webcredentials:` association.
  var webAuthnOrigin: String {
    guard let scheme = baseURL.scheme, let host = baseURL.host else { return "" }
    if let port = baseURL.port { return "\(scheme)://\(host):\(port)" }
    return "\(scheme)://\(host)"
  }

  func fetchOptions() async throws -> PasskeyAssertionOptions {
    var request = URLRequest(
      url: baseURL.appending(path: "/api/auth/passkey/generate-authenticate-options")
    )
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    let data = try await send(request, step: "options").data
    guard let options = try? JSONDecoder().decode(PasskeyAssertionOptions.self, from: data)
    else {
      throw PasskeySignInError.invalidResponse(step: "options")
    }
    return options
  }

  func verify(_ assertion: PasskeyAssertion) async throws -> PasskeySignInResult {
    var request = URLRequest(
      url: baseURL.appending(path: "/api/auth/passkey/verify-authentication")
    )
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(webAuthnOrigin, forHTTPHeaderField: "Origin")
    request.httpBody = try JSONEncoder().encode(PasskeyVerificationBody(assertion: assertion))

    let (data, response) = try await send(request, step: "verify")
    return try Self.signInResult(from: data, response: response)
  }

  static func signInResult(from data: Data, response: HTTPURLResponse) throws
    -> PasskeySignInResult
  {
    struct Body: Decodable {
      struct Session: Decodable {
        let token: String
        let userId: String
        let expiresAt: String
      }

      let session: Session
    }

    guard let body = try? JSONDecoder().decode(Body.self, from: data) else {
      throw PasskeySignInError.invalidResponse(step: "verify")
    }

    // The bearer plugin's signed token wins; the raw session token also
    // authenticates when the header is absent.
    let headerToken = response.value(forHTTPHeaderField: "set-auth-token")
    let token = (headerToken?.isEmpty == false ? headerToken : nil) ?? body.session.token
    let expiresAt = Self.parseDate(body.session.expiresAt)
      ?? Date().addingTimeInterval(60 * 60 * 24 * 7)
    return PasskeySignInResult(userID: body.session.userId, token: token, expiresAt: expiresAt)
  }

  static func parseDate(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }

  private func send(_ request: URLRequest, step: String) async throws
    -> (data: Data, response: HTTPURLResponse)
  {
    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await session.data(for: request)
    } catch let error as URLError {
      throw PasskeySignInError.transportFailed(step: step, code: error.code.rawValue)
    }
    guard let http = response as? HTTPURLResponse else {
      throw PasskeySignInError.invalidResponse(step: step)
    }
    guard (200 ... 299).contains(http.statusCode) else {
      throw PasskeySignInError.requestFailed(step: step, statusCode: http.statusCode)
    }
    return (data, http)
  }
}

/// Runs one platform passkey assertion. On macOS 14+ the system sheet lists
/// iCloud Keychain and enabled credential-provider extensions (1Password).
@MainActor
final class PasskeyAssertionPerformer: NSObject {
  private var continuation: CheckedContinuation<PasskeyAssertion, Error>?
  private var controller: ASAuthorizationController?

  func assert(options: PasskeyAssertionOptions, relyingParty: String) async throws
    -> PasskeyAssertion
  {
    guard let challenge = Base64URL.decode(options.challenge) else {
      throw PasskeySignInError.invalidOptions
    }

    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
      relyingPartyIdentifier: options.rpId ?? relyingParty
    )
    let request = provider.createCredentialAssertionRequest(challenge: challenge)
    request.allowedCredentials = (options.allowCredentials ?? []).compactMap {
      Base64URL.decode($0.id).map(ASAuthorizationPlatformPublicKeyCredentialDescriptor.init)
    }
    if let verification = options.userVerification {
      request.userVerificationPreference = .init(rawValue: verification)
    }

    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    self.controller = controller

    return try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      controller.performRequests()
    }
  }

  private func finish(_ result: Result<PasskeyAssertion, Error>) {
    continuation?.resume(with: result)
    continuation = nil
    controller = nil
  }
}

extension PasskeyAssertionPerformer: ASAuthorizationControllerDelegate {
  func authorizationController(
    controller _: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    guard
      let credential = authorization.credential
        as? ASAuthorizationPlatformPublicKeyCredentialAssertion
    else {
      finish(.failure(PasskeySignInError.invalidResponse(step: "assertion")))
      return
    }
    finish(
      .success(
        PasskeyAssertion(
          credentialID: credential.credentialID,
          clientDataJSON: credential.rawClientDataJSON,
          authenticatorData: credential.rawAuthenticatorData,
          signature: credential.signature,
          userHandle: credential.userID
        )
      )
    )
  }

  func authorizationController(
    controller _: ASAuthorizationController,
    didCompleteWithError error: Error
  ) {
    let nsError = error as NSError
    if nsError.domain == ASAuthorizationError.errorDomain,
       nsError.code == ASAuthorizationError.canceled.rawValue
    {
      finish(.failure(PasskeySignInError.cancelled))
      return
    }
    finish(
      .failure(
        PasskeySignInError.authorizationFailed(
          code: nsError.code,
          message: nsError.localizedDescription
        )
      )
    )
  }
}

extension PasskeyAssertionPerformer: ASAuthorizationControllerPresentationContextProviding {
  func presentationAnchor(for _: ASAuthorizationController) -> ASPresentationAnchor {
    NSApp.keyWindow ?? NSApp.windows.first ?? ASPresentationAnchor()
  }
}
