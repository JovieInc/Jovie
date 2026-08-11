import Foundation
import Speech
import Testing
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
    follower.ingest(transcript: "one two")
    follower.previewSeek(to: 5)
    #expect(follower.nextWordIndex == 5)
    #expect(follower.alignment == .manual)

    follower.resume(at: 5)
    follower.ingest(transcript: "six seven")
    #expect(follower.nextWordIndex == 7)
    #expect(follower.alignment == .aligned)
  }

  @Test func localVlogStoreKeepsScriptVideoAndTimingLinkage() throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
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
}
