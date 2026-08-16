import AVFoundation
import SwiftUI

/// Camera preview bridge for the teleprompter overlay. The preview layer is
/// owned by the controller's session; the view only re-points it.
private struct TeleprompterCameraPreview: UIViewRepresentable {
  let session: AVCaptureSession

  func makeUIView(context: Context) -> TeleprompterPreviewUIView {
    let view = TeleprompterPreviewUIView()
    view.previewLayer.session = session
    view.previewLayer.videoGravity = .resizeAspectFill
    return view
  }

  func updateUIView(_ uiView: TeleprompterPreviewUIView, context: Context) {
    if uiView.previewLayer.session !== session {
      uiView.previewLayer.session = session
    }
  }
}

private final class TeleprompterPreviewUIView: UIView {
  override class var layerClass: AnyClass {
    AVCaptureVideoPreviewLayer.self
  }

  var previewLayer: AVCaptureVideoPreviewLayer {
    // Safe: `layerClass` pins the backing layer type.
    layer as! AVCaptureVideoPreviewLayer // swiftlint:disable:this force_cast
  }
}

private struct TeleprompterFramingGridView: View {
  var body: some View {
    GeometryReader { proxy in
      let thirdWidth = proxy.size.width / 3
      let thirdHeight = proxy.size.height / 3

      Path { path in
        path.move(to: CGPoint(x: thirdWidth, y: 0))
        path.addLine(to: CGPoint(x: thirdWidth, y: proxy.size.height))
        path.move(to: CGPoint(x: thirdWidth * 2, y: 0))
        path.addLine(to: CGPoint(x: thirdWidth * 2, y: proxy.size.height))
        path.move(to: CGPoint(x: 0, y: thirdHeight))
        path.addLine(to: CGPoint(x: proxy.size.width, y: thirdHeight))
        path.move(to: CGPoint(x: 0, y: thirdHeight * 2))
        path.addLine(to: CGPoint(x: proxy.size.width, y: thirdHeight * 2))
      }
      .stroke(Color.white.opacity(0.22), lineWidth: 1)
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}

/// Wrapping horizontal layout for per-word prompt views. Kept minimal: words
/// flow left→right, top→bottom, with a constant gap; row height is the
/// tallest word in the row.
private struct WordFlowLayout: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) -> CGSize {
    let frames = arrangedFrames(width: proposal.width ?? .infinity, subviews: subviews)
    let height = frames.map(\.maxY).max() ?? 0
    return CGSize(width: proposal.width ?? 0, height: height)
  }

  func placeSubviews(
    in bounds: CGRect,
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) {
    let frames = arrangedFrames(width: bounds.width, subviews: subviews)
    for (subview, frame) in zip(subviews, frames) {
      subview.place(
        at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
        anchor: .topLeading,
        proposal: ProposedViewSize(width: frame.width, height: frame.height)
      )
    }
  }

  private func arrangedFrames(width: CGFloat, subviews: Subviews) -> [CGRect] {
    var frames: [CGRect] = []
    var x: CGFloat = 0
    var y: CGFloat = 0
    var rowHeight: CGFloat = 0

    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > width {
        x = 0
        y += rowHeight + spacing
        rowHeight = 0
      }
      frames.append(CGRect(origin: CGPoint(x: x, y: y), size: size))
      rowHeight = max(rowHeight, size.height)
      x += size.width + spacing
    }

    return frames
  }
}

