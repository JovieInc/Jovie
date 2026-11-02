import Foundation
import Testing
@testable import Jovie

final class RecordingObservabilitySpan: ObservabilitySpan {
  private(set) var finishCount = 0

  func finish() {
    finishCount += 1
  }
}

final class RecordingObservabilityProvider: ObservabilityProvider {
  private(set) var configurations: [ObservabilityConfiguration] = []
  private(set) var errors: [
    (
      error: Error,
      event: ObservabilityEvent,
      context: ObservabilityContext
    )
  ] = []
  private(set) var messages: [
    (
      event: ObservabilityEvent,
      level: ObservabilityLevel,
      context: ObservabilityContext
    )
  ] = []
  private(set) var breadcrumbs: [
    (
      event: ObservabilityEvent,
      level: ObservabilityLevel,
      context: ObservabilityContext
    )
  ] = []
  private(set) var userIDs: [String] = []
  private(set) var clearUserCount = 0
  private(set) var tags: [(key: String, value: String)] = []
  private(set) var spans: [
    (
      name: ObservabilityEvent,
      context: ObservabilityContext,
      span: RecordingObservabilitySpan
    )
  ] = []

  func configure(_ configuration: ObservabilityConfiguration) {
    configurations.append(configuration)
  }

  func captureError(
    _ error: Error,
    event: ObservabilityEvent,
    context: ObservabilityContext
  ) {
    errors.append((error: error, event: event, context: context))
  }

  func captureMessage(
    _ event: ObservabilityEvent,
    level: ObservabilityLevel,
    context: ObservabilityContext
  ) {
    messages.append((event: event, level: level, context: context))
  }

  func addBreadcrumb(
    _ event: ObservabilityEvent,
    level: ObservabilityLevel,
    context: ObservabilityContext
  ) {
    breadcrumbs.append((event: event, level: level, context: context))
  }

  func setUser(id: String) {
    userIDs.append(id)
  }

  func clearUser() {
    clearUserCount += 1
  }

  func setTag(key: String, value: String) {
    tags.append((key: key, value: value))
  }

  func startSpan(
    name: ObservabilityEvent,
    context: ObservabilityContext
  ) -> ObservabilitySpan {
    let span = RecordingObservabilitySpan()
    spans.append((name: name, context: context, span: span))
    return span
  }
}

