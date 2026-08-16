import Foundation
import Speech
import Testing
@testable import Jovie

struct VoiceCaptureServiceTests {
  private let enabledVlogContext = VlogActivationContext(
    isEnabled: true,
    isAppActive: true,
    isEligibleSurface: true,
    allowsMotionActivation: true
  )

  @Test func vlogActivationRequiresOptIn() {
    var policy = VlogActivationPolicy()
    let disabled = VlogActivationContext(
      isEnabled: false,
      isAppActive: true,
      isEligibleSurface: true,
      allowsMotionActivation: true
    )

    #expect(policy.ingest(vlogLiftSample(at: 0), context: disabled) == .none)
    #expect(policy.ingest(vlogSteadyLandscapeSample(at: 1), context: disabled) == .none)
  }

  @Test func vlogActivationRejectsLandscapeWithoutRecentLift() {
    var policy = VlogActivationPolicy()

    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 0), context: enabledVlogContext) == .none
    )
    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 2), context: enabledVlogContext) == .none
    )
  }

  @Test func vlogActivationRequiresStableDwellAfterLift() {
    var policy = VlogActivationPolicy()

    #expect(policy.ingest(vlogLiftSample(at: 0), context: enabledVlogContext) == .none)
    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 0.2), context: enabledVlogContext)
        == .candidateStarted
    )
    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 0.4), context: enabledVlogContext) == .none
    )
    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 0.6), context: enabledVlogContext) == .none
    )
    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 0.8), context: enabledVlogContext) == .none
    )
    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 1.0), context: enabledVlogContext)
        == .activate
    )
  }

  @Test func vlogActivationCancelsWhenPostureIsLost() {
    var policy = VlogActivationPolicy()

    _ = policy.ingest(vlogLiftSample(at: 0), context: enabledVlogContext)
    _ = policy.ingest(vlogSteadyLandscapeSample(at: 0.2), context: enabledVlogContext)
    let portrait = VlogActivationSample(
      timestamp: 0.5,
      isLandscape: false,
      gravityX: 0,
      gravityZ: 0,
      userAccelerationMagnitude: 0.01
    )

    #expect(
      policy.ingest(portrait, context: enabledVlogContext)
        == .candidateCancelled(.postureLost)
    )
    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 1.2), context: enabledVlogContext) == .none
    )
  }

  @Test func vlogActivationCooldownPreventsImmediateReentry() {
    var policy = VlogActivationPolicy()
    _ = policy.ingest(vlogLiftSample(at: 0), context: enabledVlogContext)
    _ = policy.ingest(vlogSteadyLandscapeSample(at: 0.2), context: enabledVlogContext)
    _ = policy.ingest(vlogSteadyLandscapeSample(at: 0.4), context: enabledVlogContext)
    _ = policy.ingest(vlogSteadyLandscapeSample(at: 0.6), context: enabledVlogContext)
    _ = policy.ingest(vlogSteadyLandscapeSample(at: 0.8), context: enabledVlogContext)
    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 1.0), context: enabledVlogContext)
        == .activate
    )

    #expect(policy.ingest(vlogLiftSample(at: 2), context: enabledVlogContext) == .none)
    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 3), context: enabledVlogContext) == .none
    )
  }

  @Test func vlogActivationDisablesAutomaticPathForAssistiveControl() {
    var policy = VlogActivationPolicy()
    let accessibilityContext = VlogActivationContext(
      isEnabled: true,
      isAppActive: true,
      isEligibleSurface: true,
      allowsMotionActivation: false
    )

    _ = policy.ingest(vlogLiftSample(at: 0), context: accessibilityContext)
    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 1), context: accessibilityContext) == .none
    )
  }

  @Test func vlogActivationCancelsWhenSurfaceBecomesBlocked() {
    var policy = VlogActivationPolicy()
    _ = policy.ingest(vlogLiftSample(at: 0), context: enabledVlogContext)
    _ = policy.ingest(vlogSteadyLandscapeSample(at: 0.2), context: enabledVlogContext)
    let blocked = VlogActivationContext(
      isEnabled: true,
      isAppActive: true,
      isEligibleSurface: false,
      allowsMotionActivation: true
    )

    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 0.5), context: blocked)
        == .candidateCancelled(.surfaceBlocked)
    )
  }

  @Test func vlogActivationRejectsExpiredLift() {
    var policy = VlogActivationPolicy()
    _ = policy.ingest(vlogLiftSample(at: 0), context: enabledVlogContext)

    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 2.6), context: enabledVlogContext) == .none
    )
  }

  @Test func vlogActivationRequiresNewLiftAfterCandidateMovesAgain() {
    var policy = VlogActivationPolicy()
    _ = policy.ingest(vlogLiftSample(at: 0), context: enabledVlogContext)
    _ = policy.ingest(vlogSteadyLandscapeSample(at: 0.2), context: enabledVlogContext)
    let movingLandscape = VlogActivationSample(
      timestamp: 0.4,
      isLandscape: true,
      gravityX: 0.9,
      gravityZ: 0.1,
      userAccelerationMagnitude: 0.16
    )

    #expect(
      policy.ingest(movingLandscape, context: enabledVlogContext)
        == .candidateCancelled(.motionContinued)
    )
    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 1.2), context: enabledVlogContext) == .none
    )
  }

  @Test func manualVlogActivationStartsCooldown() {
    var policy = VlogActivationPolicy()
    policy.recordManualActivation(at: 0)

    #expect(policy.ingest(vlogLiftSample(at: 1), context: enabledVlogContext) == .none)
    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 2), context: enabledVlogContext) == .none
    )
  }

  @Test func vlogActivationRejectsDroppedSamplesDuringDwell() {
    var policy = VlogActivationPolicy()
    _ = policy.ingest(vlogLiftSample(at: 0), context: enabledVlogContext)
    _ = policy.ingest(vlogSteadyLandscapeSample(at: 0.2), context: enabledVlogContext)

    #expect(
      policy.ingest(vlogSteadyLandscapeSample(at: 0.6), context: enabledVlogContext)
        == .candidateCancelled(.sampleGap)
    )
  }

  private func vlogLiftSample(at timestamp: TimeInterval) -> VlogActivationSample {
    VlogActivationSample(
      timestamp: timestamp,
      isLandscape: false,
      gravityX: 0.1,
      gravityZ: -0.9,
      userAccelerationMagnitude: 0.24
    )
  }

  private func vlogSteadyLandscapeSample(at timestamp: TimeInterval) -> VlogActivationSample {
    VlogActivationSample(
      timestamp: timestamp,
      isLandscape: true,
      gravityX: 0.92,
      gravityZ: 0.08,
      userAccelerationMagnitude: 0.02
    )
  }

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

  @Test func emptyTranscriptErrorCopyIsUserFacing() {
    #expect(VoiceCaptureError.emptyTranscript.errorDescription == "Nothing heard.")
  }

  @Test func voiceMemoInsertIsDraftNotAutoSend() {
    // Contract: Talk overlay → AppShell uses shellHandoff (draft only, never auto-send).
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
}
