import Testing
@testable import Jovie

struct AppShellDrawerThreadsFilterTests {
  private let conversations = [
    MobileConversationSummary(
      id: "conv-1",
      title: "Launch follow-up",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      latestMessageRole: "assistant",
      latestTurnStatus: "completed"
    ),
    MobileConversationSummary(
      id: "conv-2",
      title: "Release strategy",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-03T00:00:00Z",
      latestMessageRole: "assistant",
      latestTurnStatus: "completed"
    ),
  ]

  @Test func emptyQueryReturnsAllConversations() {
    let filtered = AppShellDrawerThreadsFilter.filtered(
      conversations: conversations,
      query: "   "
    )

    #expect(filtered == conversations)
  }

  @Test func queryMatchesConversationTitlesCaseInsensitively() {
    let filtered = AppShellDrawerThreadsFilter.filtered(
      conversations: conversations,
      query: "LAUNCH"
    )

    #expect(filtered.map(\.id) == ["conv-1"])
  }

  @Test func queryFallsBackToNewConversationTitle() {
    let untitled = MobileConversationSummary(
      id: "conv-3",
      title: nil,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-04T00:00:00Z",
      latestMessageRole: "assistant",
      latestTurnStatus: "completed"
    )

    let filtered = AppShellDrawerThreadsFilter.filtered(
      conversations: [untitled],
      query: "new"
    )

    #expect(filtered.map(\.id) == ["conv-3"])
  }
}

struct AppShellDrawerSurfaceLayoutTests {
  @Test func longestSurfaceTitleIsAudience() {
    #expect(AppShellDrawerSurfaceLayout.longestSurfaceTitle == "Audience")
  }

  @Test func surfaceLabelUsesMinimumScaleGuard() {
    #expect(AppShellDrawerSurfaceLayout.labelMinimumScaleFactor == 0.85)
  }

  @Test func singleLineSurfaceButtonsStayWithinHeightBudget() {
    #expect(AppShellDrawerSurfaceLayout.maxSingleLineSurfaceButtonHeight == 56)
  }
}

// GH-12949: recessed drawer base plane must be fully occluded when closed so
// translucent composer/toolbar chrome cannot reveal thread rows underneath.
struct AppShellDrawerBasePlaneOcclusionTests {
  @Test func closedIdleStateHidesBasePlane() {
    #expect(
      appShellDrawerBasePlaneOpacity(isShowingDrawer: false, drawerDragOffset: 0) == 0
    )
  }

  @Test func openStateShowsBasePlane() {
    #expect(
      appShellDrawerBasePlaneOpacity(isShowingDrawer: true, drawerDragOffset: 0) == 1
    )
  }

  @Test func edgeDragRevealShowsBasePlaneWhileStillClosed() {
    #expect(
      appShellDrawerBasePlaneOpacity(isShowingDrawer: false, drawerDragOffset: 48) == 1
    )
  }

  @Test func closingDragKeepsBasePlaneVisibleUntilSettled() {
    #expect(
      appShellDrawerBasePlaneOpacity(isShowingDrawer: true, drawerDragOffset: -32) == 1
    )
  }
}