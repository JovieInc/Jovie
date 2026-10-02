import Foundation
import LocalAuthentication
import SwiftUI

enum BiometricLockSettings {
  static let enabledStorageKey = "ie.jov.Jovie.biometricLockEnabled"
  static let isEnabledByDefault = true
  static let backgroundTimeout: TimeInterval = 60
}

enum BiometricLockEvent: Equatable {
  case coldLaunch
  case foregrounded(backgroundDuration: TimeInterval)
}

enum BiometricLockPolicy {
  static func shouldRequireUnlock(
    isEnabled: Bool,
    hasSession: Bool,
    event: BiometricLockEvent,
    backgroundTimeout: TimeInterval = BiometricLockSettings.backgroundTimeout
  ) -> Bool {
    guard isEnabled, hasSession else { return false }

    switch event {
    case .coldLaunch:
      return true
    case let .foregrounded(backgroundDuration):
      return backgroundDuration >= backgroundTimeout
    }
  }
}

enum BiometricLockState: Equatable {
  case resolvingSession
  case unlocked
  case locked(message: String?)
  case authenticating

  var requiresUnlock: Bool {
    switch self {
    case .locked, .authenticating:
      return true
    case .resolvingSession, .unlocked:
      return false
    }
  }

  var message: String? {
    guard case let .locked(message) = self else { return nil }
    return message
  }
}

enum DeviceOwnerAuthenticationResult: Equatable {
  case authenticated
  case cancelled
  case unavailable
  case failed
}

struct LocalDeviceOwnerAuthenticator {
  func authenticate(reason: String) async -> DeviceOwnerAuthenticationResult {
    let context = LAContext()
    context.localizedCancelTitle = "Cancel"
    context.localizedFallbackTitle = "Use Passcode"

    var evaluationError: NSError?
    guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &evaluationError) else {
      return .unavailable
    }

    do {
      let didAuthenticate = try await context.evaluatePolicy(
        .deviceOwnerAuthentication,
        localizedReason: reason
      )
      return didAuthenticate ? .authenticated : .failed
    } catch let error as LAError {
      switch error.code {
      case .appCancel, .systemCancel, .userCancel:
        return .cancelled
      default:
        return .failed
      }
    } catch {
      return .failed
    }
  }
}

enum BiometricLockLayout {
  static let reservedStatusMinHeight: CGFloat = 44
  static let reservedActionMinHeight: CGFloat = 48
}

struct BiometricLockView: View {
  let state: BiometricLockState
  let onAuthenticate: @MainActor () async -> Void
  let onLogout: @MainActor () async -> Void

  @State private var didRequestInitialAuthentication = false
  @State private var isLoggingOut = false

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      GeometryReader { proxy in
        ScrollView {
          VStack(spacing: JovieSpacing.large) {
            Image(systemName: "lock.shield")
              .font(.system(size: 48, weight: .medium))
              .foregroundStyle(JovieColor.textPrimary)
              .frame(width: 88, height: 88)
              .accessibilityHidden(true)

            VStack(spacing: JovieSpacing.small) {
              Text("Unlock Jovie")
                .font(JovieFont.display(size: 28))
                .foregroundStyle(JovieColor.textPrimary)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)

              Text(statusMessage)
                .font(JovieFont.body(size: 15))
                .foregroundStyle(JovieColor.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(minHeight: BiometricLockLayout.reservedStatusMinHeight)
            }

            VStack(spacing: JovieSpacing.small) {
              ZStack {
                Button("Unlock Jovie") {
                  Task { await onAuthenticate() }
                }
                .buttonStyle(JoviePillButtonStyle(filled: true))
                .opacity(state == .authenticating ? 0 : 1)
                .disabled(state == .authenticating || isLoggingOut)

                ProgressView("Authenticating")
                  .tint(JovieColor.textPrimary)
                  .opacity(state == .authenticating ? 1 : 0)
                  .accessibilityHidden(state != .authenticating)
              }
              .frame(minHeight: BiometricLockLayout.reservedActionMinHeight)

              Button("Log Out", role: .destructive) {
                guard !isLoggingOut else { return }
                isLoggingOut = true
                Task {
                  await onLogout()
                  isLoggingOut = false
                }
              }
              .disabled(isLoggingOut || state == .authenticating)
              .frame(minHeight: BiometricLockLayout.reservedActionMinHeight)
            }
          }
          .frame(maxWidth: 420)
          .padding(.horizontal, JovieSpacing.xLarge)
          .padding(.vertical, JovieSpacing.large)
          .frame(
            maxWidth: .infinity,
            minHeight: proxy.size.height,
            alignment: .center
          )
        }
        .scrollBounceBehavior(.basedOnSize)
      }
    }
    .accessibilityIdentifier("biometric-lock")
    .task {
      guard !didRequestInitialAuthentication else { return }
      didRequestInitialAuthentication = true
      await onAuthenticate()
    }
  }

  private var statusMessage: String {
    if let message = state.message {
      return message
    }

    return "Use Face ID, Touch ID, or your device passcode to continue."
  }
}

struct BiometricPrivacyShieldView: View {
  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(spacing: JovieSpacing.medium) {
        Image(systemName: "lock.fill")
          .font(.system(size: 32, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
          .accessibilityHidden(true)

        Text("Jovie is locked")
          .font(JovieFont.body(size: 16, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
      }
    }
    .accessibilityIdentifier("biometric-privacy-shield")
  }
}
