import CryptoKit
import Foundation
import MetricKit

final class MetricKitReporter: NSObject, MXMetricManagerSubscriber {
  static let shared = MetricKitReporter()

  private let uploadQueue = DispatchQueue(label: "ie.jov.Jovie.metricKitReporter")
  private var ingestURL: URL?
  private var ingestSecret = ""
  private var release = ""
  private var environment = ""
  private var isEnabled = false

  private override init() {
    super.init()
  }

  func configure(
    ingestURL: URL?,
    ingestSecret: String?,
    release: String,
    environment: String,
    isEnabled: Bool
  ) {
    self.ingestURL = ingestURL
    self.ingestSecret = ingestSecret?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    self.release = release
    self.environment = environment
    self.isEnabled = isEnabled && ingestURL != nil && !self.ingestSecret.isEmpty

    guard self.isEnabled else {
      return
    }

    MXMetricManager.shared.add(self)
  }

  func didReceive(_ payloads: [MXDiagnosticPayload]) {
    guard isEnabled, let ingestURL else {
      return
    }

    for payload in payloads {
      let reports = Self.reports(
        from: payload,
        release: release,
        environment: environment
      )

      for report in reports where report.sampled {
        uploadQueue.async { [ingestSecret] in
          Self.upload(report: report, ingestURL: ingestURL, ingestSecret: ingestSecret)
        }
      }
    }
  }

  static func reports(
    from payload: MXDiagnosticPayload,
    release: String,
    environment: String
  ) -> [ObservabilityIngestReport] {
    var reports: [ObservabilityIngestReport] = []

    let occurredAt = payload.timeStampBegin

    if let crashDiagnostics = payload.crashDiagnostics {
      for diagnostic in crashDiagnostics {
        let kind: ObservabilityReportKind = .crash
        let title = String(describing: diagnostic.exceptionType)
        let message = diagnostic.terminationReason
          ?? String(describing: diagnostic.exceptionCode)
        let stacktrace = formattedCallStack(diagnostic.callStackTree)
        reports.append(
          ObservabilityReportBuilder.buildReport(
            kind: kind,
            title: title,
            message: message,
            stacktrace: stacktrace,
            release: release,
            environment: environment,
            occurredAt: occurredAt,
            sampled: ObservabilityReportBuilder.shouldSample(kind: kind)
          )
        )
      }
    }

    if let hangDiagnostics = payload.hangDiagnostics {
      for diagnostic in hangDiagnostics {
        let kind: ObservabilityReportKind = .hang
        reports.append(
          ObservabilityReportBuilder.buildReport(
            kind: kind,
            title: "hang",
            message: "Application hang detected",
            stacktrace: formattedCallStack(diagnostic.callStackTree),
            release: release,
            environment: environment,
            occurredAt: occurredAt,
            sampled: ObservabilityReportBuilder.shouldSample(kind: kind)
          )
        )
      }
    }

    if let launchDiagnostics = payload.appLaunchDiagnostics {
      for diagnostic in launchDiagnostics {
        let kind: ObservabilityReportKind = .launch
        reports.append(
          ObservabilityReportBuilder.buildReport(
            kind: kind,
            title: "slow_launch",
            message: "Launch exceeded MetricKit threshold",
            stacktrace: formattedCallStack(diagnostic.callStackTree),
            release: release,
            environment: environment,
            occurredAt: occurredAt,
            sampled: ObservabilityReportBuilder.shouldSample(kind: kind)
          )
        )
      }
    }

    return reports
  }

  private static func formattedCallStack(_ tree: MXCallStackTree?) -> String {
    guard let tree else {
      return ""
    }

    let data = tree.jsonRepresentation()
    return String(data: data, encoding: .utf8)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  }

  private static func upload(
    report: ObservabilityIngestReport,
    ingestURL: URL,
    ingestSecret: String
  ) {
    guard let body = try? report.jsonData() else {
      return
    }

    var request = URLRequest(url: ingestURL)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(signature(for: body, secret: ingestSecret), forHTTPHeaderField: "X-Observability-Signature")
    request.httpBody = body

    let task = URLSession.shared.dataTask(with: request) { _, _, _ in }
    task.resume()
  }

  static func signature(for body: Data, secret: String) -> String {
    var digest = SHA256()
    digest.update(data: Data("\(secret):".utf8))
    digest.update(data: body)
    let hashed = digest.finalize()
    let hex = hashed.reduce(into: "") { partial, byte in
      partial += String(format: "%02x", byte)
    }
    return "sha256=\(hex)"
  }
}