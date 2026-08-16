@preconcurrency import AVFoundation
import Foundation
import Observation
import Speech

enum TeleprompterCaptureError: LocalizedError, Equatable {
  case cameraDenied
  case microphoneDenied
  case speechDenied
  case cameraUnavailable
  case recognizerUnavailable
  case notRecording
  case recordingFailed

  var errorDescription: String? {
    switch self {
    case .cameraDenied:
      "Camera access is off. Enable it in Settings → Jovie."
    case .microphoneDenied:
      "Microphone access is off. Enable it in Settings → Jovie."
    case .speechDenied:
      "Speech recognition is off. Enable it in Settings → Jovie."
    case .cameraUnavailable:
      "No front camera is available on this device."
    case .recognizerUnavailable:
      "Voice following is unavailable on this device."
    case .notRecording:
      "Teleprompter is not recording."
    case .recordingFailed:
      "The recording couldn't be saved."
    }
  }
}

struct TeleprompterCaptureResult: Equatable {
  let videoURL: URL
  let transcript: String
  let segments: [VlogWordTiming]
  /// True when recognition ran with `requiresOnDeviceRecognition`.
  let usedOnDeviceRecognition: Bool
}

/// Catalina never falls back to network speech during a local-first take.
/// When on-device recognition is not both authorized and available, the
/// camera continues recording and the prompt remains static/manual.
enum TeleprompterSpeechMode: Equatable, Sendable {
  case onDevice
  case manual

  static func resolve(
    isAuthorized: Bool,
    isAvailable: Bool,
    supportsOnDevice: Bool
  ) -> Self {
    isAuthorized && isAvailable && supportsOnDevice ? .onDevice : .manual
  }
}

/// Teleprompter capture controller (JOV-5075): front-camera video recording
/// plus on-device speech recognition in one AVCaptureSession. Audio for the
/// recognizer comes from an `AVCaptureAudioDataOutput` tap on the same mic the
/// movie file records, so the camera and Speech never fight over the audio
/// session (AVAudioEngine's `.record` category would conflict with capture).
@MainActor
@Observable
final class TeleprompterCaptureController {
  /// Exposed for the preview layer. All mutation happens on `sessionQueue`.
  let captureSession = AVCaptureSession()

  private let sessionQueue = DispatchQueue(label: "ie.jov.jovie.teleprompter.capture")
  private let recognizer: SFSpeechRecognizer?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var movieOutput: AVCaptureMovieFileOutput?
  /// Strong retain: `AVCaptureAudioDataOutput.sampleBufferDelegate` is weak.
  private var audioSink: TeleprompterAudioSink?
  private var isConfigured = false
  /// Monotonic session id so late delegate callbacks cannot rewrite state
  /// after cancel/stop.
  private var sessionID: UInt64 = 0
  private var latestTranscript = ""
  private var latestSegments: [VlogWordTiming] = []
  private var activeOnDevicePreference = false
  private var finishDelegate: RecordingFinishDelegate?

  private(set) var isRecording = false
  private(set) var isPreviewing = false
  private(set) var lastErrorMessage: String?
  /// Whether the current/last session preferred on-device recognition.
  private(set) var isUsingOnDeviceRecognition = false
  /// True only while the current take has an active on-device recognition
  /// task. False means the prompt is static/manual; it never implies network
  /// recognition.
  private(set) var isSpeechRecognitionActive = false
  /// Live partial transcript for the voice-following follower.
  var onPartialTranscript: ((String) -> Void)?

  init(locale: Locale = .current) {
    recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer()
  }

  var supportsOnDeviceRecognition: Bool {
    VoiceCaptureRecognitionConfig.preferOnDevice(for: recognizer)
  }

  func startPreview() async throws {
    guard !isPreviewing else { return }
    let cameraGranted = await AVCaptureDevice.requestAccess(for: .video)
    guard cameraGranted else { throw TeleprompterCaptureError.cameraDenied }
    try await configureSessionIfNeeded()

    await withCheckedContinuation { continuation in
      sessionQueue.async { [captureSession] in
        if !captureSession.isRunning {
          captureSession.startRunning()
        }
        continuation.resume()
      }
    }
    isPreviewing = true
  }

