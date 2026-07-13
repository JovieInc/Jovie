import SwiftUI

enum MobileChatKeyboardPolicy {
  /// Dismiss when the assistant starts streaming only if the user has not typed since send.
  static func shouldDismissOnStreamingStart(userEditedSinceSend: Bool) -> Bool {
    !userEditedSinceSend
  }
}

struct MobileChatView: View {
  @Bindable var repository: ChatRepository
  @Binding var draft: String
  @Binding var voiceCaptureTrigger: Int
  let webBaseURL: URL
  let onEntityTap: (EntityContextItem) -> Void

  @FocusState private var isComposerFocused: Bool
  @State private var isAtBottom = true
  @State private var userEditedSinceSend = false

  init(
    repository: ChatRepository,
    draft: Binding<String>,
    voiceCaptureTrigger: Binding<Int>,
    webBaseURL: URL,
    onEntityTap: @escaping (EntityContextItem) -> Void = { _ in }
  ) {
    self.repository = repository
    _draft = draft
    _voiceCaptureTrigger = voiceCaptureTrigger
    self.webBaseURL = webBaseURL
    self.onEntityTap = onEntityTap
  }

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      Group {
        if repository.timeline.isEmpty {
          emptyState
        } else {
          transcriptView
        }
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        composerChrome
      }
    }
    .accessibilityIdentifier("mobile-chat")
    .task {
      await repository.refreshConversations()
    }
    // voiceCaptureTrigger is owned by the shell Talk FAB / App Intents path
    // (JOV-3636). Chat no longer starts capture itself — the shell opens
    // TalkOverlayView when the trigger increments.
  }

  @ViewBuilder
  private var transcriptView: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: JovieSpacing.large) {
          ForEach(repository.timeline) { item in
            MobileChatMessageRow(
              item: item,
              webBaseURL: webBaseURL,
              onRetry: {
                guard let clientTurnId = item.clientTurnId else { return }
                Task { await repository.retry(clientTurnId: clientTurnId) }
              },
              onSubmitPrompt: { prompt in
                Task { await repository.send(text: prompt) }
              },
              onEntityTap: onEntityTap
            )
            .transition(.opacity.combined(with: .offset(y: 6)))
          }
        }
        // Keyed on `count` only, so this fires when a message is appended --
        // never on in-place streaming text/status mutations of an existing
        // row, which must render without animation.
        .animation(JovieMotion.easeOut(), value: repository.timeline.count)
        .padding(.horizontal, JovieSpacing.large)
        .padding(.top, JovieSpacing.xLarge)
        .padding(.bottom, JovieSpacing.medium)

        // ponytail: onAppear/onDisappear of this sentinel tracks whether the user is near
        // the bottom without needing coordinate-space math
        Color.clear
          .frame(height: 1)
          .id("chat-bottom")
          .onAppear { isAtBottom = true }
          .onDisappear { isAtBottom = false }
      }
      .defaultScrollAnchor(.bottom)
      .scrollDismissesKeyboard(.interactively)
      .contentShape(Rectangle())
      .simultaneousGesture(
        TapGesture().onEnded {
          isComposerFocused = false
        }
      )
      .onChange(of: repository.timeline.count) {
        scrollToBottomIfPinned(using: proxy, animated: true)
      }
      .onChange(of: repository.timeline.last?.content) {
        scrollToBottomIfPinned(using: proxy, animated: false)
      }
      .onChange(of: repository.timeline.last?.status) {
        guard repository.timeline.last?.status == .streaming else { return }
        guard MobileChatKeyboardPolicy.shouldDismissOnStreamingStart(
          userEditedSinceSend: userEditedSinceSend
        ) else { return }
        isComposerFocused = false
      }
      .onChange(of: isComposerFocused) {
        scrollToBottomIfPinned(using: proxy, animated: true)
      }
      .overlay(alignment: .bottom) {
        if !isAtBottom {
          Button {
            isAtBottom = true
            withAnimation(.easeOut(duration: 0.25)) {
              proxy.scrollTo("chat-bottom", anchor: .bottom)
            }
          } label: {
            Image(systemName: "arrow.down")
          }
          .buttonStyle(JovieIconButtonStyle())
          .padding(.bottom, JovieSpacing.medium)
          .transition(.opacity.combined(with: .scale(scale: 0.85)))
          .animation(.spring(duration: 0.2), value: isAtBottom)
          .accessibilityLabel("Scroll to latest message")
        }
      }
    }
  }

  private var composerChrome: some View {
    VStack(spacing: 0) {
      if let errorMessage = repository.lastErrorMessage, repository.isOffline {
        Text(errorMessage)
          .font(JovieFont.body(size: 13))
          .foregroundStyle(JovieColor.textTertiary)
          .multilineTextAlignment(.center)
          .padding(.horizontal, JovieSpacing.large)
          .padding(.bottom, JovieSpacing.small)
      }

      ChatComposerView(
        draft: $draft,
        isComposerFocused: $isComposerFocused,
        isSending: repository.isSending,
        isOffline: repository.isOffline,
        onSend: {
          let text = draft
          draft = ""
          userEditedSinceSend = false
          Task { await repository.send(text: text) }
        },
        onSelectWorkflow: { action in
          draft = action.prompt
          userEditedSinceSend = true
        },
        onDraftEdited: {
          userEditedSinceSend = true
        }
      )
      .padding(.horizontal, JovieSpacing.large)
      .padding(.bottom, JovieSpacing.medium)
    }
    .background(JovieColor.backgroundBase)
  }

  private func scrollToBottomIfPinned(
    using proxy: ScrollViewProxy,
    animated: Bool
  ) {
    guard isAtBottom else { return }
    if animated {
      withAnimation(.easeOut(duration: 0.25)) {
        proxy.scrollTo("chat-bottom", anchor: .bottom)
      }
    } else {
      proxy.scrollTo("chat-bottom", anchor: .bottom)
    }
  }

  private var emptyState: some View {
    VStack(spacing: JovieSpacing.large) {
      Spacer(minLength: 120)

      VStack(spacing: JovieSpacing.large) {
        JovieLogoMark(size: 34)

        VStack(spacing: JovieSpacing.small) {
          Text("Ask Jovie")
            .font(JovieFont.display(size: 28))
            .foregroundStyle(JovieColor.textPrimary)
            .multilineTextAlignment(.center)

          Text(
            repository.isOffline
              ? "Offline. Drafts stay on this device and cached history remains available."
              : "Ask Jovie about your profile, releases, and next moves."
          )
          .font(JovieFont.body(size: 15))
          .foregroundStyle(JovieColor.textTertiary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
        }
      }
      .frame(maxWidth: 330)
      .padding(.horizontal, JovieSpacing.xLarge)

      Spacer(minLength: 48)
    }
  }

}
