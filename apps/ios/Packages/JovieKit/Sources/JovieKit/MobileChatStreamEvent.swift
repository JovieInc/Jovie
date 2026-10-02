import Foundation

public enum MobileChatStreamEvent: Equatable, Sendable {
  case turnReserved(conversationId: String, turnId: String, clientTurnId: String)
  case turnState(clientTurnId: String, state: String, eveWorkId: String?)
  case assistantDelta(clientTurnId: String, text: String)
  case assistantCompleted(
    clientTurnId: String,
    conversationId: String,
    turnId: String,
    text: String
  )
  case webHandoff(clientTurnId: String, conversationId: String, url: URL, summary: String)
  case error(code: String, message: String)
}

public enum MobileChatClientError: Error, Equatable, LocalizedError {
  case decodingFailed
  case invalidResponse
  case requestFailed(statusCode: Int)
  case transportFailed(code: Int)
  case streamFailed(message: String)

  public var errorDescription: String? {
    switch self {
    case .decodingFailed:
      return "The chat response could not be decoded."
    case .invalidResponse:
      return "The chat server returned an invalid response."
    case let .requestFailed(statusCode):
      return "The chat request failed with status code \(statusCode)."
    case let .transportFailed(code):
      return "The chat network request failed with code \(code)."
    case let .streamFailed(message):
      return message
    }
  }
}
