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
  @Test func facadeCanUseNoopProvider() {
    Observability.useProviderForTesting(NoopObservabilityProvider())
    defer { Observability.resetForTesting() }

    Observability.addBreadcrumb(.authStart)
    Observability.captureMessage(.authProviderSelected)
    Observability.captureError(
      TestError.example,
      event: .clerkSessionExchangeFailed
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
  }

  @Test func startSpanReturnsFinishableSpan() throws {
    let provider = RecordingObservabilityProvider()
    Observability.useProviderForTesting(provider)
    defer { Observability.resetForTesting() }

    let span = Observability.startSpan(
      name: .clerkSessionExchangeStarted,
      context: [
        "token": "abcdefghijklmnopqrstuvwxyz1234567890",
        "stage": "native_auth_return",
      ]
    )

    span.finish()

    let recordedSpan = try #require(provider.spans.first)
    #expect(recordedSpan.name == .clerkSessionExchangeStarted)
    #expect(recordedSpan.context["token"] as? String == ObservabilityRedactor.filteredValue)
    #expect(recordedSpan.context["stage"] as? String == "native_auth_return")
    #expect(recordedSpan.span.finishCount == 1)
  }
}

private enum TestError: Error {
  case example
}
