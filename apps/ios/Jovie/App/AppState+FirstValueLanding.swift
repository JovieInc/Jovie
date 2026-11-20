import Foundation

extension AppState {
  /// Resolves the ready-shell landing tab once per ready entry.
  /// - Parameter markIdentityFirstValue: only when a loaded ready profile is
  ///   shown — speculative loading shells must not consume the first-value bit.
  func lockReadyShellInitialTab(markIdentityFirstValue: Bool) {
    let presented = FirstValueLandingPolicy.hasPresentedIdentityFirstValue(
      userID: activeUserID
    )
    let tab = FirstValueLandingPolicy.readyInitialTab(
      launchMode: launchMode,
      hasPresentedIdentityFirstValue: presented
    )
    readyShellInitialTab = tab
    if markIdentityFirstValue {
      markIdentityFirstValueIfLanded()
    }
  }

  func markIdentityFirstValueIfLanded() {
    guard launchMode == .live, readyShellInitialTab == .profile else { return }
    guard !FirstValueLandingPolicy.hasPresentedIdentityFirstValue(userID: activeUserID) else {
      return
    }
    FirstValueLandingPolicy.markIdentityFirstValuePresented(userID: activeUserID)
  }

  func applyLoadedReadyProfile(_ response: MobileMeResponse) {
    let enteringReady = route != .ready
    route = .ready
    dashboardState = .loaded(response)
    if enteringReady {
      lockReadyShellInitialTab(markIdentityFirstValue: true)
    } else {
      markIdentityFirstValueIfLanded()
    }
  }

  func enterSpeculativeReadyShell(dashboardState newState: DashboardLoadState, isOffline offline: Bool) {
    let enteringReady = route != .ready
    route = .ready
    dashboardState = newState
    isOffline = offline
    if enteringReady {
      lockReadyShellInitialTab(markIdentityFirstValue: false)
    }
  }

  /// Deterministic UI fixtures keep LaunchMode defaults; never consume the
  /// live first-value bit from harness accounts.
  func lockReadyShellIfCurrentlyReadyForFixtures() {
    guard route == .ready else { return }
    lockReadyShellInitialTab(markIdentityFirstValue: false)
  }
}
