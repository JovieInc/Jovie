import Foundation

enum LaunchMode: Equatable {
  case live
  case unitTesting
  case uiTestingAutoAuth
  case uiTestingLiveAuth
  case uiTestingRealBrowserAuth
  case uiTestingAuthCallback
  case uiTestingSignedOut
  case uiTestingReady
  case uiTestingChat
  case uiTestingSettings
  case uiTestingVenueMode
  case uiTestingNeedsOnboarding
  case uiTestingSplash

  var usesLiveClerk: Bool {
    switch self {
    case .live, .uiTestingAutoAuth, .uiTestingLiveAuth, .uiTestingRealBrowserAuth:
      return true
    case .unitTesting,
         .uiTestingAuthCallback,
         .uiTestingSignedOut,
         .uiTestingReady,
         .uiTestingChat,
         .uiTestingSettings,
         .uiTestingVenueMode,
         .uiTestingNeedsOnboarding,
         .uiTestingSplash:
      return false
    }
  }

  var requiresAutoAuth: Bool {
    self == .uiTestingAutoAuth
  }

  var opensSettingsOnLaunch: Bool {
    self == .uiTestingSettings
  }

  var opensChatOnLaunch: Bool {
    self == .uiTestingChat
  }

  var opensVenueModeOnLaunch: Bool {
    self == .uiTestingVenueMode
  }

  static func current(processInfo: ProcessInfo = .processInfo) -> LaunchMode {
    let arguments = processInfo.arguments

    if arguments.contains("-ui-testing-auto-auth") {
      return .uiTestingAutoAuth
    }

    if arguments.contains("-ui-testing-live-auth") {
      return .uiTestingLiveAuth
    }

    if arguments.contains("-ui-testing-real-browser-auth") {
      return .uiTestingRealBrowserAuth
    }

    if arguments.contains("-ui-testing-auth-callback") {
      return .uiTestingAuthCallback
    }

    if arguments.contains("-ui-testing-signed-out") {
      return .uiTestingSignedOut
    }

    if arguments.contains("-ui-testing-ready") {
      return .uiTestingReady
    }

    if arguments.contains("-ui-testing-chat") {
      return .uiTestingChat
    }

    if arguments.contains("-ui-testing-settings") {
      return .uiTestingSettings
    }

    if arguments.contains("-ui-testing-venue-mode") {
      return .uiTestingVenueMode
    }

    if arguments.contains("-ui-testing-needs-onboarding") {
      return .uiTestingNeedsOnboarding
    }

    if arguments.contains("-ui-testing-splash") {
      return .uiTestingSplash
    }

    if processInfo.environment["XCTestConfigurationFilePath"] != nil {
      return .unitTesting
    }

    return .live
  }
}
