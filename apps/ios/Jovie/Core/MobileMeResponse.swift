import Foundation

struct MobileMeResponse: Codable, Equatable, Sendable {
  enum State: String, Codable, Sendable {
    case ready
    case needsOnboarding = "needs_onboarding"
    case waitlistPending = "waitlist_pending"
  }

  let state: State
  let displayName: String?
  let username: String?
  let publicProfileURL: String?
  let qrPayload: String?
  let avatarURL: String?
  let appleWalletProfilePassAvailable: Bool
  let chatEnabled: Bool
  let continueOnWebURL: String
  /// Absent on cached `/me` payloads from older app versions. Never treat
  /// missing as admin — the Settings switch must stay hidden.
  let isAdmin: Bool?

  enum CodingKeys: String, CodingKey {
    case state
    case displayName
    case username
    case publicProfileURL = "publicProfileUrl"
    case qrPayload
    case avatarURL = "avatarUrl"
    case appleWalletProfilePassAvailable
    case chatEnabled
    case continueOnWebURL = "continueOnWebUrl"
    case isAdmin
  }

  init(
    state: State,
    displayName: String?,
    username: String?,
    publicProfileURL: String?,
    qrPayload: String?,
    avatarURL: String?,
    appleWalletProfilePassAvailable: Bool,
    chatEnabled: Bool,
    continueOnWebURL: String,
    isAdmin: Bool? = false
  ) {
    self.state = state
    self.displayName = displayName
    self.username = username
    self.publicProfileURL = publicProfileURL
    self.qrPayload = qrPayload
    self.avatarURL = avatarURL
    self.appleWalletProfilePassAvailable = appleWalletProfilePassAvailable
    self.chatEnabled = chatEnabled
    self.continueOnWebURL = continueOnWebURL
    self.isAdmin = isAdmin
  }

  var showsAdminWorkspaceSwitch: Bool {
    isAdmin == true
  }

  static let previewReady = MobileMeResponse(
    state: .ready,
    displayName: "Tim White",
    username: "tim",
    publicProfileURL: "https://jov.ie/tim",
    qrPayload: "https://jov.ie/tim",
    avatarURL: nil,
    appleWalletProfilePassAvailable: false,
    chatEnabled: true,
    continueOnWebURL: "https://jov.ie/app"
  )

  static let previewReadyWithoutQR = MobileMeResponse(
    state: .ready,
    displayName: "Tim White",
    username: "tim",
    publicProfileURL: nil,
    qrPayload: nil,
    avatarURL: nil,
    appleWalletProfilePassAvailable: false,
    chatEnabled: true,
    continueOnWebURL: "https://jov.ie/app"
  )

  static let previewNeedsOnboarding = MobileMeResponse(
    state: .needsOnboarding,
    displayName: nil,
    username: nil,
    publicProfileURL: nil,
    qrPayload: nil,
    avatarURL: nil,
    appleWalletProfilePassAvailable: false,
    chatEnabled: false,
    continueOnWebURL: "https://jov.ie/app"
  )

  static let previewWaitlistPending = MobileMeResponse(
    state: .waitlistPending,
    displayName: nil,
    username: nil,
    publicProfileURL: nil,
    qrPayload: nil,
    avatarURL: nil,
    appleWalletProfilePassAvailable: false,
    chatEnabled: false,
    continueOnWebURL: "https://jov.ie/app"
  )
}

/// Mobile workspace ids match web `APP_SHELL_WORKSPACES` (`customer` / `ov`).
enum MobileWorkspaceMode: String, Codable, Equatable, Sendable, CaseIterable {
  case jovie = "customer"
  case ovie = "ov"

  var displayName: String { self == .ovie ? "Ovie" : "Jovie" }
  var toggled: MobileWorkspaceMode { self == .jovie ? .ovie : .jovie }
  var chatMode: String? { self == .ovie ? "ov" : nil }
  var askChatLabel: String { self == .ovie ? "Ask Summer" : "Ask Jovie" }
  var composerPlaceholder: String { askChatLabel }
  var composerOfflinePlaceholder: String { "\(askChatLabel) (offline)" }
  var emptyChatTitle: String { askChatLabel }
  var emptyChatSubtitle: String {
    self == .ovie
      ? "Taste cards, stills, and ops. Summer is the speaker."
      : "Ask Jovie about your profile, releases, and next moves."
  }
}

enum MobileWorkspaceStore {
  static let defaultsKey = "ie.jov.Jovie.workspaceMode"

  static func load(
    isAdmin: Bool,
    defaults: UserDefaults = .standard
  ) -> MobileWorkspaceMode {
    guard isAdmin else { return .jovie }
    guard
      let raw = defaults.string(forKey: defaultsKey),
      let mode = MobileWorkspaceMode(rawValue: raw)
    else {
      return .jovie
    }
    return mode
  }

  static func save(
    _ mode: MobileWorkspaceMode,
    isAdmin: Bool,
    defaults: UserDefaults = .standard
  ) {
    defaults.set((isAdmin ? mode : .jovie).rawValue, forKey: defaultsKey)
  }
}
