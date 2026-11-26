import Foundation

/// First useful value on Jovie iOS is accurate Identity (URL / QR / Copy / Share)
/// plus one next action. Chat stays the permanent home after that first land.
enum FirstValueLandingPolicy {
  static let storageKeyPrefix = "jovie.firstValue.identityPresented."

  private static var defaultsOverride: UserDefaults?

  static var defaults: UserDefaults {
    defaultsOverride ?? .standard
  }

  @discardableResult
  static func replaceDefaultsForTesting(_ defaults: UserDefaults?) -> UserDefaults? {
    let previous = defaultsOverride
    defaultsOverride = defaults
    return previous
  }

  static func storageKey(for userID: String) -> String {
    storageKeyPrefix + userID
  }

  static func hasPresentedIdentityFirstValue(
    userID: String?,
    defaults: UserDefaults = FirstValueLandingPolicy.defaults
  ) -> Bool {
    guard let userID, !userID.isEmpty else { return true }
    return defaults.bool(forKey: storageKey(for: userID))
  }

  static func markIdentityFirstValuePresented(
    userID: String?,
    defaults: UserDefaults = FirstValueLandingPolicy.defaults
  ) {
    guard let userID, !userID.isEmpty else { return }
    defaults.set(true, forKey: storageKey(for: userID))
  }

  /// Live first ready → Identity once. Later live launches and all UI-test
  /// launch modes keep their existing LaunchMode defaults (chat-first home).
  static func readyInitialTab(
    launchMode: LaunchMode,
    hasPresentedIdentityFirstValue: Bool
  ) -> AppShellTab {
    if launchMode.opensAudienceOnLaunch {
      return .audience
    }
    if launchMode.opensChatOnLaunch {
      return .chat
    }

    let modeDefault = launchMode.defaultInitialTab
    if modeDefault != .chat {
      return modeDefault
    }

    guard launchMode == .live, !hasPresentedIdentityFirstValue else {
      return .chat
    }
    return .profile
  }
}
