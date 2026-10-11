import Foundation

/// Supplies request snapshots while retaining the application's authorization policy.
public protocol MobileChatAuthorizing: Sendable {
  associatedtype Authorization: Sendable
  associatedtype Ownership: Sendable

  var isOwned: Bool { get }
  func requestAuthorization(
    forceRefresh: Bool, authorizationOverride: Authorization?
  ) async throws -> Authorization
  func bearerToken(for authorization: Authorization) -> String
  func ownership(for authorization: Authorization) -> Ownership?
  func validateDispatch(_ authorization: Authorization) throws
  /// A retried rejection must terminate with the application's terminal error.
  func retryAuthorizationOrTerminal(
    _ authorization: Authorization, retried: Bool
  ) async throws -> Authorization
  func acceptSuccessfulResponse(_ response: URLResponse, authorizedBy authorization: Authorization)
}
