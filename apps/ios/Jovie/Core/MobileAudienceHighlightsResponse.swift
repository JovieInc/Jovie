import Foundation

struct MobileAudienceHighlightsStatTile: Codable, Equatable, Sendable, Identifiable {
  let label: String
  let value: Int
  let hint: String?

  var id: String { label }
}

struct MobileAudienceHighlightsResponse: Codable, Equatable, Sendable {
  let rangeLabel: String
  let heroLabel: String
  let heroValue: Int
  let heroDeltaLabel: String?
  let statTiles: [MobileAudienceHighlightsStatTile]
  let chatPrompt: String

  static let preview = MobileAudienceHighlightsResponse(
    rangeLabel: "Last 7 days",
    heroLabel: "Profile views",
    heroValue: 1284,
    heroDeltaLabel: "+18% vs last week",
    statTiles: [
      MobileAudienceHighlightsStatTile(label: "Unique fans", value: 963, hint: nil),
      MobileAudienceHighlightsStatTile(label: "Subscribed fans", value: 531, hint: "55% of fans"),
      MobileAudienceHighlightsStatTile(label: "Link clicks", value: 893, hint: nil),
      MobileAudienceHighlightsStatTile(label: "Listen clicks", value: 342, hint: nil),
    ],
    chatPrompt: "Ask Jovie about my audience trends and who is engaging most."
  )
}

enum AudienceHighlightsLoadState: Equatable {
  case idle
  case loading
  case loaded(MobileAudienceHighlightsResponse)
  case error(String)
}