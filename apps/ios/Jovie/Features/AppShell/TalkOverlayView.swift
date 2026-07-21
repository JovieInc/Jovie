import SwiftUI

/// Full-screen Talk overlay (JOV-3636 / #10380). Single global voice entry from
/// the shell Talk FAB — composer has no mic. On-device Speech captures a memo;
/// the transcript becomes an editable action draft via `onInsertDraft` (chat
/// composer), never auto-sent.
struct TalkOverlayView: View {
  @Bindable var voiceCaptureService: VoiceCaptureService
  let onCancel: () -> Void
  /// Inserts transcript into the chat action draft surface for editing.
  let onInsertDraft: (String) -> Void

  @State private var phase: Phase = .starting
  @State private var reviewDraft = ""
  @State private var localError: String?
  /// Blocks double-taps while finish/insert is in flight.
  @State private var isPrimaryBusy = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private enum Phase: Equatable {
    case starting
    case recording
    case reviewing
  }

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.opacity(0.96)
        .ignoresSafeArea()

      VStack(spacing: JovieSpacing.xLarge) {
        HStack {
          Button("Cancel", action: handleCancel)
            .font(JovieFont.body(size: 16, weight: .semibold))
            .foregroundStyle(JovieColor.textSecondary)
            .accessibilityIdentifier("talk-overlay-cancel")

          Spacer()

          Text(titleText)
            .font(JovieFont.body(size: 17, weight: .semibold))
            .foregroundStyle(JovieColor.textPrimary)

          Spacer()

          // Mirror cancel width so the title stays centered (no layout jump).
          Text("Cancel")
            .font(JovieFont.body(size: 16, weight: .semibold))
            .opacity(0)
            .accessibilityHidden(true)
        }
        .padding(.horizontal, JovieSpacing.large)
        .padding(.top, JovieSpacing.large)

        Spacer(minLength: JovieSpacing.xLarge)

        pulsingOrb
          .accessibilityLabel(orbAccessibilityLabel)

        VStack(spacing: JovieSpacing.medium) {
          Text(statusText)
            .font(JovieFont.body(size: 15, weight: .medium))
            .foregroundStyle(JovieColor.textTertiary)
            .frame(minHeight: 20)

          // Fixed-height transcript / draft region so starting → recording →
          // reviewing never shifts the action bar.
          Group {
            if phase == .reviewing {
              TextField("Action draft", text: $reviewDraft, axis: .vertical)
                .font(JovieFont.display(size: 22))
                .foregroundStyle(JovieColor.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(3...6)
                .textInputAutocapitalization(.sentences)
                .accessibilityIdentifier("talk-overlay-draft-field")
            } else {
              Text(transcriptDisplay)
                .font(JovieFont.display(size: 22))
                .foregroundStyle(JovieColor.textPrimary)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("talk-overlay-transcript")
            }
          }
          .frame(maxWidth: 320, minHeight: 96, maxHeight: 160, alignment: .top)
          .padding(.horizontal, JovieSpacing.xLarge)

          recognitionModeCaption
            .font(JovieFont.body(size: 13))
            .foregroundStyle(JovieColor.textTertiary)
            .frame(minHeight: 18)

          // Reserved error slot — opacity only, no height collapse.
          Text(displayedError ?? " ")
            .font(JovieFont.body(size: 14))
            .foregroundStyle(displayedError == nil ? .clear : JovieColor.errorText)
            .multilineTextAlignment(.center)
            .padding(.horizontal, JovieSpacing.large)
            .frame(minHeight: 40)
            .accessibilityIdentifier("talk-overlay-error")
            .accessibilityHidden(displayedError == nil)
        }

        Spacer(minLength: JovieSpacing.xLarge)

        HStack(spacing: JovieSpacing.large) {
          Button(action: handleCancel) {
            Text("Cancel")
              .frame(maxWidth: .infinity)
          }
          .buttonStyle(JoviePillButtonStyle(filled: false))
          .accessibilityIdentifier("talk-overlay-cancel-pill")

          Button {
            Task { await handlePrimaryAction() }
          } label: {
            Text(primaryActionTitle)
              .frame(maxWidth: .infinity)
          }
          .buttonStyle(JoviePillButtonStyle(filled: true))
          .disabled(!canPrimary || isPrimaryBusy)
          // Stable id used by UI tests (primary action: Done / Use Draft).
          .accessibilityIdentifier("talk-overlay-send")
        }
        .padding(.horizontal, JovieSpacing.xLarge)
        .padding(.bottom, JovieSpacing.xxLarge)
      }
    }
    .accessibilityIdentifier("talk-overlay")
    .task {
      await startIfNeeded()
    }
  }

  private var displayedError: String? {
    localError ?? voiceCaptureService.lastErrorMessage
  }

  private var titleText: String {
    phase == .reviewing ? "Draft" : "Talk"
  }

  private var statusText: String {
    switch phase {
    case .starting:
      "Starting…"
    case .recording:
      "Listening…"
    case .reviewing:
      "Edit, then use as action draft"
    }
  }

  private var primaryActionTitle: String {
    phase == .reviewing ? "Use Draft" : "Done"
  }

  private var canPrimary: Bool {
    switch phase {
    case .starting:
      false
    case .recording:
      VoiceMemoActionDraft.isReady(voiceCaptureService.transcriptPreview)
    case .reviewing:
      VoiceMemoActionDraft.isReady(reviewDraft)
    }
  }

  private var transcriptDisplay: String {
    let preview = voiceCaptureService.transcriptPreview
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if preview.isEmpty {
      return "Say something…"
    }
    return preview
  }

  private var orbAccessibilityLabel: String {
    switch phase {
    case .starting:
      "Starting microphone"
    case .recording:
      "Listening"
    case .reviewing:
      "Transcript ready"
    }
  }

  @ViewBuilder
  private var recognitionModeCaption: some View {
    if phase == .recording || phase == .reviewing {
      if voiceCaptureService.isUsingOnDeviceRecognition {
        Text("On-device transcription")
          .accessibilityIdentifier("talk-overlay-on-device")
      } else {
        Text("Network transcription (on-device unavailable)")
          .accessibilityIdentifier("talk-overlay-network-fallback")
      }
    } else {
      Text(" ")
        .accessibilityHidden(true)
    }
  }

  private var pulsingOrb: some View {
    let level = phase == .recording ? voiceCaptureService.audioLevel : 0
    let base: CGFloat = 120
    let scale = reduceMotion ? 1 : 1 + CGFloat(level) * 0.18

    return ZStack {
      Circle()
        .fill(JovieColor.accent.opacity(0.18))
        .frame(width: base + 48, height: base + 48)
        .scaleEffect(scale)
      Circle()
        .fill(JovieColor.accent.opacity(0.35))
        .frame(width: base + 16, height: base + 16)
        .scaleEffect(scale)
      Circle()
        .fill(Color.white)
        .frame(width: base, height: base)
      Image(systemName: phase == .reviewing ? "text.badge.checkmark" : "mic.fill")
        .font(.system(size: 36, weight: .bold))
        .foregroundStyle(JovieColor.backgroundBase)
    }
    .animation(
      reduceMotion ? nil : JovieMotion.easeOut(duration: JovieMotion.fastDuration),
      value: level
    )
  }

  private func startIfNeeded() async {
    guard phase == .starting || phase == .recording else { return }
    guard !voiceCaptureService.isRecording else {
      phase = .recording
      return
    }
    phase = .starting
    localError = nil
    do {
      try await voiceCaptureService.start()
      phase = .recording
    } catch {
      localError = (error as? LocalizedError)?.errorDescription
        ?? "Voice is unavailable."
      voiceCaptureService.cancel()
      phase = .starting
    }
  }

  private func handleCancel() {
    voiceCaptureService.cancel()
    reviewDraft = ""
    phase = .starting
    onCancel()
  }

  private func handlePrimaryAction() async {
    guard !isPrimaryBusy else { return }
    isPrimaryBusy = true
    defer { isPrimaryBusy = false }

    switch phase {
    case .starting:
      return
    case .recording:
      await finishIntoReview()
    case .reviewing:
      let draft = VoiceMemoActionDraft.make(fromTranscript: reviewDraft)
      guard VoiceMemoActionDraft.isReady(draft) else {
        localError = VoiceCaptureError.emptyTranscript.errorDescription
        return
      }
      onInsertDraft(draft)
    }
  }

  private func finishIntoReview() async {
    do {
      let result = try await voiceCaptureService.finish()
      reviewDraft = result.transcript
      localError = nil
      phase = .reviewing
    } catch {
      localError = (error as? LocalizedError)?.errorDescription
        ?? "Nothing heard."
      // Stay open so the user can retry; restart capture after a clean cancel.
      voiceCaptureService.cancel()
      phase = .starting
      await startIfNeeded()
    }
  }
}
