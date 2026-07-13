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
      "Microphone access is off."
    case .speechDenied:
      "Speech access is off."
    case .recognizerUnavailable:
      "Voice is unavailable."
    case .emptyTranscript:
      "Nothing heard."
    case .notRecording:
      "Voice is not recording."
    }
  }
}

struct VoiceCaptureResult: Equatable {
  let transcript: String
  let latencyMilliseconds: Int
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

  private(set) var isRecording = false
  private(set) var audioLevel: Double = 0
  private(set) var transcriptPreview = ""
  private(set) var lastErrorMessage: String?

  init(locale: Locale = .current) {
    recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer()
  }

  func start() async throws {
    guard !isRecording else { return }
    try await ensurePermissions()
    guard recognizer?.isAvailable == true else {
      throw VoiceCaptureError.recognizerUnavailable
    }

    reset()

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    recognitionRequest = request

    let inputNode = audioEngine.inputNode
    let format = inputNode.outputFormat(forBus: 0)

    inputNode.removeTap(onBus: 0)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      request.append(buffer)
      let level = Self.normalizedLevel(from: buffer)
      Task { @MainActor in
        self?.audioLevel = level
      }
    }

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
    try session.setActive(true, options: .notifyOthersOnDeactivation)

    recognitionTask = recognizer?.recognitionTask(with: request) { [weak self] result, error in
      Task { @MainActor in
        if let result {
          let text = result.bestTranscription.formattedString
          self?.latestTranscript = text
          self?.transcriptPreview = text
        }

        if let error {
          self?.lastErrorMessage = error.localizedDescription
        }
      }
    }

    recordingStartedAt = .now
    isRecording = true
    Observability.addBreadcrumb(.voiceCaptureStarted)

    audioEngine.prepare()
    try audioEngine.start()
  }

  func finish() async throws -> VoiceCaptureResult {
    guard isRecording else { throw VoiceCaptureError.notRecording }
    let startedAt = recordingStartedAt

    audioEngine.stop()
    audioEngine.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    isRecording = false
    audioLevel = 0

    try? await Task.sleep(for: .milliseconds(180))
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

    let transcript = latestTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !transcript.isEmpty else {
      recordCompletion(status: "empty", latencyMilliseconds: latencyMilliseconds(since: startedAt))
      throw VoiceCaptureError.emptyTranscript
    }

    let latency = latencyMilliseconds(since: startedAt)
    recordCompletion(status: "sent", latencyMilliseconds: latency)
    return VoiceCaptureResult(transcript: transcript, latencyMilliseconds: latency)
  }

  func cancel() {
    guard isRecording else { return }
    audioEngine.stop()
    audioEngine.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest = nil
    isRecording = false
    audioLevel = 0
    transcriptPreview = ""
    latestTranscript = ""
    recordCompletion(status: "cancelled", latencyMilliseconds: latencyMilliseconds(since: recordingStartedAt))
    recordingStartedAt = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func reset() {
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest = nil
    recordingStartedAt = nil
    latestTranscript = ""
    transcriptPreview = ""
    lastErrorMessage = nil
    audioLevel = 0
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

  private func recordCompletion(status: String, latencyMilliseconds: Int) {
    Observability.captureMessage(
      .voiceTranscriptionCompleted,
      context: [
        "latency_ms": latencyMilliseconds,
        "status": status,
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
