@preconcurrency import AVFoundation
import Foundation
import Observation
import Speech
import UIKit

enum TeleprompterCaptureError: LocalizedError, Equatable {
  case cameraDenied
  case microphoneDenied
  case microphoneUnavailable
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
    case .microphoneUnavailable:
      "No microphone is available for this recording."
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
  private static let finalRecognitionDrainDelay: Duration = .milliseconds(180)
  private static let recordingStartPollInterval: Duration = .milliseconds(50)
  private static let recordingStartPollLimit = 20

  /// Exposed for the preview layer. All mutation happens on `sessionQueue`.
  let captureSession = AVCaptureSession()

  private let sessionQueue = DispatchQueue(label: "ie.jov.jovie.teleprompter.capture")
  private let recognizer: SFSpeechRecognizer?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var movieOutput: AVCaptureMovieFileOutput?
  private var audioInput: AVCaptureDeviceInput?
  private var audioOutput: AVCaptureAudioDataOutput?
  /// Strong retain: `AVCaptureAudioDataOutput.sampleBufferDelegate` is weak.
  private var audioSink: TeleprompterAudioSink?
  private var isConfigured = false
  private var configurationTask: Task<Void, Error>?
  private(set) var isAudioCaptureConfigured = false
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
    try await configureAudioCaptureIfNeeded()
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
      audioSink?.setRecognitionRequest(request)

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
    audioSink?.setRecognitionRequest(nil)
    // Allow the final partial result to land before tearing down the task.
    try? await Task.sleep(for: Self.finalRecognitionDrainDelay)
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
    for _ in 0..<Self.recordingStartPollLimit where !movieOutput.isRecording {
      try? await Task.sleep(for: Self.recordingStartPollInterval)
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

    isPreviewing = false
    await stopSessionAndRemoveAudioCapture()

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

  func cancel() async {
    guard isPreviewing || isRecording || recognitionRequest != nil else { return }
    sessionID &+= 1
    isRecording = false
    recognitionRequest?.endAudio()
    audioSink?.setRecognitionRequest(nil)
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest = nil
    isSpeechRecognitionActive = false
    isPreviewing = false
    let movieOutput = self.movieOutput
    let delegate = finishDelegate
    finishDelegate = nil
    delegate?.discard()
    let shouldWaitForFileClose = movieOutput?.isRecording == true && delegate != nil
    async let fileClose: Void = shouldWaitForFileClose
      ? delegate?.waitUntilFinished() ?? ()
      : ()
    await stopSessionAndRemoveAudioCapture(stopping: movieOutput)
    await fileClose
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
    if let configurationTask {
      try await configurationTask.value
      return
    }

    let task = Task { try await performBaseSessionConfiguration() }
    configurationTask = task
    defer { configurationTask = nil }
    try await task.value
  }

  private func performBaseSessionConfiguration() async throws {
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

          let movieOutput = AVCaptureMovieFileOutput()
          guard captureSession.canAddOutput(movieOutput) else {
            captureSession.commitConfiguration()
            continuation.resume(throwing: TeleprompterCaptureError.cameraUnavailable)
            return
          }
          captureSession.addOutput(movieOutput)
          if let connection = movieOutput.connection(with: .video) {
            TeleprompterCaptureOrientation.apply(
              to: connection,
              orientation: TeleprompterCaptureOrientation.resolvedDeviceOrientation(
                UIDevice.current.orientation
              )
            )
            if connection.isVideoMirroringSupported {
              connection.automaticallyAdjustsVideoMirroring = true
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

  private func configureAudioCaptureIfNeeded() async throws {
    guard !isAudioCaptureConfigured else { return }

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      sessionQueue.async { [captureSession] in
        guard let microphone = AVCaptureDevice.default(for: .audio) else {
          continuation.resume(throwing: TeleprompterCaptureError.microphoneUnavailable)
          return
        }

        do {
          let audioInput = try AVCaptureDeviceInput(device: microphone)
          let audioOutput = AVCaptureAudioDataOutput()
          let audioSink = TeleprompterAudioSink()
          audioOutput.setSampleBufferDelegate(
            audioSink,
            queue: DispatchQueue(label: "ie.jov.jovie.teleprompter.speech")
          )

          captureSession.beginConfiguration()
          guard captureSession.canAddInput(audioInput) else {
            captureSession.commitConfiguration()
            continuation.resume(throwing: TeleprompterCaptureError.microphoneUnavailable)
            return
          }
          captureSession.addInput(audioInput)
          guard captureSession.canAddOutput(audioOutput) else {
            captureSession.removeInput(audioInput)
            captureSession.commitConfiguration()
            continuation.resume(throwing: TeleprompterCaptureError.microphoneUnavailable)
            return
          }
          captureSession.addOutput(audioOutput)
          captureSession.commitConfiguration()

          Task { @MainActor [weak self] in
            self?.audioInput = audioInput
            self?.audioOutput = audioOutput
            self?.audioSink = audioSink
            self?.isAudioCaptureConfigured = true
            continuation.resume()
          }
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  private func stopSessionAndRemoveAudioCapture(
    stopping movieOutput: AVCaptureMovieFileOutput? = nil
  ) async {
    let captureSession = self.captureSession
    let audioInput = self.audioInput
    let audioOutput = self.audioOutput
    self.audioInput = nil
    self.audioOutput = nil
    audioSink = nil
    isAudioCaptureConfigured = false

    await withCheckedContinuation { continuation in
      sessionQueue.async {
        if movieOutput?.isRecording == true {
          movieOutput?.stopRecording()
        }
        captureSession.stopRunning()
        captureSession.beginConfiguration()
        if let audioInput { captureSession.removeInput(audioInput) }
        if let audioOutput { captureSession.removeOutput(audioOutput) }
        captureSession.commitConfiguration()
        continuation.resume()
      }
    }
  }

  func applyDeviceOrientation(_ orientation: UIDeviceOrientation) {
    let resolved = TeleprompterCaptureOrientation.resolvedDeviceOrientation(orientation)
    sessionQueue.async { [movieOutput] in
      guard let connection = movieOutput?.connection(with: .video) else { return }
      TeleprompterCaptureOrientation.apply(to: connection, orientation: resolved)
    }
  }
}

/// Converts capture audio sample buffers into PCM buffers for the Speech
/// request. Runs entirely off the main actor on the output's callback queue.
private final class TeleprompterAudioSink: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate,
  @unchecked Sendable
{
  private let lock = NSLock()
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?

  func setRecognitionRequest(_ request: SFSpeechAudioBufferRecognitionRequest?) {
    lock.lock()
    recognitionRequest = request
    lock.unlock()
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard
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

    lock.lock()
    let request = recognitionRequest
    lock.unlock()
    request?.append(buffer)
  }
}

/// One-shot delegate bridging `AVCaptureFileOutputRecordingDelegate` into
/// async/await. Kept alive by the controller until finish or cancel.
final class RecordingFinishDelegate: NSObject, AVCaptureFileOutputRecordingDelegate,
  @unchecked Sendable
{
  private let lock = NSLock()
  private var continuation: CheckedContinuation<URL, Error>?
  private var finishWaiters: [CheckedContinuation<Void, Never>] = []
  private var didFinish = false

  func arm(_ continuation: CheckedContinuation<URL, Error>) {
    lock.lock()
    self.continuation = continuation
    lock.unlock()
  }

  /// Cancel path: resume any pending waiter so nothing suspends forever.
  func discard() {
    let pending = takeContinuation()
    pending?.resume(throwing: TeleprompterCaptureError.recordingFailed)
  }

  func waitUntilFinished() async {
    await withCheckedContinuation { waiter in
      lock.lock()
      if didFinish {
        lock.unlock()
        waiter.resume()
      } else {
        finishWaiters.append(waiter)
        lock.unlock()
      }
    }
  }

  func fileOutput(
    _ output: AVCaptureFileOutput,
    didFinishRecordingTo outputFileURL: URL,
    from connections: [AVCaptureConnection],
    error: (any Error)?
  ) {
    let (pending, waiters) = takeCompletionState()
    if let error {
      // `recordingWasInterrupted`-style errors still leave a playable file in
      // many cases; the controller verifies file existence separately.
      pending?.resume(throwing: error)
    } else {
      pending?.resume(returning: outputFileURL)
    }
    for waiter in waiters {
      waiter.resume()
    }
  }

  private func takeContinuation() -> CheckedContinuation<URL, Error>? {
    lock.lock()
    defer { lock.unlock() }
    let pending = continuation
    continuation = nil
    return pending
  }

  private func takeCompletionState() -> (
    CheckedContinuation<URL, Error>?,
    [CheckedContinuation<Void, Never>]
  ) {
    lock.lock()
    defer { lock.unlock() }
    let pending = continuation
    continuation = nil
    didFinish = true
    let waiters = finishWaiters
    finishWaiters.removeAll()
    return (pending, waiters)
  }
}
