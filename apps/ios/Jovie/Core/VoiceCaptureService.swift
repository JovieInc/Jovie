import AVFoundation
import Foundation
import Observation
import Speech

enum VoiceCaptureError: LocalizedError, Equatable {
  case microphoneDenied
  case speechDenied
  case recognizerUnavailable
  case audioUnavailable
  case emptyTranscript
  case notRecording

  var errorDescription: String? {
    switch self {
    case .microphoneDenied:
      "Microphone access is off. Enable it in Settings → Jovie."
    case .speechDenied:
      "Speech recognition is off. Enable it in Settings → Jovie."
    case .recognizerUnavailable:
      "Voice is unavailable on this device."
    case .audioUnavailable:
      "The microphone isn't available right now. Try again."
    case .emptyTranscript:
      "Nothing heard."
    case .notRecording:
      "Voice is not recording."
    }
  }
}

/// Shared transcript normalization and recovery-draft contract for iOS voice.
/// Normal capture submits directly; this keeps recoverable text editable when
/// a direct completion cannot finish safely.
enum EyesFreeReadback {
  @MainActor
  static func speak(_ text: String) {
    let utterance = AVSpeechUtterance(string: text)
    utterance.rate = AVSpeechUtteranceDefaultSpeechRate
    SpeechCueSynthesizer.shared.speak(utterance)
  }
}

@MainActor
private final class SpeechCueSynthesizer {
  static let shared = SpeechCueSynthesizer()
  private let synthesizer = AVSpeechSynthesizer()

  func speak(_ utterance: AVSpeechUtterance) {
    synthesizer.speak(utterance)
  }
}

enum EyesFreeCaptureGate: Equatable {
  case ready
  case unavailable
  case offline
  case unsigned
  case summerForbidden
  case permission
  case transcriptionEmpty
  case uploadFailed

  static let unavailableMessage = "Capture is unavailable."
  static let offlineMessage = "You're offline. Retry when you are back."
  static let summerForbiddenMessage = "Summer is only available to the founder."
  static let retryMessage = "Retry this capture from Jovie."

  static func resolve(
    isSignedIn: Bool,
    chatEnabled: Bool,
    isOffline: Bool,
    destination: EyesFreeCaptureDestination,
    canUseSummer: Bool
  ) -> Self {
    if !isSignedIn { return .unsigned }
    if !chatEnabled { return .unavailable }
    if isOffline { return .offline }
    if destination == .summer, !canUseSummer { return .summerForbidden }
    return .ready
  }

  var message: String {
    switch self {
    case .ready: ""
    case .unavailable, .unsigned: Self.unavailableMessage
    case .offline: Self.offlineMessage
    case .summerForbidden: Self.summerForbiddenMessage
    case .permission:
      VoiceCaptureError.microphoneDenied.errorDescription ?? Self.unavailableMessage
    case .transcriptionEmpty:
      VoiceCaptureError.emptyTranscript.errorDescription ?? "Nothing heard."
    case .uploadFailed: Self.retryMessage
    }
  }
}

enum VoiceMemoActionDraft: Equatable {
  /// Shell handoff outcome for a recovered voice memo (never auto-sends).
  struct ShellHandoff: Equatable {
    let chatDraft: String
    /// Recovery requires a new explicit send from the composer.
    let autoSendMessage: String?
  }

