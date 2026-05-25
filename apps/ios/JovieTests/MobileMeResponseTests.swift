import Foundation
import Testing
@testable import Jovie

struct MobileMeResponseTests {
  @Test func decodesReadyResponse() throws {
    let data = """
      {
        "state": "ready",
        "displayName": "Tim White",
        "username": "tim",
        "publicProfileUrl": "https://jov.ie/tim",
        "qrPayload": "https://jov.ie/tim",
        "avatarUrl": null,
        "appleWalletProfilePassAvailable": true,
        "continueOnWebUrl": "https://jov.ie/app"
      }
      """.data(using: .utf8)!

    let response = try JSONDecoder().decode(MobileMeResponse.self, from: data)

    #expect(response.state == .ready)
    #expect(response.publicProfileURL == "https://jov.ie/tim")
    #expect(response.appleWalletProfilePassAvailable == true)
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
        "appleWalletProfilePassAvailable": false,
        "continueOnWebUrl": "https://jov.ie/app"
      }
      """.data(using: .utf8)!

    let response = try JSONDecoder().decode(MobileMeResponse.self, from: data)

    #expect(response.state == .needsOnboarding)
    #expect(response.continueOnWebURL == "https://jov.ie/app")
  }
}
