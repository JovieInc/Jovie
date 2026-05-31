import Foundation

enum MobileAuthFinalizationPlan: Equatable {
  case completeWithNativeSession(token: String, userID: String, expiresInSeconds: Int)
  case requiresClerkTicketFlow(ticket: String)
}

enum MobileAuthFinalizationPlanner {
  static func plan(for exchangeResponse: NativeAuthExchangeResponse) -> MobileAuthFinalizationPlan? {
    if let sessionToken = exchangeResponse.sessionToken,
       let userID = exchangeResponse.userId,
       sessionToken.isEmpty == false,
       userID.isEmpty == false
    {
      return .completeWithNativeSession(
        token: sessionToken,
        userID: userID,
        expiresInSeconds: exchangeResponse.expiresInSeconds
      )
    }

    if let ticket = exchangeResponse.ticket, ticket.isEmpty == false {
      return .requiresClerkTicketFlow(ticket: ticket)
    }

    return nil
  }
}

enum ClerkPublishableKeyValidationError: Error, Equatable, LocalizedError {
  case missing
  case placeholder
  case developmentKeyInDistribution
  case knownDevelopmentInstance

  var errorDescription: String? {
    switch self {
    case .missing:
      return "Clerk publishable key is missing from the app configuration."
    case .placeholder:
      return "Clerk publishable key is still set to the CI placeholder."
    case .developmentKeyInDistribution:
      return "Clerk publishable key is a development key in a distribution build."
    case .knownDevelopmentInstance:
      return "Clerk publishable key points at a non-production Clerk instance."
    }
  }
}

enum ClerkPublishableKeyValidator {
  static let placeholderKey = "pk_test_ci_placeholder"

  private static let blockedDevelopmentInstances = [
    "most-koala",
    "distinct-giraffe",
  ]

  static func validateForDistribution(_ key: String) throws {
    let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.isEmpty == false else {
      throw ClerkPublishableKeyValidationError.missing
    }

    guard trimmed != placeholderKey else {
      throw ClerkPublishableKeyValidationError.placeholder
    }

#if !DEBUG
    if trimmed.hasPrefix("pk_test") {
      throw ClerkPublishableKeyValidationError.developmentKeyInDistribution
    }

    let lowercased = trimmed.lowercased()
    for instance in blockedDevelopmentInstances where lowercased.contains(instance) {
      throw ClerkPublishableKeyValidationError.knownDevelopmentInstance
    }
#endif
  }
}
