import SwiftUI

enum AppShellDrawerSurfaceLayout {
  static let labelMinimumScaleFactor: CGFloat = 0.85
  static let maxSingleLineSurfaceButtonHeight: CGFloat = 56

  static var longestSurfaceTitle: String {
    AppShellTab.audience.title
  }
}

enum AppShellDrawerThreadsFilter {
  static func filtered(
    conversations: [MobileConversationSummary],
    query: String
  ) -> [MobileConversationSummary] {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return conversations }

    return conversations.filter { conversation in
      let title = conversation.title ?? "New Conversation"
      return title.localizedCaseInsensitiveContains(trimmed)
    }
  }

  // Loading skeleton only makes sense while there is nothing cached to show
  // yet — once any conversation is cached, prefer showing stale data over a
  // skeleton flash (stale-while-revalidate, matches the dashboard/audience
  // cache-first canon).
  static func shouldShowLoadingSkeleton(
    isLoading: Bool,
    conversations: [MobileConversationSummary]
  ) -> Bool {
    isLoading && conversations.isEmpty
  }
}

// The drawer is mounted as the recessed BASE plane behind the elevated content
// card (see AppShellView.body). It never overlays, dims, or offsets itself —
// AppShellView owns all drag/open state, moves the content plane, and sets
// base-plane opacity to 0 while fully closed (GH-12949) so translucent content
// chrome cannot show drawer rows underneath. This view is a pure surface
// switcher; hit-testing is gated on isPresented.
struct AppShellLeftDrawer: View {
  let isPresented: Bool
  let profile: AppShellProfile
  let chatEnabled: Bool
  let audienceEnabled: Bool
  let selectedTab: AppShellTab
  let recentConversations: [MobileConversationSummary]
  let isLoadingConversations: Bool
  let activeConversationID: String?
  let drawerWidth: CGFloat
  let onSelectTab: (AppShellTab) -> Void
  let onStartNewChat: () -> Void
  let onSelectConversation: (String) -> Void
  let onOpenSettings: () -> Void

  @State private var threadSearch = ""
  // Decorative open-stagger only; the drawer is fully interactive regardless
  // of this flag (rows never block on it — see DrawerRowRevealModifier).
  @State private var contentRevealed = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var filteredConversations: [MobileConversationSummary] {
    AppShellDrawerThreadsFilter.filtered(
      conversations: recentConversations,
      query: threadSearch
    )
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("Jovie")
        .font(JovieFont.display(size: 22))
        .foregroundStyle(JovieColor.textPrimary)
        .padding(.horizontal, JovieSpacing.large)
        .padding(.top, JovieSpacing.large)
        .padding(.bottom, JovieSpacing.medium)

      ScrollView {
        VStack(alignment: .leading, spacing: JovieSpacing.xLarge) {
          // Surface switcher leads the drawer (approved IA 3A): it is the
          // primary reason to open the drawer, so it sits above the account
          // header rather than being buried mid-list.
          DrawerSurfaceSwitcher(
            chatEnabled: chatEnabled,
            audienceEnabled: audienceEnabled,
            selectedTab: selectedTab,
            onSelectTab: onSelectTab
          )
          .drawerRowReveal(isRevealed: contentRevealed, delay: 0, reduceMotion: reduceMotion)

          DrawerAccountHeader(profile: profile)
            .drawerRowReveal(isRevealed: contentRevealed, delay: 0.04, reduceMotion: reduceMotion)

          if chatEnabled {
            DrawerNewChatButton(action: onStartNewChat)
              .drawerRowReveal(isRevealed: contentRevealed, delay: 0.08, reduceMotion: reduceMotion)

            DrawerThreadsSection(
              searchText: $threadSearch,
              conversations: filteredConversations,
              totalCount: recentConversations.count,
              isLoading: isLoadingConversations,
              activeConversationID: activeConversationID,
              onSelectConversation: onSelectConversation
            )
            .drawerRowReveal(isRevealed: contentRevealed, delay: 0.08, reduceMotion: reduceMotion)
          }

          DrawerSettingsRow(action: onOpenSettings)
            .drawerRowReveal(isRevealed: contentRevealed, delay: 0.12, reduceMotion: reduceMotion)
        }
        .padding(.horizontal, JovieSpacing.large)
        .padding(.bottom, JovieSpacing.xxLarge)
      }
    }
    .frame(width: drawerWidth, alignment: .leading)
    .frame(maxHeight: .infinity)
    .background(JovieColor.backgroundBase)
    .allowsHitTesting(isPresented)
    .accessibilityHidden(!isPresented)
    .accessibilityIdentifier("shell-drawer")
    .onChange(of: isPresented) {
      guard !isPresented else { return }
      threadSearch = ""
    }
    // Reveal is purely decorative (opacity/offset only, see the modifier
    // below) — it never gates hit-testing or accessibility, both of which
    // stay driven by `isPresented` above.
    .task(id: isPresented) {
      guard isPresented else {
        contentRevealed = false
        return
      }

      guard !reduceMotion else {
        contentRevealed = true
        return
      }

      contentRevealed = false
      try? await Task.sleep(nanoseconds: 20_000_000)
      contentRevealed = true
    }
  }
}

