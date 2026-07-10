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
    .buttonStyle(AppShellTabBarButtonStyle())
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
    .buttonStyle(AppShellTabBarButtonStyle())
    .frame(width: AppShellTabBarLayout.talkFabSize + 8)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Talk")
    .accessibilityIdentifier("shell-talk-fab")
    .accessibilityHint("Opens full-screen voice capture")
  }
}

private struct AppShellTabBarButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(configuration.isPressed ? 0.72 : 1)
      .scaleEffect(configuration.isPressed ? JovieMotion.pressScale : 1)
      .animation(JovieMotion.subtle, value: configuration.isPressed)
  }
}

/// Pure helpers for gesture ownership (JOV-3635) — edge swipes own rails;
/// tabs own surface switching. Horizontal page-swipes between tabs are banned.
enum AppShellGesturePolicy {
  static let leftEdgeOpenWidth: CGFloat = 28
  static let rightEdgeOpenWidth: CGFloat = 28
  static let openDistance: CGFloat = 72
  static let openPredicted: CGFloat = 120

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

  /// Tabs switch only via explicit selection — never via horizontal swipe.
  static func shouldSwitchTabFromHorizontalSwipe() -> Bool {
    false
  }
}
