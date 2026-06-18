import AppIntents

// Modern App Intents (Shortcuts / Spotlight / Siri). These do NOT require the
// legacy `com.apple.developer.siri` SiriKit entitlement — they are discovered by
// the App Intents metadata processor at build time. Each intent opens the app and
// enqueues a navigation request that the shell consumes.

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
    "Opens Jovie chat with your message ready to send."
  )
  static let openAppWhenRun = true

  @Parameter(
    title: "Message",
    requestValueDialog: "What do you want to ask Jovie?"
  )
  var message: String

  @MainActor
  func perform() async throws -> some IntentResult {
    IntentNavigationStore.shared.submit(.sendMessage(message))
    return .result()
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
      intent: ContinueLastConversationIntent(),
      phrases: [
        "Continue my \(.applicationName) chat",
        "Resume \(.applicationName)",
      ],
      shortTitle: "Continue Chat",
      systemImageName: "arrow.uturn.backward"
    )
  }
}
