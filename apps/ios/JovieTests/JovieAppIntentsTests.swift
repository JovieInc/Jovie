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
