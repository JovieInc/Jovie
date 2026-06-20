import Foundation
import MetricKit

/// Subscribes to MetricKit payloads in production builds so field launch and
/// scroll regressions surface in observability without waiting for manual QA.
enum MetricKitWatch {
  private final class Subscriber: NSObject, MXMetricManagerSubscriber {
    func didReceive(_ payloads: [MXMetricPayload]) {
      for payload in payloads {
        var context: ObservabilityContext = [
          "time_begin": payload.timeStampBegin.ISO8601Format(),
          "time_end": payload.timeStampEnd.ISO8601Format(),
        ]

        if payload.applicationLaunchMetrics != nil {
          context["launch_metrics"] = true
        }

        if payload.applicationResponsivenessMetrics != nil {
          context["responsiveness_metrics"] = true
        }

        Observability.addBreadcrumb(
          .metrickitPayloadReceived,
          context: context
        )
      }
    }
  }

  private static let subscriber = Subscriber()
  private static var isStarted = false

  static func start() {
    guard !isStarted else { return }
    isStarted = true
    MXMetricManager.shared.add(subscriber)
  }
}