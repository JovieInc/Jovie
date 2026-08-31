import AppIntents

// Modern App Intents (Shortcuts / Spotlight / Siri / Action Button). These do
// NOT require the legacy `com.apple.developer.siri` SiriKit entitlement — they
// are discovered by the App Intents metadata processor at build time.
// Action Button can run an App Shortcut; iOS does not give third-party apps a
// press-and-release capture gesture, so listening is start → Stop/submit.

struct OpenChatIntent: AppIntent {
  static let title: LocalizedStringResource = "Open Jovie Chat"
  static let description = IntentDescription("Opens the Jovie chat.")
  static let openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult {
    IntentNavigationStore.shared.submit(.openChat)
    return .result()
  }
}

struct SendMessageIntent: AppIntent {
  static let title: LocalizedStringResource = "Ask Jovie"
  static let description = IntentDescription(
    "Opens Jovie chat and sends your message to Jovie."
  )
  static let openAppWhenRun = true

  @Parameter(
    title: "Message",
    requestValueDialog: "What do you want to ask Jovie?"
  )
  var message: String

  @MainActor
  func perform() async throws -> some IntentResult {
    IntentNavigationStore.shared.submit(.sendMessage(text: message, autoSend: true))
    return .result()
  }
}

enum EyesFreeCaptureIntentSupport {
  @MainActor
  static func enqueue(
    destination: EyesFreeCaptureDestination,
    spokenText: String?
  ) -> IntentDialog {
    let launch = EyesFreeCaptureLaunch(
      destination: destination,
      spokenText: spokenText,
      idempotencyKey: UUID().uuidString
    )
    IntentNavigationStore.shared.submit(.startEyesFreeCapture(launch))
    let ready = VoiceMemoActionDraft.isReady(spokenText ?? "")
    return IntentDialog("\(ready ? destination.sendingCue : destination.listeningCue)")
  }
}

struct StartVoiceCaptureIntent: AppIntent {
  static let title: LocalizedStringResource = "Talk to Jovie"
  static let description = IntentDescription(
    "Starts Jovie capture. Tap Stop when you are done. iOS does not provide a press-and-release capture gesture."
  )
  static let openAppWhenRun = true

  @Parameter(title: "Capture")
  var spokenText: String?

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    .result(dialog: EyesFreeCaptureIntentSupport.enqueue(destination: .jovie, spokenText: spokenText))
  }
}

struct CaptureForSummerIntent: AppIntent {
  static let title: LocalizedStringResource = "Talk to Summer"
  static let description = IntentDescription(
    "Founder-only Summer capture. Ordinary users are rejected by the server. Tap Stop when you are done."
  )
  static let openAppWhenRun = true

  @Parameter(title: "Capture")
  var spokenText: String?

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    .result(dialog: EyesFreeCaptureIntentSupport.enqueue(destination: .summer, spokenText: spokenText))
  }
}

struct ContinueLastConversationIntent: AppIntent {
  static let title: LocalizedStringResource = "Continue Jovie Chat"
  static let description = IntentDescription(
    "Reopens your most recent Jovie conversation."
  )
  static let openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult {
    IntentNavigationStore.shared.submit(.continueLastConversation)
    return .result()
  }
}

struct JovieAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: OpenChatIntent(),
      phrases: [
        "Open \(.applicationName) chat",
        "Open chat in \(.applicationName)",
      ],
      shortTitle: "Open Chat",
      systemImageName: "bubble.left.and.bubble.right"
    )
    AppShortcut(
      intent: SendMessageIntent(),
      phrases: [
        "Ask \(.applicationName)",
        "Start a \(.applicationName) chat",
      ],
      shortTitle: "Ask Jovie",
      systemImageName: "sparkles"
    )
    AppShortcut(
      intent: StartVoiceCaptureIntent(),
      phrases: [
        "Talk to \(.applicationName)",
        "Start talking to \(.applicationName)",
      ],
      shortTitle: "Talk",
      systemImageName: "mic.fill"
    )
    AppShortcut(
      intent: ContinueLastConversationIntent(),
      phrases: [
        "Continue my \(.applicationName) chat",
        "Resume \(.applicationName)",
      ],
      shortTitle: "Continue Chat",
      systemImageName: "arrow.uturn.backward"
    )
    AppShortcut(
      intent: CaptureForSummerIntent(),
      phrases: [
        "Talk to Summer in \(.applicationName)",
        "Capture for Summer in \(.applicationName)",
      ],
      shortTitle: "Summer",
      systemImageName: "lock.fill"
    )
  }
}