  /// Normalize spoken text for direct submission or recovery.
  static func make(fromTranscript transcript: String) -> String {
    transcript.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// Whether normalized text is ready to submit or preserve.
  static func isReady(_ draft: String) -> Bool {
    !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// Failed Talk completion → AppShell recovery contract.
  static func shellHandoff(fromTranscript transcript: String) -> ShellHandoff {
    ShellHandoff(
      chatDraft: make(fromTranscript: transcript),
      autoSendMessage: nil
    )
  }
}

struct VoiceCaptureResult: Equatable {
  let transcript: String
  let latencyMilliseconds: Int
  /// True when recognition ran with `requiresOnDeviceRecognition`.
  let usedOnDeviceRecognition: Bool
}

/// Pure helpers for Speech request configuration (testable without audio hardware).
enum VoiceCaptureRecognitionConfig {
  /// Prefer on-device SFSpeechRecognizer when the OS supports it (privacy + offline).
  /// Falls back to network recognition only when on-device is unavailable.
  static func preferOnDevice(for recognizer: SFSpeechRecognizer?) -> Bool {
    recognizer?.supportsOnDeviceRecognition == true
  }

  static func configure(
    _ request: SFSpeechAudioBufferRecognitionRequest,
    recognizer: SFSpeechRecognizer?
  ) -> Bool {
    let onDevice = preferOnDevice(for: recognizer)
    request.shouldReportPartialResults = true
    request.requiresOnDeviceRecognition = onDevice
    return onDevice
  }

  /// An inactive or contended audio session can hand back a 0 Hz / 0-channel
  /// input format; `installTap(onBus:)` traps on it instead of throwing.
  static func isUsableCaptureFormat(sampleRate: Double, channelCount: UInt32) -> Bool {
    sampleRate > 0 && channelCount > 0
  }
}

/// Plain-language copy for Speech/AVFoundation failures. `nil` means the
/// failure was caused by our own cancellation and must not be surfaced.
enum VoiceCaptureFailureMessage {
  static let assistantDomain = "kAFAssistantErrorDomain"
  static let genericMessage = "Voice recognition failed. Try again."
  static let nothingHeardMessage = "Didn't catch that. Try again."
  static let networkMessage = "Voice needs a network connection right now."
  static let onDeviceNotReadyMessage = "On-device recognition isn't ready. Try again."
  static let interruptedMessage = "Recording was interrupted."
  static let routeLostMessage = "Your microphone disconnected."
  static let recognizerFinishedMessage = "Recognition paused."
  static let sendPreservedSuffix = "Tap Send to use what was heard."

  static func message(for error: Error) -> String? {
    let nsError = error as NSError
    return message(domain: nsError.domain, code: nsError.code)
  }

  static func message(domain: String, code: Int) -> String? {
    switch (domain, code) {
    // 209/216/301: request or session cancelled — always ours.
    case (assistantDomain, 209), (assistantDomain, 216), (assistantDomain, 301):
      nil
    case (assistantDomain, 1110):
      nothingHeardMessage
    case (assistantDomain, 1101), (assistantDomain, 1107):
      onDeviceNotReadyMessage
    case (NSURLErrorDomain, _):
      networkMessage
    default:
      genericMessage
    }
  }
}

/// What to do when the recognizer or audio session stops before the user
/// finishes: keep usable text so Send still works, or offer a retry.
enum VoiceCaptureSessionInterruption: Equatable {
  case preserveTranscript(String)
  case retry

  static func resolve(transcript: String) -> Self {
    let draft = VoiceMemoActionDraft.make(fromTranscript: transcript)
    return VoiceMemoActionDraft.isReady(draft) ? .preserveTranscript(draft) : .retry
  }
}

@MainActor
@Observable
final class VoiceCaptureService {
  private let recognizer: SFSpeechRecognizer?
  private let audioEngine = AVAudioEngine()
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var recordingStartedAt: ContinuousClock.Instant?
  private var latestTranscript = ""
  private var activeOnDevicePreference = false
  /// Monotonic session id so late recognition callbacks cannot rewrite state
  /// after cancel/finish.
  private var sessionID: UInt64 = 0
  /// True while `finish()` is suspended/tearing down — blocks concurrent `start()`.
  private var isFinishing = false
  /// Text kept when the session was paused early (interruption, route loss,
  /// recognizer finished/failed). `finish()` returns it without a live engine.
  private var interruptedTranscript: String?
  private var audioSessionObservers: [NSObjectProtocol] = []

  private(set) var isRecording = false
  private(set) var audioLevel: Double = 0
  private(set) var transcriptPreview = ""
  private(set) var lastErrorMessage: String?
  /// Whether the current/last session preferred on-device recognition.
  private(set) var isUsingOnDeviceRecognition = false
  /// Whether this device reports on-device Speech support.
  var supportsOnDeviceRecognition: Bool {
    VoiceCaptureRecognitionConfig.preferOnDevice(for: recognizer)
  }
  /// True while `finish()` can produce a transcript: live, or paused with text.
  var canFinish: Bool {
    isRecording || interruptedTranscript != nil
  }

  init(locale: Locale = .current) {
    recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer()
  }

  func start() async throws {
    guard !isRecording, !isFinishing else { return }
    try await ensurePermissions()
    guard !isRecording, !isFinishing else { return }
    guard recognizer?.isAvailable == true else {
      throw VoiceCaptureError.recognizerUnavailable
    }

    reset()
    sessionID &+= 1
    let captureSessionID = sessionID

    // Activate the session BEFORE touching the input node. An inactive
    // session can report a 0 Hz format and installTap(onBus:) traps on it.
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
      try session.setActive(true, options: .notifyOthersOnDeactivation)
    } catch {
      throw VoiceCaptureError.audioUnavailable
    }

    let inputNode = audioEngine.inputNode
    let format = inputNode.outputFormat(forBus: 0)
    guard
      VoiceCaptureRecognitionConfig.isUsableCaptureFormat(
        sampleRate: format.sampleRate,
        channelCount: format.channelCount
      )
    else {
      deactivateAudioSession()
      throw VoiceCaptureError.audioUnavailable
    }

    let request = SFSpeechAudioBufferRecognitionRequest()
    activeOnDevicePreference = VoiceCaptureRecognitionConfig.configure(
      request,
      recognizer: recognizer
    )
    isUsingOnDeviceRecognition = activeOnDevicePreference
    recognitionRequest = request

    inputNode.removeTap(onBus: 0)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      request.append(buffer)
      let level = Self.normalizedLevel(from: buffer)
      Task { @MainActor in
        guard let self, self.sessionID == captureSessionID, self.isRecording else { return }
        self.audioLevel = level
      }
    }

    recognitionTask = recognizer?.recognitionTask(with: request) { [weak self] result, error in
      Task { @MainActor in
        guard let self, self.sessionID == captureSessionID else { return }
        // Accept final results briefly after stop (finish ends isRecording first).
        let sessionStillOpen = self.recognitionRequest != nil || self.isRecording
        guard sessionStillOpen else { return }

        if let result {
          let text = result.bestTranscription.formattedString
          self.latestTranscript = text
          self.transcriptPreview = text
          // Server recognition caps a request (~1 min) and finishes on its
          // own; the engine would keep running into a dead request.
          if result.isFinal, error == nil, self.isRecording {
            self.pauseSession(
              message: VoiceCaptureFailureMessage.recognizerFinishedMessage,
              status: "recognizer_finished"
            )
          }
        }

        if let error {
          self.handleRecognitionError(error)
        }
      }
    }

    audioEngine.prepare()
    do {
      try audioEngine.start()
    } catch {
      // Leave nothing half-armed: no tap, no task, session released.
      inputNode.removeTap(onBus: 0)
      recognitionTask?.cancel()
      recognitionTask = nil
      recognitionRequest = nil
      deactivateAudioSession()
      throw VoiceCaptureError.audioUnavailable
    }

    recordingStartedAt = .now
    isRecording = true
    observeAudioSession(sessionID: captureSessionID)
    Observability.addBreadcrumb(
      .voiceCaptureStarted,
      context: [
        "on_device": activeOnDevicePreference,
      ]
    )
  }

