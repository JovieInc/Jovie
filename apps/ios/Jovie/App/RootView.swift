import ClerkKit
import Observation
import SwiftUI

private enum LiveAuthBootstrapError: LocalizedError {
  case bootstrapFailed(stage: String, message: String)
  case missingEmailAddress
  case missingUser

  var errorDescription: String? {
    switch self {
    case let .bootstrapFailed(stage, message):
      return "Live auth bootstrap failed during \(stage): \(message)"
    case .missingEmailAddress:
      return "Missing E2E_CLERK_USER_USERNAME for live auth bootstrap."
    case .missingUser:
      return "Clerk did not expose a signed-in user after live auth bootstrap."
    }
  }
}

private enum LiveAuthBootstrapper {
  @MainActor
  static func signInFromEnvironment(
    processInfo: ProcessInfo = .processInfo
  ) async throws -> String {
    let environment = processInfo.environment
    let emailAddress = environment["E2E_CLERK_USER_USERNAME"] ?? ""
    let verificationCode = environment["JOVIE_IOS_LIVE_AUTH_CODE"] ?? "424242"

    guard !emailAddress.isEmpty else {
      throw LiveAuthBootstrapError.missingEmailAddress
    }

    try? await Clerk.shared.auth.signOut()

    let signIn: SignIn
    do {
      signIn = try await Clerk.shared.auth.signIn(emailAddress)
    } catch {
      throw LiveAuthBootstrapError.bootstrapFailed(
        stage: "signIn",
        message: error.localizedDescription
      )
    }

    let preparedSignIn: SignIn
    do {
      preparedSignIn = try await signIn.sendEmailCode()
    } catch {
      throw LiveAuthBootstrapError.bootstrapFailed(
        stage: "sendEmailCode",
        message: error.localizedDescription
      )
    }

    let completedSignIn: SignIn
    do {
      completedSignIn = try await preparedSignIn.verifyCode(verificationCode)
    } catch {
      throw LiveAuthBootstrapError.bootstrapFailed(
        stage: "verifyCode",
        message: error.localizedDescription
      )
    }

    if let sessionID = completedSignIn.createdSessionId,
       Clerk.shared.session?.id != sessionID
    {
      do {
        try await Clerk.shared.auth.setActive(sessionId: sessionID)
      } catch {
        throw LiveAuthBootstrapError.bootstrapFailed(
          stage: "setActive",
          message: error.localizedDescription
        )
      }
    }

    do {
      _ = try await Clerk.shared.refreshClient()
    } catch {
      throw LiveAuthBootstrapError.bootstrapFailed(
        stage: "refreshClient",
        message: error.localizedDescription
      )
    }

    do {
      _ = try await ClerkTokenProvider().bearerToken(forceRefresh: false)
    } catch {
      throw LiveAuthBootstrapError.bootstrapFailed(
        stage: "getToken",
        message: error.localizedDescription
      )
    }

    guard let userID = Clerk.shared.user?.id else {
      throw LiveAuthBootstrapError.missingUser
    }

    return userID
  }
}

private struct AppContentView: View {
  @Bindable var appState: AppState

  var body: some View {
    Group {
      switch appState.route {
      case .launching:
        SplashView()
      case .signedOut:
        AuthScreen(isMock: !appState.launchMode.usesLiveClerk)
      case .needsOnboarding:
        NeedsOnboardingView(continueURL: appState.continueOnWebURL)
      case .ready:
        DashboardView(
          state: appState.dashboardState,
          isOffline: appState.isOffline,
          brightnessManager: appState.brightnessManager,
          onRetry: { await appState.retry() }
        )
      }
    }
  }
}

struct RootView: View {
  @Bindable var appState: AppState
  let liveUserID: String?

  var body: some View {
    AppContentView(appState: appState)
      .task(id: "\(appState.didLoadClerk)-\(liveUserID ?? "signed-out")") {
        if appState.launchMode.requiresAutoAuth, liveUserID == nil {
          return
        }

        if let liveUserID, appState.activeUserID == liveUserID {
          return
        }

        await appState.handleSignedInUserChange(liveUserID)
      }
  }
}

struct LiveRootContainer: View {
  @Environment(Clerk.self) private var clerk
  @Bindable var appState: AppState
  @State private var didBootstrapLiveAuth = false

  var body: some View {
    RootView(appState: appState, liveUserID: clerk.user?.id)
      .task(id: appState.launchMode.requiresAutoAuth) {
        guard appState.launchMode.requiresAutoAuth, didBootstrapLiveAuth == false else {
          return
        }

        didBootstrapLiveAuth = true

        do {
          let userID = try await LiveAuthBootstrapper.signInFromEnvironment()
          await appState.handleSignedInUserChange(userID)
        } catch {
          appState.route = .ready
          appState.dashboardState = .error(
            error.localizedDescription.isEmpty
              ? "Live auth bootstrap failed."
              : error.localizedDescription
          )
        }
      }
  }
}
