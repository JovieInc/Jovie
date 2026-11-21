import Foundation
import Testing
@testable import Jovie

struct FirstValueLandingPolicyTests {
  // JOV-13845: first live ready lands Identity once; later live launches keep chat.
  @Test func firstLiveReadyLandsIdentityBeforePermanentChatHome() {
    #expect(
      FirstValueLandingPolicy.readyInitialTab(
        launchMode: .live,
        hasPresentedIdentityFirstValue: false
      ) == .profile
    )
    #expect(
      FirstValueLandingPolicy.readyInitialTab(
        launchMode: .live,
        hasPresentedIdentityFirstValue: true
      ) == .chat
    )
  }

  @Test func uiTestingChatLaunchStillForcesChatHome() {
    #expect(
      FirstValueLandingPolicy.readyInitialTab(
        launchMode: .uiTestingChat,
        hasPresentedIdentityFirstValue: false
      ) == .chat
    )
  }

  @Test func uiTestingReadyKeepsProfileDefaultThroughFirstValuePolicy() {
    #expect(
      FirstValueLandingPolicy.readyInitialTab(
        launchMode: .uiTestingReady,
        hasPresentedIdentityFirstValue: false
      ) == .profile
    )
  }

  @Test func uiTestingAudienceLaunchStillForcesAudience() {
    #expect(
      FirstValueLandingPolicy.readyInitialTab(
        launchMode: .uiTestingAudience,
        hasPresentedIdentityFirstValue: false
      ) == .audience
    )
  }

  @Test func identityFirstValueStorageIsPerUser() {
    let suiteName = "jovie.firstValue.policy.tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let userID = "user_first_value_policy"

    #expect(
      FirstValueLandingPolicy.hasPresentedIdentityFirstValue(userID: userID, defaults: defaults)
        == false
    )
    FirstValueLandingPolicy.markIdentityFirstValuePresented(userID: userID, defaults: defaults)
    #expect(
      FirstValueLandingPolicy.hasPresentedIdentityFirstValue(userID: userID, defaults: defaults)
    )
    #expect(
      FirstValueLandingPolicy.hasPresentedIdentityFirstValue(
        userID: "other_user",
        defaults: defaults
      ) == false
    )
    defaults.removePersistentDomain(forName: suiteName)
  }

  @Test @MainActor func appStateLockConsumesFirstValueBitOnlyWhenRequested() {
    let suiteName = "jovie.firstValue.lock.tests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let previous = FirstValueLandingPolicy.replaceDefaultsForTesting(defaults)
    defer {
      _ = FirstValueLandingPolicy.replaceDefaultsForTesting(previous)
      defaults.removePersistentDomain(forName: suiteName)
    }

    let configuration = AppConfiguration(
      apiBaseURL: URL(string: "http://localhost:3100")!,
      webBaseURL: URL(string: "https://jov.ie")!,
      sentryDSN: nil,
      observabilityIngestURL: nil,
      observabilityIngestSecret: nil,
      observabilityEnvironment: "test"
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: FirstValueLandingStubRepository(),
      brightnessManager: FirstValueLandingStubBrightness()
    )
    appState.activeUserID = "user_lock"

    appState.lockReadyShellInitialTab(markIdentityFirstValue: false)
    #expect(appState.readyShellInitialTab == .profile)
    #expect(
      FirstValueLandingPolicy.hasPresentedIdentityFirstValue(userID: "user_lock") == false
    )

    appState.lockReadyShellInitialTab(markIdentityFirstValue: true)
    #expect(appState.readyShellInitialTab == .profile)
    #expect(FirstValueLandingPolicy.hasPresentedIdentityFirstValue(userID: "user_lock"))

    appState.lockReadyShellInitialTab(markIdentityFirstValue: true)
    #expect(appState.readyShellInitialTab == .chat)
  }
}

private struct FirstValueLandingStubRepository: AppStateRepository {
  func loadMe(for _: String) async throws -> MeRepositoryResult {
    MeRepositoryResult(response: .previewReady, isStale: false)
  }

  func clearCachedUser(_: String) async {}
}

private final class FirstValueLandingStubBrightness: BrightnessControlling, @unchecked Sendable {
  func setMaxBrightness() async {}
  func restoreBrightness() async {}
}
