import Foundation
import Sentry

final class SentryObservabilityProvider: ObservabilityProvider {
  private let dsn: String
  private var didConfigure = false
  private let configureLock = NSLock()

  init(dsn: String) {
    self.dsn = dsn
  }

  func configure(_ configuration: ObservabilityConfiguration) {
    configureLock.lock()
    defer { configureLock.unlock() }

    guard !didConfigure else {
      configureScope(with: configuration)
      return
    }

    SentrySDK.start { options in
      options.dsn = self.dsn
      options.environment = configuration.environment
      options.releaseName = configuration.release
      options.dist = configuration.buildNumber
      options.sendDefaultPii = false
      options.enableCaptureFailedRequests = false
      options.beforeSend = { event in
        Self.redact(event: event)
      }
      options.beforeBreadcrumb = { breadcrumb in
        Self.redact(breadcrumb: breadcrumb)
      }
      options.beforeSendSpan = { span in
        Self.redact(span: span)
      }
    }

    didConfigure = true
    configureScope(with: configuration)
  }

  func captureError(
    _ error: Error,
    event: ObservabilityEvent,
    context: ObservabilityContext
  ) {
    SentrySDK.capture(error: error) { scope in
      Self.applyScope(scope, event: event, level: .error, context: context)
    }
  }

  func captureMessage(
    _ event: ObservabilityEvent,
    level: ObservabilityLevel,
    context: ObservabilityContext
  ) {
    SentrySDK.capture(message: event.rawValue) { scope in
      Self.applyScope(scope, event: event, level: level, context: context)
    }
  }

  func addBreadcrumb(
    _ event: ObservabilityEvent,
    level: ObservabilityLevel,
    context: ObservabilityContext
  ) {
    let breadcrumb = Breadcrumb(level: level.sentryLevel, category: "jovie")
    breadcrumb.type = "default"
    breadcrumb.message = event.rawValue
    breadcrumb.data = context
    SentrySDK.addBreadcrumb(breadcrumb)
  }

  func setUser(id: String) {
    SentrySDK.setUser(User(userId: id))
  }

  func clearUser() {
    SentrySDK.setUser(nil)
  }

  func setTag(key: String, value: String) {
    SentrySDK.configureScope { scope in
      scope.setTag(value: value, key: key)
    }
  }

  func startSpan(
    name: ObservabilityEvent,
    context: ObservabilityContext
  ) -> ObservabilitySpan {
    let span = SentrySDK.startTransaction(
      name: name.rawValue,
      operation: "jovie"
    )

    for (key, value) in context {
      span.setData(value: value, key: key)
    }

    return SentryObservabilitySpan {
      span.finish()
    }
  }

  private func configureScope(with configuration: ObservabilityConfiguration) {
    SentrySDK.configureScope { scope in
      scope.setTag(value: configuration.platform, key: "platform")
      scope.setTag(value: configuration.buildNumber, key: "build_number")
      scope.setEnvironment(configuration.environment)
      scope.setDist(configuration.buildNumber)
    }
  }

  private static func applyScope(
    _ scope: Scope,
    event: ObservabilityEvent,
    level: ObservabilityLevel,
    context: ObservabilityContext
  ) {
    scope.setLevel(level.sentryLevel)
    scope.setTag(value: event.rawValue, key: "jovie_event")
    scope.setContext(value: context, key: "jovie")
  }

  private static func redact(event: Event) -> Event? {
    event.extra = event.extra.map { ObservabilityRedactor.sanitizedContext($0) }
    event.context = event.context?.reduce(into: [String: [String: Any]]()) { result, entry in
      result[entry.key] = ObservabilityRedactor.sanitizedContext(entry.value)
    }
    event.breadcrumbs = event.breadcrumbs?.compactMap { redact(breadcrumb: $0) }

    if let request = event.request {
      if let url = request.url {
        request.url = ObservabilityRedactor.sanitizedURLString(url)
      }
      if let queryString = request.queryString,
         ObservabilityRedactor.containsSensitiveString(queryString)
      {
        request.queryString = ObservabilityRedactor.filteredValue
      }
      if request.cookies != nil {
        request.cookies = ObservabilityRedactor.filteredValue
      }
      if let headers = request.headers {
        request.headers = headers.reduce(into: [String: String]()) { result, entry in
          let sanitized = ObservabilityRedactor.sanitizedValue(
            entry.value,
            key: entry.key
          )
          result[entry.key] = sanitized as? String ?? String(describing: sanitized)
        }
      }
    }

    if let user = event.user {
      user.email = nil
      user.username = nil
      user.name = nil
      user.ipAddress = nil
      user.data = nil
    }

    if let tags = event.tags {
      event.tags = tags.reduce(into: [String: String]()) { result, entry in
        let sanitized = ObservabilityRedactor.sanitizedValue(
          entry.value,
          key: entry.key
        )
        result[entry.key] = sanitized as? String ?? String(describing: sanitized)
      }
    }

    return event
  }

  private static func redact(breadcrumb: Breadcrumb) -> Breadcrumb? {
    if let data = breadcrumb.data {
      breadcrumb.data = ObservabilityRedactor.sanitizedContext(data)
    }

    if let message = breadcrumb.message,
       ObservabilityRedactor.containsSensitiveString(message)
    {
      breadcrumb.message = ObservabilityRedactor.filteredValue
    }

    return breadcrumb
  }

  private static func redact(span: Span) -> Span? {
    for (key, value) in span.data {
      span.setData(
        value: ObservabilityRedactor.sanitizedValue(value, key: key),
        key: key
      )
    }

    for (key, value) in span.tags {
      let sanitized = ObservabilityRedactor.sanitizedValue(value, key: key)
      span.setTag(value: sanitized as? String ?? String(describing: sanitized), key: key)
    }

    if let description = span.spanDescription,
       ObservabilityRedactor.containsSensitiveString(description)
    {
      span.spanDescription = ObservabilityRedactor.filteredValue
    }

    return span
  }
}

private final class SentryObservabilitySpan: ObservabilitySpan {
  private let finishHandler: () -> Void

  init(finishHandler: @escaping () -> Void) {
    self.finishHandler = finishHandler
  }

  func finish() {
    finishHandler()
  }
}

private extension ObservabilityLevel {
  var sentryLevel: SentryLevel {
    switch self {
    case .debug:
      return .debug
    case .info:
      return .info
    case .warning:
      return .warning
    case .error:
      return .error
    case .fatal:
      return .fatal
    }
  }
}
