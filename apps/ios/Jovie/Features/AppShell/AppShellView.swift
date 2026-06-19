import SwiftUI

enum AppShellTab: Equatable {
  case chat
  case profile

  var accessibilityID: String {
    switch self {
    case .chat:
      return "shell-tab-chat"
    case .profile:
      return "shell-tab-profile"
    }
  }

  var title: String {
    switch self {
    case .chat:
      return "Chat"
    case .profile:
      return "Profile"
    }
  }

  var systemImage: String {
    switch self {
    case .chat:
      return "sparkles"
    case .profile:
      return "qrcode.viewfinder"
    }
  }
}

private enum AppShellRoute: Hashable {
  case settings
}

struct AppShellProfile: Equatable {
  let displayName: String
  let username: String?
  let publicProfileURL: String?
  let avatarURL: URL?

  init(response: MobileMeResponse?) {
    displayName = response?.displayName ?? response?.username ?? "Jovie"
    username = response?.username
    publicProfileURL = response?.publicProfileURL
    avatarURL = response?.avatarURL.flatMap(URL.init(string:))
  }

  var secondaryText: String {
    if let username, !username.isEmpty {
      return "@\(username)"
    }

    return publicProfileURL ?? "Profile setup pending"
  }
}

struct AppShellView<ProfileContent: View, ChatContent: View>: View {
  let profile: AppShellProfile
  let isOffline: Bool
  let opensSettingsOnLaunch: Bool
  let billingURL: URL
  let chatEnabled: Bool
  let recentConversations: [MobileConversationSummary]
  let onSelectConversation: (String) -> Void
  let onLogout: @MainActor () async -> Void
  @ViewBuilder let profileContent: ProfileContent
  let chatContent: (Binding<String>) -> ChatContent

  @State private var selectedTab: AppShellTab
  @State private var navigationPath: [AppShellRoute] = []
  @State private var isShowingMenu = false
  @State private var didOpenLaunchSettings = false
  @State private var chatDraft = ""
  @State private var intentStore = IntentNavigationStore.shared

  init(
    profile: AppShellProfile,
    isOffline: Bool,
    initialTab: AppShellTab = .profile,
    opensSettingsOnLaunch: Bool = false,
    billingURL: URL,
    chatEnabled: Bool = false,
    recentConversations: [MobileConversationSummary] = [],
    onSelectConversation: @escaping (String) -> Void = { _ in },
    onLogout: @escaping @MainActor () async -> Void,
    @ViewBuilder profileContent: () -> ProfileContent,
    @ViewBuilder chatContent: @escaping (Binding<String>) -> ChatContent
  ) {
    self.profile = profile
    self.isOffline = isOffline
    self.opensSettingsOnLaunch = opensSettingsOnLaunch
    self.billingURL = billingURL
    self.chatEnabled = chatEnabled
    self.recentConversations = recentConversations
    self.onSelectConversation = onSelectConversation
    self.onLogout = onLogout
    self.profileContent = profileContent()
    self.chatContent = chatContent
    _selectedTab = State(initialValue: chatEnabled ? initialTab : .profile)
  }

  var body: some View {
    NavigationStack(path: $navigationPath) {
      ZStack {
        JovieColor.backgroundBase.ignoresSafeArea()

        pagedContent
          .id(selectedTab)
          .transition(pageTransition)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .clipped()
      }
      .safeAreaInset(edge: .top, spacing: 0) {
        shellToolbar
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        bottomBar
      }
      .simultaneousGesture(pageSwipe)
      .navigationBarHidden(true)
      .navigationDestination(for: AppShellRoute.self) { route in
        switch route {
        case .settings:
          SettingsView(
            profile: profile,
            buildInfo: .current(),
            billingURL: billingURL,
            onClose: { navigationPath.removeLast() },
            onLogout: onLogout
          )
          .navigationBarBackButtonHidden()
        }
      }
    }
    .background(JovieColor.backgroundBase)
    .fullScreenCover(isPresented: $isShowingMenu) {
      AppNavigationMenu(
        profile: profile,
        isOffline: isOffline,
        chatEnabled: chatEnabled,
        recentConversations: recentConversations,
        onSelectConversation: { conversationID in
          onSelectConversation(conversationID)
          selectedTab = .chat
          isShowingMenu = false
        },
        onOpenSettings: {
          isShowingMenu = false
          navigationPath.append(.settings)
        },
        onClose: { isShowingMenu = false }
      )
    }
    .task(id: opensSettingsOnLaunch) {
      guard opensSettingsOnLaunch, didOpenLaunchSettings == false else { return }
      didOpenLaunchSettings = true
      await Task.yield()
      navigationPath.append(.settings)
    }
    .task {
      applyPendingIntentNavigation()
    }
    .onChange(of: intentStore.pending) {
      applyPendingIntentNavigation()
    }
  }

