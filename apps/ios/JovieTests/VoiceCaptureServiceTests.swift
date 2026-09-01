import AVFoundation
import Foundation
import Speech
import Testing
import UIKit
@testable import Jovie

struct VoiceCaptureServiceTests {
  @Test func teleprompterFollowsWordsAndRecoversAfterOffScriptSpeech() {
    var follower = KaraokeScriptFollower(
      script: "Today we are building a calmer path for independent artists"
    )

    follower.ingest(transcript: "Today we are building")
    #expect(follower.nextWordIndex == 4)
    #expect(follower.alignment == .aligned)

    follower.ingest(transcript: "Today we are building honestly this part is a rant")
    #expect(follower.nextWordIndex == 4)
    #expect(follower.alignment == .offScript)

    follower.ingest(
      transcript: "Today we are building honestly this part is a rant a calmer path for"
    )
    #expect(follower.nextWordIndex == 8)
    #expect(follower.alignment == .aligned)
  }

  @Test func teleprompterManualResumeReanchorsWithoutEndingCapture() {
    var follower = KaraokeScriptFollower(script: "one two three four five six seven")
    follower.ingest(transcript: "one two three")
    follower.previewSeek(to: 5)
    #expect(follower.nextWordIndex == 5)
    #expect(follower.alignment == .manual)

    follower.resume(at: 5)
    follower.ingest(transcript: "one two three six seven")
    #expect(follower.nextWordIndex == 7)
    #expect(follower.alignment == .aligned)
  }

  @Test func teleprompterSkipsPunctuationOnlyScriptTokens() {
    var follower = KaraokeScriptFollower(script: "hello — artists")

    follower.ingest(transcript: "hello artists")

    #expect(follower.displayWords == ["hello", "artists"])
    #expect(follower.nextWordIndex == 2)
    #expect(follower.alignment == .aligned)
  }

  @Test func localVlogStoreKeepsScriptVideoAndTimingLinkage() throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = VlogSessionStore(rootURL: root)
    let (created, videoURL) = try store.create(
      scriptTitle: "Founder take",
      scriptText: "hello artists"
    )

    var completed = created
    completed.status = .completed
    completed.endedAt = Date(timeIntervalSince1970: 123)
    completed.transcript = "hello artists"
    completed.segments = [
      VlogWordTiming(word: "hello", startSeconds: 0.2, durationSeconds: 0.4, confidence: 0.9),
    ]
    try store.save(completed)

