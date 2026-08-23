import SwiftUI

// Rendered by AppContentView while the ChatRepository is unavailable
// (signed-out, offline bootstrap, or launch modes without a repository).
// Signed-in empty Chat uses the same greeting + composer lock as MobileChatView.
struct MobileChatPlaceholderView: View {
  let isOffline: Bool
  @Binding var draft: String

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(spacing: 0) {
        Spacer(minLength: 0)
        MobileChatEmptyGreetingView(greeting: ChatEmptyGreeting.current())
          .padding(.horizontal, JovieSpacing.xLarge)
        Spacer(minLength: 0)
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        ChatComposerPreview(draft: $draft)
          .padding(.horizontal, JovieSpacing.large)
          .padding(.bottom, JovieSpacing.medium)
          .background(JovieColor.backgroundBase)
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("mobile-chat")
    .accessibilityValue(isOffline ? "Offline" : "")
  }
}

private struct ChatComposerPreview: View {
  @Binding var draft: String
  @FocusState private var isComposerFocused: Bool

  var body: some View {
    ChatComposerBar(
      draft: $draft,
      isFocused: $isComposerFocused,
      placeholder: ChatComposerCopy.emptyPlaceholder,
      isSending: false,
      isPlusEnabled: true,
      onSend: { draft = "" },
      onSelectWorkflow: { action in
        draft = action.prompt
      },
      onDraftEdited: {}
    )
  }
}
