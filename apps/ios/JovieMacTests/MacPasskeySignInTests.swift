import XCTest
@testable import JovieMac

final class MacPasskeySignInTests: XCTestCase {
  func testBase64URLRoundTripsWithoutPadding() {
    let data = Data([0xFB, 0xFF, 0xBF, 0x00, 0x10])
    let encoded = Base64URL.encode(data)

    XCTAssertEqual(encoded, "-_-_ABA")
    XCTAssertFalse(encoded.contains("="))
    XCTAssertEqual(Base64URL.decode(encoded), data)
  }

  func testBase64URLRejectsImpossibleLength() {
    XCTAssertNil(Base64URL.decode("abcde"))
  }

  func testDecodesBetterAuthAssertionOptions() throws {
    let json = Data("""
    {"rpId":"staging.jov.ie","challenge":"rpzP9VAzBL0GrxubIfyYFwYHKn-uGXjU67s6yxIAtXs",
     "timeout":60000,"userVerification":"preferred"}
    """.utf8)

    let options = try JSONDecoder().decode(PasskeyAssertionOptions.self, from: json)

    XCTAssertEqual(options.rpId, "staging.jov.ie")
    XCTAssertEqual(options.userVerification, "preferred")
    XCTAssertNil(options.allowCredentials)
    XCTAssertEqual(Base64URL.decode(options.challenge)?.count, 32)
  }

  func testVerificationBodyMatchesSimpleWebAuthnShape() throws {
    let assertion = PasskeyAssertion(
      credentialID: Data([1, 2, 3]),
      clientDataJSON: Data("{}".utf8),
      authenticatorData: Data([4, 5]),
      signature: Data([6]),
      userHandle: nil
    )

    let data = try JSONEncoder().encode(PasskeyVerificationBody(assertion: assertion))
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    let credential = try XCTUnwrap(object["response"] as? [String: Any])
    let response = try XCTUnwrap(credential["response"] as? [String: Any])

    XCTAssertEqual(credential["id"] as? String, "AQID")
    XCTAssertEqual(credential["rawId"] as? String, "AQID")
    XCTAssertEqual(credential["type"] as? String, "public-key")
    XCTAssertEqual(credential["authenticatorAttachment"] as? String, "platform")
    XCTAssertNotNil(credential["clientExtensionResults"] as? [String: Any])
    XCTAssertEqual(response["clientDataJSON"] as? String, "e30")
    XCTAssertEqual(response["authenticatorData"] as? String, "BAU")
    XCTAssertEqual(response["signature"] as? String, "Bg")
    XCTAssertNil(response["userHandle"])
  }

  func testSignInResultPrefersBearerHeaderToken() throws {
    let body = Data("""
    {"session":{"token":"raw","userId":"u1","expiresAt":"2026-10-04T04:00:00.000Z"},"user":{"id":"u1"}}
    """.utf8)
    let response = try XCTUnwrap(HTTPURLResponse(
      url: URL(string: "https://jov.ie")!,
      statusCode: 200,
      httpVersion: nil,
      headerFields: ["set-auth-token": "raw.signed"]
    ))

    let result = try PasskeyAuthClient.signInResult(from: body, response: response)

    XCTAssertEqual(result.token, "raw.signed")
    XCTAssertEqual(result.userID, "u1")
    XCTAssertEqual(result.expiresAt, PasskeyAuthClient.parseDate("2026-10-04T04:00:00.000Z"))
  }

  func testSignInResultFallsBackToSessionToken() throws {
    let body = Data("""
    {"session":{"token":"raw","userId":"u1","expiresAt":"2026-10-04T04:00:00Z"}}
    """.utf8)
    let response = try XCTUnwrap(HTTPURLResponse(
      url: URL(string: "https://jov.ie")!,
      statusCode: 200,
      httpVersion: nil,
      headerFields: nil
    ))

    let result = try PasskeyAuthClient.signInResult(from: body, response: response)

    XCTAssertEqual(result.token, "raw")
    XCTAssertNotNil(PasskeyAuthClient.parseDate("2026-10-04T04:00:00Z"))
  }

  func testSignInResultRejectsBodyWithoutSession() throws {
    let response = try XCTUnwrap(HTTPURLResponse(
      url: URL(string: "https://jov.ie")!,
      statusCode: 200,
      httpVersion: nil,
      headerFields: nil
    ))

    XCTAssertThrowsError(
      try PasskeyAuthClient.signInResult(from: Data("{}".utf8), response: response)
    ) { error in
      XCTAssertEqual(error as? PasskeySignInError, .invalidResponse(step: "verify"))
    }
  }

  func testWebAuthnOriginIsSchemeAndHost() {
    XCTAssertEqual(
      PasskeyAuthClient(baseURL: URL(string: "https://staging.jov.ie/")!).webAuthnOrigin,
      "https://staging.jov.ie"
    )
    XCTAssertEqual(
      PasskeyAuthClient(baseURL: URL(string: "http://localhost:3100")!).webAuthnOrigin,
      "http://localhost:3100"
    )
  }

  func testBaseURLOverrideAcceptsOnlyHTTPSOrLoopback() {
    let defaults = UserDefaults(suiteName: "MacPasskeySignInTests")!
    defaults.removePersistentDomain(forName: "MacPasskeySignInTests")

    XCTAssertEqual(
      MacConfiguration.baseURL(environment: [:], defaults: defaults),
      MacConfiguration.defaultBaseURL
    )
    XCTAssertEqual(
      MacConfiguration.baseURL(
        environment: ["JOVIE_MAC_BASE_URL": "https://staging.jov.ie"],
        defaults: defaults
      ).host,
      "staging.jov.ie"
    )
    XCTAssertEqual(
      MacConfiguration.baseURL(
        environment: ["JOVIE_MAC_BASE_URL": "http://evil.example"],
        defaults: defaults
      ),
      MacConfiguration.defaultBaseURL
    )
  }

  @MainActor
  func testFixtureBootstrapShowsHomeWithoutNetwork() async {
    let model = MacSessionModel(baseURL: MacConfiguration.defaultBaseURL, isFixture: true)

    await model.bootstrap()

    XCTAssertEqual(model.phase, .signedIn)
    XCTAssertEqual(model.me?.username, "tim")
    XCTAssertEqual(model.ops, .fixture)
  }
}
