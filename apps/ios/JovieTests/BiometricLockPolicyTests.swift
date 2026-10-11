import Testing
@testable import Jovie

struct BiometricLockPolicyTests {
  @Test func defaultsToProtectingStoredSessionsOnColdLaunch() {
    #expect(BiometricLockSettings.isEnabledByDefault)
    #expect(
      BiometricLockPolicy.shouldRequireUnlock(
        isEnabled: BiometricLockSettings.isEnabledByDefault,
        hasSession: true,
        event: .coldLaunch
      )
    )
  }

  @Test func neverLocksWithoutBothTheSettingAndASession() {
    #expect(
      !BiometricLockPolicy.shouldRequireUnlock(
        isEnabled: false,
        hasSession: true,
        event: .coldLaunch
      )
    )
    #expect(
      !BiometricLockPolicy.shouldRequireUnlock(
        isEnabled: true,
        hasSession: false,
        event: .coldLaunch
      )
    )
  }

  @Test func locksOnlyAfterTheBackgroundTimeout() {
    let timeout = BiometricLockSettings.backgroundTimeout

    #expect(
      !BiometricLockPolicy.shouldRequireUnlock(
        isEnabled: true,
        hasSession: true,
        event: .foregrounded(backgroundDuration: timeout - 0.001)
      )
    )
    #expect(
      BiometricLockPolicy.shouldRequireUnlock(
        isEnabled: true,
        hasSession: true,
        event: .foregrounded(backgroundDuration: timeout)
      )
    )
  }

  @Test func lockedAndAuthenticatingStatesKeepAppContentCovered() {
    #expect(!BiometricLockState.resolvingSession.requiresUnlock)
    #expect(!BiometricLockState.unlocked.requiresUnlock)
    #expect(BiometricLockState.locked(message: nil).requiresUnlock)
    #expect(BiometricLockState.authenticating.requiresUnlock)
  }

  @Test func lockScreenReservesStableStatusAndActionFootprints() {
    #expect(BiometricLockLayout.reservedStatusMinHeight == 44)
    #expect(BiometricLockLayout.reservedActionMinHeight == 48)
  }
}
