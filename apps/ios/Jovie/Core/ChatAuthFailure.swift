import Foundation
import JovieKit

/// Terminal chat auth: missing token or a 401 after retry. Not a transport outage.
func isTerminalChatAuthFailure(_ error: Error) -> Bool {
  if case APIClientError.missingToken = error {
    return true
  }
  if case APIClientError.requestFailed(statusCode: 401) = error {
    return true
  }
  if case MobileChatClientError.requestFailed(statusCode: 401) = error {
    return true
  }
  return false
}
