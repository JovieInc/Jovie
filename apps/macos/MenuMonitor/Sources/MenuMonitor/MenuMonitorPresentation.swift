import Foundation

struct MenuMetric: Identifiable, Equatable {
  enum Kind: CaseIterable {
    case inProgress
    case ready
    case blocked

    fileprivate var title: String {
      switch self {
      case .inProgress: "In Progress"
      case .ready: "Ready"
      case .blocked: "Blocked"
      }
    }

    fileprivate var singularNoun: String {
      switch self {
      case .inProgress: "issue"
      case .ready, .blocked: "card"
      }
    }

    fileprivate var qualifier: String {
      switch self {
      case .inProgress: "shipping"
      case .ready: "waiting"
      case .blocked: "blocked"
      }
    }
  }

  let kind: Kind
  let count: Int

  var id: Kind { kind }

  var valueText: String {
    let noun = count == 1 ? kind.singularNoun : "\(kind.singularNoun)s"
    return "\(count) \(noun) \(kind.qualifier)"
  }

  var text: String {
    "\(kind.title): \(valueText)"
  }

  func displayText(isStale: Bool) -> String {
    isStale ? "Last known: \(text)" : text
  }
}

struct MenuBarPresentation: Equatable {
  let count: Int
  let hasLoaded: Bool
  let hasError: Bool
  let actionMessage: String?

  var badgeText: String? {
    if hasError {
      return "!"
    }
    if actionMessage?.hasSuffix("…") == true {
      return "…"
    }
    guard hasLoaded, count > 0 else {
      return nil
    }
    return count > 99 ? "99+" : "\(count)"
  }

  var helpText: String {
    let statusText: String
    if hasError {
      statusText =
        hasLoaded
        ? "Shipping status unavailable; last known: \(shippingMetric.valueText)"
        : "Shipping status unavailable"
    } else if hasLoaded {
      statusText = shippingMetric.valueText
    } else {
      statusText = "Refreshing shipping status"
    }

    if let actionMessage {
      return "\(actionMessage) \(statusText)"
    }
    return statusText
  }

  let accessibilityLabel = "Jovie shipping monitor"

  var accessibilityValue: String { helpText }

  private var shippingMetric: MenuMetric {
    MenuMetric(kind: .inProgress, count: count)
  }
}

struct MenuMonitorPresentation: Equatable {
  private let allMetrics: [MenuMetric]
  let lastRefreshDescription: String?
  let lastError: String?
  let actionMessage: String?
  let statusOutput: String?

  init(
    inProgressCount: Int,
    readyCount: Int,
    blockedCount: Int,
    lastRefreshDescription: String?,
    lastError: String?,
    actionMessage: String?,
    statusOutput: String?
  ) {
    allMetrics = [
      MenuMetric(kind: .inProgress, count: inProgressCount),
      MenuMetric(kind: .ready, count: readyCount),
      MenuMetric(kind: .blocked, count: blockedCount),
    ]
    self.lastRefreshDescription = lastRefreshDescription
    self.lastError = lastError
    self.actionMessage = actionMessage
    self.statusOutput = statusOutput
  }

  var showsInitialLoading: Bool {
    lastRefreshDescription == nil && lastError == nil
  }

  var metrics: [MenuMetric] {
    lastRefreshDescription == nil ? [] : allMetrics
  }

  func text(for metric: MenuMetric) -> String {
    metric.displayText(isStale: lastError != nil)
  }
}