@Suite(.serialized)
@MainActor
struct ObservabilityTests {
  @Test(arguments: [
    "Jovie.(unknown context at $104d1ab9c).MobileAuthFinalizationStageError",
    "Jovie.(unknown context at $10ABCDEF).MobileAuthFinalizationStageError",
    "Jovie.(unknown context at $7fff1234).MobileAuthFinalizationStageError",
  ])
  func normalizesSwiftUnknownContextAddresses(_ value: String) {
    #expect(
      SentryEventNormalizer.normalizeUnknownContext(value)
        == "Jovie.MobileAuthFinalizationStageError"
    )
  }

  @Test func fingerprintsMobileAuthByStageAndUnderlyingErrorClass() {
    #expect(
      SentryEventNormalizer.mobileAuthFingerprint(
        exceptionTypes: [
          "Jovie.(unknown context at $104d1ab9c).MobileAuthFinalizationStageError",
          "APIClient.AuthExchangeError",
        ],
        exceptionValues: [
          "Native auth exchange failed: OTT user mismatch",
          "OTT user mismatch",
        ]
      ) == [
        "MobileAuthFinalizationStageError",
        "exchange",
        "APIClient.AuthExchangeError",
      ]
    )
  }

  @Test func facadeCanUseNoopProvider() {
    Observability.useProviderForTesting(NoopObservabilityProvider())
    defer { Observability.resetForTesting() }

    Observability.addBreadcrumb(.authStart)
    Observability.captureMessage(.authProviderSelected)
    Observability.captureError(
      TestError.example,
      event: .nativeAuthExchangeFailed
    )
    Observability.setUser(id: "user_123")
    Observability.clearUser()
    Observability.setTag(key: "platform", value: "ios")

    let span = Observability.startSpan(name: .authStart)
    span.finish()
  }

  @Test func recordingProviderReceivesTypedEventsAndSanitizedContext() throws {
    let provider = RecordingObservabilityProvider()
    Observability.useProviderForTesting(provider)
    defer { Observability.resetForTesting() }

    Observability.addBreadcrumb(
      .deepLinkReceived,
      level: .warning,
      context: [
        "authorization": "Bearer abcdefghijklmnopqrstuvwxyz123456",
        "callback_url": "ie.jov.jovie://auth/complete?code=secret_code&state=secret_state&email=tim@example.com",
        "safe": "value",
      ]
    )
    Observability.captureMessage(
      .authCallbackURLParsed,
      context: ["phone": "+1 415 555 1212"]
    )
    Observability.captureMessage(
      .voiceTranscriptionCompleted,
      context: [
        "latency_ms": 240,
        "status": "sent",
      ]
    )

    let breadcrumb = try #require(provider.breadcrumbs.first)
    #expect(breadcrumb.event.rawValue == "deep_link_received")
    #expect(breadcrumb.level == .warning)
    #expect(breadcrumb.context["authorization"] as? String == ObservabilityRedactor.filteredValue)
    #expect(breadcrumb.context["safe"] as? String == "value")

    let sanitizedURL = try #require(
      breadcrumb.context["callback_url"] as? ObservabilityContext
    )
    #expect(sanitizedURL["scheme"] as? String == "ie.jov.jovie")
    #expect(sanitizedURL["host"] as? String == "auth")
    #expect(sanitizedURL["path"] as? String == "/complete")
    #expect(sanitizedURL["queryKeys"] as? [String] == ["code", "email", "state"])

    let payload = String(describing: breadcrumb.context)
    #expect(!payload.contains("secret_code"))
    #expect(!payload.contains("secret_state"))
    #expect(!payload.contains("tim@example.com"))

    let message = try #require(provider.messages.first)
    #expect(message.event == .authCallbackURLParsed)
    #expect(message.context["phone"] as? String == ObservabilityRedactor.filteredValue)
    let voiceMessage = try #require(provider.messages.last)
    #expect(voiceMessage.event == .voiceTranscriptionCompleted)
    #expect(voiceMessage.context["latency_ms"] as? Int == 240)
    #expect(voiceMessage.context["status"] as? String == "sent")
  }

  @Test func startSpanReturnsFinishableSpan() throws {
    let provider = RecordingObservabilityProvider()
    Observability.useProviderForTesting(provider)
    defer { Observability.resetForTesting() }

    let span = Observability.startSpan(
      name: .nativeAuthExchangeStarted,
      context: [
        "token": "abcdefghijklmnopqrstuvwxyz1234567890",
        "stage": "native_auth_return",
      ]
    )

    span.finish()

    let recordedSpan = try #require(provider.spans.first)
    #expect(recordedSpan.name == .nativeAuthExchangeStarted)
    #expect(recordedSpan.context["token"] as? String == ObservabilityRedactor.filteredValue)
    #expect(recordedSpan.context["stage"] as? String == "native_auth_return")
    #expect(recordedSpan.span.finishCount == 1)
  }
}

private enum TestError: Error {
  case example
}

#if DEBUG
@MainActor
private final class ChatMeasurementClock {
  var value = 1000.0
  func make() throws -> ChatPresentationMeasurement {
    let identity = try #require(ChatMeasurementIdentity(sourceSHA: String(repeating: "a", count: 40),
      buildNumber: "42", maximumFramesPerSecond: 120))
    return ChatPresentationMeasurement(identity: identity, now: { self.value })
  }
}

extension ObservabilityTests {
  @Test func nativePresentationRequiresModelLayoutAndDisplayCallbacks() throws {
    let clock = ChatMeasurementClock()
    let probe = try clock.make()
    let token = try #require(probe.begin(runIndex: 0))
    clock.value = 1000.01
    probe.modelUpdated(generation: token)
    probe.nextInputHandled() // Before the reply: cannot establish next-input readiness.
    clock.value = 1000.02
    probe.displayedFrame(generation: token, timestamp: clock.value, targetTimestamp: clock.value + 0.01,
      feedbackLaidOutAt: 1000.001, replyLaidOutAt: 1000.011, inputLaidOutAt: 1000.012)
    #expect(probe.isActive)
    clock.value = 1000.08
    probe.nextInputHandled()
    // The enabled composer in earlier frames does not prove that the edit painted.
    clock.value = 1000.09
    probe.displayedFrame(generation: token, timestamp: clock.value, targetTimestamp: clock.value + 0.01,
      inputLaidOutAt: 1000.03)
    #expect(probe.isActive)
    clock.value = 1000.10
    probe.displayedFrame(generation: token, timestamp: clock.value, targetTimestamp: clock.value + 0.01,
      inputLaidOutAt: 1000.081)
    let sample = try #require(probe.samples.first)
    #expect(sample.outcome == .complete)
    #expect(abs((sample.dataReadyMs ?? -1) - 10) < 0.001)
    #expect(abs((sample.firstFeedbackMs ?? -1) - 20) < 0.001)
    #expect(abs((sample.usableStateMs ?? -1) - 20) < 0.001)
    #expect(abs((sample.renderToInteractiveMs ?? -1) - 80) < 0.001)
    #expect(!probe.isActive)
  }

