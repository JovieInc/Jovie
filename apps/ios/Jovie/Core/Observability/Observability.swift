import Foundation

enum Observability {
  private static var provider: ObservabilityProvider = NoopObservabilityProvider()
  private static let providerLock = NSLock()

  static func configure(
    environment: String,
    release: String = Bundle.main.observabilityReleaseName,
    buildNumber: String = Bundle.main.observabilityBuildNumber,
    dsn: String?,
    isEnabled: Bool = true
  ) {
    let configuration = ObservabilityConfiguration(
      dsn: dsn,
      environment: environment,
      release: release,
      buildNumber: buildNumber,
      isEnabled: isEnabled
    )

    let replacementProvider: ObservabilityProvider

    if configuration.isEnabled,
       let dsn = configuration.dsn,
       !dsn.isEmpty
    {
      replacementProvider = SentryObservabilityProvider(dsn: dsn)
    } else {
      replacementProvider = NoopObservabilityProvider()
    }

    replacementProvider.configure(configuration)
    replaceProvider(replacementProvider)
  }

  static func useProviderForTesting(_ replacement: ObservabilityProvider) {
    replaceProvider(replacement)
  }

  static func resetForTesting() {
    replaceProvider(NoopObservabilityProvider())
  }

  static func captureError(
    _ error: Error,
    event: ObservabilityEvent,
    context: ObservabilityContext = [:]
  ) {
    currentProvider().captureError(
      error,
      event: event,
      context: ObservabilityRedactor.sanitizedContext(context)
    )
  }

  static func captureMessage(
    _ event: ObservabilityEvent,
    level: ObservabilityLevel = .info,
    context: ObservabilityContext = [:]
  ) {
    currentProvider().captureMessage(
      event,
      level: level,
      context: ObservabilityRedactor.sanitizedContext(context)
    )
  }

  static func addBreadcrumb(
    _ event: ObservabilityEvent,
    level: ObservabilityLevel = .info,
    context: ObservabilityContext = [:]
  ) {
    currentProvider().addBreadcrumb(
      event,
      level: level,
      context: ObservabilityRedactor.sanitizedContext(context)
    )
  }

  static func setUser(id: String) {
    let trimmedID = id.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedID.isEmpty else { return }
    currentProvider().setUser(id: trimmedID)
  }

  static func clearUser() {
    currentProvider().clearUser()
  }

  static func setTag(key: String, value: String) {
    let sanitizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
    let sanitizedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sanitizedKey.isEmpty, !sanitizedValue.isEmpty else { return }
    currentProvider().setTag(key: sanitizedKey, value: sanitizedValue)
  }

  static func startSpan(
    name: ObservabilityEvent,
    context: ObservabilityContext = [:]
  ) -> ObservabilitySpan {
    currentProvider().startSpan(
      name: name,
      context: ObservabilityRedactor.sanitizedContext(context)
    )
  }

  private static func currentProvider() -> ObservabilityProvider {
    providerLock.lock()
    defer { providerLock.unlock() }
    return provider
  }

  private static func replaceProvider(_ replacement: ObservabilityProvider) {
    providerLock.lock()
    provider = replacement
    providerLock.unlock()
  }
}

extension Bundle {
  var observabilityBuildNumber: String {
    object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
  }

  var observabilityReleaseName: String {
    let bundleIdentifier = bundleIdentifier ?? "ie.jov.Jovie"
    let version = object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    return "\(bundleIdentifier)@\(version)+\(observabilityBuildNumber)"
  }
}