// Decorative stagger for the drawer's open animation: rows fade + slide in a
// short distance, `delay` apart. Opacity-only (no offset) and undelayed under
// Reduce Motion per motion.md §6. Never affects interactivity — hit-testing
// is controlled solely by `isPresented` on the drawer root.
private struct DrawerRowRevealModifier: ViewModifier {
  let isRevealed: Bool
  let delay: Double
  let reduceMotion: Bool

  func body(content: Content) -> some View {
    content
      .opacity(isRevealed ? 1 : 0)
      .offset(x: (reduceMotion || isRevealed) ? 0 : -8)
      .animation(
        reduceMotion ? nil : JovieMotion.easeOut().delay(delay),
        value: isRevealed
      )
  }
}

private extension View {
  func drawerRowReveal(isRevealed: Bool, delay: Double, reduceMotion: Bool) -> some View {
    modifier(DrawerRowRevealModifier(isRevealed: isRevealed, delay: delay, reduceMotion: reduceMotion))
  }
}

private struct DrawerAccountHeader: View {
  let profile: AppShellProfile

  var body: some View {
    HStack(spacing: JovieSpacing.medium) {
      DashboardAvatarView(
        name: profile.displayName,
        avatarURL: profile.avatarURL
      )
      .frame(width: 40, height: 40)

      VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
        Text(profile.displayName)
          .font(JovieFont.body(size: 16, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
          .lineLimit(1)

        Text(profile.secondaryText)
          .font(JovieFont.body(size: 13, weight: .medium))
          .foregroundStyle(JovieColor.textTertiary)
          .lineLimit(1)
      }

      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("shell-drawer-account")
  }
}

private struct DrawerSurfaceSwitcher: View {
  let chatEnabled: Bool
  let audienceEnabled: Bool
  let selectedTab: AppShellTab
  let onSelectTab: (AppShellTab) -> Void

  private var surfaces: [AppShellTab] {
    var tabs: [AppShellTab] = [.profile]
    if audienceEnabled {
      tabs.append(.audience)
    }
    if chatEnabled {
      tabs.append(.chat)
    }
    return tabs
  }

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      Text("Surfaces")
        .font(JovieFont.body(size: 13, weight: .semibold))
        .foregroundStyle(JovieColor.textTertiary)

      HStack(spacing: JovieSpacing.small) {
        ForEach(surfaces, id: \.self) { tab in
          DrawerSurfaceButton(
            tab: tab,
            isSelected: selectedTab == tab,
            action: { onSelectTab(tab) }
          )
        }
      }
      .frame(height: 62)
    }
  }
}

private struct DrawerSurfaceButton: View {
  let tab: AppShellTab
  let isSelected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      VStack(spacing: JovieSpacing.xSmall) {
        Image(systemName: tab.systemImage)
          .font(.system(size: 14, weight: .semibold))

        Text(tab.title)
          .font(JovieFont.body(size: 15, weight: .semibold))
          .lineLimit(1)
          .minimumScaleFactor(AppShellDrawerSurfaceLayout.labelMinimumScaleFactor)
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity)
      }
      .foregroundStyle(isSelected ? JovieColor.textPrimary : JovieColor.textSecondary)
      .padding(.horizontal, JovieSpacing.small)
      .padding(.vertical, 11)
      .frame(maxWidth: .infinity, minHeight: 62, maxHeight: 62)
      .background(
        isSelected ? JovieColor.surface1 : JovieColor.surface1.opacity(0.001),
        in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
          .stroke(isSelected ? JovieColor.borderDefault : Color.clear, lineWidth: 1)
      }
    }
    .buttonStyle(DrawerRowButtonStyle())
    .frame(maxWidth: .infinity, minHeight: 62, maxHeight: 62)
    .accessibilityLabel(tab.title)
    .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    .accessibilityIdentifier("shell-drawer-surface-\(tab.accessibilityID)")
  }
}

private struct DrawerNewChatButton: View {
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.medium) {
        Image(systemName: "square.and.pencil")
          .frame(width: 22)

        Text("New chat")
          .lineLimit(1)

        Spacer(minLength: 0)
      }
      .font(JovieFont.body(size: 18, weight: .semibold))
      .foregroundStyle(JovieColor.textPrimary)
      .padding(.vertical, 13)
      .padding(.horizontal, JovieSpacing.medium)
      .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous))
    }
    .buttonStyle(DrawerRowButtonStyle())
    .accessibilityLabel("New chat")
    .accessibilityIdentifier("shell-drawer-new-chat")
  }
}

private struct DrawerThreadsSection: View {
  @Binding var searchText: String
  let conversations: [MobileConversationSummary]
  let totalCount: Int
  let isLoading: Bool
  let activeConversationID: String?
  let onSelectConversation: (String) -> Void

