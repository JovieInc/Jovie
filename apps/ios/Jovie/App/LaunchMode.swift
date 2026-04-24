import Foundation

enum LaunchMode: Equatable {
  case live
  case unitTesting
  case uiTestingAutoAuth
  case uiTestingLiveAuth
  case uiTestingSignedOut
  case uiTestingReady
  case uiTestingNeedsOnboarding

  var usesLiveClerk: Bool {
    switch self {
    case .live, .uiTestingAutoAuth, .uiTestingLiveAuth:
      return true
    case .unitTesting, .uiTestingSignedOut, .uiTestingReady, .uiTestingNeedsOnboarding:
      return false
    }
  }

  var requiresAutoAuth: Bool {
    self == .uiTestingAutoAuth
  }

  static func current(processInfo: ProcessInfo = .processInfo) -> LaunchMode {
    let arguments = processInfo.arguments

    if arguments.contains("-ui-testing-auto-auth") {
      return .uiTestingAutoAuth
    }

    if arguments.contains("-ui-testing-live-auth") {
      return .uiTestingLiveAuth
    }

    if arguments.contains("-ui-testing-signed-out") {
      return .uiTestingSignedOut
    }

    if arguments.contains("-ui-testing-ready") {
      return .uiTestingReady
    }

    if arguments.contains("-ui-testing-needs-onboarding") {
      return .uiTestingNeedsOnboarding
    }

    if processInfo.environment["XCTestConfigurationFilePath"] != nil {
      return .unitTesting
    }

    return .live
  }
}
