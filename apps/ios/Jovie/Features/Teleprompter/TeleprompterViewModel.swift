import Foundation
import Observation

/// How the prompt advances while recording (JOV-5075). Voice follow is the
/// default; the speed override is a deliberate user escape hatch.
enum TeleprompterFollowMode: String, Equatable, Sendable {
  case voice
  case auto
}

/// Overlay presentations. Same overlay, two framings (JOV-5075): the notch
/// strip keeps the script next to the camera; fullscreen enlarges the script
/// for rehearsal-style reading.
enum TeleprompterPresentationMode: String, Equatable, Sendable, CaseIterable {
  case notch
  case fullscreen

  var title: String {
    switch self {
    case .notch: return "Notch"
    case .fullscreen: return "Full"
    }
  }
}

/// Pure speed-override math (unit-testable without audio/camera hardware):
/// advances the prompt at a fixed reading speed from the word where auto
/// mode was engaged.
struct TeleprompterAutoScroller: Equatable, Sendable {
  static let defaultWordsPerMinute: Double = 130
  static let minimumWordsPerMinute: Double = 60
  static let maximumWordsPerMinute: Double = 220

  var wordsPerMinute: Double = Self.defaultWordsPerMinute

  func wordIndex(
    startIndex: Int,
    elapsedSeconds: TimeInterval,
    wordCount: Int
  ) -> Int {
    guard wordCount > 0, elapsedSeconds > 0 else {
      return min(max(startIndex, 0), wordCount)
    }
    let advanced = startIndex + Int(elapsedSeconds * wordsPerMinute / 60)
    return min(max(advanced, 0), wordCount)
  }
}

/// Teleprompter overlay state (JOV-5075): owns the karaoke follower, the
/// capture controller, and the on-disk vlog session. The script auto-loads
/// from the chat proposal and stays editable until recording starts.
@MainActor
@Observable
final class TeleprompterViewModel {
  let proposal: MobileChatVideoProposalPayload
  var scriptTitle: String
  var scriptText: String

  private(set) var follower: KaraokeScriptFollower
  var presentationMode: TeleprompterPresentationMode = .notch
  private(set) var followMode: TeleprompterFollowMode = .voice
  var speedWordsPerMinute: Double = TeleprompterAutoScroller.defaultWordsPerMinute
  var isEditingScript = false

  private(set) var isStarting = false
  private(set) var isRecording = false
  private(set) var isFinishing = false
  private(set) var elapsedSeconds: TimeInterval = 0
  private(set) var errorMessage: String?
  private(set) var savedRecord: VlogSessionRecord?

  let captureController: TeleprompterCaptureController
  private let store: VlogSessionStore
  private var activeRecord: VlogSessionRecord?
  private var activeVideoURL: URL?
  private var autoScroller = TeleprompterAutoScroller()
  private var autoStartIndex = 0
  private var autoStartElapsed: TimeInterval = 0
  private var autoIndex = 0
  private var tickerTask: Task<Void, Never>?

  /// Called after a recording is saved to the on-disk session store. The
  /// shell uses this to dismiss the overlay and surface Library.
  var onSaved: ((VlogSessionRecord) -> Void)?

  init(
    proposal: MobileChatVideoProposalPayload,
    store: VlogSessionStore = .localDocuments(),
    captureController: TeleprompterCaptureController = TeleprompterCaptureController()
  ) {
    self.proposal = proposal
    scriptTitle = proposal.title
    scriptText = proposal.script
    follower = KaraokeScriptFollower(script: proposal.script)
    self.store = store
    self.captureController = captureController
  }

  var displayWords: [String] {
    follower.displayWords
  }

  var alignment: KaraokeAlignment {
    follower.alignment
  }

  var currentWordIndex: Int {
    switch followMode {
    case .voice:
      return follower.nextWordIndex
    case .auto:
      return autoIndex
    }
  }

  var isUsingOnDeviceRecognition: Bool {
    captureController.isUsingOnDeviceRecognition
  }

  var progress: Double {
    follower.progress
  }

