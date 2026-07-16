import SwiftUI

// Rendered by AppContentView while the ChatRepository is unavailable
// (signed-out, offline bootstrap, or launch modes without a repository).
struct MobileChatPlaceholderView: View {
  let isOffline: Bool
  @Binding var draft: String

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(spacing: 0) {
        Spacer(minLength: 120)

        VStack(spacing: JovieSpacing.large) {
          JovieLogoMark(size: 34)

          VStack(spacing: JovieSpacing.small) {
            Text("Ask Jovie")
              .font(JovieFont.display(size: 28))
              .foregroundStyle(JovieColor.textPrimary)
              .multilineTextAlignment(.center)

            Text(
              isOffline
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
      .safeAreaInset(edge: .bottom, spacing: 0) {
        ChatComposerPreview(draft: $draft, isOffline: isOffline)
          .padding(.horizontal, JovieSpacing.large)
          .padding(.bottom, JovieSpacing.medium)
          .background(JovieColor.backgroundBase)
      }
    }
    .accessibilityIdentifier("mobile-chat")
  }
}

private struct ChatComposerPreview: View {
  @Binding var draft: String
  let isOffline: Bool
  @FocusState private var isComposerFocused: Bool

  var body: some View {
    ChatComposerBar(
      draft: $draft,
      isFocused: $isComposerFocused,
      placeholder: isOffline ? "Ask Jovie (offline)" : "Ask Jovie",
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