  // Consume a navigation request raised by an App Intent (Siri / Shortcuts /
  // Spotlight). Chat-bound requests land on Profile when chat is unavailable.
  private func applyPendingIntentNavigation() {
    guard let request = intentStore.consume() else { return }
    guard chatEnabled else { return }

    switch request {
    case .openChat, .continueLastConversation:
      withAnimation(.easeInOut(duration: 0.25)) {
        selectedTab = .chat
      }
    case let .sendMessage(text):
      chatDraft = text
      withAnimation(.easeInOut(duration: 0.25)) {
        selectedTab = .chat
      }
    }
  }

  // Horizontally paged primary screens. The floating bottom bar drives the same
  // `selectedTab` selection so taps and the horizontal swipe gesture stay in sync,
  // and each screen keeps its own vertical scrolling (the swipe is recognized
  // simultaneously and only acts on a clearly-horizontal end gesture).
  @ViewBuilder
  private var pagedContent: some View {
    switch selectedTab {
    case .chat:
      if chatEnabled {
        chatContent($chatDraft)
      } else {
        profileContent
      }
    case .profile:
      profileContent
    }
  }

  // Slide direction follows the destination: Chat enters from the trailing edge,
  // Profile from the leading edge, so the motion matches the swipe.
  private var pageTransition: AnyTransition {
    .asymmetric(
      insertion: .move(edge: selectedTab == .chat ? .trailing : .leading),
      removal: .move(edge: selectedTab == .chat ? .leading : .trailing)
    )
  }

  private var pageSwipe: some Gesture {
    DragGesture(minimumDistance: 24)
      .onEnded { value in
        let horizontal = value.translation.width
        guard chatEnabled,
              abs(horizontal) > 60,
              abs(horizontal) > abs(value.translation.height) * 1.5
        else { return }

        withAnimation(.easeInOut(duration: 0.28)) {
          if horizontal < 0, selectedTab == .profile {
            selectedTab = .chat
          } else if horizontal > 0, selectedTab == .chat {
            selectedTab = .profile
          }
        }
      }
  }

  private var shellToolbar: some View {
    HStack(alignment: .firstTextBaseline, spacing: JovieSpacing.medium) {
      VStack(alignment: .leading, spacing: 2) {
        Text(selectedTab.title)
          .font(JovieFont.display(size: 22))
          .foregroundStyle(JovieColor.textPrimary)
          .lineLimit(1)

        if isOffline {
          Text("Offline")
            .font(JovieFont.body(size: 11, weight: .medium))
            .foregroundStyle(JovieColor.textTertiary)
        }
      }

      Spacer(minLength: 0)

      Button {
        navigationPath.append(.settings)
      } label: {
        Image(systemName: "gearshape")
      }
      .buttonStyle(JovieIconButtonStyle())
      .accessibilityLabel("Open Settings")
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.vertical, JovieSpacing.small)
    .background(JovieColor.backgroundBase.opacity(0.96))
  }

  // Floating, icon-only bottom bar: primary destinations live in one capsule, with
  // an overflow "More" control in its own adjacent capsule (drawer trigger).
  private var bottomBar: some View {
    HStack(spacing: JovieSpacing.small) {
      HStack(spacing: 4) {
        navIcon(.profile)
        if chatEnabled {
          navIcon(.chat)
        }
      }
      .padding(6)
      .modifier(BottomBarSurface())

      moreButton
        .padding(6)
        .modifier(BottomBarSurface())
    }
    .padding(.bottom, JovieSpacing.medium)
  }