    let loaded = try store.load(id: completed.id)
    #expect(loaded.scriptID == completed.scriptID)
    #expect(loaded.scriptText == "hello artists")
    #expect(loaded.videoFilename == videoURL.lastPathComponent)
    #expect(loaded.transcript == "hello artists")
    #expect(loaded.segments.first?.startSeconds == 0.2)
    #expect(loaded.storageMode == "local_only_no_upload")
    #expect(FileManager.default.fileExists(atPath: store.metadataURL(for: loaded).path))
  }

  @Test func localVlogStoreDeletesCancelledPrivateTake() throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = VlogSessionStore(rootURL: root)
    let (record, videoURL) = try store.create(
      scriptTitle: "Cancelled take",
      scriptText: "private draft"
    )
    try Data("partial creator media".utf8).write(to: videoURL)

    try store.delete(record)

    #expect(!FileManager.default.fileExists(atPath: store.metadataURL(for: record).path))
    #expect(!FileManager.default.fileExists(atPath: videoURL.path))
  }

  @Test func recordingFinishDelegateResumesOnlyOnceWhenCancelRacesCallback() async {
    for _ in 0..<100 {
      let delegate = RecordingFinishDelegate()
      let url = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString)

      _ = try? await withCheckedThrowingContinuation {
        (continuation: CheckedContinuation<URL, Error>) in
        delegate.arm(continuation)
        DispatchQueue.global().async {
          delegate.discard()
        }
        DispatchQueue.global().async {
          delegate.fileOutput(
            AVCaptureMovieFileOutput(),
            didFinishRecordingTo: url,
            from: [],
            error: nil
          )
        }
      }
    }
  }

  @MainActor
  @Test func cancelKeepsRestartBlockedUntilPrivateTakeTeardownFinishes() async throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = VlogSessionStore(rootURL: root)
    let controller = SuspendingTeleprompterCaptureController()
    controller.suspendCancel = true
    let viewModel = TeleprompterViewModel(
      proposal: .quickVlog,
      store: store,
      captureController: controller
    )

    await viewModel.startRecording()
    #expect(viewModel.isRecording)
    #expect(controller.startCallCount == 1)
    #expect(store.recent().count == 1)

    let cancelTask = Task { @MainActor in
      await viewModel.cancelRecording()
    }
    await controller.waitUntilCancelStarts()

    #expect(viewModel.isFinishing)
    #expect(!viewModel.isRecording)
    await viewModel.startRecording()
    await viewModel.stopRecording()
    #expect(await viewModel.cancelRecording() == false)
    #expect(controller.startCallCount == 1)
    #expect(store.recent().count == 1)

    controller.resumeCancel()
    #expect(await cancelTask.value)
    #expect(!viewModel.isFinishing)
    #expect(store.recent().isEmpty)
  }

  @MainActor
  @Test func cancelInvalidatesAStartThatFinishesAfterDismissal() async throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = VlogSessionStore(rootURL: root)
    let controller = SuspendingTeleprompterCaptureController()
    controller.suspendStart = true
    let viewModel = TeleprompterViewModel(
      proposal: .quickVlog,
      store: store,
      captureController: controller
    )

    let startTask = Task { @MainActor in
      await viewModel.startRecording()
    }
    await controller.waitUntilStartBegins()
    #expect(viewModel.isStarting)
    #expect(store.recent().count == 1)

    #expect(await viewModel.cancelRecording())
    #expect(viewModel.isStarting)
    #expect(!viewModel.isRecording)
    #expect(store.recent().isEmpty)

    controller.resumeStart()
    await startTask.value
    #expect(!viewModel.isStarting)
    #expect(!viewModel.isRecording)
    #expect(controller.cancelCallCount == 2)
    #expect(store.recent().isEmpty)
  }

  #if !targetEnvironment(simulator)
    @MainActor
    @Test func cameraPreviewDoesNotActivateAudioCaptureBeforeRecord() async throws {
      let controller = TeleprompterCaptureController()
      try await controller.startPreview()

      #expect(controller.isPreviewing)
      #expect(!controller.isAudioCaptureConfigured)

      await controller.cancel()
    }
  #endif

  @Test func actionDraftTrimsWhitespace() {
    #expect(VoiceMemoActionDraft.make(fromTranscript: "  launch single Friday  ") == "launch single Friday")
    #expect(VoiceMemoActionDraft.make(fromTranscript: "\n\tpromo plan\n") == "promo plan")
    #expect(VoiceMemoActionDraft.make(fromTranscript: "   ") == "")
  }

  @Test func actionDraftReadyRequiresNonEmptyText() {
    #expect(VoiceMemoActionDraft.isReady("schedule release") == true)
    #expect(VoiceMemoActionDraft.isReady("  ") == false)
    #expect(VoiceMemoActionDraft.isReady("") == false)
  }

  @Test func recognitionConfigPrefersOnDeviceWhenSupported() {
    let request = SFSpeechAudioBufferRecognitionRequest()
    let recognizer = SFSpeechRecognizer()

    // Device-dependent: when OS reports on-device support, config must force it.
    // When unsupported, must leave network path available (requiresOnDevice = false).
    let preferred = VoiceCaptureRecognitionConfig.configure(request, recognizer: recognizer)
    #expect(request.shouldReportPartialResults == true)
    #expect(request.requiresOnDeviceRecognition == preferred)
    #expect(preferred == VoiceCaptureRecognitionConfig.preferOnDevice(for: recognizer))
  }

  @Test func recognitionConfigWithNilRecognizerDoesNotRequireOnDevice() {
    let request = SFSpeechAudioBufferRecognitionRequest()
    let preferred = VoiceCaptureRecognitionConfig.configure(request, recognizer: nil)
    #expect(preferred == false)
    #expect(request.requiresOnDeviceRecognition == false)
    #expect(request.shouldReportPartialResults == true)
  }

  @Test func permissionErrorCopyPointsToSettings() {
    #expect(
      VoiceCaptureError.microphoneDenied.errorDescription?
        .contains("Settings") == true
    )
    #expect(
      VoiceCaptureError.speechDenied.errorDescription?
        .contains("Settings") == true
    )
  }

  @Test func captureResultCarriesOnDeviceFlag() {
    let result = VoiceCaptureResult(
      transcript: "draft a drop",
      latencyMilliseconds: 120,
      usedOnDeviceRecognition: true
    )
    #expect(result.transcript == "draft a drop")
    #expect(result.usedOnDeviceRecognition == true)
    #expect(result.latencyMilliseconds == 120)
  }

  @Test func eyesFreeGateKeepsSummerFounderOnlyAndSurfacesOfflineRetry() {
    func gate(
      destination: EyesFreeCaptureDestination,
      canUseSummer: Bool,
      isOffline: Bool
    ) -> EyesFreeCaptureGate {
      EyesFreeCaptureGate.resolve(
        isSignedIn: true,
        chatEnabled: true,
        isOffline: isOffline,
        destination: destination,
        canUseSummer: canUseSummer
      )
    }
    #expect(gate(destination: .jovie, canUseSummer: false, isOffline: false) == .ready)
    #expect(gate(destination: .summer, canUseSummer: false, isOffline: false) == .summerForbidden)
    #expect(gate(destination: .jovie, canUseSummer: true, isOffline: true) == .offline)
    #expect(EyesFreeCaptureGate.summerForbidden.message.contains("founder"))
  }

  @Test func emptyTranscriptErrorCopyIsUserFacing() {
    #expect(VoiceCaptureError.emptyTranscript.errorDescription == "Nothing heard.")
  }

  @Test func failedVoiceCompletionCanPreserveARecoveryDraftWithoutAutoSend() {
    // Recovery contract: a direct-completion failure preserves editable text.
    let handoff = VoiceMemoActionDraft.shellHandoff(
      fromTranscript: "  schedule release next Friday  "
    )
    #expect(handoff.chatDraft == "schedule release next Friday")
    #expect(VoiceMemoActionDraft.isReady(handoff.chatDraft))
    #expect(handoff.autoSendMessage == nil)

    let empty = VoiceMemoActionDraft.shellHandoff(fromTranscript: "   ")
    #expect(empty.chatDraft == "")
    #expect(empty.autoSendMessage == nil)
    #expect(VoiceMemoActionDraft.isReady(empty.chatDraft) == false)
  }

  @Test func autoScrollerAdvancesAtConfiguredSpeedAndClamps() {
    let scroller = TeleprompterAutoScroller(wordsPerMinute: 120)

    // 120 wpm = 2 words/second. Start at word 4.
    #expect(scroller.wordIndex(startIndex: 4, elapsedSeconds: 0, wordCount: 20) == 4)
    #expect(scroller.wordIndex(startIndex: 4, elapsedSeconds: 1.4, wordCount: 20) == 6)
    #expect(scroller.wordIndex(startIndex: 4, elapsedSeconds: 3, wordCount: 20) == 10)
    // Clamp at the end of the script, never beyond.
    #expect(scroller.wordIndex(startIndex: 4, elapsedSeconds: 60, wordCount: 20) == 20)
    // Empty scripts never crash and pin to 0.
    #expect(scroller.wordIndex(startIndex: 4, elapsedSeconds: 5, wordCount: 0) == 0)
  }

  @Test func teleprompterFallsBackToManualPromptWithoutOnDeviceSpeech() {
    #expect(
      TeleprompterSpeechMode.resolve(
        isAuthorized: false,
        isAvailable: true,
        supportsOnDevice: true
      ) == .manual
    )
    #expect(
      TeleprompterSpeechMode.resolve(
        isAuthorized: true,
        isAvailable: false,
        supportsOnDevice: true
      ) == .manual
    )
    #expect(
      TeleprompterSpeechMode.resolve(
        isAuthorized: true,
        isAvailable: true,
        supportsOnDevice: false
      ) == .manual
    )
    #expect(
      TeleprompterSpeechMode.resolve(
        isAuthorized: true,
        isAvailable: true,
        supportsOnDevice: true
      ) == .onDevice
    )
  }

  @Test func karaokeHoldsDuringTangentAndRejoinsOnlyOnStrongSuffix() {
    var follower = KaraokeScriptFollower(
      script: "one two three four five six seven eight"
    )

    follower.ingest(transcript: "one two")
    #expect(follower.nextWordIndex == 2)

    follower.ingest(transcript: "one two tangent tangent")
    #expect(follower.alignment == .offScript)
    #expect(follower.nextWordIndex == 2)

    // A single coincidental script word does not move the held prompt.
    follower.ingest(transcript: "one two tangent tangent three")
    #expect(follower.nextWordIndex == 2)

    // A long, unambiguous suffix re-anchors automatically while recording.
    follower.ingest(
      transcript: "one two tangent tangent three four five six seven eight"
    )
    #expect(follower.alignment == .aligned)
    #expect(follower.nextWordIndex == 8)
  }

  @Test func librarySurfacesOnlyCompletedVlogSessionsWithVideoOnDisk() throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = VlogSessionStore(rootURL: root)

    let (completed, completedVideoURL) = try store.create(
      scriptTitle: "Release day shout-out",
      scriptText: "hello artists"
    )
    FileManager.default.createFile(atPath: completedVideoURL.path, contents: Data([0x00]))
    var completedRecord = completed
    completedRecord.status = .completed
    try store.save(completedRecord)

    let (recording, _) = try store.create(scriptTitle: "In progress", scriptText: "still talking")
    let (missingFile, _) = try store.create(scriptTitle: "Lost file", scriptText: "gone")
    var missingFileRecord = missingFile
    missingFileRecord.status = .completed
    try store.save(missingFileRecord)

    let assets = LibraryVlogVideos.assets(
      from: store.recent(),
      store: store,
      now: completedRecord.createdAt.addingTimeInterval(90)
    )

    #expect(assets.count == 1)
    #expect(assets[0].id == "vlog-\(completedRecord.id.uuidString)")
    #expect(assets[0].name == "Release day shout-out")
    #expect(assets[0].type == .video)
    #expect(assets[0].isPublic == false)
    #expect(assets[0].localVideoURL == completedVideoURL)
    #expect(assets[0].liveStatLabel == "Recorded 1m ago")
    // Recording-in-progress sessions never surface.
    #expect(assets.contains { $0.id == "vlog-\(recording.id.uuidString)" } == false)
  }

  @MainActor
  @Test func teleprompterViewModelTracksEditsSeekAndSpeedOverride() {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }

    let proposal = MobileChatVideoProposalPayload(
      kind: .promo,
      title: "Release day shout-out",
      script: "one two three four"
    )
    let viewModel = TeleprompterViewModel(
      proposal: proposal,
      store: VlogSessionStore(rootURL: root)
    )

    // Script auto-loads from the proposing context.
    #expect(viewModel.scriptTitle == "Release day shout-out")
    #expect(viewModel.displayWords == ["one", "two", "three", "four"])

    // Inline edit rebuilds the follower from the top.
    viewModel.isEditingScript = true
    viewModel.scriptText = "alpha beta gamma"
    viewModel.commitScriptEdits()
    #expect(viewModel.displayWords == ["alpha", "beta", "gamma"])
    #expect(viewModel.currentWordIndex == 0)

    // Tap-to-seek re-anchors voice follow.
    viewModel.seek(to: 2)
    #expect(viewModel.currentWordIndex == 2)
    #expect(viewModel.alignment == .aligned)

    // Speed override switches to auto from the current word; voice resumes.
    viewModel.engageSpeedOverride()
    #expect(viewModel.followMode == .auto)
    viewModel.resumeVoiceFollow()
    #expect(viewModel.followMode == .voice)
    #expect(viewModel.currentWordIndex == 2)
  }

  @Test func landscapeScriptRegionStaysCompactSoControlsRemain() {
    #expect(
      TeleprompterCaptureOrientation.scriptRegionHeight(
        isLandscape: true,
        presentationMode: .fullscreen
      ) == 72
    )
    #expect(
      TeleprompterCaptureOrientation.scriptRegionHeight(
        isLandscape: false,
        presentationMode: .notch
      ) == 120
    )
  }

  @Test func teleprompterRotationTurnsNinetyNotOneHundredEighty() {
    #expect(TeleprompterCaptureOrientation.videoRotationAngle(for: .portrait) == 90)
    #expect(TeleprompterCaptureOrientation.videoRotationAngle(for: .landscapeRight) == 0)
    #expect(TeleprompterCaptureOrientation.videoRotationAngle(for: .landscapeLeft) == 180)
    #expect(TeleprompterCaptureOrientation.videoRotationAngle(for: .portraitUpsideDown) == 270)
    #expect(TeleprompterCaptureOrientation.resolvedDeviceOrientation(.faceUp) == .portrait)
  }

  @MainActor
  @Test func quickVlogLaunchesPromptFirstWithoutChangingChatProposalDefaults() {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }

    let quickVlog = MobileChatVideoProposalPayload.quickVlog
    let quickViewModel = TeleprompterViewModel(
      proposal: quickVlog,
      store: VlogSessionStore(rootURL: root)
    )
    #expect(quickVlog.title == "Quick Vlog")
    #expect(quickVlog.script == "What do you want to share?")
    #expect(quickViewModel.contentMode == .prompt)
    #expect(quickViewModel.promptText == "What do you want to share?")

    let chatProposal = MobileChatVideoProposalPayload(
      kind: .promo,
      title: "Release Day",
      script: "Tell fans why this song matters."
    )
    let chatViewModel = TeleprompterViewModel(
      proposal: chatProposal,
      store: VlogSessionStore(rootURL: root)
    )
    #expect(chatViewModel.contentMode == .script)
    #expect(chatViewModel.promptText == "Release Day")
  }

  @MainActor
  @Test func teleprompterOverlayStatesStayIndependentAndFeedbackQueuesLocally() async throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }

    let proposal = MobileChatVideoProposalPayload(
      kind: .bts,
      title: "What changed when the ferry arrived?",
      script: "The ferry is not where the story starts."
    )
    let store = VlogSessionStore(rootURL: root)
    let viewModel = TeleprompterViewModel(
      proposal: proposal,
      store: store,
      overlayAutoResumeDelay: .milliseconds(20),
      overlayAutoResumeSleeper: { _ in }
    )

    #expect(viewModel.promptText == "What changed when the ferry arrived?")
    #expect(viewModel.overlayVisibility == .visible)
    #expect(viewModel.framingGrid == .off)
    #expect(viewModel.promptFeedback == .idle)
    #expect(TeleprompterViewModel.defaultOverlayAutoResumeDelay == .seconds(3))

    viewModel.setFramingGridEnabled(true)
    viewModel.setOverlayVisible(false)
    #expect(viewModel.overlayVisibility == .liveOnly)
    #expect(viewModel.framingGrid == .thirds)

    for _ in 0..<20 where viewModel.overlayVisibility == .liveOnly {
      await Task.yield()
    }
    #expect(viewModel.overlayVisibility == .visible)
    #expect(viewModel.framingGrid == .thirds)

    viewModel.setFramingGridEnabled(false)
    #expect(viewModel.framingGrid == .off)

    // The still-visible control can restore the prompt immediately, without
    // waiting for the temporary live-only window to expire.
    viewModel.setOverlayVisible(false)
    viewModel.setOverlayVisible(true)
    #expect(viewModel.overlayVisibility == .visible)

    viewModel.submitPromptFeedback(.useful)
    #expect(viewModel.promptFeedback == .queuedOffline)
    #expect(viewModel.pendingPromptFeedback == .useful)
    let queuedFeedback = store.queuedPromptFeedback()
    #expect(queuedFeedback.count == 1)
    #expect(queuedFeedback[0].proposalID == proposal.id)
    #expect(queuedFeedback[0].feedback == TeleprompterPromptFeedback.useful.rawValue)
    #expect(queuedFeedback[0].storageMode == "local_only_no_upload")

    viewModel.submitPromptFeedback(.notUseful)
    #expect(viewModel.promptFeedback == .queuedOffline)
    #expect(viewModel.pendingPromptFeedback == .notUseful)
    #expect(store.queuedPromptFeedback().contains { record in
      record.feedback == TeleprompterPromptFeedback.notUseful.rawValue
    })

    let queuedCount = store.queuedPromptFeedback().count
    viewModel.submitPromptFeedback(.idle)
    #expect(store.queuedPromptFeedback().count == queuedCount)
  }
}

