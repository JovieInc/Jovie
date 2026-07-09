import SwiftUI

enum JovieMotion {
  static let cinematicDuration: Double = 0.42
  static let cinematic = Animation.timingCurve(0.22, 1, 0.36, 1, duration: cinematicDuration)
}

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
  let activeConversationID: String?
  let drawerWidth: CGFloat
  let onSelectTab: (AppShellTab) -> Void
  let onStartNewChat: () -> Void
  let onSelectConversation: (String) -> Void
  let onOpenSettings: () -> Void

  @State private var threadSearch = ""

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

          DrawerAccountHeader(profile: profile)

          if chatEnabled {
            DrawerNewChatButton(action: onStartNewChat)

            DrawerThreadsSection(
              searchText: $threadSearch,
              conversations: filteredConversations,
              totalCount: recentConversations.count,
              activeConversationID: activeConversationID,
              onSelectConversation: onSelectConversation
            )
          }

          DrawerSettingsRow(action: onOpenSettings)
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
    .buttonStyle(.plain)
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
    .buttonStyle(.plain)
    .accessibilityLabel("New chat")
    .accessibilityIdentifier("shell-drawer-new-chat")
  }
}

private struct DrawerThreadsSection: View {
  @Binding var searchText: String
  let conversations: [MobileConversationSummary]
  let totalCount: Int
  let activeConversationID: String?
  let onSelectConversation: (String) -> Void

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

      if totalCount == 0 {
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
    .buttonStyle(.plain)
    .accessibilityIdentifier("shell-drawer-thread-\(conversation.id)")
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
    .buttonStyle(.plain)
    .accessibilityLabel("Settings")
    .accessibilityIdentifier("shell-drawer-settings")
  }
}
