import Testing
@testable import Jovie

@MainActor
@Suite(.serialized)
struct JovieAppIntentsTests {
  @Test func openChatIntentRequestsChat() async throws {
    IntentNavigationStore.shared.consume()

    _ = try await OpenChatIntent().perform()

    #expect(IntentNavigationStore.shared.consume() == .openChat)
  }

  @Test func sendMessageIntentRequestsMessageText() async throws {
    IntentNavigationStore.shared.consume()

    let intent = SendMessageIntent()
    intent.message = "launch my single"
    _ = try await intent.perform()

    #expect(
      IntentNavigationStore.shared.consume() ==
        .sendMessage(text: "launch my single", autoSend: true)
    )
  }

  @Test func continueLastConversationIntentRequestsResume() async throws {
    IntentNavigationStore.shared.consume()

    _ = try await ContinueLastConversationIntent().perform()

    #expect(
      IntentNavigationStore.shared.consume() == .continueLastConversation
    )
  }

  @Test func startVoiceCaptureIntentRequestsVoice() async throws {
    IntentNavigationStore.shared.consume()

    _ = try await StartVoiceCaptureIntent().perform()

    guard case let .startEyesFreeCapture(launch) = IntentNavigationStore.shared.consume() else {
      Issue.record("expected eyes-free Jovie launch")
      return
    }
    #expect(launch.destination == .jovie)
    #expect(launch.spokenText == nil)
  }

  @Test func summerCaptureIntentUsesClosedDestination() async throws {
    IntentNavigationStore.shared.consume()

    _ = try await CaptureForSummerIntent().perform()

    guard case let .startEyesFreeCapture(launch) = IntentNavigationStore.shared.consume() else {
      Issue.record("expected eyes-free Summer launch")
      return
    }
    #expect(launch.destination == .summer)
    #expect(launch.idempotencyKey.isEmpty == false)
  }

  @Test func shortcutsExposeVoiceCapture() {
    #expect(JovieAppShortcuts.appShortcuts.count == 5)
  }
}

struct PushNotificationDeepLinkTests {
  @Test func ctaUrlParsesFromAPNsUserInfo() {
    let userInfo: [AnyHashable: Any] = [
      "notificationId": "notif_1",
      "url": "https://jovie.ing/artist/release",
      "aps": ["alert": ["title": "New release"]],
    ]

    #expect(
      PushNotificationDeepLink.url(from: userInfo) ==
        URL(string: "https://jovie.ing/artist/release")
    )
  }

  @Test func missingOrMalformedUrlDrops() {
    #expect(PushNotificationDeepLink.url(from: [:]) == nil)
    #expect(PushNotificationDeepLink.url(from: ["url": NSNull()]) == nil)
    #expect(PushNotificationDeepLink.url(from: ["url": "not a url"]) == nil)
    #expect(PushNotificationDeepLink.url(from: ["url": "  "]) == nil)
    #expect(PushNotificationDeepLink.url(from: ["url": "jovie.ing/artist"]) == nil)
  }

  @Test(arguments: [
    "ie.jov.jovie://callback?code=abc&state=xyz",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://example.com/x",
  ])
  func nonWebSchemesAreRejected(raw: String) {
    #expect(PushNotificationDeepLink.url(from: ["url": raw]) == nil)
  }
}