  private func navIcon(_ tab: AppShellTab) -> some View {
    let isSelected = selectedTab == tab

    return Button {
      withAnimation(.easeInOut(duration: 0.25)) {
        selectedTab = tab
      }
    } label: {
      Image(systemName: tab.systemImage)
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(isSelected ? JovieColor.textPrimary : JovieColor.textTertiary)
        .frame(width: 48, height: 40)
        .background(
          isSelected ? JovieColor.surface1 : Color.clear,
          in: RoundedRectangle(cornerRadius: 13, style: .continuous)
        )
        .contentShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(tab.title)
    .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    .accessibilityIdentifier(tab.accessibilityID)
  }

  private var moreButton: some View {
    Button {
      isShowingMenu = true
    } label: {
      Image(systemName: "ellipsis")
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(JovieColor.textSecondary)
        .frame(width: 48, height: 40)
        .contentShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel("More")
    .accessibilityIdentifier("shell-more")
  }
}

private struct BottomBarSurface: ViewModifier {
  func body(content: Content) -> some View {
    content.background {
      if #available(iOS 26.0, *) {
        Capsule(style: .continuous)
          .fill(JovieColor.surface1.opacity(0.4))
          .glassEffect(
            .regular.tint(JovieColor.surface1.opacity(0.4)),
            in: .rect(cornerRadius: 28)
          )
      } else {
        Capsule(style: .continuous)
          .fill(.ultraThinMaterial)
          .overlay {
            Capsule(style: .continuous)
              .stroke(JovieColor.borderDefault, lineWidth: 1)
          }
      }
    }
  }
}

private struct AppNavigationMenu: View {
  let profile: AppShellProfile
  let isOffline: Bool
  let chatEnabled: Bool
  let recentConversations: [MobileConversationSummary]
  let onSelectConversation: (String) -> Void
  let onOpenSettings: () -> Void
  let onClose: () -> Void

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(alignment: .leading, spacing: JovieSpacing.xLarge) {
        HStack {
          Text("Jovie")
            .font(JovieFont.display(size: 30))
            .foregroundStyle(JovieColor.textPrimary)

          Spacer()

          Button(action: onClose) {
            Image(systemName: "xmark")
          }
          .buttonStyle(JovieIconButtonStyle())
          .accessibilityLabel("Close Menu")
        }

        MenuAccountView(profile: profile, isOffline: isOffline)

        VStack(spacing: JovieSpacing.small) {
          MenuRow(
            title: "Settings",
            systemImage: "gearshape",
            isSelected: false,
            action: onOpenSettings
          )
        }

        if chatEnabled {
          VStack(alignment: .leading, spacing: JovieSpacing.medium) {
            Text("Recent")
              .font(JovieFont.body(size: 13, weight: .semibold))
              .foregroundStyle(JovieColor.textTertiary)

            if recentConversations.isEmpty {
              Text("Start a conversation to see recent conversations here.")
                .font(JovieFont.body(size: 15))
                .foregroundStyle(JovieColor.textTertiary)
                .fixedSize(horizontal: false, vertical: true)
            } else {
              VStack(spacing: JovieSpacing.small) {
                ForEach(recentConversations.prefix(5)) { conversation in
                  Button {
                    onSelectConversation(conversation.id)
                  } label: {
                    HStack {
                      Text(conversation.title ?? "New Conversation")
                        .font(JovieFont.body(size: 15))
                        .foregroundStyle(JovieColor.textPrimary)
                        .lineLimit(1)
                      Spacer()
                    }
                    .padding(.vertical, JovieSpacing.small)
                  }
                  .buttonStyle(.plain)
                }
              }
            }
          }
          .padding(.top, JovieSpacing.medium)
        }

        Spacer(minLength: 0)
      }
      .padding(.horizontal, JovieSpacing.xLarge)
      .padding(.top, JovieSpacing.xxLarge)
      .padding(.bottom, JovieSpacing.xLarge)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    .accessibilityIdentifier("shell-menu")
  }
}

private struct MenuAccountView: View {
  let profile: AppShellProfile
  let isOffline: Bool

  var body: some View {
    HStack(spacing: JovieSpacing.medium) {
      DashboardAvatarView(
        name: profile.displayName,
        avatarURL: profile.avatarURL
      )
      .frame(width: 36, height: 36)

      VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
        Text(profile.displayName)
          .font(JovieFont.body(size: 15, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
          .lineLimit(1)

        Text(isOffline ? "Offline" : profile.secondaryText)
          .font(JovieFont.body(size: 13, weight: .medium))
          .foregroundStyle(JovieColor.textTertiary)
          .lineLimit(1)
      }

      Spacer(minLength: 0)
    }
  }
}

private struct MenuRow: View {
  let title: String
  let systemImage: String
  let isSelected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.medium) {
        Image(systemName: systemImage)
          .frame(width: 22)

        Text(title)
          .lineLimit(1)

        Spacer(minLength: 0)
      }
      .font(JovieFont.body(size: 18, weight: .semibold))
      .foregroundStyle(isSelected ? JovieColor.textPrimary : JovieColor.textSecondary)
      .padding(.vertical, 13)
      .padding(.horizontal, JovieSpacing.medium)
      .background(
        isSelected ? JovieColor.surface1 : Color.clear,
        in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
      )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(title)
  }
}