  @Test func nativeOldOrSameFrameLayoutCannotEstablishPresentation() throws {
    let clock = ChatMeasurementClock()
    let probe = try clock.make()
    let token = try #require(probe.begin(runIndex: 0))
    clock.value += 0.01
    probe.modelUpdated(generation: token)
    clock.value += 0.01
    probe.displayedFrame(generation: token, timestamp: clock.value, targetTimestamp: clock.value + 0.01,
      feedbackLaidOutAt: clock.value, replyLaidOutAt: 1000.001)
    probe.cancel()
    let sample = try #require(probe.samples.first)
    #expect(sample.firstFeedbackMs == nil)
    #expect(sample.usableStateMs == nil)
    #expect(sample.unavailableMetrics["usableStateMs"] == .noPresentation)
  }

  @Test(arguments: [60.0, 120.0])
  func nativeDetectsOneLostRefreshWithoutLongFrameThreshold(hz: Double) throws {
    let clock = ChatMeasurementClock()
    let probe = try clock.make()
    let token = try #require(probe.begin(runIndex: 0))
    let interval = 1 / hz
    clock.value += interval
    probe.displayedFrame(generation: token, timestamp: clock.value, targetTimestamp: clock.value + interval)
    clock.value += 2 * interval
    probe.displayedFrame(generation: token, timestamp: clock.value, targetTimestamp: clock.value + interval)
    probe.cancel()
    let sample = try #require(probe.samples.first)
    #expect(sample.droppedFrameCount == 1)
    #expect(sample.foregroundFrameCount == 2)
    #expect(abs((sample.maxFrameIntervalMs ?? 0) - 2000 / hz) < 0.001)
  }

  @Test func nativeUsesForecastCadenceAndDiscardsBackgroundGaps() throws {
    let clock = ChatMeasurementClock()
    let probe = try clock.make()
    let first = try #require(probe.begin(runIndex: 0))
    clock.value += 0.01
    probe.displayedFrame(generation: first, timestamp: clock.value, targetTimestamp: clock.value + 0.02)
    clock.value += 0.02
    probe.displayedFrame(generation: first, timestamp: clock.value, targetTimestamp: clock.value + 0.01)
    probe.cancel(.backgrounded)
    #expect(probe.samples.first?.droppedFrameCount == 0)
    clock.value += 60
    let second = try #require(probe.begin(runIndex: 1))
    clock.value += 0.01
    probe.displayedFrame(generation: second, timestamp: clock.value, targetTimestamp: clock.value + 0.01)
    probe.cancel()
    #expect(probe.samples.last?.droppedFrameCount == nil)
    #expect(probe.samples.last?.unavailableMetrics["droppedFrameCount"] == .insufficientFrames)
  }

  @Test func nativeCancellationCleansUpOnceAndRejectsStaleCallbacks() throws {
    let clock = ChatMeasurementClock()
    let probe = try clock.make()
    var starts = 0
    var stops = 0
    probe.onStart = { starts += 1 }
    probe.onStop = { stops += 1 }
    let stale = try #require(probe.begin(runIndex: 0))
    let current = try #require(probe.begin(runIndex: 1))
    #expect(stops == 1)
    clock.value += 0.01
    probe.modelUpdated(generation: stale)
    probe.displayedFrame(generation: stale, timestamp: clock.value, targetTimestamp: clock.value + 0.01,
      feedbackLaidOutAt: 1000.001, replyLaidOutAt: 1000.001)
    probe.cancel()
    probe.cancel()
    probe.modelUpdated(generation: current)
    #expect(starts == 2)
    #expect(stops == 2)
    #expect(probe.samples.count == 2)
    #expect(probe.samples.last?.dataReadyMs == nil)
    #expect(probe.samples.last?.firstFeedbackMs == nil)
  }

