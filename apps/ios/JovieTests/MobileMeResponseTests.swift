import Foundation
import Testing
@testable import Jovie

struct MobileMeResponseTests {
  @Test func decodesReadyResponse() throws {
    let data = """
      {
        "state": "ready",
        "displayName": "DJ Shadow",
        "username": "djshadow",
        "publicProfileUrl": "https://jov.ie/djshadow",
        "qrPayload": "https://jov.ie/djshadow",
        "avatarUrl": null,
        "continueOnWebUrl": "https://jov.ie/app"
      }
      """.data(using: .utf8)!

    let response = try JSONDecoder().decode(MobileMeResponse.self, from: data)

    #expect(response.state == .ready)
    #expect(response.publicProfileURL == "https://jov.ie/djshadow")
  }

  @Test func decodesNeedsOnboardingResponse() throws {
    let data = """
      {
        "state": "needs_onboarding",
        "displayName": null,
        "username": null,
        "publicProfileUrl": null,
        "qrPayload": null,
        "avatarUrl": null,
        "continueOnWebUrl": "https://jov.ie/app"
      }
      """.data(using: .utf8)!

    let response = try JSONDecoder().decode(MobileMeResponse.self, from: data)

    #expect(response.state == .needsOnboarding)
    #expect(response.continueOnWebURL == "https://jov.ie/app")
  }
}
