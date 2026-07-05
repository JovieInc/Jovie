import SwiftUI
import UIKit

enum ComposerWorkflowAction: String, CaseIterable, Identifiable {
  case makeMerch
  case smartLink
  case camera
  case photoFile
  case releaseCampaign
  case lyricVideo

  var id: String { rawValue }

  var title: String {
    switch self {
    case .makeMerch:
      return "Make merch"
    case .smartLink:
      return "Smart link"
    case .camera:
      return "Camera"
    case .photoFile:
      return "Photo/file"
    case .releaseCampaign:
      return "Release campaign"
    case .lyricVideo:
      return "Lyric video"
    }
  }

  var systemImage: String {
    switch self {
    case .makeMerch:
      return "tshirt"
    case .smartLink:
      return "link"
    case .camera:
      return "camera"
    case .photoFile:
      return "photo.on.rectangle.angled"
    case .releaseCampaign:
      return "calendar.badge.clock"
    case .lyricVideo:
      return "play.rectangle"
    }
  }

  var prompt: String {
    switch self {
    case .makeMerch:
      return "Make merch for my latest release."
    case .smartLink:
      return "Help me set up a smart link for my release."
    case .camera:
      return "I want to take a photo for my release."
    case .photoFile:
      return "I want to upload a photo or file."
    case .releaseCampaign:
      return "Help me plan a release campaign."
    case .lyricVideo:
      return "Generate a lyric video for my latest release."
    }
  }

  var accessibilityIdentifier: String {
    "composer-workflow-\(rawValue)"
  }
}

struct ComposerWorkflowSheet: View {
  let onSelect: (ComposerWorkflowAction) -> Void

  private let columns = [
    GridItem(.flexible(), spacing: JovieSpacing.medium),
    GridItem(.flexible(), spacing: JovieSpacing.medium),
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.large) {
      Capsule()
        .fill(JovieColor.borderDefault)
        .frame(width: 36, height: 4)
        .frame(maxWidth: .infinity)

      Text("Start a workflow")
        .font(JovieFont.body(size: 15, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)

      LazyVGrid(columns: columns, spacing: JovieSpacing.medium) {
        ForEach(ComposerWorkflowAction.allCases) { action in
          Button {
            onSelect(action)
          } label: {
            ComposerWorkflowTile(action: action)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(action.title)
          .accessibilityIdentifier(action.accessibilityIdentifier)
        }
      }
    }
    .padding(.horizontal, JovieSpacing.xLarge)
    .padding(.top, JovieSpacing.medium)
    .padding(.bottom, JovieSpacing.xLarge)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(JovieColor.surface0)
    .accessibilityIdentifier("composer-workflow-sheet")
    .accessibilityAddTraits(.isModal)
  }
}

private struct ComposerWorkflowTile: View {
  let action: ComposerWorkflowAction

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      Image(systemName: action.systemImage)
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
        .frame(width: 36, height: 36)
        .background(JovieColor.surface2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))

      Text(action.title)
        .font(JovieFont.body(size: 14, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
        .multilineTextAlignment(.leading)
        .lineLimit(2)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
    .padding(JovieSpacing.medium)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
  }
}

struct ChatComposerBar: View {
  @Binding var draft: String
  @FocusState.Binding var isFocused: Bool
  let placeholder: String
  let isSending: Bool
  let isPlusEnabled: Bool
  @Bindable var voiceCaptureService: VoiceCaptureService
  let onVoiceStart: () async -> Void
  let onVoiceFinish: () async -> Void
  let onVoiceCancel: () -> Void
  let onSend: () -> Void
  let onSelectWorkflow: (ComposerWorkflowAction) -> Void
  let onDraftEdited: () -> Void

  @State private var isShowingWorkflowSheet = false
  @State private var didStartVoiceDrag = false
  @State private var isVoiceDragCancelled = false

  var body: some View {
    let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)