  func start(videoURL: URL) async throws {
    guard !isRecording else { return }
    let speechAuthorized = try await ensurePermissions()
    guard !isRecording else { return }
    try await configureSessionIfNeeded()
    guard let movieOutput else {
      throw TeleprompterCaptureError.cameraUnavailable
    }

    sessionID &+= 1
    let captureSessionID = sessionID
    latestTranscript = ""
    latestSegments = []
    lastErrorMessage = nil
    isSpeechRecognitionActive = false

    let speechMode = TeleprompterSpeechMode.resolve(
      isAuthorized: speechAuthorized,
      isAvailable: recognizer?.isAvailable == true,
      supportsOnDevice: supportsOnDeviceRecognition
    )
    activeOnDevicePreference = speechMode == .onDevice
    isUsingOnDeviceRecognition = activeOnDevicePreference

    if speechMode == .onDevice, let recognizer {
      let request = SFSpeechAudioBufferRecognitionRequest()
      _ = VoiceCaptureRecognitionConfig.configure(request, recognizer: recognizer)
      recognitionRequest = request

      recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
        Task { @MainActor in
          guard let self, self.sessionID == captureSessionID else { return }
          let sessionStillOpen = self.recognitionRequest != nil || self.isRecording
          guard sessionStillOpen else { return }

          if let result {
            let transcription = result.bestTranscription
            self.latestTranscript = transcription.formattedString
            self.latestSegments = transcription.segments.map { segment in
              VlogWordTiming(
                word: segment.substring.trimmingCharacters(in: .whitespacesAndNewlines),
                startSeconds: segment.timestamp,
                durationSeconds: segment.duration,
                confidence: segment.confidence
              )
            }
            self.onPartialTranscript?(self.latestTranscript)
          }

          if let error {
            self.lastErrorMessage = error.localizedDescription
            self.isSpeechRecognitionActive = false
            self.isUsingOnDeviceRecognition = false
          }
        }
      }
      isSpeechRecognitionActive = true
    }

    Observability.addBreadcrumb(
      .teleprompterRecordingStarted,
      context: [
        "on_device": activeOnDevicePreference,
      ]
    )

    // Start the session, then the movie write, on the capture queue so the
    // main thread never blocks on camera hardware.
    let delegate = RecordingFinishDelegate()
    finishDelegate = delegate
    sessionQueue.async { [captureSession, movieOutput] in
      if !captureSession.isRunning {
        captureSession.startRunning()
      }
      movieOutput.startRecording(to: videoURL, recordingDelegate: delegate)
    }
    isPreviewing = true
    isRecording = true
  }

  func stop() async throws -> TeleprompterCaptureResult {
    guard isRecording, let movieOutput else {
      throw TeleprompterCaptureError.notRecording
    }
    isRecording = false
    let captureSessionID = sessionID
    let usedOnDevice = activeOnDevicePreference

    recognitionRequest?.endAudio()
    // Allow the final partial result to land before tearing down the task.
    try? await Task.sleep(for: .milliseconds(180))
    guard sessionID == captureSessionID else {
      throw TeleprompterCaptureError.notRecording
    }
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest = nil
    isSpeechRecognitionActive = false

    // `stopRecording()` before the output has started never fires the finish
    // delegate, which would suspend the continuation forever. Wait briefly
    // for the sessionQueue start to land.
    for _ in 0..<20 where !movieOutput.isRecording {
      try? await Task.sleep(for: .milliseconds(50))
    }
    guard movieOutput.isRecording else {
      finishDelegate = nil
      throw TeleprompterCaptureError.recordingFailed
    }

    let videoURL = try await withCheckedThrowingContinuation {
      (continuation: CheckedContinuation<URL, Error>) in
      finishDelegate?.arm(continuation)
      movieOutput.stopRecording()
    }
    finishDelegate = nil

    let captureSession = self.captureSession
    isPreviewing = false
    sessionQueue.async {
      captureSession.stopRunning()
    }

    guard FileManager.default.fileExists(atPath: videoURL.path) else {
      Observability.captureMessage(
        .teleprompterRecordingFailed,
        level: .error,
        context: ["reason": "missing_video_file"]
      )
      throw TeleprompterCaptureError.recordingFailed
    }

    Observability.captureMessage(
      .teleprompterRecordingCompleted,
      context: [
        "on_device": usedOnDevice,
        "word_count": latestSegments.count,
      ]
    )

    return TeleprompterCaptureResult(
      videoURL: videoURL,
      transcript: latestTranscript,
      segments: latestSegments,
      usedOnDeviceRecognition: usedOnDevice
    )
  }

  func cancel() {
    guard isPreviewing || isRecording || recognitionRequest != nil else { return }
    sessionID &+= 1
    isRecording = false
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest = nil
    isSpeechRecognitionActive = false
    isPreviewing = false
    let movieOutput = self.movieOutput
    let captureSession = self.captureSession
    let delegate = finishDelegate
    finishDelegate = nil
    sessionQueue.async {
      if movieOutput?.isRecording == true {
        movieOutput?.stopRecording()
      }
      captureSession.stopRunning()
    }
    delegate?.discard()
  }

  private func ensurePermissions() async throws -> Bool {
    let cameraGranted = await AVCaptureDevice.requestAccess(for: .video)
    guard cameraGranted else { throw TeleprompterCaptureError.cameraDenied }

    let microphoneGranted = await AVAudioApplication.requestRecordPermission()
    guard microphoneGranted else { throw TeleprompterCaptureError.microphoneDenied }

    let speechStatus = await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { status in
        continuation.resume(returning: status)
      }
    }
    return speechStatus == .authorized
  }

  private func configureSessionIfNeeded() async throws {
    guard !isConfigured else { return }

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      sessionQueue.async { [captureSession] in
        do {
          captureSession.beginConfiguration()
          captureSession.sessionPreset = .high

          guard
            let camera = AVCaptureDevice.default(
              .builtInWideAngleCamera,
              for: .video,
              position: .front
            )
          else {
            captureSession.commitConfiguration()
            continuation.resume(throwing: TeleprompterCaptureError.cameraUnavailable)
            return
          }

          let videoInput = try AVCaptureDeviceInput(device: camera)
          guard captureSession.canAddInput(videoInput) else {
            captureSession.commitConfiguration()
            continuation.resume(throwing: TeleprompterCaptureError.cameraUnavailable)
            return
          }
          captureSession.addInput(videoInput)

          if
            let microphone = AVCaptureDevice.default(for: .audio),
            let audioInput = try? AVCaptureDeviceInput(device: microphone),
            captureSession.canAddInput(audioInput)
          {
            captureSession.addInput(audioInput)
          }

          let movieOutput = AVCaptureMovieFileOutput()
          guard captureSession.canAddOutput(movieOutput) else {
            captureSession.commitConfiguration()
            continuation.resume(throwing: TeleprompterCaptureError.cameraUnavailable)
            return
          }
          captureSession.addOutput(movieOutput)
          if let connection = movieOutput.connection(with: .video) {
            // Portrait capture (rotation angle replaces deprecated
            // `videoOrientation` on iOS 17+).
            if connection.isVideoRotationAngleSupported(90) {
              connection.videoRotationAngle = 90
            }
            if connection.isVideoMirroringSupported {
              connection.automaticallyAdjustsVideoMirroring = true
            }
          }

          let audioOutput = AVCaptureAudioDataOutput()
          let audioSink = TeleprompterAudioSink()
          audioOutput.setSampleBufferDelegate(
            audioSink,
            queue: DispatchQueue(label: "ie.jov.jovie.teleprompter.speech")
          )
          if captureSession.canAddOutput(audioOutput) {
            captureSession.addOutput(audioOutput)
            Task { @MainActor [weak self] in
              self?.audioSink = audioSink
              // No session-id guard here: `recognitionRequest` is nil outside
              // an active capture, so late buffers are no-ops.
              audioSink.onPCMBuffer = { [weak self] buffer in
                self?.recognitionRequest?.append(buffer)
              }
            }
          }

          captureSession.commitConfiguration()
          Task { @MainActor [weak self] in
            self?.movieOutput = movieOutput
            self?.isConfigured = true
            continuation.resume()
          }
        } catch {
          captureSession.commitConfiguration()
          continuation.resume(throwing: error)
        }
      }
    }
  }
}

