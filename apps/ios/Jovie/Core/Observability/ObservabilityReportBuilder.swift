import Foundation

enum ObservabilityReportKind: String, Equatable {
  case crash
  case hang
  case hitch
  case launch
  case error
}

struct ObservabilityIngestReport: Equatable {
  let platform: String
  let kind: ObservabilityReportKind
  let title: String
  let message: String
  let release: String
  let environment: String
  let stacktrace: String
  let occurredAt: String
  let sampled: Bool

  func jsonData() throws -> Data {
    let payload: [String: Any] = [
      "platform": platform,
      "kind": kind.rawValue,
      "title": title,
      "message": message,
      "release": release,
      "environment": environment,
      "stacktrace": stacktrace,
      "occurred_at": occurredAt,
      "sampled": sampled,
    ]

    return try JSONSerialization.data(withJSONObject: payload)
  }
}

enum ObservabilityReportBuilder {
  static func buildReport(
    kind: ObservabilityReportKind,
    title: String,
    message: String,
    stacktrace: String,
    release: String,
    environment: String,
    occurredAt: Date = Date(),
    sampled: Bool
  ) -> ObservabilityIngestReport {
    ObservabilityIngestReport(
      platform: "ios",
      kind: kind,
      title: sanitizedLine(title),
      message: sanitizedLine(message),
      release: sanitizedLine(release),
      environment: sanitizedLine(environment),
      stacktrace: sanitizedStacktrace(stacktrace),
      occurredAt: ISO8601DateFormatter().string(from: occurredAt),
      sampled: sampled
    )
  }

  static func shouldSample(kind: ObservabilityReportKind) -> Bool {
    switch kind {
    case .crash, .hang, .launch:
      return true
    case .hitch, .error:
      return Int.random(in: 0..<100) < 10
    }
  }

  private static func sanitizedLine(_ value: String) -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return "unknown"
    }

    if ObservabilityRedactor.containsSensitiveString(trimmed) {
      return ObservabilityRedactor.filteredValue
    }

    return trimmed
  }

  private static func sanitizedStacktrace(_ value: String) -> String {
    value
      .split(separator: "\n", omittingEmptySubsequences: false)
      .prefix(8)
      .map { sanitizedLine(String($0)) }
      .joined(separator: "\n")
  }
}