@MainActor
private final class SuspendingTeleprompterCaptureController: TeleprompterCaptureControlling {
  let captureSession = AVCaptureSession()
  var isUsingOnDeviceRecognition = false
  var isSpeechRecognitionActive = false
  var onPartialTranscript: ((String) -> Void)?
  var suspendStart = false
  var suspendCancel = false
  private(set) var startCallCount = 0
  private(set) var cancelCallCount = 0

  private var startContinuation: CheckedContinuation<Void, Never>?
  private var cancelContinuation: CheckedContinuation<Void, Never>?

  func startPreview() async throws {}

  func start(videoURL _: URL) async throws {
    startCallCount += 1
    guard suspendStart else { return }
    await withCheckedContinuation { continuation in
      startContinuation = continuation
    }
  }

  func stop() async throws -> TeleprompterCaptureResult {
    throw TeleprompterCaptureError.notRecording
  }

  func cancel() async {
    cancelCallCount += 1
    guard suspendCancel else { return }
    await withCheckedContinuation { continuation in
      cancelContinuation = continuation
    }
  }

  func applyDeviceOrientation(_: UIDeviceOrientation) {}

  func waitUntilStartBegins() async {
    while startCallCount == 0 || startContinuation == nil {
      await Task.yield()
    }
  }

  func waitUntilCancelStarts() async {
    while cancelCallCount == 0 || cancelContinuation == nil {
      await Task.yield()
    }
  }

  func resumeStart() {
    startContinuation?.resume()
    startContinuation = nil
  }

  func resumeCancel() {
    cancelContinuation?.resume()
    cancelContinuation = nil
  }
}