/// Scrolling karaoke prompt. Voice/auto mode scrolls programmatically to keep
/// the current word centered; a user drag pauses auto-scroll (manual scroll)
/// until they tap a word to seek or hit "Current line".
private struct TeleprompterScriptScrollView: View {
  let words: [String]
  let currentWordIndex: Int
  let fontSize: CGFloat
  let isLive: Bool
  @Binding var userScrollLocked: Bool
  let onSeek: (Int) -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        WordFlowLayout(spacing: fontSize * 0.45) {
          ForEach(Array(words.enumerated()), id: \.offset) { index, word in
            wordView(index: index, word: word)
              .id(index)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, JovieSpacing.large)
        .padding(.vertical, JovieSpacing.small)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(words.joined(separator: " "))
      }
      .scrollIndicators(.hidden)
      .simultaneousGesture(
        DragGesture(minimumDistance: 6)
          .onChanged { _ in
            guard isLive else { return }
            userScrollLocked = true
          }
      )
      .onChange(of: currentWordIndex) { _, newValue in
        guard isLive, !userScrollLocked, !words.isEmpty else { return }
        let target = min(newValue, words.count - 1)
        withAnimation(reduceMotion ? nil : JovieMotion.easeOut(duration: JovieMotion.fastDuration)) {
          proxy.scrollTo(target, anchor: .center)
        }
      }
      .onChange(of: userScrollLocked) { _, locked in
        guard !locked, !words.isEmpty else { return }
        let target = min(currentWordIndex, words.count - 1)
        withAnimation(reduceMotion ? nil : JovieMotion.easeOut(duration: JovieMotion.fastDuration)) {
          proxy.scrollTo(target, anchor: .center)
        }
      }
    }
  }

  private func wordView(index: Int, word: String) -> some View {
    let isCurrent = index == currentWordIndex
    let isSpoken = index < currentWordIndex

    return Text(word)
      .font(JovieFont.display(size: fontSize))
      .foregroundStyle(
        isCurrent
          ? JovieColor.backgroundBase
          : (isSpoken ? JovieColor.textTertiary : JovieColor.textPrimary)
      )
      // Constant horizontal padding in every state: a conditional inset would
      // reflow the following words each time the highlight advances.
      .padding(.horizontal, 4)
      .background(
        isCurrent ? JovieColor.accent : .clear,
        in: RoundedRectangle(cornerRadius: 6, style: .continuous)
      )
      .onTapGesture {
        onSeek(index)
      }
      .accessibilityHidden(true)
  }
}

/// Voice-following teleprompter overlay (JOV-5075). One overlay, two
/// presentations: the notch strip keeps the script directly under the camera
/// so the reader looks at the lens; fullscreen enlarges the same prompt.
struct TeleprompterOverlayView: View {
  @State private var viewModel: TeleprompterViewModel
  @State private var userScrollLocked = false
  let onClose: () -> Void

  init(viewModel: TeleprompterViewModel, onClose: @escaping () -> Void) {
    _viewModel = State(initialValue: viewModel)
    self.onClose = onClose
  }

  private var scriptFontSize: CGFloat {
    viewModel.presentationMode == .notch ? 17 : 26
  }

  /// Fixed script region heights per mode — the region never resizes within
  /// a mode, so recording state transitions cannot shift the layout.
  private var scriptRegionHeight: CGFloat {
    viewModel.presentationMode == .notch ? 120 : 320
  }

  private var isLockedWhileLive: Bool {
    userScrollLocked && viewModel.isRecording
  }

