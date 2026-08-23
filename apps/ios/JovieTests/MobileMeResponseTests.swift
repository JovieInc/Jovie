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
        "chatEnabled": true,
        "continueOnWebUrl": "https://jov.ie/app"
      }
      """.data(using: .utf8)!

    let response = try JSONDecoder().decode(MobileMeResponse.self, from: data)

    #expect(response.state == .ready)
    #expect(response.publicProfileURL == "https://jov.ie/tim")
    #expect(response.appleWalletProfilePassAvailable == true)
    #expect(response.chatEnabled == true)
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
        "chatEnabled": false,
        "continueOnWebUrl": "https://jov.ie/app"
      }
      """.data(using: .utf8)!

    let response = try JSONDecoder().decode(MobileMeResponse.self, from: data)

    #expect(response.state == .needsOnboarding)
    #expect(response.continueOnWebURL == "https://jov.ie/app")
    #expect(response.chatEnabled == false)
  }

  @Test func decodesWaitlistPendingResponse() throws {
    let data = """
      {
        "state": "waitlist_pending",
        "displayName": null,
        "username": null,
        "publicProfileUrl": null,
        "qrPayload": null,
        "avatarUrl": null,
        "appleWalletProfilePassAvailable": false,
        "chatEnabled": false,
        "continueOnWebUrl": "https://jov.ie/app"
      }
      """.data(using: .utf8)!

    let response = try JSONDecoder().decode(MobileMeResponse.self, from: data)

    #expect(response.state == .waitlistPending)
  }

  @Test func missingIsAdminDoesNotShowWorkspaceSwitch() throws {
    let data = """
      {
        "state": "ready",
        "displayName": "Tim White",
        "username": "tim",
        "publicProfileUrl": "https://jov.ie/tim",
        "qrPayload": "https://jov.ie/tim",
        "avatarUrl": null,
        "appleWalletProfilePassAvailable": true,
        "chatEnabled": true,
        "continueOnWebUrl": "https://jov.ie/app"
      }
      """.data(using: .utf8)!

    let response = try JSONDecoder().decode(MobileMeResponse.self, from: data)

    #expect(response.isAdmin == nil)
    #expect(response.showsAdminWorkspaceSwitch == false)
  }

  @Test func isAdminTrueShowsWorkspaceSwitch() throws {
    let data = """
      {
        "state": "ready",
        "displayName": "Tim White",
        "username": "tim",
        "publicProfileUrl": "https://jov.ie/tim",
        "qrPayload": "https://jov.ie/tim",
        "avatarUrl": null,
        "appleWalletProfilePassAvailable": true,
        "chatEnabled": true,
        "continueOnWebUrl": "https://jov.ie/app",
        "isAdmin": true
      }
      """.data(using: .utf8)!

    let response = try JSONDecoder().decode(MobileMeResponse.self, from: data)

    #expect(response.isAdmin == true)
    #expect(response.showsAdminWorkspaceSwitch)
  }

  @Test func previewReadyHidesWorkspaceSwitch() {
    #expect(MobileMeResponse.previewReady.showsAdminWorkspaceSwitch == false)
  }

  @Test func workspaceStoreForcesJovieForNonAdmin() {
    let suiteName = "MobileWorkspaceStoreTests-non-admin"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    defaults.set(MobileWorkspaceMode.ovie.rawValue, forKey: MobileWorkspaceStore.defaultsKey)

    #expect(MobileWorkspaceStore.load(isAdmin: false, defaults: defaults) == .jovie)

    MobileWorkspaceStore.save(.ovie, isAdmin: false, defaults: defaults)
    #expect(defaults.string(forKey: MobileWorkspaceStore.defaultsKey) == MobileWorkspaceMode.jovie.rawValue)
  }

  @Test func workspaceStorePersistsOvieForAdmin() {
    let suiteName = "MobileWorkspaceStoreTests-admin"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)

    MobileWorkspaceStore.save(.ovie, isAdmin: true, defaults: defaults)
    #expect(MobileWorkspaceStore.load(isAdmin: true, defaults: defaults) == .ovie)
  }

  @Test func inboxStillImageURLOnlyForStillType() {
    let still = MobileActionLoopInboxItem(
      id: "still-1",
      typeLabel: "Still",
      createdAt: "2026-08-02T00:00:00.000Z",
      title: "Merch still",
      why: "Existing Telegram still — do not regenerate.",
      primaryActionLabel: "Review",
      status: "pending",
      imageURL: "https://cdn.jov.ie/stills/16197.jpg"
    )
    let card = MobileActionLoopInboxItem(
      id: "card-1",
      typeLabel: "Card",
      createdAt: "2026-08-01T00:00:00.000Z",
      title: "Taste card",
      why: "Approve the quiet hero treatment.",
      primaryActionLabel: "Review",
      status: "pending",
      imageURL: "https://cdn.jov.ie/cards/local.png"
    )

    #expect(still.stillImageURL?.absoluteString == "https://cdn.jov.ie/stills/16197.jpg")
    #expect(card.stillImageURL == nil)
  }
}
