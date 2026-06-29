import Foundation
import Testing
@testable import Jovie

struct MobileAudienceHighlightsResponseTests {
  @Test func decodesMobileAudienceHighlightsPayload() throws {
    let json = """
    {
      "rangeLabel": "Last 7 days",
      "heroLabel": "Profile views",
      "heroValue": 1284,
      "heroDeltaLabel": "+18% vs last week",
      "statTiles": [
        { "label": "Unique fans", "value": 963 },
        { "label": "Subscribed fans", "value": 531, "hint": "55% of fans" },
        { "label": "Link clicks", "value": 893 },
        { "label": "Listen clicks", "value": 342 }
      ],
      "chatPrompt": "Ask Jovie about my audience trends and who is engaging most."
    }
    """

    let response = try JSONDecoder().decode(
      MobileAudienceHighlightsResponse.self,
      from: Data(json.utf8)
    )

    #expect(response.heroValue == 1284)
    #expect(response.statTiles.count == 4)
    #expect(response.chatPrompt.contains("audience"))
  }
}