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
  let webBaseURL: URL

  @FocusState private var isComposerFocused: Bool
  @State private var isAtBottom = true
  @State private var userEditedSinceSend = false

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
              }
            )
          }
        }
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
      .overlay(alignment: .bottomTrailing) {
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
          .padding(.trailing, JovieSpacing.large)
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

private struct MobileChatMessageRow: View {
  let item: MobileChatTimelineItem
  let webBaseURL: URL
  let onRetry: () -> Void
  let onSubmitPrompt: (String) -> Void

  private var isStreamingAssistant: Bool {
    item.role == .assistant && item.status == .streaming
  }

  private var assistantSegments: [MobileChatRenderableSegment] {
    MobileChatContentParser.segments(from: item.content, isStreaming: isStreamingAssistant)
  }

  private var assistantDisplayText: String {
    MobileChatContentParser.displayText(from: item.content, isStreaming: isStreamingAssistant)
  }

  var body: some View {
    VStack(alignment: item.role == .user ? .trailing : .leading, spacing: JovieSpacing.small) {
      if item.role == .user {
        userMessageBubble
      } else {
        assistantMessageContent
      }

      if item.requiresWebHandoff, let handoffURL = item.handoffURL {
        Link("Continue on web", destination: handoffURL)
          .font(JovieFont.body(size: 14, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
      }

      if item.status == .failed {
        Button("Retry", action: onRetry)
          .font(JovieFont.body(size: 14, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
      }
    }
    .frame(maxWidth: .infinity, alignment: item.role == .user ? .trailing : .leading)
  }

  private var userMessageBubble: some View {
    MobileChatProseText(
      runs: MobileChatProseTokenizer.tokenize(item.content, isStreaming: false),
      tone: .onLight
    )
    .font(JovieFont.body(size: 16))
    .foregroundStyle(JovieColor.backgroundBase)
    .padding(.horizontal, JovieSpacing.large)
    .padding(.vertical, JovieSpacing.medium)
    .background(Color.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .frame(maxWidth: 320, alignment: .trailing)
  }

  @ViewBuilder
  private var assistantMessageContent: some View {
    let segments = assistantSegments
    let displayText = assistantDisplayText
    let hasRenderableSegments = segments.contains { segment in
      switch segment {
      case .text, .toolCall, .merchArtifact:
        return true
      }
    }
    let showsThinking = displayText.isEmpty && !hasRenderableSegments && isStreamingAssistant

    if showsThinking {
      Text("Thinking…")
        .font(JovieFont.body(size: 16))
        .foregroundStyle(JovieColor.textPrimary)
        .padding(.horizontal, JovieSpacing.large)
        .padding(.vertical, JovieSpacing.medium)
        .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .frame(maxWidth: 320, alignment: .leading)
    } else {
      VStack(alignment: .leading, spacing: JovieSpacing.small) {
        let proseRuns = assistantProseRuns(from: segments)
        if !proseRuns.isEmpty {
          MobileChatAssistantProseBubble(runs: proseRuns)
            .frame(maxWidth: 320, alignment: .leading)
        }

        ForEach(segments) { segment in
          switch segment {
          case let .toolCall(model):
            MobileChatToolCardView(model: model)
              .frame(maxWidth: 320, alignment: .leading)
          case let .merchArtifact(artifact):
            MobileChatMerchOptionsView(artifact: artifact, onSelectPrompt: onSubmitPrompt)
              .frame(maxWidth: .infinity, alignment: .leading)
          case .text:
            EmptyView()
          }
        }
      }
    }
  }

  /// Flattens every `.text` segment's prose runs into one ordered run list,
  /// joined by a blank-line run wherever segments were separated (mirrors
  /// the `\n\n` join in `MobileChatContentParser.displayText`). Tool-call
  /// segments render as their own cards below and are excluded here.
  private func assistantProseRuns(from segments: [MobileChatRenderableSegment]) -> [MobileChatProseRun] {
    var runs: [MobileChatProseRun] = []
    for segment in segments {
      guard case let .text(segmentRuns) = segment, !segmentRuns.isEmpty else { continue }
      if !runs.isEmpty {
        runs.append(.text("\n\n"))
      }
      runs.append(contentsOf: segmentRuns)
    }
    return runs
  }
}

private struct ChatComposerView: View {
  @Binding var draft: String
  @FocusState.Binding var isComposerFocused: Bool
  let isSending: Bool
  let isOffline: Bool
  let onSend: () -> Void
  let onSelectWorkflow: (ComposerWorkflowAction) -> Void
  let onDraftEdited: () -> Void

  var body: some View {
    ChatComposerBar(
      draft: $draft,
      isFocused: $isComposerFocused,
      placeholder: isOffline ? "Ask Jovie (offline)" : "Ask Jovie",
      isSending: isSending,
      isPlusEnabled: !isSending,
      onSend: onSend,
      onSelectWorkflow: onSelectWorkflow,
      onDraftEdited: onDraftEdited
    )
  }
}

/// Assistant prose bubble with markdown fallback for plain-text runs.
private struct MobileChatAssistantProseBubble: View {
  let runs: [MobileChatProseRun]

  var body: some View {
    Group {
      if shouldRenderMarkdown {
        Text(markdownText)
          .font(JovieFont.body(size: 16))
          .foregroundStyle(JovieColor.textPrimary)
      } else {
        MobileChatProseText(runs: runs, tone: .onDark)
          .font(JovieFont.body(size: 16))
          .foregroundStyle(JovieColor.textPrimary)
      }
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.vertical, JovieSpacing.medium)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
  }

  private var shouldRenderMarkdown: Bool {
    runs.allSatisfy { run in
      if case let .text(text) = run {
        return text.contains("**") || text.contains("__") || text.contains("* ")
      }
      return false
    }
  }

  private var markdownText: AttributedString {
    let joined = runs.compactMap { run -> String? in
      guard case let .text(text) = run else { return nil }
      return text
    }.joined(separator: "\n\n")

    return (try? AttributedString(markdown: joined)) ?? AttributedString(joined)
  }
}

/// Surface a `MobileChatProseText` renders on. Drives chip color mixing so
/// an entity/skill chip stays legible on whichever bubble background it
/// lands on -- mirrors `EntityChipTone` (`onLight` | `onDark`) on the web.
enum MobileChatProseTone {
  /// White user-message bubble (`userMessageBubble`).
  case onLight
  /// Dark assistant-transcript bubble (`assistantMessageContent`).
  case onDark
}

/// Renders an ordered `[MobileChatProseRun]` as a single concatenated
/// `Text`, matching web's `TokenizedText`/`AssistantMessageText`: entity and
/// skill mentions render inline within the sentence (never as separate
/// blocks that would shred prose), tinted with the entity's kind accent.
///
/// SwiftUI `Text` concatenation (`+`) is the only supported way to mix
/// styled runs inline without breaking text flow/wrapping, so chips here are
/// text-only (kind-accent color + underline for entities, secondary color
/// for skills) rather than pill/dot chips -- v1 scope per JOV-3608.
struct MobileChatProseText: View {
  let runs: [MobileChatProseRun]
  let tone: MobileChatProseTone

  var body: some View {
    runs.reduce(Text("")) { partial, run in
      partial + textRun(for: run)
    }
  }

  private func textRun(for run: MobileChatProseRun) -> Text {
    switch run {
    case let .text(value):
      return Text(value)
    case let .entity(kind, _, label):
      return Text(label)
        .foregroundColor(entityAccentColor(for: kind))
        .underline(true, color: entityAccentColor(for: kind).opacity(0.55))
    case let .skill(_, label):
      return Text(label)
        .foregroundColor(skillLabelColor)
        .fontWeight(.medium)
    }
  }

  private func entityAccentColor(for kind: MobileChatEntityKind) -> Color {
    let accent = JovieColor.EntityAccent.color(for: kind)
    switch tone {
    case .onDark:
      // Mirrors .system-b-entity-mention-span: accent blended toward the
      // dark transcript's primary text color, not the raw accent hue.
      return accent.opacity(0.86)
    case .onLight:
      // On the white user bubble, blend toward the dark bubble text color
      // instead of white so the chip stays legible (mirrors the web
      // [data-entity-tone="onLight"] text override).
      return accent.opacity(0.92)
    }
  }

  private var skillLabelColor: Color {
    switch tone {
    case .onDark:
      return JovieColor.textSecondary
    case .onLight:
      return JovieColor.backgroundBase.opacity(0.72)
    }
  }
}
