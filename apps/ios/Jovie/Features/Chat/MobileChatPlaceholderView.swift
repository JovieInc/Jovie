import SwiftUI

// Rendered by AppContentView while the ChatRepository is unavailable
// (signed-out, offline bootstrap, or launch modes without a repository).
struct MobileChatPlaceholderView: View {
  @Binding var draft: String
  @State private var greeting = ChatEmptyGreeting.takeNext()

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(spacing: 0) {
        Spacer(minLength: 0)
        MobileChatEmptyGreetingView(greeting: greeting)
          .padding(.horizontal, JovieSpacing.xLarge)
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .safeAreaInset(edge: .bottom, spacing: 0) {
        ChatComposerPreview(draft: $draft)
          .padding(.horizontal, JovieSpacing.large)
          .padding(.bottom, JovieSpacing.medium)
          .background(JovieColor.backgroundBase)
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("mobile-chat")
  }
}

private struct ChatComposerPreview: View {
  @Binding var draft: String
  @FocusState private var isComposerFocused: Bool

  var body: some View {
    ChatComposerBar(
      draft: $draft,
      isFocused: $isComposerFocused,
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
