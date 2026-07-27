import Speech
import Testing
@testable import Jovie

struct VoiceCaptureServiceTests {
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
      provenance: AudioTranscriptionProvenance(
        source: .speechRecognition,
        provider: .appleSpeech,
        execution: .onDevice,
        locale: "en-US",
        modelID: nil
      )
    )
    #expect(result.transcript == "draft a drop")
    #expect(result.usedOnDeviceRecognition == true)
    #expect(result.latencyMilliseconds == 120)
    #expect(result.provenance.provider == .appleSpeech)
    #expect(result.provenance.execution == .onDevice)
  }

  @Test func transcriptionErrorsMapToCanonicalCodes() {
    #expect(VoiceCaptureError.microphoneDenied.transcriptionCode == .permissionDenied)
    #expect(VoiceCaptureError.speechDenied.transcriptionCode == .permissionDenied)
    #expect(VoiceCaptureError.recognizerUnavailable.transcriptionCode == .unavailable)
    #expect(VoiceCaptureError.emptyTranscript.transcriptionCode == .emptyTranscript)
    #expect(VoiceCaptureError.notRecording.transcriptionCode == .aborted)
  }

  @Test func generatedTranscriptionRegistryHasExpectedCrossPlatformValues() {
    #expect(AudioTranscriptionStatus.allCases.map(\.rawValue) == [
      "idle", "requesting-permission", "listening", "partial", "processing",
      "completed", "empty", "cancelled", "failed", "unsupported",
    ])
    #expect(AudioTranscriptionProviderID.allCases.map(\.rawValue) == [
      "user", "youtube-captions", "web-speech", "apple-speech", "server-asr", "none",
    ])
    #expect(AudioTranscriptionExecution.allCases.map(\.rawValue) == [
      "provided", "on-device", "network", "provider-managed", "unavailable",
    ])
    #expect(
      nextAudioTranscriptionStatus(.idle, event: .permissionRequested)
        == .requestingPermission
    )
    #expect(
      nextAudioTranscriptionStatus(.requestingPermission, event: .captureStarted)
        == .listening
    )
    #expect(
      nextAudioTranscriptionStatus(.partial, event: .captureStopped)
        == .processing
    )
    #expect(
      nextAudioTranscriptionStatus(.processing, event: .finalResult)
        == .completed
    )
    #expect(
      nextAudioTranscriptionStatus(.completed, event: .captureStarted)
        == .completed
    )
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
