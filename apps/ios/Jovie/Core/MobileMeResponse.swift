import Foundation

struct MobileAppShellContract: Codable, Equatable, Sendable {
  enum WorkspaceID: String, Codable, Sendable {
    case customer
    case ov
  }

  enum WorkspaceRole: String, Codable, Sendable {
    case primary
    case secondary
  }

  enum WorkspaceAccess: String, Codable, Sendable {
    case authenticated
    case admin
  }

  struct Workspace: Codable, Equatable, Sendable {
    let id: WorkspaceID
    let label: String
    let href: String
    let role: WorkspaceRole
    let access: WorkspaceAccess
    let shellOwner: String
    let chatOwner: String
    let chatMode: String?
    let selectedAgent: String
    let dataScope: String
    let navigationDivergenceReason: String?
  }

  let launchWorkspaceID: WorkspaceID
  let primaryWorkspaceID: WorkspaceID
  let shellOwner: String
  let chatOwner: String
  let workspaces: [Workspace]

  enum CodingKeys: String, CodingKey {
    case launchWorkspaceID = "launchWorkspaceId"
    case primaryWorkspaceID = "primaryWorkspaceId"
    case shellOwner
    case chatOwner
    case workspaces
  }

  var canAccessOvie: Bool {
    workspaces.contains { workspace in
      workspace.id == .ov && workspace.role == .secondary && workspace.access == .admin
    }
  }

  static let jovieOnly = MobileAppShellContract(
    launchWorkspaceID: .customer,
    primaryWorkspaceID: .customer,
    shellOwner: "jovie",
    chatOwner: "jovie-chat",
    workspaces: [
      Workspace(
        id: .customer,
        label: "Jovie",
        href: "/app",
        role: .primary,
        access: .authenticated,
        shellOwner: "jovie",
        chatOwner: "jovie-chat",
        chatMode: nil,
        selectedAgent: "jovie",
        dataScope: "customer",
        navigationDivergenceReason: nil
      )
    ]
  )
}

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
  let appShell: MobileAppShellContract
  /// Missing `isAdmin` must hide the Settings switch.
  /// `var` is required: synthesized Codable skips a `let` that already has a
  /// default, so `"isAdmin": true` would never decode.
  var isAdmin: Bool? = nil

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
    case appShell
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
    appShell: MobileAppShellContract = .jovieOnly,
    isAdmin: Bool? = nil
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
    self.appShell = appShell
    self.isAdmin = isAdmin
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    state = try container.decode(State.self, forKey: .state)
    displayName = try container.decodeIfPresent(String.self, forKey: .displayName)
    username = try container.decodeIfPresent(String.self, forKey: .username)
    publicProfileURL = try container.decodeIfPresent(String.self, forKey: .publicProfileURL)
    qrPayload = try container.decodeIfPresent(String.self, forKey: .qrPayload)
    avatarURL = try container.decodeIfPresent(String.self, forKey: .avatarURL)
    appleWalletProfilePassAvailable = try container.decode(
      Bool.self,
      forKey: .appleWalletProfilePassAvailable
    )
    chatEnabled = try container.decode(Bool.self, forKey: .chatEnabled)
    continueOnWebURL = try container.decode(String.self, forKey: .continueOnWebURL)
    appShell = try container.decodeIfPresent(MobileAppShellContract.self, forKey: .appShell)
      ?? .jovieOnly
    isAdmin = try container.decodeIfPresent(Bool.self, forKey: .isAdmin)
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
  var composerOfflinePlaceholder: String { "\(askChatLabel) (offline)" }
  var emptyChatSubtitle: String {
    self == .ovie ? "Taste cards, stills, and ops. Summer is the speaker."
      : "Ask Jovie about your profile, releases, and next moves."
  }
}

enum MobileWorkspaceStore {
  static let defaultsKey = "ie.jov.Jovie.workspaceMode"

  static func load(isAdmin: Bool, defaults: UserDefaults = .standard) -> MobileWorkspaceMode {
    guard isAdmin else { return .jovie }
    guard
      let raw = defaults.string(forKey: defaultsKey),
      let mode = MobileWorkspaceMode(rawValue: raw)
    else {
      return .jovie
    }
    return mode
  }

  static func save(_ mode: MobileWorkspaceMode, isAdmin: Bool, defaults: UserDefaults = .standard) {
    defaults.set((isAdmin ? mode : .jovie).rawValue, forKey: defaultsKey)
  }
}