  private static let skeletonRowCount = 5

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.medium) {
      Text("Threads")
        .font(JovieFont.body(size: 13, weight: .semibold))
        .foregroundStyle(JovieColor.textTertiary)

      HStack(spacing: JovieSpacing.small) {
        Image(systemName: "magnifyingglass")
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(JovieColor.textTertiary)

        TextField("Search threads", text: $searchText)
          .textInputAutocapitalization(.never)
          .disableAutocorrection(true)
          .font(JovieFont.body(size: 15))
          .foregroundStyle(JovieColor.textPrimary)
      }
      .padding(.horizontal, JovieSpacing.medium)
      .padding(.vertical, 11)
      .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous))
      .accessibilityIdentifier("shell-drawer-search")

      // Skeleton mirrors DrawerThreadRow's exact paddings/height so the
      // skeleton -> loaded swap causes zero layout shift. Only shown while
      // there is nothing cached yet (AppShellDrawerThreadsFilter.shouldShowLoadingSkeleton) --
      // once a conversation is cached, stale rows are preferred over a flash.
      if AppShellDrawerThreadsFilter.shouldShowLoadingSkeleton(isLoading: isLoading, conversations: conversations) {
        VStack(spacing: JovieSpacing.xSmall) {
          ForEach(0 ..< Self.skeletonRowCount, id: \.self) { _ in
            DrawerThreadRowSkeleton()
          }
        }
        .redacted(reason: .placeholder)
        .accessibilityHidden(true)
      } else if totalCount == 0 {
        Text("Start a conversation to see recent conversations here.")
          .font(JovieFont.body(size: 15))
          .foregroundStyle(JovieColor.textTertiary)
          .fixedSize(horizontal: false, vertical: true)
      } else if conversations.isEmpty {
        Text("No threads match your search.")
          .font(JovieFont.body(size: 15))
          .foregroundStyle(JovieColor.textTertiary)
          .fixedSize(horizontal: false, vertical: true)
      } else {
        VStack(spacing: JovieSpacing.xSmall) {
          ForEach(conversations) { conversation in
            DrawerThreadRow(
              conversation: conversation,
              isActive: activeConversationID == conversation.id,
              action: { onSelectConversation(conversation.id) }
            )
          }
        }
      }
    }
    .accessibilityIdentifier("shell-drawer-threads")
  }
}

private struct DrawerThreadRow: View {
  let conversation: MobileConversationSummary
  let isActive: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.medium) {
        Text(conversation.title ?? "New Conversation")
          .font(JovieFont.body(size: 15, weight: isActive ? .semibold : .regular))
          .foregroundStyle(isActive ? JovieColor.textPrimary : JovieColor.textSecondary)
          .lineLimit(1)

        Spacer(minLength: 0)
      }
      .padding(.vertical, JovieSpacing.small)
      .padding(.horizontal, JovieSpacing.small)
      .background(
        isActive ? JovieColor.surface1 : Color.clear,
        in: RoundedRectangle(cornerRadius: JovieRadius.small, style: .continuous)
      )
    }
    .buttonStyle(DrawerRowButtonStyle())
    .accessibilityIdentifier("shell-drawer-thread-\(conversation.id)")
  }
}

// Exactly mirrors DrawerThreadRow's paddings, font, and single-line height so
// the loading -> loaded swap in DrawerThreadsSection causes zero layout
// shift. Non-interactive (no Button, no action) -- it is purely a visual
// placeholder gated on `.redacted(reason: .placeholder)` by its parent.
private struct DrawerThreadRowSkeleton: View {
  var body: some View {
    HStack(spacing: JovieSpacing.medium) {
      Text("Loading conversation")
        .font(JovieFont.body(size: 15, weight: .regular))
        .foregroundStyle(JovieColor.textSecondary)
        .lineLimit(1)

      Spacer(minLength: 0)
    }
    .padding(.vertical, JovieSpacing.small)
    .padding(.horizontal, JovieSpacing.small)
    .background(
      Color.clear,
      in: RoundedRectangle(cornerRadius: JovieRadius.small, style: .continuous)
    )
  }
}

private struct DrawerSettingsRow: View {
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.medium) {
        Image(systemName: "gearshape")
          .frame(width: 22)

        Text("Settings")
          .lineLimit(1)

        Spacer(minLength: 0)
      }
      .font(JovieFont.body(size: 18, weight: .semibold))
      .foregroundStyle(JovieColor.textSecondary)
      .padding(.vertical, 13)
      .padding(.horizontal, JovieSpacing.medium)
    }
    .buttonStyle(DrawerRowButtonStyle())
    .accessibilityLabel("Settings")
    .accessibilityIdentifier("shell-drawer-settings")
  }
}

// Canonical drawer-row press feedback (background dim + JovieMotion.pressScale),
// shared by every plain-content Button row in the drawer (new chat, threads,
// settings). Mirrors JoviePillButtonStyle/JovieIconButtonStyle in
// DesignSystem/JovieTheme.swift but without their filled backgrounds, since
// drawer rows are flush against the drawer canvas.
private struct DrawerRowButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(configuration.isPressed ? 0.72 : 1)
      .scaleEffect(configuration.isPressed ? JovieMotion.pressScale : 1)
      .animation(JovieMotion.subtle, value: configuration.isPressed)
  }
}
