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

  @Test func decodesSummerCardDetailOnInboxItem() throws {
    let json = """
    {
      "pendingCount": 1,
      "items": [
        {
          "id": "summer-card:sc_0123456789abcdef0123456789abcdef",
          "typeLabel": "Spend",
          "createdAt": "2026-09-06T10:00:00.000Z",
          "title": "Book Detroit venue",
          "why": "Approve the $400 deposit.",
          "primaryActionLabel": "Decide",
          "status": "pending",
          "imageUrl": null,
          "summerCard": {
            "id": "sc_0123456789abcdef0123456789abcdef",
            "kind": "spend",
            "body": "Full deposit terms and date holds.",
            "defaultIfSilent": "Hold expires Friday.",
            "recipient": "Magic Stick",
            "amountUsd": 400,
            "evidence": ["https://example.com/quote"]
          }
        }
      ],
      "emptyActionCards": [],
      "chatPrompt": "Ask Summer which taste cards need a decision."
    }
    """

    let response = try JSONDecoder().decode(
      MobileActionLoopInboxResponse.self,
      from: Data(json.utf8)
    )

    let card = response.items.first?.summerCard
    #expect(card?.id == "sc_0123456789abcdef0123456789abcdef")
    #expect(card?.kind == "spend")
    #expect(card?.recipient == "Magic Stick")
    #expect(card?.amountLabel == "$400")
    #expect(card?.evidenceURLs.first?.absoluteString == "https://example.com/quote")
  }

  @Test func decodesMobileActionLoopCalendarPayload() throws {
    let json = """
    {
      "rangeLabel": "Upcoming",
      "pendingReviewCount": 1,
      "upcomingEvents": [
        {
          "id": "event-2",
          "title": "Listening party",
          "subtitle": "New York, NY · Manual",
          "eventDate": "2026-07-15T20:00:00.000Z",
          "eventType": "livestream",
          "confirmationStatus": "confirmed"
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
    #expect(
      Set(response.upcomingEvents.map(\.id))
        .isDisjoint(with: Set(response.pendingEvents.map(\.id)))
    )
    #expect(response.upcomingReleases.first?.title == "Midnight Drive")
  }

  @Test func previewInboxExposesPendingActionAndChatPrompt() {
    let preview = MobileActionLoopInboxResponse.preview
    #expect(preview.pendingCount == 1)
    #expect(preview.items.isEmpty == false)
    #expect(preview.chatPrompt.isEmpty == false)
  }

  @Test func previewCalendarPartitionsPendingAndUpcomingEvents() {
    let preview = MobileActionLoopCalendarResponse.preview
    #expect(preview.rangeLabel == "Upcoming")
    #expect(preview.upcomingEvents.isEmpty == false)
    #expect(preview.pendingEvents.isEmpty == false)
    #expect(
      Set(preview.upcomingEvents.map(\.id))
        .isDisjoint(with: Set(preview.pendingEvents.map(\.id)))
    )
    #expect(preview.chatPrompt.isEmpty == false)
  }
}
