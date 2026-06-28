import SwiftUI

enum AppShellTab: Equatable, Hashable {
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
  let activeConversationID: String?
  let onSelectConversation: (String) -> Void
  let onStartNewChat: () -> Void
  let onLogout: @MainActor () async -> Void
  @ViewBuilder let profileContent: ProfileContent
  let chatContent: (Binding<String>) -> ChatContent

  @State private var selectedTab: AppShellTab
  @State private var navigationPath: [AppShellRoute] = []
  @State private var isShowingDrawer = false
  @State private var didOpenLaunchSettings = false
  @State private var chatDraft = ""
  @State private var intentStore = IntentNavigationStore.shared
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(
    profile: AppShellProfile,
    isOffline: Bool,
    initialTab: AppShellTab = .profile,
    opensSettingsOnLaunch: Bool = false,
    billingURL: URL,
    chatEnabled: Bool = false,
    recentConversations: [MobileConversationSummary] = [],
    activeConversationID: String? = nil,
    onSelectConversation: @escaping (String) -> Void = { _ in },
    onStartNewChat: @escaping () -> Void = {},
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
    self.activeConversationID = activeConversationID
    self.onSelectConversation = onSelectConversation
    self.onStartNewChat = onStartNewChat
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
      .simultaneousGesture(edgeSwipeToOpenDrawer)
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
      .overlay {
        AppShellLeftDrawer(
          isPresented: $isShowingDrawer,
          profile: profile,
          isOffline: isOffline,
          chatEnabled: chatEnabled,
          selectedTab: selectedTab,
          recentConversations: recentConversations,
          activeConversationID: activeConversationID,
          onSelectTab: selectTab,
          onStartNewChat: startNewChat,
          onSelectConversation: { conversationID in
            onSelectConversation(conversationID)
            selectTab(.chat)
          },
          onOpenSettings: {
            navigationPath.append(.settings)
          }
        )
      }
    }
    .background(JovieColor.backgroundBase)
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
    var state = AppShellIntentNavigationState(
      selectedTab: selectedTab,
      chatDraft: chatDraft,
      pendingRequest: intentStore.consume()
    )
    let previousTab = selectedTab

    guard AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: chatEnabled,
      state: &state
    ) else { return }

    chatDraft = state.chatDraft

    if state.selectedTab != previousTab {
      withAnimation(.easeInOut(duration: 0.25)) {
        selectedTab = state.selectedTab
      }
    } else {
      selectedTab = state.selectedTab
    }
  }

  private func selectTab(_ tab: AppShellTab) {
    withAnimation(.easeInOut(duration: 0.25)) {
      selectedTab = tab
    }
  }

  private func startNewChat() {
    onStartNewChat()
    chatDraft = ""
    selectTab(.chat)
  }

  private func openDrawer() {
    guard !isShowingDrawer else { return }
    isShowingDrawer = true
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
        guard !isShowingDrawer else { return }

        let horizontal = value.translation.width
        guard chatEnabled,
              abs(horizontal) > 60,
              abs(horizontal) > abs(value.translation.height) * 1.5,
              value.startLocation.x >= 28 || horizontal < 0
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

  private var edgeSwipeToOpenDrawer: some Gesture {
    DragGesture(minimumDistance: 12, coordinateSpace: .global)
      .onEnded { value in
        guard !isShowingDrawer, !reduceMotion else { return }
        guard value.startLocation.x < 28 else { return }
        if value.translation.width > 72 || value.predictedEndTranslation.width > 120 {
          openDrawer()
        }
      }
  }

  private var shellToolbar: some View {
    HStack(alignment: .center, spacing: JovieSpacing.medium) {
      Button(action: openDrawer) {
        DashboardAvatarView(
          name: profile.displayName,
          avatarURL: profile.avatarURL
        )
        .frame(width: 32, height: 32)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Open navigation drawer")
      .accessibilityIdentifier("shell-drawer-open")

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

  // Floating, icon-only bottom bar: primary destinations live in one capsule.
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