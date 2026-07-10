import SwiftUI

/// Full-screen Talk overlay (JOV-3636). Single global voice entry from the
/// shell Talk FAB — composer has no mic. Routes transcript into the active
/// chat thread via `onSend`.
struct TalkOverlayView: View {
  @Bindable var voiceCaptureService: VoiceCaptureService
  let onCancel: () -> Void
  let onSend: (String) -> Void

  @State private var isStarting = false
  @State private var localError: String?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

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

          Text("Talk")
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
          .accessibilityLabel(
            voiceCaptureService.isRecording ? "Listening" : "Starting microphone"
          )

        VStack(spacing: JovieSpacing.medium) {
          Text(voiceCaptureService.isRecording ? "Listening…" : "Starting…")
            .font(JovieFont.body(size: 15, weight: .medium))
            .foregroundStyle(JovieColor.textTertiary)

          Text(transcriptDisplay)
            .font(JovieFont.display(size: 22))
            .foregroundStyle(JovieColor.textPrimary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: 320, minHeight: 72, alignment: .top)
            .padding(.horizontal, JovieSpacing.xLarge)
            .accessibilityIdentifier("talk-overlay-transcript")

          if let localError {
            Text(localError)
              .font(JovieFont.body(size: 14))
              .foregroundStyle(JovieColor.errorText)
              .multilineTextAlignment(.center)
              .padding(.horizontal, JovieSpacing.large)
          }
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
            Task { await handleSend() }
          } label: {
            Text("Send")
              .frame(maxWidth: .infinity)
          }
          .buttonStyle(JoviePillButtonStyle(filled: true))
          .disabled(!canSend)
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

  private var canSend: Bool {
    !transcriptDisplay.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && !isStarting
  }

  private var transcriptDisplay: String {
    let preview = voiceCaptureService.transcriptPreview
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if preview.isEmpty {
      return "Say something…"
    }
    return preview
  }

  private var pulsingOrb: some View {
    let level = voiceCaptureService.audioLevel
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
      Image(systemName: "mic.fill")
        .font(.system(size: 36, weight: .bold))
        .foregroundStyle(JovieColor.backgroundBase)
    }
    .animation(
      reduceMotion ? nil : JovieMotion.easeOut(duration: JovieMotion.fastDuration),
      value: level
    )
  }

  private func startIfNeeded() async {
    guard !voiceCaptureService.isRecording, !isStarting else { return }
    isStarting = true
    localError = nil
    do {
      try await voiceCaptureService.start()
    } catch {
      localError = (error as? LocalizedError)?.errorDescription
        ?? "Voice is unavailable."
      voiceCaptureService.cancel()
    }
    isStarting = false
  }

  private func handleCancel() {
    voiceCaptureService.cancel()
    onCancel()
  }

  private func handleSend() async {
    do {
      let result = try await voiceCaptureService.finish()
      onSend(result.transcript)
    } catch {
      localError = (error as? LocalizedError)?.errorDescription
        ?? "Nothing heard."
      // Stay open so the user can retry; restart capture after a clean cancel.
      voiceCaptureService.cancel()
      await startIfNeeded()
    }
  }
}