  var body: some View {
    ZStack {
      TeleprompterCameraPreview(session: viewModel.captureController.captureSession)
        .ignoresSafeArea()

      if viewModel.framingGrid == .thirds {
        TeleprompterFramingGridView()
          .ignoresSafeArea()
      }

      if viewModel.overlayVisibility == .visible, viewModel.contentMode == .script {
        // Script mode retains the existing lens-adjacent readability treatment.
        LinearGradient(
          colors: [Color.black.opacity(0.72), Color.black.opacity(0)],
          startPoint: .top,
          endPoint: .bottom
        )
        .frame(height: scriptRegionHeight + 120)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea()
        .allowsHitTesting(false)

        LinearGradient(
          colors: [Color.black.opacity(0), Color.black.opacity(0.82)],
          startPoint: .top,
          endPoint: .bottom
        )
        .frame(height: 260)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .ignoresSafeArea()
        .allowsHitTesting(false)
      }

      VStack(spacing: 0) {
        ViewThatFits(in: .horizontal) {
          captureHeader
          compactCaptureHeader
        }
          .padding(.horizontal, JovieSpacing.large)
          .padding(.top, JovieSpacing.medium)

        if viewModel.overlayVisibility == .visible {
          if viewModel.contentMode == .script {
            scriptRegion
              .frame(height: scriptRegionHeight)
          } else {
            Spacer(minLength: 0)
            promptRegion
            Spacer(minLength: 0)
          }
        } else {
          Spacer(minLength: 0)
        }

        // Reserved error/status slot — opacity only, no height collapse.
        Text(viewModel.errorMessage ?? " ")
          .font(JovieFont.body(size: 13))
          .foregroundStyle(
            viewModel.errorMessage == nil ? .clear : JovieColor.errorText
          )
          .multilineTextAlignment(.center)
          .padding(.horizontal, JovieSpacing.large)
          .frame(minHeight: 32)
          .accessibilityIdentifier("teleprompter-error")
          .accessibilityHidden(viewModel.errorMessage == nil)

        if viewModel.overlayVisibility == .visible, viewModel.contentMode == .script {
          Spacer(minLength: 0)
        }

        if viewModel.overlayVisibility == .visible, viewModel.contentMode == .prompt {
          promptFeedbackControls
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, JovieSpacing.large)
            .padding(.bottom, JovieSpacing.medium)
        }

        if viewModel.contentMode == .script, viewModel.overlayVisibility == .visible {
          speedControls
          controlBar
            .padding(.horizontal, JovieSpacing.large)
            .padding(.bottom, JovieSpacing.xxLarge)
        } else {
          promptRecordControl
            .padding(.bottom, JovieSpacing.xxLarge)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .task {
      await viewModel.startPreview()
    }
    .onDisappear {
      viewModel.cancelRecording()
    }
  }

  private var captureHeader: some View {
    HStack(spacing: JovieSpacing.small) {
      Button(action: handleClose) {
        Image(systemName: "xmark")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
          .frame(width: 56, height: 56)
          .background(Color.black.opacity(0.58), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Close capture")
      .accessibilityIdentifier("teleprompter-header-close")

      HStack(spacing: 6) {
        Circle()
          .fill(viewModel.isRecording ? Color.red : Color.clear)
          .frame(width: 8, height: 8)
        Text(viewModel.isRecording ? Self.elapsedLabel(for: viewModel.elapsedSeconds) : "Ready")
          .font(JovieFont.body(size: 13, weight: .medium))
          .monospacedDigit()
      }
      .foregroundStyle(JovieColor.textPrimary)
      .padding(.horizontal, JovieSpacing.medium)
      .frame(minHeight: 44)
      .background(Color.black.opacity(0.58), in: Capsule())
      .accessibilityElement(children: .combine)
      .accessibilityLabel(
        viewModel.isRecording
          ? "Recording, \(Self.elapsedLabel(for: viewModel.elapsedSeconds))"
          : "Ready to record"
      )

      Spacer(minLength: JovieSpacing.small)

      HStack(spacing: 2) {
        contentModeButton(.script, title: "Script")
        contentModeButton(.prompt, title: "Prompt")
      }
      .padding(3)
      .background(Color.black.opacity(0.58), in: Capsule())
      .accessibilityElement(children: .contain)

      overlayVisibilityButton
      framingGridButton
    }
  }

  private var compactCaptureHeader: some View {
    VStack(spacing: JovieSpacing.small) {
      HStack(spacing: JovieSpacing.small) {
        headerCloseButton
        recordingStatus
        Spacer(minLength: 0)
        overlayVisibilityButton
        framingGridButton
      }

      HStack(spacing: 2) {
        contentModeButton(.script, title: "Script")
        contentModeButton(.prompt, title: "Prompt")
      }
      .padding(3)
      .background(Color.black.opacity(0.58), in: Capsule())
      .accessibilityElement(children: .contain)
    }
  }

  private var headerCloseButton: some View {
    Button(action: handleClose) {
      Image(systemName: "xmark")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
        .frame(width: 56, height: 56)
        .background(Color.black.opacity(0.58), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Close capture")
    .accessibilityIdentifier("teleprompter-header-close")
  }

  private var recordingStatus: some View {
    HStack(spacing: 6) {
      Circle()
        .fill(viewModel.isRecording ? Color.red : Color.clear)
        .frame(width: 8, height: 8)
      Text(viewModel.isRecording ? Self.elapsedLabel(for: viewModel.elapsedSeconds) : "Ready")
        .font(JovieFont.body(size: 13, weight: .medium))
        .monospacedDigit()
    }
    .foregroundStyle(JovieColor.textPrimary)
    .padding(.horizontal, JovieSpacing.medium)
    .frame(minHeight: 44)
    .background(Color.black.opacity(0.58), in: Capsule())
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      viewModel.isRecording
        ? "Recording, \(Self.elapsedLabel(for: viewModel.elapsedSeconds))"
        : "Ready to record"
    )
  }

  private func contentModeButton(
    _ mode: TeleprompterContentMode,
    title: String
  ) -> some View {
    Button {
      viewModel.contentMode = mode
      viewModel.setOverlayVisible(true)
    } label: {
      Text(title)
        .font(JovieFont.body(size: 13, weight: .semibold))
        .foregroundStyle(
          viewModel.contentMode == mode
            ? JovieColor.backgroundBase
            : JovieColor.textSecondary
        )
        .padding(.horizontal, JovieSpacing.medium)
        .frame(minWidth: 72, minHeight: 44)
        .background(
          viewModel.contentMode == mode ? Color.white : Color.clear,
          in: Capsule()
        )
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("teleprompter-content-\(mode.rawValue)")
    .accessibilityAddTraits(viewModel.contentMode == mode ? .isSelected : [])
  }

  private var overlayVisibilityButton: some View {
    Button {
      viewModel.setOverlayVisible(viewModel.overlayVisibility != .visible)
    } label: {
      Image(systemName: viewModel.overlayVisibility == .visible ? "eye.fill" : "eye.slash.fill")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(JovieColor.accent)
        .frame(width: 56, height: 56)
        .background(Color.black.opacity(0.58), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      viewModel.overlayVisibility == .visible ? "Temporarily hide overlay" : "Show overlay now"
    )
    .accessibilityHint(
      viewModel.overlayVisibility == .visible
        ? "Shows the live camera for three seconds, then restores the prompt. Recording continues."
        : "Restores the prompt immediately. Recording continues."
    )
    .accessibilityIdentifier("teleprompter-overlay-toggle")
  }

  private var framingGridButton: some View {
    Button {
      viewModel.setFramingGridEnabled(viewModel.framingGrid == .off)
    } label: {
      Image(systemName: "grid")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(viewModel.framingGrid == .thirds ? JovieColor.accent : JovieColor.textPrimary)
        .frame(width: 56, height: 56)
        .background(Color.black.opacity(0.58), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(viewModel.framingGrid == .thirds ? "Hide framing grid" : "Show framing grid")
    .accessibilityIdentifier("teleprompter-grid-toggle")
  }

  private var promptRegion: some View {
    GeometryReader { proxy in
      Text(viewModel.promptText)
        .font(JovieFont.display(size: 34))
        .foregroundStyle(JovieColor.textPrimary)
        .multilineTextAlignment(.center)
        .lineLimit(3)
        .minimumScaleFactor(0.6)
        .allowsTightening(true)
        .padding(.horizontal, JovieSpacing.xxLarge)
        .frame(width: proxy.size.width, height: proxy.size.height)
        .background(Color.black.opacity(0.46))
        .accessibilityIdentifier("teleprompter-prompt")
    }
    .frame(height: 180)
  }

  private var promptFeedbackControls: some View {
    HStack(spacing: 4) {
      promptFeedbackButton(.useful, systemImage: "hand.thumbsup.fill", label: "Useful prompt")
      promptFeedbackButton(.notUseful, systemImage: "hand.thumbsdown.fill", label: "Not useful prompt")
    }
    .padding(4)
    .background(Color.black.opacity(0.58), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .accessibilityElement(children: .contain)
  }

  private func promptFeedbackButton(
    _ feedback: TeleprompterPromptFeedback,
    systemImage: String,
    label: String
  ) -> some View {
    Button {
      viewModel.submitPromptFeedback(feedback)
    } label: {
      Image(systemName: systemImage)
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(
          viewModel.pendingPromptFeedback == feedback
            ? JovieColor.accent
            : JovieColor.textPrimary
        )
        .frame(width: 56, height: 56)
    }
    .frame(width: 56, height: 56)
    .contentShape(Rectangle())
    .buttonStyle(.plain)
    .accessibilityLabel(label)
    .accessibilityHint("Saved privately on this iPhone while offline")
    .accessibilityIdentifier("teleprompter-feedback-\(feedback.rawValue)")
  }

  private var promptRecordControl: some View {
    Button {
      if viewModel.isRecording {
        Task { await viewModel.stopRecording() }
      } else {
        Task { await viewModel.startRecording() }
      }
    } label: {
      ZStack {
        Circle()
          .fill(Color.white)
          .frame(width: 80, height: 80)
        if viewModel.isRecording {
          RoundedRectangle(cornerRadius: 5, style: .continuous)
            .fill(Color.red)
            .frame(width: 28, height: 28)
        } else {
          Circle()
            .fill(Color.red)
            .frame(width: 58, height: 58)
        }
      }
    }
    .buttonStyle(.plain)
    .disabled(viewModel.isStarting || viewModel.isFinishing)
    .accessibilityLabel(viewModel.isRecording ? "Stop recording" : "Start recording")
    .accessibilityIdentifier("teleprompter-prompt-record")
  }

  @ViewBuilder
  private var scriptRegion: some View {
    ZStack(alignment: .bottom) {
      if viewModel.isEditingScript {
        VStack(spacing: JovieSpacing.small) {
          TextEditor(text: $viewModel.scriptText)
            .font(JovieFont.body(size: 15))
            .foregroundStyle(JovieColor.textPrimary)
            .scrollContentBackground(.hidden)
            .padding(JovieSpacing.small)
            .background(JovieColor.surface1.opacity(0.9), in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous))
            .padding(.horizontal, JovieSpacing.large)
            .accessibilityIdentifier("teleprompter-script-editor")

          Button("Done") {
            viewModel.commitScriptEdits()
          }
          .font(JovieFont.body(size: 14, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
          .accessibilityIdentifier("teleprompter-script-done")
        }
      } else {
        TeleprompterScriptScrollView(
          words: viewModel.displayWords,
          currentWordIndex: viewModel.currentWordIndex,
          fontSize: scriptFontSize,
          isLive: viewModel.isRecording,
          userScrollLocked: $userScrollLocked,
          onSeek: { index in
            userScrollLocked = false
            viewModel.seek(to: index)
          }
        )
      }

      if isLockedWhileLive {
        Button("Current line") {
          userScrollLocked = false
        }
        .font(JovieFont.body(size: 13, weight: .semibold))
        .foregroundStyle(JovieColor.backgroundBase)
        .padding(.horizontal, JovieSpacing.medium)
        .padding(.vertical, 6)
        .background(JovieColor.accent, in: Capsule())
        .transition(.opacity)
        .accessibilityIdentifier("teleprompter-current-line")
      }
    }
    .animation(JovieMotion.subtle, value: isLockedWhileLive)
  }

  /// Speed override row. Fixed height in both modes. The slider retunes the
  /// rate applied the next time "Auto" engages.
  private var speedControls: some View {
    HStack(spacing: JovieSpacing.medium) {
      Image(systemName: "tortoise.fill")
        .font(.system(size: 12))
        .foregroundStyle(JovieColor.textTertiary)
        .accessibilityHidden(true)

      Slider(
        value: $viewModel.speedWordsPerMinute,
        in: TeleprompterAutoScroller.minimumWordsPerMinute
          ... TeleprompterAutoScroller.maximumWordsPerMinute,
        step: 5
      )
      .tint(JovieColor.accent)
      .accessibilityIdentifier("teleprompter-speed-slider")
      .accessibilityLabel("Prompt speed, words per minute")

      Image(systemName: "hare.fill")
        .font(.system(size: 12))
        .foregroundStyle(JovieColor.textTertiary)
        .accessibilityHidden(true)

      Button {
        if viewModel.followMode == .auto {
          viewModel.resumeVoiceFollow()
        } else {
          viewModel.engageSpeedOverride()
        }
      } label: {
        Text(viewModel.followMode == .auto ? "Voice" : "Auto")
          .font(JovieFont.body(size: 13, weight: .semibold))
          .foregroundStyle(
            viewModel.followMode == .auto
              ? JovieColor.backgroundBase
              : JovieColor.textPrimary
          )
          .frame(width: 56)
          .padding(.vertical, 6)
          .background(
            viewModel.followMode == .auto ? JovieColor.accent : JovieColor.surface1,
            in: Capsule()
          )
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("teleprompter-follow-toggle")
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.bottom, JovieSpacing.medium)
    .frame(height: 44)
  }

  private var controlBar: some View {
    VStack(spacing: JovieSpacing.medium) {
      // Status row: fixed height, reserved slots for elapsed time and the
      // recognition caption so start/stop never shift the buttons.
      HStack(spacing: JovieSpacing.small) {
        Circle()
          .fill(viewModel.isRecording ? Color.red : Color.clear)
          .frame(width: 8, height: 8)

        Text(Self.elapsedLabel(for: viewModel.elapsedSeconds))
          .font(JovieFont.body(size: 13, weight: .medium))
          .foregroundStyle(
            viewModel.isRecording ? JovieColor.textPrimary : .clear
          )
          .monospacedDigit()
          .accessibilityIdentifier("teleprompter-elapsed")

        Spacer(minLength: 0)

        Text(recognitionCaption ?? " ")
          .font(JovieFont.body(size: 12))
          .foregroundStyle(JovieColor.textTertiary)
          .opacity(recognitionCaption == nil ? 0 : 1)
      }
      .frame(height: 20)

      HStack(spacing: JovieSpacing.xLarge) {
        Button(action: handleClose) {
          Image(systemName: "xmark")
            .font(.system(size: 16, weight: .semibold))
        }
        .buttonStyle(JovieIconButtonStyle())
        .accessibilityLabel("Close teleprompter")
        .accessibilityIdentifier("teleprompter-close")

        Button {
          viewModel.presentationMode =
            viewModel.presentationMode == .notch ? .fullscreen : .notch
        } label: {
          Image(
            systemName: viewModel.presentationMode == .notch
              ? "rectangle.expand.vertical"
              : "rectangle.compress.vertical"
          )
          .font(.system(size: 16, weight: .semibold))
        }
        .buttonStyle(JovieIconButtonStyle())
        .accessibilityLabel(
          viewModel.presentationMode == .notch
            ? "Switch to fullscreen script"
            : "Switch to notch script"
        )
        .accessibilityIdentifier("teleprompter-mode-toggle")

        Button {
          if viewModel.isRecording {
            Task { await viewModel.stopRecording() }
          } else {
            Task { await viewModel.startRecording() }
          }
        } label: {
          ZStack {
            Circle()
              .stroke(Color.white, lineWidth: 3)
              .frame(width: 68, height: 68)
            if viewModel.isRecording {
              RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(Color.red)
                .frame(width: 26, height: 26)
            } else {
              Circle()
                .fill(Color.red)
                .frame(width: 54, height: 54)
            }
          }
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isStarting || viewModel.isFinishing)
        .accessibilityLabel(viewModel.isRecording ? "Stop recording" : "Start recording")
        .accessibilityIdentifier("teleprompter-record")

        Button {
          viewModel.isEditingScript.toggle()
        } label: {
          Image(systemName: viewModel.isEditingScript ? "checkmark" : "pencil")
            .font(.system(size: 16, weight: .semibold))
        }
        .buttonStyle(JovieIconButtonStyle())
        .disabled(viewModel.isRecording)
        .opacity(viewModel.isRecording ? 0.4 : 1)
        .accessibilityLabel("Edit script")
        .accessibilityIdentifier("teleprompter-edit")

        // Mirror slot keeps the record button centered: same 44×44 footprint
        // as the icon buttons (same trick as the Talk overlay title row).
        Color.clear
          .frame(width: 44, height: 44)
          .accessibilityHidden(true)
      }
      .frame(height: 72)
    }
  }

  private var recognitionCaption: String? {
    guard viewModel.isRecording else { return nil }
    return viewModel.captureController.isSpeechRecognitionActive
      ? "On-device voice following"
      : "Manual prompt · recording continues"
  }

  private func handleClose() {
    viewModel.cancelRecording()
    onClose()
  }

  static func elapsedLabel(for seconds: TimeInterval) -> String {
    let totalSeconds = Int(seconds)
    let minutes = totalSeconds / 60
    let remainder = totalSeconds % 60
    return String(format: "%d:%02d", minutes, remainder)
  }
}