/// Converts capture audio sample buffers into PCM buffers for the Speech
/// request. Runs entirely off the main actor on the output's callback queue.
private final class TeleprompterAudioSink: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate,
  @unchecked Sendable
{
  /// Set once from the main actor before the session starts running.
  var onPCMBuffer: (@MainActor (AVAudioPCMBuffer) -> Void)?

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard
      let onPCMBuffer,
      let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
      let streamDescription = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription),
      streamDescription.pointee.mFormatID == kAudioFormatLinearPCM
    else {
      return
    }

    let frameCount = CMSampleBufferGetNumSamples(sampleBuffer)
    guard frameCount > 0,
          let buffer = AVAudioPCMBuffer(
            pcmFormat: AVAudioFormat(cmAudioFormatDescription: formatDescription),
            frameCapacity: AVAudioFrameCount(frameCount)
          )
    else {
      return
    }

    buffer.frameLength = buffer.frameCapacity
    let status = CMSampleBufferCopyPCMDataIntoAudioBufferList(
      sampleBuffer,
      at: 0,
      frameCount: Int32(frameCount),
      into: buffer.mutableAudioBufferList
    )
    guard status == noErr else { return }

    // `recognitionRequest.append` is safe off-main; hop only to respect the
    // controller's MainActor isolation.
    Task { @MainActor in
      onPCMBuffer(buffer)
    }
  }
}

/// One-shot delegate bridging `AVCaptureFileOutputRecordingDelegate` into
/// async/await. Kept alive by the controller until finish or cancel.
private final class RecordingFinishDelegate: NSObject, AVCaptureFileOutputRecordingDelegate,
  @unchecked Sendable
{
  private var continuation: CheckedContinuation<URL, Error>?

  func arm(_ continuation: CheckedContinuation<URL, Error>) {
    self.continuation = continuation
  }

  /// Cancel path: resume any pending waiter so nothing suspends forever.
  func discard() {
    let pending = continuation
    continuation = nil
    pending?.resume(throwing: TeleprompterCaptureError.recordingFailed)
  }

  func fileOutput(
    _ output: AVCaptureFileOutput,
    didFinishRecordingTo outputFileURL: URL,
    from connections: [AVCaptureConnection],
    error: (any Error)?
  ) {
    let pending = continuation
    continuation = nil
    if let error {
      // `recordingWasInterrupted`-style errors still leave a playable file in
      // many cases; the controller verifies file existence separately.
      pending?.resume(throwing: error)
    } else {
      pending?.resume(returning: outputFileURL)
    }
  }
}
