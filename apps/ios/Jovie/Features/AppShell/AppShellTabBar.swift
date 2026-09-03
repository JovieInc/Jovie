import SwiftUI

struct AppShellRailSwipeExclusionFramesKey: PreferenceKey {
  static var defaultValue: [CGRect] = []

  static func reduce(value: inout [CGRect], nextValue: () -> [CGRect]) {
    value.append(contentsOf: nextValue())
  }
}

@MainActor
final class AppShellRailSwipeExclusionStore {
  var frames: [CGRect] = []
}

/// Gesture ownership (JOV-5201): chat-home pans open sidebar / right rail.
/// Other surfaces keep thumb-sized edge drags so Inbox triage still owns the
/// card. Horizontal pans never switch tabs.
enum AppShellGesturePolicy {
  static let leftEdgeOpenWidth: CGFloat = 44
  static let rightEdgeOpenWidth: CGFloat = 44
  static let openDistance: CGFloat = 72
  static let openPredicted: CGFloat = 120
  static let horizontalDominanceRatio: CGFloat = 1.35
  static let horizontalFollowDominanceRatio: CGFloat = horizontalDominanceRatio

  static func isDominantHorizontalSwipe(translationX: CGFloat, translationY: CGFloat) -> Bool {
    abs(translationX) > abs(translationY) * horizontalDominanceRatio
  }

  static func isHorizontalDragIntent(translationX: CGFloat, translationY: CGFloat) -> Bool {
    abs(translationX) >= 8 && abs(translationX) > abs(translationY) * horizontalFollowDominanceRatio
  }

  /// Chat is the home pager: a full-width horizontal pan opens rails.
  static func allowsFullWidthRailSwipe(selectedTab: AppShellTab) -> Bool {
    selectedTab == .chat
  }

  /// Reduce Motion commits an accepted rail change without showing a partial
  /// pane during the drag.
  static func showsInteractiveRailProgress(reduceMotion: Bool) -> Bool {
    !reduceMotion
  }

  static func effectiveReduceMotion(environmentValue: Bool, arguments: [String]) -> Bool {
    environmentValue || arguments.contains("-ui-testing-reduce-motion")
  }

  static func isLeftEdgeOpen(startX: CGFloat, translationX: CGFloat, predictedX: CGFloat)
    -> Bool
  {
    startX < leftEdgeOpenWidth
      && (translationX > openDistance || predictedX > openPredicted)
  }

  static func isRightEdgeOpen(
    startX: CGFloat,
    containerWidth: CGFloat,
    translationX: CGFloat,
    predictedX: CGFloat
  ) -> Bool {
    startX > containerWidth - rightEdgeOpenWidth
      && (translationX < -openDistance || predictedX < -openPredicted)
  }

  static func isLeadingSwipeOpen(
    selectedTab: AppShellTab,
    startX: CGFloat,
    translationX: CGFloat,
    predictedX: CGFloat,
    translationY: CGFloat
  ) -> Bool {
    guard translationX > 0 else { return false }
    guard isDominantHorizontalSwipe(translationX: translationX, translationY: translationY) else {
      return false
    }
    if allowsFullWidthRailSwipe(selectedTab: selectedTab) {
      return translationX > openDistance || predictedX > openPredicted
    }
    return isLeftEdgeOpen(startX: startX, translationX: translationX, predictedX: predictedX)
  }

  static func isTrailingSwipeOpen(
    selectedTab: AppShellTab,
    startX: CGFloat,
    containerWidth: CGFloat,
    translationX: CGFloat,
    predictedX: CGFloat,
    translationY: CGFloat
  ) -> Bool {
    guard translationX < 0 else { return false }
    guard isDominantHorizontalSwipe(translationX: translationX, translationY: translationY) else {
      return false
    }
    if allowsFullWidthRailSwipe(selectedTab: selectedTab) {
      return translationX < -openDistance || predictedX < -openPredicted
    }
    return isRightEdgeOpen(
      startX: startX,
      containerWidth: containerWidth,
      translationX: translationX,
      predictedX: predictedX
    )
  }

  static func shouldFollowLeadingDrag(
    selectedTab: AppShellTab,
    startX: CGFloat,
    translationX: CGFloat,
    translationY: CGFloat
  ) -> Bool {
    guard translationX > 0,
          isHorizontalDragIntent(translationX: translationX, translationY: translationY)
    else { return false }
    if allowsFullWidthRailSwipe(selectedTab: selectedTab) {
      return true
    }
    return startX < leftEdgeOpenWidth
  }

  static func shouldFollowTrailingDrag(
    selectedTab: AppShellTab,
    startX: CGFloat,
    containerWidth: CGFloat,
    translationX: CGFloat,
    translationY: CGFloat
  ) -> Bool {
    guard translationX < 0,
          isHorizontalDragIntent(translationX: translationX, translationY: translationY)
    else { return false }
    if allowsFullWidthRailSwipe(selectedTab: selectedTab) {
      return true
    }
    return startX > containerWidth - rightEdgeOpenWidth
  }

  static func isRightEdgeClose(
    isRailOpen: Bool,
    translationX: CGFloat,
    predictedX: CGFloat
  ) -> Bool {
    isRailOpen
      && (translationX > openDistance || predictedX > openPredicted)
  }

  /// Tabs switch only via explicit selection — never via horizontal swipe.
  static func shouldSwitchTabFromHorizontalSwipe() -> Bool {
    false
  }

  static func appliesSubviewExclusion(
    selectedTab: AppShellTab,
    isShowingDrawer: Bool,
    isShowingRightRail: Bool
  ) -> Bool {
    selectedTab == .chat && !isShowingDrawer && !isShowingRightRail
  }

  /// Rail drags must not fight text selection, Talk, or a teleprompter. Reduce
  /// Motion keeps the navigation path available; the shell suppresses offset
  /// animation separately.
  static func allowsEdgeRailDrag(
    reduceMotion: Bool,
    isKeyboardVisible: Bool,
    isShowingTalkOverlay: Bool,
    hasTeleprompterProposal: Bool
  ) -> Bool {
    !isKeyboardVisible && !isShowingTalkOverlay && !hasTeleprompterProposal
  }
}

/// Chat-first pane policy: sidebar / main / right rail. No bottom bar.
enum AppShellOpenPane: Equatable {
  case none
  case sidebar
  case rail
}

enum AppShellPanePolicy {
  static func homeSurface(chatEnabled: Bool) -> AppShellTab {
    chatEnabled ? .chat : .profile
  }

  static func paneAfterLeadingSwipe(current _: AppShellOpenPane) -> AppShellOpenPane {
    .sidebar
  }

  static func paneAfterTrailingSwipe(current _: AppShellOpenPane) -> AppShellOpenPane {
    .rail
  }

  static func paneAfterDismiss() -> AppShellOpenPane {
    .none
  }

  static func sidebarDestinations(chatEnabled: Bool, audienceEnabled: Bool) -> [AppShellTab] {
    var tabs: [AppShellTab] = []
    if chatEnabled {
      tabs.append(.chat)
    }
    tabs.append(contentsOf: [.library, .calendar, .inbox, .profile])
    if audienceEnabled {
      tabs.append(.audience)
    }
    return tabs
  }
}
