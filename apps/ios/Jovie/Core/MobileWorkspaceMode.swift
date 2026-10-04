import Foundation

/// Mobile workspace ids match web `APP_SHELL_WORKSPACES` (`customer` / `ov`).
enum MobileWorkspaceMode: String, Codable, Equatable, Sendable, CaseIterable {
  case jovie = "customer"
  case ovie = "ov"

  var displayName: String { self == .ovie ? "Ovie" : "Jovie" }
  var toggled: MobileWorkspaceMode { self == .jovie ? .ovie : .jovie }
  var chatMode: String? { self == .ovie ? "ov" : nil }
  var askChatLabel: String { self == .ovie ? "Ask Summer" : "Ask Jovie" }
  var composerOfflinePlaceholder: String { "\(askChatLabel) (offline)" }
  var emptyChatSubtitle: String {
    self == .ovie ? "Taste cards, stills, and ops. Summer is the speaker."
      : "Ask Jovie about your profile, releases, and next moves."
  }
}
