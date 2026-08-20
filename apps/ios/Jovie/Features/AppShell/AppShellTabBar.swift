import SwiftUI

/// Primary bottom destinations (JOV-3632). Profile + Audience stay drawer-only.
enum AppShellPrimaryTab: Equatable, Hashable, CaseIterable {
  case chat
  case library
  case calendar
  case inbox

  var shellTab: AppShellTab {
    switch self {
    case .chat: return .chat
    case .library: return .library
    case .calendar: return .calendar
    case .inbox: return .inbox
    }
  }

  var title: String {
    shellTab.title
  }

  var systemImage: String {
    shellTab.systemImage
  }

  var accessibilityID: String {
    shellTab.accessibilityID
  }
}

enum AppShellTabBarLayout {
  /// Reserved height for the bar content (excluding home-indicator safe area).
  static let barHeight: CGFloat = 56
  /// Raised mic sits above the bar midline so it reads as a center FAB.
  static let talkFabSize: CGFloat = 58
  static let talkFabLift: CGFloat = 18
}

/// Thumb-zone bottom bar: Chat · Library · [Talk FAB] · Calendar · Inbox.
struct AppShellTabBar: View {
  let selectedTab: AppShellTab
  let onSelect: (AppShellPrimaryTab) -> Void
  let onTalk: () -> Void

  var body: some View {
    HStack(spacing: 0) {
      tabButton(.chat)
      tabButton(.library)
      talkButton
      tabButton(.calendar)
      tabButton(.inbox)
    }
    .padding(.horizontal, JovieSpacing.small)
    .frame(height: AppShellTabBarLayout.barHeight)
    .frame(maxWidth: .infinity)
    .background(JovieColor.backgroundBase.opacity(0.98))
    .overlay(alignment: .top) {
      Rectangle()
        .fill(JovieColor.borderSubtle)
        .frame(height: 1)
    }
    // Keep children as independent AX elements with their own identifiers.
    // A bare accessibilityIdentifier on the HStack was bleeding onto every
    // child button (all exposed as identifier "shell-tab-bar"), which broke
    // UITests looking for shell-tab-chat / shell-talk-fab.
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("shell-tab-bar")
  }

  private func tabButton(_ tab: AppShellPrimaryTab) -> some View {
    let isSelected = selectedTab == tab.shellTab
    return Button {
      onSelect(tab)
    } label: {
      VStack(spacing: 4) {
        Image(systemName: tab.systemImage)
          .font(.system(size: 18, weight: .semibold))
        Text(tab.title)
          .font(JovieFont.body(size: 11, weight: .medium))
          .lineLimit(1)
      }
      .foregroundStyle(isSelected ? JovieColor.textPrimary : JovieColor.textTertiary)
      .frame(maxWidth: .infinity)
      .frame(height: AppShellTabBarLayout.barHeight)
      .contentShape(Rectangle())
    }
    .buttonStyle(JoviePressFeedbackButtonStyle())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(tab.title)
    .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    .accessibilityIdentifier(tab.accessibilityID)
  }

  private var talkButton: some View {
    Button(action: onTalk) {
      ZStack {
        Circle()
          .fill(Color.white)
          .frame(
            width: AppShellTabBarLayout.talkFabSize,
            height: AppShellTabBarLayout.talkFabSize
          )
          .shadow(color: .black.opacity(0.28), radius: 12, y: 4)

        Image(systemName: "mic.fill")
          .font(.system(size: 22, weight: .bold))
          .foregroundStyle(JovieColor.backgroundBase)
      }
      .offset(y: -AppShellTabBarLayout.talkFabLift)
    }
    .buttonStyle(JoviePressFeedbackButtonStyle())
    .frame(width: AppShellTabBarLayout.talkFabSize + 8)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Talk")
    .accessibilityIdentifier("shell-talk-fab")
    .accessibilityHint("Opens full-screen voice capture")
  }
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

  static func isDominantHorizontalSwipe(translationX: CGFloat, translationY: CGFloat) -> Bool {
    abs(translationX) > abs(translationY) * horizontalDominanceRatio
  }

  /// Chat is the home pager: a full-width horizontal pan opens rails.
  static func allowsFullWidthRailSwipe(selectedTab: AppShellTab) -> Bool {
    selectedTab == .chat
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
          isDominantHorizontalSwipe(translationX: translationX, translationY: translationY)
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
          isDominantHorizontalSwipe(translationX: translationX, translationY: translationY)
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

  /// Rail drags must not fight text selection, Talk, or a teleprompter.
  static func allowsEdgeRailDrag(
    reduceMotion: Bool,
    isKeyboardVisible: Bool,
    isShowingTalkOverlay: Bool,
    hasTeleprompterProposal: Bool
  ) -> Bool {
    !reduceMotion && !isKeyboardVisible && !isShowingTalkOverlay && !hasTeleprompterProposal
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

  static func primaryBottomTabs() -> [AppShellPrimaryTab] {
    []
  }

  static func showsBottomTabBar() -> Bool {
    false
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
