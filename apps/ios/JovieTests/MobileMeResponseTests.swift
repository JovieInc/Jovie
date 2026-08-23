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
    #expect(response.isAdmin == nil)
    #expect(response.showsAdminWorkspaceSwitch == false)
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

  @Test func isAdminTrueShowsWorkspaceSwitch() throws {
    let data = Data(
      #"{"state":"ready","displayName":"Tim","username":"tim","publicProfileUrl":"https://jov.ie/tim","qrPayload":"https://jov.ie/tim","avatarUrl":null,"appleWalletProfilePassAvailable":true,"chatEnabled":true,"continueOnWebUrl":"https://jov.ie/app","isAdmin":true}"#.utf8
    )
    let response = try JSONDecoder().decode(MobileMeResponse.self, from: data)
    #expect(response.isAdmin == true)
    #expect(response.showsAdminWorkspaceSwitch)
    #expect(MobileMeResponse.previewReady.showsAdminWorkspaceSwitch == false)
  }

  @Test func workspaceStoreForcesJovieForNonAdminAndPersistsOvieForAdmin() {
    let suiteName = "MobileWorkspaceStoreTests"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    defaults.set(MobileWorkspaceMode.ovie.rawValue, forKey: MobileWorkspaceStore.defaultsKey)
    #expect(MobileWorkspaceStore.load(isAdmin: false, defaults: defaults) == .jovie)
    MobileWorkspaceStore.save(.ovie, isAdmin: false, defaults: defaults)
    #expect(defaults.string(forKey: MobileWorkspaceStore.defaultsKey) == MobileWorkspaceMode.jovie.rawValue)
    MobileWorkspaceStore.save(.ovie, isAdmin: true, defaults: defaults)
    #expect(MobileWorkspaceStore.load(isAdmin: true, defaults: defaults) == .ovie)
  }

  @Test func ovieCopyTalksToSummerAndJovieComposerStaysEmpty() {
    #expect(MobileWorkspaceMode.ovie.askChatLabel == "Ask Summer")
    #expect(MobileWorkspaceMode.ovie.composerOfflinePlaceholder == "Ask Summer (offline)")
    #expect(MobileWorkspaceMode.ovie.emptyChatSubtitle.contains("Summer"))
    #expect(MobileWorkspaceMode.jovie.askChatLabel == "Ask Jovie")
    #expect(ChatComposerCopy.emptyPlaceholder.isEmpty)
    #expect(ChatEmptyGreeting.lockedCopy.contains("Ask Jovie") == false)
  }

  @Test func inboxStillImageURLOnlyForStillType() {
    func item(_ type: String, url: String) -> MobileActionLoopInboxItem {
      MobileActionLoopInboxItem(
        id: type,
        typeLabel: type,
        createdAt: "2026-08-02T00:00:00.000Z",
        title: type,
        why: "x",
        primaryActionLabel: "Review",
        status: "pending",
        imageURL: url
      )
    }
    #expect(
      item("Still", url: "https://cdn.jov.ie/stills/16197.jpg").stillImageURL?.absoluteString
        == "https://cdn.jov.ie/stills/16197.jpg"
    )
    #expect(item("Card", url: "https://cdn.jov.ie/cards/local.png").stillImageURL == nil)
  }
}
