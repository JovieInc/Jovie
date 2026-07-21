import AVFoundation
import Foundation
import Observation
import Speech

enum VoiceCaptureError: LocalizedError, Equatable {
  case microphoneDenied
  case speechDenied
  case recognizerUnavailable
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
    case .emptyTranscript:
      "Nothing heard."
    case .notRecording:
      "Voice is not recording."
    }
  }
}

/// Shared transcript → editable action/task draft contract for iOS voice memo
/// capture. Mirrors the web voice-input path: transcript lands in the chat
/// composer as an editable draft; the user sends when ready.
enum VoiceMemoActionDraft: Equatable {
  /// Shell handoff outcome for a finished voice memo (never auto-sends).
  struct ShellHandoff: Equatable {
    let chatDraft: String
    /// Always nil for voice memo capture — send remains a composer action.
    let autoSendMessage: String?
  }

  /// Normalize spoken text into a composer-ready action draft.
  static func make(fromTranscript transcript: String) -> String {
    transcript.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// Whether a draft is ready to insert into the action surface.
  static func isReady(_ draft: String) -> Bool {
    !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// Talk overlay → AppShell contract: insert transcript as editable draft only.
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

    let request = SFSpeechAudioBufferRecognitionRequest()
    activeOnDevicePreference = VoiceCaptureRecognitionConfig.configure(
      request,
      recognizer: recognizer
    )
    isUsingOnDeviceRecognition = activeOnDevicePreference
    recognitionRequest = request

    let inputNode = audioEngine.inputNode
    let format = inputNode.outputFormat(forBus: 0)

    inputNode.removeTap(onBus: 0)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      request.append(buffer)
      let level = Self.normalizedLevel(from: buffer)
      Task { @MainActor in
        guard let self, self.sessionID == captureSessionID, self.isRecording else { return }
        self.audioLevel = level
      }
    }

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
    try session.setActive(true, options: .notifyOthersOnDeactivation)

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
        }

        if let error {
          self.lastErrorMessage = error.localizedDescription
        }
      }
    }

    recordingStartedAt = .now
    isRecording = true
    Observability.addBreadcrumb(
      .voiceCaptureStarted,
      context: [
        "on_device": activeOnDevicePreference,
      ]
    )

    audioEngine.prepare()
    try audioEngine.start()
  }

  func finish() async throws -> VoiceCaptureResult {
    guard isRecording, !isFinishing else { throw VoiceCaptureError.notRecording }
    isFinishing = true
    defer { isFinishing = false }

    let startedAt = recordingStartedAt
    let usedOnDevice = activeOnDevicePreference
    let captureSessionID = sessionID

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
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

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
    recordCompletion(status: "draft", latencyMilliseconds: latency, onDevice: usedOnDevice)
    return VoiceCaptureResult(
      transcript: transcript,
      latencyMilliseconds: latency,
      usedOnDeviceRecognition: usedOnDevice
    )
  }

  func cancel() {
    guard isRecording || recognitionRequest != nil || isFinishing else {
      clearTranscriptBuffers()
      return
    }
    sessionID &+= 1
    isFinishing = false
    audioEngine.stop()
    audioEngine.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest = nil
    isRecording = false
    audioLevel = 0
    clearTranscriptBuffers()
    recordCompletion(
      status: "cancelled",
      latencyMilliseconds: latencyMilliseconds(since: recordingStartedAt),
      onDevice: activeOnDevicePreference
    )
    recordingStartedAt = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func clearTranscriptBuffers() {
    latestTranscript = ""
    transcriptPreview = ""
  }

  private func reset() {
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest = nil
    recordingStartedAt = nil
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
