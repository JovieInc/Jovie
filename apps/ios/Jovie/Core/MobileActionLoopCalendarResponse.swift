import Foundation

struct MobileActionLoopCalendarEventItem: Codable, Equatable, Sendable, Identifiable {
  let id: String
  let title: String
  let subtitle: String
  let eventDate: String
  let eventType: String
  let confirmationStatus: String
  let statusBadge: String?
}

struct MobileActionLoopCalendarReleaseItem: Codable, Equatable, Sendable, Identifiable {
  let id: String
  let title: String
  let releaseDate: String?
  let status: String
  let artworkUrl: String?
}

struct MobileActionLoopCalendarResponse: Codable, Equatable, Sendable {
  let rangeLabel: String
  let pendingReviewCount: Int
  let upcomingEvents: [MobileActionLoopCalendarEventItem]
  let pendingEvents: [MobileActionLoopCalendarEventItem]
  let upcomingReleases: [MobileActionLoopCalendarReleaseItem]
  let chatPrompt: String

  static let preview = MobileActionLoopCalendarResponse(
    rangeLabel: "Upcoming",
    pendingReviewCount: 1,
    upcomingEvents: [
      MobileActionLoopCalendarEventItem(
        id: "event-1",
        title: "Brooklyn show",
        subtitle: "Brooklyn, NY · Bandsintown",
        eventDate: "2026-07-10T20:00:00.000Z",
        eventType: "tour",
        confirmationStatus: "pending",
        statusBadge: nil
      ),
    ],
    pendingEvents: [
      MobileActionLoopCalendarEventItem(
        id: "event-1",
        title: "Brooklyn show",
        subtitle: "Brooklyn, NY · Bandsintown",
        eventDate: "2026-07-10T20:00:00.000Z",
        eventType: "tour",
        confirmationStatus: "pending",
        statusBadge: nil
      ),
    ],
    upcomingReleases: [
      MobileActionLoopCalendarReleaseItem(
        id: "release-1",
        title: "Midnight Drive",
        releaseDate: "2026-08-01T00:00:00.000Z",
        status: "scheduled",
        artworkUrl: "https://cdn.example/art.jpg"
      ),
    ],
    chatPrompt: "Ask Jovie what I should prioritize on my calendar this week."
  )
}