  func finish() async throws -> VoiceCaptureResult {
    if !isRecording, !isFinishing, let preserved = interruptedTranscript {
      // Paused early with usable text — hand it over without a live engine.
      interruptedTranscript = nil
      clearTranscriptBuffers()
      lastErrorMessage = nil
      let latency = latencyMilliseconds(since: recordingStartedAt)
      recordingStartedAt = nil
      recordCompletion(
        status: "draft_after_pause",
        latencyMilliseconds: latency,
        onDevice: activeOnDevicePreference
      )
      return VoiceCaptureResult(
        transcript: preserved,
        latencyMilliseconds: latency,
        usedOnDeviceRecognition: activeOnDevicePreference
      )
    }

    guard isRecording, !isFinishing else { throw VoiceCaptureError.notRecording }
    isFinishing = true
    defer { isFinishing = false }

    let startedAt = recordingStartedAt
    let usedOnDevice = activeOnDevicePreference
    let captureSessionID = sessionID

    stopObservingAudioSession()
    audioEngine.stop()
    audioEngine.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    isRecording = false
    audioLevel = 0

    try? await Task.sleep(for: .milliseconds(180))
    // Only tear down if this session is still current (no re-start race).
    guard sessionID == captureSessionID else {
      throw VoiceCaptureError.notRecording
    }
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest = nil
    deactivateAudioSession()

    let transcript = VoiceMemoActionDraft.make(fromTranscript: latestTranscript)
    // Drop residual transcript from the long-lived service after handoff.
    clearTranscriptBuffers()

    guard VoiceMemoActionDraft.isReady(transcript) else {
      recordCompletion(
        status: "empty",
        latencyMilliseconds: latencyMilliseconds(since: startedAt),
        onDevice: usedOnDevice
      )
      throw VoiceCaptureError.emptyTranscript
    }

    let latency = latencyMilliseconds(since: startedAt)
    // endAudio() routinely yields a trailing "no speech" (1110) on a silent
    // tail during the settle window; a successful handoff must not carry it.
    lastErrorMessage = nil
    recordCompletion(status: "draft", latencyMilliseconds: latency, onDevice: usedOnDevice)
    return VoiceCaptureResult(
      transcript: transcript,
      latencyMilliseconds: latency,
      usedOnDeviceRecognition: usedOnDevice
    )
  }

  func cancel() {
    guard
      isRecording || recognitionRequest != nil || isFinishing || interruptedTranscript != nil
    else {
      clearTranscriptBuffers()
      return
    }
    sessionID &+= 1
    isFinishing = false
    stopObservingAudioSession()
    audioEngine.stop()
    audioEngine.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest = nil
    isRecording = false
    audioLevel = 0
    interruptedTranscript = nil
    clearTranscriptBuffers()
    recordCompletion(
      status: "cancelled",
      latencyMilliseconds: latencyMilliseconds(since: recordingStartedAt),
      onDevice: activeOnDevicePreference
    )
    recordingStartedAt = nil
    deactivateAudioSession()
  }