    VStack(spacing: 0) {
      waveformStrip

      HStack(spacing: JovieSpacing.medium) {
        Button {
          isShowingWorkflowSheet = true
        } label: {
          Image(systemName: "plus")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(
              isPlusEnabled ? JovieColor.textPrimary : JovieColor.textTertiary
            )
            .frame(width: 36, height: 36)
            .background(JovieColor.surface2, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!isPlusEnabled)
        .accessibilityLabel("Open workflow sheet")
        .accessibilityIdentifier("chat-composer-plus")
        .accessibilityElement(children: .ignore)

        TextField(placeholder, text: $draft)
          .focused($isFocused)
          .textInputAutocapitalization(.sentences)
          .disableAutocorrection(false)
          .font(JovieFont.body(size: 16))
          .foregroundStyle(JovieColor.textPrimary)
          .frame(height: 52)
          .onChange(of: draft) {
            onDraftEdited()
          }

        if trimmedDraft.isEmpty {
          voiceButton
        } else {
          sendButton(trimmedDraft: trimmedDraft)
        }
      }
    }
    .padding(.horizontal, JovieSpacing.large)
    .frame(height: 76)
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 28, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
    .accessibilityIdentifier("chat-composer")
    .sheet(isPresented: $isShowingWorkflowSheet) {
      ComposerWorkflowSheet { action in
        isShowingWorkflowSheet = false
        onSelectWorkflow(action)
      }
      .presentationDetents([.height(ComposerWorkflowSheetHeight.estimated)])
      .presentationDragIndicator(.visible)
      .presentationBackground(JovieColor.surface0)
    }
  }

  @ViewBuilder
  private var waveformStrip: some View {
    HStack(spacing: 3) {
      ForEach(0..<14, id: \.self) { index in
        RoundedRectangle(cornerRadius: 2, style: .continuous)
          .fill(isVoiceDragCancelled ? JovieColor.textTertiary : JovieColor.textPrimary)
          .frame(width: 3, height: waveformHeight(at: index))
          .opacity(voiceCaptureService.isRecording ? 0.9 : 0)
      }
    }
    .frame(height: 12)
    .frame(maxWidth: .infinity)
    .accessibilityHidden(true)
  }

  private var voiceButton: some View {
    Button(action: {}) {
      ZStack {
        Circle()
          .fill(voiceCaptureService.isRecording ? Color.white : JovieColor.surface2)
        Image(systemName: isVoiceDragCancelled ? "xmark" : "mic.fill")
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(
            voiceCaptureService.isRecording ? JovieColor.backgroundBase : JovieColor.textPrimary
          )
      }
      .frame(width: 52, height: 52)
    }
    .buttonStyle(.plain)
    .disabled(isSending)
    .contentShape(Circle())
    .gesture(voiceDragGesture)
    .accessibilityLabel(voiceCaptureService.isRecording ? "Release to send" : "Hold to talk")
    .accessibilityIdentifier("chat-voice-button")
    .accessibilityHint("Slide away to cancel")
    .accessibilityElement(children: .ignore)
  }

  private var voiceDragGesture: some Gesture {
    DragGesture(minimumDistance: 0)
      .onChanged { value in
        if !didStartVoiceDrag {
          didStartVoiceDrag = true
          isVoiceDragCancelled = false
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
          Task { await onVoiceStart() }
        }

        isVoiceDragCancelled = abs(value.translation.width) > 72 || value.translation.height < -72
      }
      .onEnded { _ in
        guard didStartVoiceDrag else { return }
        didStartVoiceDrag = false

        if isVoiceDragCancelled {
          UINotificationFeedbackGenerator().notificationOccurred(.warning)
          onVoiceCancel()
          isVoiceDragCancelled = false
          return
        }

        UINotificationFeedbackGenerator().notificationOccurred(.success)
        Task { await onVoiceFinish() }
      }
  }

  private func sendButton(trimmedDraft: String) -> some View {
    Button(action: onSend) {
      Image(systemName: isSending ? "ellipsis" : "arrow.up")
        .font(.system(size: 16, weight: .bold))
        .foregroundStyle(
          trimmedDraft.isEmpty || isSending
            ? JovieColor.textTertiary
            : JovieColor.backgroundBase
        )
        .frame(width: 52, height: 52)
        .background(
          trimmedDraft.isEmpty || isSending ? JovieColor.surface2 : Color.white,
          in: Circle()
        )
    }
    .buttonStyle(.plain)
    .disabled(trimmedDraft.isEmpty || isSending)
    .accessibilityLabel("Send")
  }

  private func waveformHeight(at index: Int) -> CGFloat {
    let base = [4, 7, 10, 6, 12, 8, 5, 11, 7, 10, 6, 12, 8, 5][index]
    guard voiceCaptureService.isRecording else { return CGFloat(base) }
    let boosted = Double(base) + voiceCaptureService.audioLevel * Double((index % 4) + 5)
    return CGFloat(min(14, max(4, boosted)))
  }
}

enum ComposerWorkflowSheetHeight {
  static let estimated: CGFloat = 360
}
