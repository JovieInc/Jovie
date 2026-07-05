import Foundation
import Testing
@testable import Jovie

@Suite(.serialized)
struct MetricKitReporterTests {
  @Test func reportBuilderAlwaysSamplesCrashes() {
    #expect(ObservabilityReportBuilder.shouldSample(kind: .crash))
    #expect(ObservabilityReportBuilder.shouldSample(kind: .hang))
    #expect(ObservabilityReportBuilder.shouldSample(kind: .launch))
  }

  @Test func buildReportRedactsSensitiveMessageContent() throws {
    let report = ObservabilityReportBuilder.buildReport(
      kind: .crash,
      title: "EXC_BREAKPOINT",
      message: "Bearer abcdefghijklmnopqrstuvwxyz123456",
      stacktrace: "AppState.swift:120 in completeLaunch",
      release: "ie.jov.Jovie@1.0+42",
      environment: "production",
      sampled: true
    )

    #expect(report.message == ObservabilityRedactor.filteredValue)
    #expect(report.platform == "ios")
    #expect(report.kind == .crash)

    let json = try JSONSerialization.jsonObject(with: try report.jsonData()) as? [String: Any]
    #expect(json?["sampled"] as? Bool == true)
    #expect((json?["message"] as? String)?.contains("Bearer") == false)
  }

  @Test func signatureMatchesWorkerHmacContract() {
    let body = Data("""
    {"platform":"ios","kind":"crash","title":"EXC_BREAKPOINT","release":"ie.jov.Jovie@1.0+42"}
    """.utf8)

    let signature = MetricKitReporter.signature(for: body, secret: "ingest-only-secret")
    #expect(signature.hasPrefix("sha256="))
    #expect(signature.count == "sha256=".count + 64)
  }
}