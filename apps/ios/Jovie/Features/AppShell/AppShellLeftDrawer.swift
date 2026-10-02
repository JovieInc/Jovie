import JovieKit
import SwiftUI

enum AppShellDrawerProfilePolicy {
  /// Name/avatar opens the public page. The Profile surface always opens
  /// Dashboard (QR, Copy URL, Wallet) so those controls stay reachable.
  static func profileSurfaceOpensDashboard() -> Bool { true }

  static func accountHeaderOpensEmbeddedPublicProfile(publicProfileURL: String?) -> Bool {
    PublicProfileURLPolicy(publicProfileURL: publicProfileURL ?? "") != nil
  }
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
  let onTalk: () -> Void
  var onOpenPublicProfile: () -> Void = {}
  var onOpenProfileQR: () -> Void = {}

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
          // Job-level roots lead; Work owns its review and planning workflows.
          // Account controls and conversation history follow navigation.
          DrawerSurfaceSwitcher(
            chatEnabled: chatEnabled,
            audienceEnabled: audienceEnabled,
            selectedTab: selectedTab,
            hasProfileQR: profile.qrPayload != nil,
            onSelectTab: onSelectTab,
            onOpenProfileQR: onOpenProfileQR
          )

          DrawerAccountHeader(
            profile: profile,
            action: {
              if AppShellDrawerProfilePolicy.accountHeaderOpensEmbeddedPublicProfile(
                publicProfileURL: profile.publicProfileURL
              ) {
                onOpenPublicProfile()
              } else {
                onSelectTab(.profile)
              }
            }
          )

          if chatEnabled {
            DrawerTalkRow(action: onTalk)

            DrawerNewChatButton(action: onStartNewChat)

            DrawerThreadsSection(
              searchText: $threadSearch,
              conversations: filteredConversations,
              totalCount: recentConversations.count,
              isLoading: isLoadingConversations,
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
  let action: () -> Void

  var body: some View {
    Button(action: action) {
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
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Open \(profile.displayName) public profile")
    .accessibilityIdentifier("shell-drawer-account")
  }
}

private struct DrawerSurfaceSwitcher: View {
  let chatEnabled: Bool
  let audienceEnabled: Bool
  let selectedTab: AppShellTab
  let hasProfileQR: Bool
  let onSelectTab: (AppShellTab) -> Void
  let onOpenProfileQR: () -> Void

  private var roots: [AppShellTab] {
    AppShellPanePolicy.rootDestinations(
      chatEnabled: chatEnabled,
      audienceEnabled: audienceEnabled
    )
  }

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      Text("Your workspace")
        .font(JovieFont.body(size: 13, weight: .semibold))
        .foregroundStyle(JovieColor.textTertiary)

      VStack(spacing: JovieSpacing.small) {
        ForEach(roots, id: \.self) { tab in
          VStack(spacing: 0) {
            HStack(spacing: JovieSpacing.small) {
              DrawerSurfaceButton(
                tab: tab,
                isSelected: selectedTab == tab,
                action: { onSelectTab(tab) }
              )

              if tab == .profile, hasProfileQR {
                Button(action: onOpenProfileQR) {
                  Image(systemName: "qrcode")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(JovieColor.textPrimary)
                    .frame(width: 48, height: 48)
                    .background(
                      JovieColor.surface1,
                      in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
                    )
                }
                .buttonStyle(JoviePressFeedbackButtonStyle())
                .accessibilityLabel("Profile QR code")
                .accessibilityIdentifier("shell-drawer-profile-qr")
              }
            }
            ForEach(AppShellPanePolicy.childDestinations(of: tab), id: \.self) { child in
              DrawerSurfaceButton(
                tab: child,
                isSelected: selectedTab == child,
                isChild: true,
                action: { onSelectTab(child) }
              )
              .padding(.leading, JovieSpacing.large)
            }
          }
        }
      }
    }
  }
}

private struct DrawerSurfaceButton: View {
  let tab: AppShellTab
  let isSelected: Bool
  var isChild: Bool = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.medium) {
        Image(systemName: tab.systemImage)
          .font(.system(size: 16, weight: .semibold))
          .frame(width: 22)

        Text(tab.title)
          .font(JovieFont.body(size: 16, weight: isChild ? .regular : .semibold))
          .lineLimit(1)
          .minimumScaleFactor(AppShellDrawerSurfaceLayout.labelMinimumScaleFactor)

        Spacer(minLength: 0)
      }
      .foregroundStyle(isSelected ? JovieColor.textPrimary : JovieColor.textSecondary)
      .padding(.horizontal, JovieSpacing.medium)
      .padding(.vertical, 11)
      .frame(maxWidth: .infinity, minHeight: 48, maxHeight: 48, alignment: .leading)
      .background(
        isSelected ? JovieColor.surface1 : JovieColor.surface1.opacity(0.001),
        in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
          .stroke(isSelected ? JovieColor.borderDefault : Color.clear, lineWidth: 1)
      }
    }
    .buttonStyle(JoviePressFeedbackButtonStyle())
    .frame(maxWidth: .infinity, minHeight: 48, maxHeight: 48)
    .accessibilityLabel(tab.title)
    .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    .accessibilityIdentifier("shell-drawer-surface-\(tab.accessibilityID)")
  }
}

private struct DrawerTalkRow: View {
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.medium) {
        Image(systemName: "mic.fill")
          .frame(width: 22)

        Text("Talk")
          .lineLimit(1)

        Spacer(minLength: 0)
      }
      .font(JovieFont.body(size: 18, weight: .semibold))
      .foregroundStyle(JovieColor.textPrimary)
      .padding(.vertical, 13)
      .padding(.horizontal, JovieSpacing.medium)
      .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous))
    }
    .buttonStyle(JoviePressFeedbackButtonStyle())
    .accessibilityLabel("Talk")
    .accessibilityIdentifier("shell-drawer-talk")
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
    .buttonStyle(JoviePressFeedbackButtonStyle())
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
      Text("Conversations")
        .font(JovieFont.body(size: 13, weight: .semibold))
        .foregroundStyle(JovieColor.textTertiary)

      HStack(spacing: JovieSpacing.small) {
        Image(systemName: "magnifyingglass")
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(JovieColor.textTertiary)

        TextField("Search conversations", text: $searchText)
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
        Text("No conversations match your search.")
          .font(JovieFont.body(size: 15))
          .foregroundStyle(JovieColor.textTertiary)
          .fixedSize(horizontal: false, vertical: true)
      } else {
        LazyVStack(spacing: JovieSpacing.xSmall) {
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
    .buttonStyle(JoviePressFeedbackButtonStyle())
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
    .buttonStyle(JoviePressFeedbackButtonStyle())
    .accessibilityLabel("Settings")
    .accessibilityIdentifier("shell-drawer-settings")
  }
}
