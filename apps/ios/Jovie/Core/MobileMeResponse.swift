import Foundation

struct MobileMeResponse: Codable, Equatable, Sendable {
  enum State: String, Codable, Sendable {
    case ready
    case needsOnboarding = "needs_onboarding"
  }

  let state: State
  let displayName: String?
  let username: String?
  let publicProfileURL: String?
  let qrPayload: String?
  let avatarURL: String?
  let continueOnWebURL: String

  enum CodingKeys: String, CodingKey {
    case state
    case displayName
    case username
    case publicProfileURL = "publicProfileUrl"
    case qrPayload
    case avatarURL = "avatarUrl"
    case continueOnWebURL = "continueOnWebUrl"
  }

  static let previewReady = MobileMeResponse(
    state: .ready,
    displayName: "DJ Shadow",
    username: "djshadow",
    publicProfileURL: "https://jov.ie/djshadow",
    qrPayload: "https://jov.ie/djshadow",
    avatarURL: nil,
    continueOnWebURL: "https://jov.ie/app"
  )

  static let previewNeedsOnboarding = MobileMeResponse(
    state: .needsOnboarding,
    displayName: nil,
    username: nil,
    publicProfileURL: nil,
    qrPayload: nil,
    avatarURL: nil,
    continueOnWebURL: "https://jov.ie/app"
  )
}
