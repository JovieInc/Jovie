import SwiftUI

struct NeedsOnboardingView: View {
  let onComplete: @MainActor (String, String) async -> String?

  @State private var displayName: String
  @State private var username: String
  @State private var isSubmitting = false
  @State private var errorMessage: String?
  @FocusState private var focusedField: Field?

  private enum Field {
    case displayName
    case username
  }

  init(
    initialDisplayName: String = "",
    initialUsername: String = "",
    onComplete: @escaping @MainActor (String, String) async -> String? = { _, _ in nil }
  ) {
    self.onComplete = onComplete
    _displayName = State(initialValue: initialDisplayName)
    _username = State(initialValue: initialUsername)
  }

  private var canSubmit: Bool {
    !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
      !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
      !isSubmitting
  }

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      ScrollView {
        VStack(alignment: .leading, spacing: JovieSpacing.large) {
          VStack(alignment: .leading, spacing: JovieSpacing.small) {
            Text("Finish Your Profile")
              .font(JovieFont.display(size: 28))
              .foregroundStyle(JovieColor.textPrimary)

            Text("Choose how fans will see you on Jovie.")
              .font(JovieFont.body(size: 16))
              .foregroundStyle(JovieColor.textSecondary)
          }

          VStack(alignment: .leading, spacing: JovieSpacing.medium) {
            profileField(
              title: "Display name",
              text: $displayName,
              field: .displayName,
              contentType: .name
            )
            profileField(
              title: "Public handle",
              text: $username,
              field: .username,
              contentType: .username
            )
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          }

          errorSlot

          Button {
            submit()
          } label: {
            HStack(spacing: JovieSpacing.small) {
              if isSubmitting {
                ProgressView()
                  .tint(JovieColor.backgroundBase)
              }
              Text(isSubmitting ? "Saving…" : "Finish Profile")
            }
            .frame(maxWidth: .infinity)
          }
          .buttonStyle(JoviePillButtonStyle(filled: true))
          .disabled(!canSubmit)
          .accessibilityIdentifier("profile-completion-submit")
        }
        .padding(JovieSpacing.xLarge)
      }
      .scrollDismissesKeyboard(.interactively)
    }
  }

  /// Idle and error share one reserved footprint so a server error cannot
  /// insert height and shift Finish Profile.
  private var errorSlot: some View {
    Text(errorMessage ?? " ")
      .font(JovieFont.body(size: 14))
      .foregroundStyle(JovieColor.errorText)
      .lineLimit(2)
      .multilineTextAlignment(.leading)
      .frame(maxWidth: .infinity, alignment: .topLeading)
      .frame(height: Self.errorSlotHeight)
      .opacity(errorMessage == nil ? 0 : 1)
      .accessibilityHidden(errorMessage == nil)
      .accessibilityIdentifier(errorMessage == nil ? "" : "profile-completion-error")
  }

  private static let errorSlotHeight: CGFloat = 40

  private func profileField(
    title: String,
    text: Binding<String>,
    field: Field,
    contentType: UITextContentType
  ) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      Text(title)
        .font(JovieFont.body(size: 13))
        .foregroundStyle(JovieColor.textSecondary)
      TextField(title, text: text)
        .textContentType(contentType)
        .focused($focusedField, equals: field)
        .submitLabel(field == .displayName ? .next : .done)
        .onSubmit {
          if field == .displayName {
            focusedField = .username
          } else if canSubmit {
            submit()
          }
        }
        .padding(.horizontal, JovieSpacing.medium)
        .frame(minHeight: 52)
        .background(JovieColor.surface1)
        .clipShape(RoundedRectangle(cornerRadius: JovieRadius.medium))
        .overlay {
          RoundedRectangle(cornerRadius: JovieRadius.medium)
            .stroke(JovieColor.borderSubtle, lineWidth: 1)
        }
        .foregroundStyle(JovieColor.textPrimary)
        .accessibilityIdentifier(
          field == .displayName
            ? "profile-completion-display-name"
            : "profile-completion-handle"
        )
    }
  }

  private func submit() {
    guard canSubmit else { return }
    focusedField = nil
    errorMessage = nil
    isSubmitting = true

    Task { @MainActor in
      errorMessage = await onComplete(displayName, username)
      isSubmitting = false
    }
  }
}