  /// Stop capturing early while keeping state coherent: the engine and
  /// recognizer are released, usable text is preserved for `finish()`, and
  /// `isRecording` flips so the overlay can show Send/Retry instead of a
  /// dead "Listening" state.
  private func pauseSession(message: String, status: String) {
    guard isRecording else { return }
    stopObservingAudioSession()
    audioEngine.stop()
    audioEngine.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest = nil
    isRecording = false
    audioLevel = 0
    deactivateAudioSession()

    switch VoiceCaptureSessionInterruption.resolve(transcript: latestTranscript) {
    case .preserveTranscript(let draft):
      interruptedTranscript = draft
      transcriptPreview = draft
      lastErrorMessage = "\(message) \(VoiceCaptureFailureMessage.sendPreservedSuffix)"
    case .retry:
      interruptedTranscript = nil
      clearTranscriptBuffers()
      lastErrorMessage = message
    }
    recordCompletion(
      status: status,
      latencyMilliseconds: latencyMilliseconds(since: recordingStartedAt),
      onDevice: activeOnDevicePreference
    )
  }

  private func handleRecognitionError(_ error: Error) {
    guard let message = VoiceCaptureFailureMessage.message(for: error) else { return }
    if isRecording {
      pauseSession(message: message, status: "recognizer_failed")
    } else {
      lastErrorMessage = message
    }
  }

  private func observeAudioSession(sessionID captureSessionID: UInt64) {
    stopObservingAudioSession()
    // `object: nil` on purpose — these notifications are not reliably posted
    // with the shared session as sender; filtering on it can silence them.
    // The captureSessionID check inside scopes them to this session.
    let center = NotificationCenter.default
    let interruption = center.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: nil,
      queue: .main
    ) { [weak self] note in
      guard
        let rawType = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
        AVAudioSession.InterruptionType(rawValue: rawType) == .began
      else { return }
      Task { @MainActor in
        guard let self, self.sessionID == captureSessionID else { return }
        self.pauseSession(
          message: VoiceCaptureFailureMessage.interruptedMessage,
          status: "interrupted"
        )
      }
    }
    let routeChange = center.addObserver(
      forName: AVAudioSession.routeChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] note in
      guard
        let rawReason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
        AVAudioSession.RouteChangeReason(rawValue: rawReason) == .oldDeviceUnavailable
      else { return }
      Task { @MainActor in
        guard let self, self.sessionID == captureSessionID else { return }
        self.pauseSession(
          message: VoiceCaptureFailureMessage.routeLostMessage,
          status: "route_lost"
        )
      }
    }
    audioSessionObservers = [interruption, routeChange]
  }

  private func stopObservingAudioSession() {
    for observer in audioSessionObservers {
      NotificationCenter.default.removeObserver(observer)
    }
    audioSessionObservers = []
  }

  private func deactivateAudioSession() {
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func clearTranscriptBuffers() {
    latestTranscript = ""
    transcriptPreview = ""
  }

  private func reset() {
    stopObservingAudioSession()
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest = nil
    recordingStartedAt = nil
    interruptedTranscript = nil
    clearTranscriptBuffers()
    lastErrorMessage = nil
    audioLevel = 0
    activeOnDevicePreference = false
    isUsingOnDeviceRecognition = false
  }

  private func ensurePermissions() async throws {
    let microphoneGranted = await AVAudioApplication.requestRecordPermission()
    guard microphoneGranted else { throw VoiceCaptureError.microphoneDenied }

    let speechStatus = await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { status in
        continuation.resume(returning: status)
      }
    }

    guard speechStatus == .authorized else {
      throw VoiceCaptureError.speechDenied
    }
  }

  private func latencyMilliseconds(since start: ContinuousClock.Instant?) -> Int {
    guard let start else { return 0 }
    let duration = start.duration(to: .now)
    return Int(duration.components.seconds * 1_000)
      + Int(duration.components.attoseconds / 1_000_000_000_000_000)
  }

  private func recordCompletion(status: String, latencyMilliseconds: Int, onDevice: Bool) {
    Observability.captureMessage(
      .voiceTranscriptionCompleted,
      context: [
        "latency_ms": latencyMilliseconds,
        "status": status,
        "on_device": onDevice,
      ]
    )
  }

  private static func normalizedLevel(from buffer: AVAudioPCMBuffer) -> Double {
    guard let channelData = buffer.floatChannelData?[0] else { return 0 }
    let frameLength = Int(buffer.frameLength)
    guard frameLength > 0 else { return 0 }

    var total: Float = 0
    for index in 0..<frameLength {
      total += abs(channelData[index])
    }

    return min(1, max(0, Double(total / Float(frameLength)) * 18))
  }
}
