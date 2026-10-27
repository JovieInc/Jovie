import JovieKit
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

  @Test func blankTitlesHaveTheSameSearchableFallbackAsTheRow() {
    let untitled = MobileConversationSummary(
      id: "blank", title: "  \n  ", createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-04T00:00:00Z", latestMessageRole: nil, latestTurnStatus: nil
    )
    #expect(AppShellDrawerThreadsFilter.title(for: untitled) == "New chat")
    #expect(
      AppShellDrawerThreadsFilter.filtered(conversations: [untitled], query: "new chat") == [untitled]
    )
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

struct AppShellDrawerThreadsSkeletonTests {
  private let conversations = [
    MobileConversationSummary(
      id: "conv-1",
      title: "Launch follow-up",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      latestMessageRole: "assistant",
      latestTurnStatus: "completed"
    ),
  ]

  @Test func showsSkeletonWhileLoadingWithNoCachedConversations() {
    #expect(
      AppShellDrawerThreadsFilter.shouldShowLoadingSkeleton(isLoading: true, conversations: []) == true
    )
  }

  @Test func prefersCachedConversationsOverSkeletonWhileRevalidating() {
    #expect(
      AppShellDrawerThreadsFilter.shouldShowLoadingSkeleton(isLoading: true, conversations: conversations) == false
    )
  }

  @Test func hidesSkeletonWhenNotLoading() {
    #expect(
      AppShellDrawerThreadsFilter.shouldShowLoadingSkeleton(isLoading: false, conversations: []) == false
    )
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

struct AppShellDrawerThreadStatusTests {
  @Test func inFlightTurnsUseOneWorkingState() {
    for status in ["reserved", "running", "streaming"] {
      let indicator = AppShellDrawerThreadStatus(latestTurnStatus: status)
      #expect(indicator == .working)
      #expect(indicator.accessibilityValue == "Working")
    }
  }

  @Test func failedTurnsExplainWhyTheyNeedAttention() {
    for status in ["failed_tool_unavailable", "failed_model_error", "failed_timeout", "failed_network", "failed"] {
      let indicator = AppShellDrawerThreadStatus(latestTurnStatus: status)
      #expect(indicator == .attention)
      #expect(indicator.accessibilityValue == "Needs attention")
    }
  }

  @Test func completedCanceledAndUnknownTurnsStayQuiet() {
    let quietStatuses: [String?] = [nil, "completed", "canceled", "future_state"]
    for status in quietStatuses {
      let indicator = AppShellDrawerThreadStatus(latestTurnStatus: status)
      #expect(indicator == .quiet)
      #expect(indicator.accessibilityValue.isEmpty)
    }
  }
}
