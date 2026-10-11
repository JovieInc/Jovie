import Foundation

/// Summer approval-card detail embedded in an OV inbox item (JOV-6670).
struct MobileSummerCard: Codable, Equatable, Sendable {
  let id: String
  let kind: String
  let body: String
  let defaultIfSilent: String?
  let recipient: String?
  let amountUsd: Double?
  let evidence: [String]

  var amountLabel: String? {
    guard let amountUsd else { return nil }
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.currencyCode = "USD"
    formatter.maximumFractionDigits = amountUsd.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 2
    return formatter.string(from: NSNumber(value: amountUsd))
  }

  var evidenceURLs: [URL] {
    evidence.compactMap { URL(string: $0) }
  }
}

enum SummerCardDecision: String, Codable, Sendable {
  case approve
  case reject
}

struct MobileActionLoopInboxItem: Codable, Equatable, Sendable, Identifiable {
  let id: String
  let typeLabel: String
  let createdAt: String
  let title: String
  let why: String
  let primaryActionLabel: String
  let status: String
  let imageURL: String?
  let summerCard: MobileSummerCard?

  enum CodingKeys: String, CodingKey {
    case id
    case typeLabel
    case createdAt
    case title
    case why
    case primaryActionLabel
    case status
    case imageURL = "imageUrl"
    case summerCard
  }

  init(
    id: String,
    typeLabel: String,
    createdAt: String,
    title: String,
    why: String,
    primaryActionLabel: String,
    status: String,
    imageURL: String? = nil,
    summerCard: MobileSummerCard? = nil
  ) {
    self.id = id
    self.typeLabel = typeLabel
    self.createdAt = createdAt
    self.title = title
    self.why = why
    self.primaryActionLabel = primaryActionLabel
    self.status = status
    self.imageURL = imageURL
    self.summerCard = summerCard
  }

  var stillImageURL: URL? {
    guard typeLabel == "Still", let imageURL, let url = URL(string: imageURL) else {
      return nil
    }
    return url
  }
}

struct MobileActionLoopInboxEmptyActionCard: Codable, Equatable, Sendable, Identifiable {
  let id: String
  let title: String
  let body: String
  let actionLabel: String
  let continueOnWebPath: String
}

struct MobileActionLoopInboxResponse: Codable, Equatable, Sendable {
  let pendingCount: Int
  let items: [MobileActionLoopInboxItem]
  let emptyActionCards: [MobileActionLoopInboxEmptyActionCard]
  let chatPrompt: String

  static let preview = MobileActionLoopInboxResponse(
    pendingCount: 1,
    items: [
      MobileActionLoopInboxItem(
        id: "action-1",
        typeLabel: "Suggestion",
        createdAt: "2026-06-28T10:00:00.000Z",
        title: "Detroit listeners up 340% — book a show",
        why: "Promoter email matched your Detroit growth spike.",
        primaryActionLabel: "Add to calendar",
        status: "pending"
      ),
    ],
    emptyActionCards: [],
    chatPrompt: "Ask Jovie which revenue opportunities I should act on first."
  )
}