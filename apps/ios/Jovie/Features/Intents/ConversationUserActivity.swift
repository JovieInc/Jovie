import Foundation

/// Spotlight / Siri Suggestions payload for an individual Jovie conversation.
enum ConversationUserActivity {
  static let activityType = "ie.jov.Jovie.conversation"
  static let conversationIDKey = "conversationID"
  static let titleKey = "title"

  struct Payload: Equatable, Sendable {
    let conversationID: String
    let title: String
  }

  static func payload(from userInfo: [AnyHashable: Any]) -> Payload? {
    guard let conversationID = userInfo[conversationIDKey] as? String,
          !conversationID.isEmpty
    else {
      return nil
    }

    let title = (userInfo[titleKey] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    return Payload(
      conversationID: conversationID,
      title: (title?.isEmpty == false) ? title! : "Jovie Chat"
    )
  }

  static func userInfo(for payload: Payload) -> [String: Any] {
    [
      conversationIDKey: payload.conversationID,
      titleKey: payload.title,
    ]
  }

  static func displayTitle(for title: String?) -> String {
    let trimmed = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return trimmed.isEmpty ? "Jovie Chat" : trimmed
  }

  static func displayTitle(for conversation: MobileConversationSummary) -> String {
    displayTitle(for: conversation.title)
  }
}

protocol ConversationActivityDonating: Sendable {
  func donate(conversationID: String, title: String)
}

#if canImport(UIKit)
import UIKit

final class LiveConversationActivityDonator: ConversationActivityDonating, @unchecked Sendable {
  private var currentActivity: NSUserActivity?

  func donate(conversationID: String, title: String) {
    let payload = ConversationUserActivity.Payload(
      conversationID: conversationID,
      title: title
    )
    let activity = NSUserActivity(activityType: ConversationUserActivity.activityType)
    activity.title = payload.title
    activity.userInfo = ConversationUserActivity.userInfo(for: payload)
    activity.isEligibleForSearch = true
    activity.isEligibleForPrediction = true
    activity.persistentIdentifier = conversationID
    currentActivity = activity
    activity.becomeCurrent()
  }
}
#endif