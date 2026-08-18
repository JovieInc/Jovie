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
  static let reservedActionMinHeight: CGFloat = 48

  static func actionTitle(isSwitchingAccount: Bool) -> String {
    isSwitchingAccount ? "Switching Account…" : "Use a Different Account"
  }
}
