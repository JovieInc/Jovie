import ClerkKit

struct ClerkTokenProvider: TokenProviding {
  func bearerToken(forceRefresh: Bool) async throws -> String {
    let options = Session.GetTokenOptions(skipCache: forceRefresh)

    guard let token = try await Clerk.shared.auth.getToken(options) else {
      throw APIClientError.missingToken
    }

    return token
  }
}
