import ClerkKit
import Foundation

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

enum MobileAuthReturnError: LocalizedError {
  case clerkDidNotLoad
  case missingExchangeCredential
  case missingSessionToken(status: String, createdSessionID: String?, activeSessionID: String?, sessionCount: Int)
  case missingSignedInUser

  var errorDescription: String? {
    switch self {
    case .clerkDidNotLoad:
      "Clerk did not finish initializing before the native auth callback was handled."
    case .missingExchangeCredential:
      "The native auth exchange did not return a usable session credential."
    case let .missingSessionToken(status, createdSessionID, activeSessionID, sessionCount):
      "Clerk ticket sign-in completed without a session token. status=\(status) createdSessionID=\(createdSessionID ?? "nil") activeSessionID=\(activeSessionID ?? "nil") sessionCount=\(sessionCount)"
    case .missingSignedInUser:
      "You're signed in, but we couldn't load your profile. Try again."
    }
  }
}

private struct MobileAuthFinalizationStageError: LocalizedError {
  let stage: String
  let underlyingError: Error

  var errorDescription: String? {
    let message = underlyingError.localizedDescription.isEmpty
      ? String(describing: underlyingError)
      : underlyingError.localizedDescription
    return "Native auth \(stage) failed: \(message)"
  }
}

@MainActor
func runMobileAuthFinalizationStage<Value>(
  _ stage: String,
  operation: () async throws -> Value
) async throws -> Value {
  do {
    return try await operation()
  } catch {
    throw MobileAuthFinalizationStageError(
      stage: stage,
      underlyingError: error
    )
  }
}

enum LiveAuthBootstrapper {
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

    let preparedSignIn: SignIn
    do {
      preparedSignIn = try await Clerk.shared.auth.signInWithEmailCode(
        emailAddress: emailAddress
      )
    } catch {
      throw LiveAuthBootstrapError.bootstrapFailed(
        stage: "signInWithEmailCode",
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
      _ = try await NativeSessionTokenProvider().bearerToken(forceRefresh: false)
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
