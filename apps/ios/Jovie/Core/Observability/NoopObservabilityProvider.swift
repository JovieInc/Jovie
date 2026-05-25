import Foundation

final class NoopObservabilitySpan: ObservabilitySpan {
  func finish() {}
}

final class NoopObservabilityProvider: ObservabilityProvider {
  func configure(_ configuration: ObservabilityConfiguration) {}

  func captureError(
    _ error: Error,
    event: ObservabilityEvent,
    context: ObservabilityContext
  ) {}

  func captureMessage(
    _ event: ObservabilityEvent,
    level: ObservabilityLevel,
    context: ObservabilityContext
  ) {}

  func addBreadcrumb(
    _ event: ObservabilityEvent,
    level: ObservabilityLevel,
    context: ObservabilityContext
  ) {}

  func setUser(id: String) {}

  func clearUser() {}

  func setTag(key: String, value: String) {}

  func startSpan(
    name: ObservabilityEvent,
    context: ObservabilityContext
  ) -> ObservabilitySpan {
    NoopObservabilitySpan()
  }
}