  /// Inline script edit (pre-recording only): rebuild the follower so the
  /// prompt tracks the edited text from the top.
  func commitScriptEdits() {
    isEditingScript = false
    guard !isRecording else { return }
    follower = KaraokeScriptFollower(script: scriptText)
    followMode = .voice
    autoIndex = 0
  }

  /// Tap-to-seek: jump the prompt to a word and keep voice-following from
  /// there.
  func seek(to wordIndex: Int) {
    follower.resume(at: wordIndex)
    followMode = .voice
  }

  /// Speed override: advance at `speedWordsPerMinute` from the current word,
  /// independent of the speech track. Voice follow keeps ingesting in the
  /// background so returning to voice mode re-syncs cleanly.
  func engageSpeedOverride() {
    guard followMode != .auto else { return }
    autoScroller.wordsPerMinute = speedWordsPerMinute
    autoStartIndex = follower.nextWordIndex
    autoStartElapsed = elapsedSeconds
    autoIndex = follower.nextWordIndex
    followMode = .auto
  }

  func resumeVoiceFollow() {
    followMode = .voice
  }

  func startRecording() async {
    guard !isRecording, !isStarting, !isFinishing else { return }
    errorMessage = nil
    isEditingScript = false
    isStarting = true
    defer { isStarting = false }

    follower = KaraokeScriptFollower(script: scriptText)
    followMode = .voice
    autoIndex = 0
    elapsedSeconds = 0

    do {
      let (record, videoURL) = try store.create(
        scriptTitle: scriptTitle,
        scriptText: scriptText
      )
      activeRecord = record
      activeVideoURL = videoURL

      captureController.onPartialTranscript = { [weak self] transcript in
        guard let self else { return }
        // Keep ingesting in every follow mode so voice re-sync is instant.
        self.follower.ingest(transcript: transcript)
      }

      try await captureController.start(videoURL: videoURL)
      isRecording = true
      startTicker()
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription
        ?? "Couldn't start the recording."
      markActiveRecordFailed()
      captureController.cancel()
    }
  }

  func stopRecording() async {
    guard isRecording, !isFinishing else { return }
    isFinishing = true
    defer { isFinishing = false }
    stopTicker()

    do {
      let result = try await captureController.stop()
      isRecording = false

      guard var record = activeRecord else { return }
      record.status = .completed
      record.endedAt = Date()
      record.transcript = result.transcript
      record.segments = result.segments
      try store.save(record)
      activeRecord = nil
      activeVideoURL = nil
      savedRecord = record
      onSaved?(record)
    } catch {
      isRecording = false
      errorMessage = (error as? LocalizedError)?.errorDescription
        ?? "The recording couldn't be saved."
      markActiveRecordFailed()
      captureController.cancel()
    }
  }

  /// Dismiss path: stop capture, mark the session failed, keep whatever
  /// partial file exists for debugging but never surface it in Library.
  func cancelRecording() {
    stopTicker()
    guard isRecording || isStarting else { return }
    isRecording = false
    isStarting = false
    markActiveRecordFailed()
    captureController.cancel()
  }

  private func startTicker() {
    tickerTask?.cancel()
    tickerTask = Task { [weak self] in
      var last = ContinuousClock.now
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(100))
        guard let self, !Task.isCancelled else { return }
        let now = ContinuousClock.now
        let delta = last.duration(to: now)
        last = now
        guard self.isRecording else { continue }
        self.elapsedSeconds +=
          Double(delta.components.seconds)
          + Double(delta.components.attoseconds) / 1e18
        if self.followMode == .auto {
          self.autoIndex = self.autoScroller.wordIndex(
            startIndex: self.autoStartIndex,
            elapsedSeconds: self.elapsedSeconds - self.autoStartElapsed,
            wordCount: self.follower.displayWords.count
          )
        }
      }
    }
  }

  private func stopTicker() {
    tickerTask?.cancel()
    tickerTask = nil
  }

  private func markActiveRecordFailed() {
    guard var record = activeRecord else { return }
    record.status = .failed
    record.endedAt = Date()
    try? store.save(record)
    activeRecord = nil
    activeVideoURL = nil
  }
}