  @Test func nativeCancellationReleasesPlatformCallbacks() throws {
    let clock = ChatMeasurementClock()
    let probe = try clock.make()
    var monitor: ChatPresentationMonitor? = ChatPresentationMonitor(measurement: probe)
    weak var observedMonitor = monitor
    _ = probe.begin(runIndex: 0)
    monitor = nil
    #expect(observedMonitor != nil) // CADisplayLink owns its callback target.
    probe.cancel()
    #expect(observedMonitor == nil) // Invalidated link, timer and observer released.
  }

  @Test func nativeTimeoutWithoutDisplayCallbacksReportsUnavailableMetrics() throws {
    let clock = ChatMeasurementClock()
    let probe = try clock.make()
    var stopped = false
    probe.onStop = { stopped = true }
    _ = probe.begin(runIndex: 0)
    clock.value += ChatPresentationMeasurement.timeoutSeconds
    probe.checkDeadline()
    let sample = try #require(probe.samples.first)
    #expect(stopped && !probe.isActive)
    #expect(sample.outcome == .timedOut)
    #expect(sample.foregroundFrameCount == 0)
    #expect(sample.dataReadyMs == nil && sample.firstFeedbackMs == nil)
    #expect(sample.renderToInteractiveMs == nil && sample.droppedFrameCount == nil)
    #expect(sample.unavailableMetrics.count == 6)
  }

  @Test(arguments: [Double.nan, Double.infinity, 999.0])
  func nativeRejectsInvalidOrRegressingClocks(value: Double) throws {
    let clock = ChatMeasurementClock()
    let probe = try clock.make()
    let token = try #require(probe.begin(runIndex: 0))
    clock.value = value
    probe.modelUpdated(generation: token)
    #expect(probe.samples.first?.outcome == .invalidClock)
    #expect(probe.samples.first?.foregroundDurationMs.isFinite == true)
    _ = try probe.export()
  }

  @Test func nativeEnvelopeIsBoundedAndContainsOnlyAllowlistedMetadataAndDurations() throws {
    let clock = ChatMeasurementClock()
    let probe = try clock.make()
    _ = probe.begin(runIndex: 0, attempt: 1, warmup: true)
    probe.cancel()
    for index in 0..<(ChatPresentationMeasurement.maximumAttempts - 1) {
      _ = probe.begin(runIndex: index)
      probe.cancel()
    }
    #expect(probe.begin(runIndex: 0) == nil)
    #expect(probe.begin(runIndex: 19) == nil)
    let data = try probe.export()
    let report = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    #expect(Set(report.keys) == Set(["schemaVersion", "measurementVersion", "metadata", "sampleCount", "attemptCount", "samples"]))
    #expect(report["schemaVersion"] as? String == "jovie.interaction-measurement/v1")
    #expect(report["sampleCount"] as? Int == 19)
    #expect(report["attemptCount"] as? Int == 20)
    let metadata = try #require(report["metadata"] as? [String: Any])
    #expect(Set(metadata.keys) == Set(["sourceSHA", "buildNumber", "fixtureId", "platform", "refreshProfile"]))
    let sample = try #require((report["samples"] as? [[String: Any]])?.first)
    #expect(sample["firstFeedbackMs"] == nil)
    #expect(sample["unavailableMetrics"] != nil)
    #expect(data.count < 32_000)
    #expect(ChatMeasurementIdentity(sourceSHA: "account@example.com", buildNumber: "42", maximumFramesPerSecond: 120) == nil)
    #expect(ChatMeasurementIdentity(sourceSHA: String(repeating: "a", count: 40), buildNumber: "token-secret", maximumFramesPerSecond: 120) == nil)
  }
}
#endif


extension ObservabilityTests {
  @Test(arguments: ["native_attempt", "nativeAttempt"])
  func nonceCorrelationIsRedactedWithoutTokenHeuristics(key: String) {
    let nonce = String(repeating: "A", count: 43)
    #expect(ObservabilityRedactor.sanitizedValue(nonce, key: key) as? String == ObservabilityRedactor.filteredValue)
    #expect(ObservabilityRedactor.sanitizedValue("callback \(key)=\(nonce)") as? String == ObservabilityRedactor.filteredValue)
  }
}
