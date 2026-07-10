import SwiftUI

enum AppShellTab: Equatable, Hashable {
  case chat
  case profile
  case audience

  var accessibilityID: String {
    switch self {
    case .chat:
      return "shell-tab-chat"
    case .profile:
      return "shell-tab-profile"
    case .audience:
      return "shell-tab-audience"
    }
  }

  var title: String {
    switch self {
    case .chat:
      return "Chat"
    case .profile:
      return "Profile"
    case .audience:
      return "Audience"
    }
  }

  var systemImage: String {
    switch self {
    case .chat:
      return "sparkles"
    case .profile:
      return "qrcode.viewfinder"
    case .audience:
      return "person.3"
    }
  }

}

// File-level so unit tests can call it without importing SwiftUI.
func resolveShellInitialTab(_ initialTab: AppShellTab, chatEnabled: Bool) -> AppShellTab {
  switch initialTab {
  case .chat:
    return chatEnabled ? .chat : .profile
  case .audience, .profile:
    return initialTab
  }
}

// GH-12949: the recessed drawer base plane must be fully invisible while closed.
// Content chrome (composer, toolbar) can be translucent, so occlusion alone is
// not enough — opacity 0 when idle prevents thread rows from peeking through.
func appShellDrawerBasePlaneOpacity(
  isShowingDrawer: Bool,
  drawerDragOffset: CGFloat
) -> Double {
  (isShowingDrawer || drawerDragOffset != 0) ? 1 : 0
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

struct AppShellView<ProfileContent: View, AudienceContent: View, ChatContent: View>: View {
  let profile: AppShellProfile
  let isOffline: Bool
  let opensSettingsOnLaunch: Bool
  let billingURL: URL
  let chatEnabled: Bool
  let audienceEnabled: Bool
  let recentConversations: [MobileConversationSummary]
  let isLoadingConversations: Bool
  let activeConversationID: String?
  let onSelectConversation: (String) -> Void
  let onStartNewChat: () -> Void
  let onAutoSendMessage: (String) -> Void
  let onLogout: @MainActor () async -> Void
  @ViewBuilder let profileContent: ProfileContent
  @ViewBuilder let audienceContent: (_ askJovie: @escaping (String) -> Void) -> AudienceContent
  let chatContent: (Binding<String>, Binding<Int>) -> ChatContent

  @State private var selectedTab: AppShellTab
  @State private var navigationPath: [AppShellRoute] = []
  @State private var isShowingDrawer = false
  @State private var drawerDragOffset: CGFloat = 0
  @State private var isKeyboardVisible = false
  @State private var didOpenLaunchSettings = false
  @State private var chatDraft = ""
  @State private var voiceCaptureTrigger = 0
  @State private var intentStore = IntentNavigationStore.shared
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(
    profile: AppShellProfile,
    isOffline: Bool,
    initialTab: AppShellTab = .chat,
    opensSettingsOnLaunch: Bool = false,
    billingURL: URL,
    chatEnabled: Bool = false,
    audienceEnabled: Bool = true,
    recentConversations: [MobileConversationSummary] = [],
    isLoadingConversations: Bool = false,
    activeConversationID: String? = nil,
    onSelectConversation: @escaping (String) -> Void = { _ in },
    onStartNewChat: @escaping () -> Void = {},
    onAutoSendMessage: @escaping (String) -> Void = { _ in },
    onLogout: @escaping @MainActor () async -> Void,
    @ViewBuilder profileContent: () -> ProfileContent,
    @ViewBuilder audienceContent: @escaping (_ askJovie: @escaping (String) -> Void) -> AudienceContent,
    @ViewBuilder chatContent: @escaping (Binding<String>, Binding<Int>) -> ChatContent
  ) {
    self.profile = profile
    self.isOffline = isOffline
    self.opensSettingsOnLaunch = opensSettingsOnLaunch
    self.billingURL = billingURL
    self.chatEnabled = chatEnabled
    self.audienceEnabled = audienceEnabled
    self.recentConversations = recentConversations
    self.isLoadingConversations = isLoadingConversations
    self.activeConversationID = activeConversationID
    self.onSelectConversation = onSelectConversation
    self.onStartNewChat = onStartNewChat
    self.onAutoSendMessage = onAutoSendMessage
    self.onLogout = onLogout
    self.profileContent = profileContent()
    self.audienceContent = audienceContent
    self.chatContent = chatContent
    _selectedTab = State(
      initialValue: Self.resolvedInitialTab(initialTab: initialTab, chatEnabled: chatEnabled)
    )
  }

  var body: some View {
    NavigationStack(path: $navigationPath) {
      GeometryReader { proxy in
        let openOffset = drawerOpenOffset(safeAreaLeading: proxy.safeAreaInsets.leading)

        // Drawer is the recessed BASE plane of the ZStack: it never overlays or
        // dims content. The content container is the elevated plane that slides
        // right to reveal it, matching the ChatGPT/desktop-app model.
        // When fully closed the base plane is opacity 0 (GH-12949) so translucent
        // composer/toolbar regions cannot show drawer rows underneath.
        let isDrawerBasePlaneVisible = isShowingDrawer || drawerDragOffset != 0

        ZStack(alignment: .leading) {
          AppShellLeftDrawer(
            isPresented: isShowingDrawer,
            profile: profile,
            chatEnabled: chatEnabled,
            audienceEnabled: audienceEnabled,
            selectedTab: selectedTab,
            recentConversations: recentConversations,
            isLoadingConversations: isLoadingConversations,
            activeConversationID: activeConversationID,
            drawerWidth: drawerWidth,
            onSelectTab: { tab in
              closeDrawerThenSelect(tab)
            },
            onStartNewChat: {
              closeDrawer()
              startNewChat()
            },
            onSelectConversation: { conversationID in
              closeDrawer()
              onSelectConversation(conversationID)
              selectTab(.chat)
            },
            onOpenSettings: {
              closeDrawer()
              navigationPath.append(.settings)
            }
          )
          .opacity(
            appShellDrawerBasePlaneOpacity(
              isShowingDrawer: isShowingDrawer,
              drawerDragOffset: drawerDragOffset
            )
          )
          .animation(drawerAnimation, value: isShowingDrawer)
          .animation(reduceMotion ? nil : drawerAnimation, value: drawerDragOffset)
          .accessibilityHidden(!isDrawerBasePlaneVisible)

          shellContent
            // Full-bleed elevated card so the base plane cannot peek at bottom
            // or trailing edges when closed (post–bottom-bar safeAreaInset removal).
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .offset(x: reduceMotion ? 0 : contentOffset(openOffset: openOffset))
            .opacity(reduceMotion && isShowingDrawer ? 0 : 1)
            .animation(drawerAnimation, value: isShowingDrawer)
            .animation(reduceMotion ? nil : drawerAnimation, value: drawerDragOffset)
        }
        .simultaneousGesture(edgeSwipeToOpenDrawer(openOffset: openOffset))
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
    .onContinueUserActivity(ConversationUserActivity.activityType) { activity in
      guard let payload = ConversationUserActivity.payload(from: activity.userInfo ?? [:]) else {
        return
      }
      intentStore.submit(.openConversation(payload.conversationID))
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
      isKeyboardVisible = true
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
      isKeyboardVisible = false
    }
  }

  // The elevated content plane: toolbar and paged content ride together as one
  // transformable container so the drawer transform reads as a single spatial
  // move, not independently animated pieces. The drawer is the sole surface
  // switcher (JOV-3670) — there is no shell-level bottom bar; each screen's
  // own composer/content extends into the reclaimed space.
  private var shellContent: some View {
    let isElevated = isShowingDrawer || drawerDragOffset != 0

    return ZStack {
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
      // Content is a non-interactive, dimmed-free card while the drawer is
      // open: taps land on the transparent overlay below (which closes the
      // drawer) instead of reaching gear/composer/chat rows underneath.
      .allowsHitTesting(!isElevated)
      .accessibilityHidden(isElevated)

      if isElevated {
        Color.clear
          .contentShape(Rectangle())
          .onTapGesture { closeDrawer() }
          .accessibilityHidden(true)
      }
    }
    // Opaque full-size card. Clip first when elevated (rounded card). When
    // closed, paint an unclipped bottom-safe-area underlay after clip so the
    // home-indicator band cannot expose the recessed drawer (GH-12949).
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(JovieColor.backgroundBase)
    .clipShape(shellContentClipShape(isElevated: isElevated))
    .background {
      if !isElevated {
        JovieColor.backgroundBase.ignoresSafeArea(edges: .bottom)
      }
    }
    .overlay(alignment: .leading) {
      if isElevated {
        Rectangle()
          .fill(JovieColor.borderSubtle)
          .frame(width: 1)
      }
    }
    .shadow(color: .black.opacity(isElevated ? 0.28 : 0), radius: 24, x: 8)
  }

  private func shellContentClipShape(isElevated: Bool) -> AnyShape {
    if isElevated {
      return AnyShape(RoundedRectangle(cornerRadius: JovieRadius.xLarge, style: .continuous))
    }
    return AnyShape(Rectangle())
  }

  // Consume a navigation request raised by an App Intent (Siri / Shortcuts /
  // Spotlight). Chat-bound requests land on Profile when chat is unavailable.
  private func applyPendingIntentNavigation() {
    var state = AppShellIntentNavigationState(
      selectedTab: selectedTab,
      chatDraft: chatDraft,
      autoSendMessage: nil,
      shouldStartVoiceCapture: false,
      openConversationID: nil,
      pendingRequest: intentStore.consume()
    )
    let previousTab = selectedTab

    guard AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: chatEnabled,
      state: &state
    ) else { return }

    chatDraft = state.chatDraft

    if let autoSendMessage = state.autoSendMessage {
      onAutoSendMessage(autoSendMessage)
    }

    if let conversationID = state.openConversationID {
      onSelectConversation(conversationID)
    }

    if state.shouldStartVoiceCapture {
      voiceCaptureTrigger += 1
    }

    if state.selectedTab != previousTab {
      withAnimation(JovieMotion.easeOut(duration: JovieMotion.slowDuration)) {
        selectedTab = state.selectedTab
      }
    } else {
      selectedTab = state.selectedTab
    }
  }

  private func selectTab(_ tab: AppShellTab) {
    withAnimation(JovieMotion.easeOut(duration: JovieMotion.slowDuration)) {
      selectedTab = tab
    }
  }

  private func startNewChat() {
    onStartNewChat()
    chatDraft = ""
    selectTab(.chat)
  }

  private func openAudienceChat(prompt: String) {
    guard chatEnabled else { return }
    chatDraft = prompt
    selectTab(.chat)
  }

  static func resolvedInitialTab(
    initialTab: AppShellTab,
    chatEnabled: Bool
  ) -> AppShellTab {
    resolveShellInitialTab(initialTab, chatEnabled: chatEnabled)
  }

  private var drawerWidth: CGFloat {
    min(320, UIScreen.main.bounds.width * 0.86)
  }

  private var drawerAnimation: Animation {
    reduceMotion ? JovieMotion.subtle : JovieMotion.cinematic
  }

  private func drawerOpenOffset(safeAreaLeading: CGFloat) -> CGFloat {
    drawerWidth + safeAreaLeading
  }

  // Content translates right by however far the drawer is open/dragged so the
  // two planes move together as one gesture-driven transform.
  private func contentOffset(openOffset: CGFloat) -> CGFloat {
    if isShowingDrawer {
      return max(0, openOffset + drawerDragOffset)
    }
    return max(0, drawerDragOffset)
  }

  private func openDrawer() {
    guard !isShowingDrawer else { return }
    dismissKeyboardIfNeeded()
    isShowingDrawer = true
  }

  private func closeDrawer() {
    drawerDragOffset = 0
    isShowingDrawer = false
  }

  // Closing must finish its transform before the page crossfade starts —
  // never animate the drawer-close and the tab-change spatial motion at once.
  private func closeDrawerThenSelect(_ tab: AppShellTab) {
    closeDrawer()
    DispatchQueue.main.asyncAfter(deadline: .now() + JovieMotion.cinematicDuration) {
      selectTab(tab)
    }
  }

  private func dismissKeyboardIfNeeded() {
    guard isKeyboardVisible else { return }
    UIApplication.shared.sendAction(
      #selector(UIResponder.resignFirstResponder),
      to: nil,
      from: nil,
      for: nil
    )
  }

  // Horizontally paged primary screens. The left drawer (sole surface switcher,
  // JOV-3670) drives the same `selectedTab` selection so drawer taps and the
  // horizontal swipe gesture stay in sync, and each screen keeps its own
  // vertical scrolling (the swipe is recognized simultaneously and only acts
  // on a clearly-horizontal end gesture).
  @ViewBuilder
  private var pagedContent: some View {
    switch selectedTab {
    case .chat:
      if chatEnabled {
        chatContent($chatDraft, $voiceCaptureTrigger)
      } else {
        profileContent
      }
    case .profile:
      profileContent
    case .audience:
      audienceContent(openAudienceChat)
    }
  }

  // Slide direction follows the destination: Chat enters from the trailing edge,
  // Profile from the leading edge, so the motion matches the swipe.
  private var pageTransition: AnyTransition {
    .asymmetric(
      insertion: .move(edge: pageInsertionEdge),
      removal: .move(edge: pageRemovalEdge)
    )
  }

  private var pageInsertionEdge: Edge {
    switch selectedTab {
    case .chat:
      return .trailing
    case .profile, .audience:
      return .leading
    }
  }

  private var pageRemovalEdge: Edge {
    switch selectedTab {
    case .chat:
      return .leading
    case .profile, .audience:
      return .trailing
    }
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

        withAnimation(JovieMotion.easeOut(duration: JovieMotion.slowDuration)) {
          if horizontal < 0, selectedTab == .profile {
            selectedTab = .chat
          } else if horizontal > 0, selectedTab == .chat {
            selectedTab = .profile
          }
        }
      }
  }

  // Drives both directions: an edge-drag from the leading edge opens the
  // drawer, and (while open) a drag anywhere on the elevated content closes
  // it. Suppressed entirely while the composer is focused so an edge-drag
  // inside the chat input can't fight text selection/cursor placement.
  private func edgeSwipeToOpenDrawer(openOffset: CGFloat) -> some Gesture {
    DragGesture(minimumDistance: 8, coordinateSpace: .global)
      .onChanged { value in
        guard !reduceMotion, !isKeyboardVisible else { return }

        if isShowingDrawer {
          drawerDragOffset = min(0, value.translation.width)
        } else if value.startLocation.x < 28, value.translation.width > 0 {
          drawerDragOffset = min(value.translation.width, openOffset)
        }
      }
      .onEnded { value in
        guard !reduceMotion, !isKeyboardVisible else { return }

        let predicted = value.predictedEndTranslation.width
        if isShowingDrawer {
          if value.translation.width < -72 || predicted < -120 {
            closeDrawer()
          } else {
            drawerDragOffset = 0
          }
          return
        }

        if value.startLocation.x < 28,
           value.translation.width > 72 || predicted > 120
        {
          openDrawer()
        }
        drawerDragOffset = 0
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
}
