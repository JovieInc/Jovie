import Foundation

enum AppRouter: Equatable {
  case launching
  case signedOut
  case needsOnboarding
  case waitlistPending
  case ready
}
