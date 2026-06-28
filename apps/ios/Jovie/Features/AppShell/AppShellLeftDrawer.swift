import SwiftUI

enum JovieMotion {
  static let cinematicDuration: Double = 0.42
  static let cinematic = Animation.timingCurve(0.22, 1, 0.36, 1, duration: cinematicDuration)
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

struct AppShellLeftDrawer: View {
  @Binding var isPresented: Bool
  let profile: AppShellProfile
  let isOffline: Bool
  let chatEnabled: Bool
  let selectedTab: AppShellTab
  let recentConversations: [MobileConversationSummary]
  let activeConversationID: String?
  let onSelectTab: (AppShellTab) -> Void
  let onStartNewChat: () -> Void
  let onSelectConversation: (String) -> Void
  let onOpenSettings: () -> Void

  @State private var threadSearch = ""
  @State private var dragOffset: CGFloat = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var drawerWidth: CGFloat {
    min(320, UIScreen.main.bounds.width * 0.86)
  }

  private var animation: Animation {
    reduceMotion ? .easeInOut(duration: 0.2) : JovieMotion.cinematic
  }

  private var filteredConversations: [MobileConversationSummary] {
    AppShellDrawerThreadsFilter.filtered(
      conversations: recentConversations,
      query: threadSearch
    )
  }

  var body: some View {
    GeometryReader { proxy in
      let openOffset = drawerWidth + proxy.safeAreaInsets.leading
      let progress = isPresented
        ? max(0, min(1, 1 + (dragOffset / openOffset)))
        : max(0, min(1, dragOffset / openOffset))

      ZStack(alignment: .leading) {
        if isPresented || dragOffset != 0 {
          Color.black
            .opacity(0.42 * progress)
            .ignoresSafeArea()
            .onTapGesture { closeDrawer() }
            .accessibilityHidden(true)
        }

        drawerPanel(openOffset: openOffset)
          .offset(x: drawerOffset(openOffset: openOffset))
          .gesture(drawerDragGesture(openOffset: openOffset))
      }
      .animation(animation, value: isPresented)
      .animation(animation, value: dragOffset)
    }
    .allowsHitTesting(isPresented || dragOffset != 0)
    .accessibilityElement(children: isPresented ? .contain : .ignore)
    .accessibilityIdentifier("shell-drawer")
  }

  @ViewBuilder
  private func drawerPanel(openOffset: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        Text("Jovie")
          .font(JovieFont.display(size: 22))
          .foregroundStyle(JovieColor.textPrimary)

        Spacer(minLength: 0)

        Button(action: closeDrawer) {
          Image(systemName: "xmark")
        }
        .buttonStyle(JovieIconButtonStyle())
        .accessibilityLabel("Close navigation drawer")
        .accessibilityIdentifier("shell-drawer-close")
      }
      .padding(.horizontal, JovieSpacing.large)
      .padding(.top, JovieSpacing.large)
      .padding(.bottom, JovieSpacing.medium)

      ScrollView {
        VStack(alignment: .leading, spacing: JovieSpacing.xLarge) {
          DrawerAccountHeader(profile: profile, isOffline: isOffline)

          DrawerSurfaceSwitcher(
            chatEnabled: chatEnabled,
            selectedTab: selectedTab,
            onSelectTab: { tab in
              onSelectTab(tab)
              closeDrawer()
            }
          )

          if chatEnabled {
            DrawerNewChatButton {
              onStartNewChat()
              closeDrawer()
            }

            DrawerThreadsSection(
              searchText: $threadSearch,
              conversations: filteredConversations,
              totalCount: recentConversations.count,
              activeConversationID: activeConversationID,
              onSelectConversation: { conversationID in
                onSelectConversation(conversationID)
                closeDrawer()
              }
            )
          }

          DrawerSettingsRow {
            onOpenSettings()
            closeDrawer()
          }
        }
        .padding(.horizontal, JovieSpacing.large)
        .padding(.bottom, JovieSpacing.xxLarge)
      }
    }
    .frame(width: drawerWidth, alignment: .leading)
    .frame(maxHeight: .infinity)
    .background(JovieColor.surface0)
    .overlay(alignment: .trailing) {
      Rectangle()
        .fill(JovieColor.borderSubtle)
        .frame(width: 1)
    }
    .clipShape(
      .rect(
        topLeadingRadius: 0,
        bottomLeadingRadius: 0,
        bottomTrailingRadius: JovieRadius.xLarge,
        topTrailingRadius: JovieRadius.xLarge
      )
    )
    .shadow(color: .black.opacity(0.28), radius: 24, x: 8)
  }

  private func drawerOffset(openOffset: CGFloat) -> CGFloat {
    if isPresented {
      return min(0, dragOffset)
    }
    return -openOffset + max(0, dragOffset)
  }

  private func drawerDragGesture(openOffset: CGFloat) -> some Gesture {
    DragGesture(minimumDistance: 8, coordinateSpace: .global)
      .onChanged { value in
        guard !reduceMotion else { return }

        if isPresented {
          dragOffset = min(0, value.translation.width)
        } else if value.startLocation.x < 28, value.translation.width > 0 {
          dragOffset = min(value.translation.width, openOffset)
        }
      }
      .onEnded { value in
        guard !reduceMotion else { return }

        let predicted = value.predictedEndTranslation.width
        if isPresented {
          if value.translation.width < -72 || predicted < -120 {
            closeDrawer()
          } else {
            dragOffset = 0
          }
          return
        }

        if value.startLocation.x < 28,
           value.translation.width > 72 || predicted > 120
        {
          openDrawer()
        }
        dragOffset = 0
      }
  }

  private func openDrawer() {
    dragOffset = 0
    isPresented = true
  }

  private func closeDrawer() {
    dragOffset = 0
    isPresented = false
    threadSearch = ""
  }
}

private struct DrawerAccountHeader: View {
  let profile: AppShellProfile
  let isOffline: Bool

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

        Text(isOffline ? "Offline" : profile.secondaryText)
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
  let selectedTab: AppShellTab
  let onSelectTab: (AppShellTab) -> Void

  private var surfaces: [AppShellTab] {
    chatEnabled ? [.profile, .chat] : [.profile]
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
    }
    .accessibilityIdentifier("shell-drawer-surfaces")
  }
}

private struct DrawerSurfaceButton: View {
  let tab: AppShellTab
  let isSelected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.small) {
        Image(systemName: tab.systemImage)
          .font(.system(size: 14, weight: .semibold))

        Text(tab.title)
          .font(JovieFont.body(size: 15, weight: .semibold))
      }
      .foregroundStyle(isSelected ? JovieColor.textPrimary : JovieColor.textSecondary)
      .padding(.horizontal, JovieSpacing.medium)
      .padding(.vertical, 11)
      .frame(maxWidth: .infinity)
      .background(
        isSelected ? JovieColor.surface1 : Color.clear,
        in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
          .stroke(isSelected ? JovieColor.borderDefault : Color.clear, lineWidth: 1)
      }
    }
    .buttonStyle(.plain)
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