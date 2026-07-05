import Foundation
import Testing
@testable import Jovie

struct MobileActionLoopResponseTests {
  @Test func decodesMobileActionLoopInboxPayload() throws {
    let json = """
    {
      "pendingCount": 1,
      "items": [
        {
          "id": "action-1",
          "typeLabel": "Suggestion",
          "createdAt": "2026-06-28T10:00:00.000Z",
          "title": "Detroit listeners up 340% — book a show",
          "why": "Promoter email matched your Detroit growth spike.",
          "primaryActionLabel": "Add to calendar",
          "status": "pending"
        }
      ],
      "emptyActionCards": [],
      "chatPrompt": "Ask Jovie which revenue opportunities I should act on first."
    }
    """

    let response = try JSONDecoder().decode(
      MobileActionLoopInboxResponse.self,
      from: Data(json.utf8)
    )

    #expect(response.pendingCount == 1)
    #expect(response.items.first?.title.contains("Detroit") == true)
  }

  @Test func decodesMobileActionLoopCalendarPayload() throws {
    let json = """
    {
      "rangeLabel": "Upcoming",
      "pendingReviewCount": 1,
      "upcomingEvents": [
        {
          "id": "event-1",
          "title": "Brooklyn show",
          "subtitle": "Brooklyn, NY · Bandsintown",
          "eventDate": "2026-07-10T20:00:00.000Z",
          "eventType": "tour",
          "confirmationStatus": "pending"
        }
      ],
      "pendingEvents": [
        {
          "id": "event-1",
          "title": "Brooklyn show",
          "subtitle": "Brooklyn, NY · Bandsintown",
          "eventDate": "2026-07-10T20:00:00.000Z",
          "eventType": "tour",
          "confirmationStatus": "pending"
        }
      ],
      "upcomingReleases": [
        {
          "id": "release-1",
          "title": "Midnight Drive",
          "releaseDate": "2026-08-01T00:00:00.000Z",
          "status": "scheduled",
          "artworkUrl": "https://cdn.example/art.jpg"
        }
      ],
      "chatPrompt": "Ask Jovie what I should prioritize on my calendar this week."
    }
    """

    let response = try JSONDecoder().decode(
      MobileActionLoopCalendarResponse.self,
      from: Data(json.utf8)
    )

    #expect(response.pendingReviewCount == 1)
    #expect(response.upcomingReleases.first?.title == "Midnight Drive")
  }
}
