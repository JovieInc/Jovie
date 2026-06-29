import SwiftUI

struct MobileChatView: View {
  @Bindable var repository: ChatRepository
  @Binding var draft: String
  let webBaseURL: URL

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(spacing: 0) {
        if repository.timeline.isEmpty {
          emptyState
        } else {
          ScrollView {
            LazyVStack(alignment: .leading, spacing: JovieSpacing.large) {
              ForEach(repository.timeline) { item in
                MobileChatMessageRow(item: item, webBaseURL: webBaseURL) {
                  guard let clientTurnId = item.clientTurnId else { return }
                  Task { await repository.retry(clientTurnId: clientTurnId) }
                }
              }
            }
            .padding(.horizontal, JovieSpacing.large)
            .padding(.top, JovieSpacing.xLarge)
            .padding(.bottom, JovieSpacing.medium)
          }
        }

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
          isSending: repository.isSending,
          isOffline: repository.isOffline,
          onSend: {
            let text = draft
            draft = ""
            Task { await repository.send(text: text) }
          },
          onSelectWorkflow: { action in
            draft = action.prompt
          }
        )
        .padding(.horizontal, JovieSpacing.large)
        .padding(.bottom, JovieSpacing.medium)
      }
    }
    .accessibilityIdentifier("mobile-chat")
    .task {
      await repository.refreshConversations()
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
    Text(item.content)
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
    let showsThinking = displayText.isEmpty && segments.isEmpty && isStreamingAssistant

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
        if !displayText.isEmpty {
          Text(displayText)
            .font(JovieFont.body(size: 16))
            .foregroundStyle(JovieColor.textPrimary)
            .padding(.horizontal, JovieSpacing.large)
            .padding(.vertical, JovieSpacing.medium)
            .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .frame(maxWidth: 320, alignment: .leading)
        }

        ForEach(segments) { segment in
          if case let .toolCall(model) = segment {
            MobileChatToolCardView(model: model)
              .frame(maxWidth: 320, alignment: .leading)
          }
        }
      }
    }
  }
}

private struct ChatComposerView: View {
  @Binding var draft: String
  let isSending: Bool
  let isOffline: Bool
  let onSend: () -> Void
  let onSelectWorkflow: (ComposerWorkflowAction) -> Void

  var body: some View {
    ChatComposerBar(
      draft: $draft,
      placeholder: isOffline ? "Ask Jovie (offline)" : "Ask Jovie",
      isSending: isSending,
      isPlusEnabled: !isSending,
      onSend: onSend,
      onSelectWorkflow: onSelectWorkflow
    )
  }
}
