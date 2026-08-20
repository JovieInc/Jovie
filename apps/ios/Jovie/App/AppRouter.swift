import Foundation

enum AppRouter: Equatable {
  case launching
  case signedOut
  case needsOnboarding
  case waitlistPending
  case ready
}

enum WaitlistPendingLayout {
  static let maxContentWidth: CGFloat = 420
  static let contentMaxWidth: CGFloat = maxContentWidth
  static let reservedActionMinHeight: CGFloat = 48

  static func actionTitle(isSwitchingAccount: Bool) -> String {
    isSwitchingAccount ? "Switching Account…" : "Use a Different Account"
  }

  /// Fill the safe-area viewport so short copy sits on the vertical center.
  /// Content taller than the viewport still grows and scrolls.
  static func contentMinHeight(viewportHeight: CGFloat) -> CGFloat {
    max(viewportHeight, 0)
  }
}
