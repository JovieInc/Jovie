import SwiftUI
import UIKit

#if DEBUG
/// Opt-in fixture adapter. Release builds contain neither capture nor export.
@MainActor
final class ChatPresentationMonitor: NSObject {
  let measurement: ChatPresentationMeasurement
  private var displayLink: CADisplayLink?
  private var deadline: Timer?
  private var backgroundObserver: NSObjectProtocol?
  private let markers = NSHashTable<ChatPresentationMarker>.weakObjects()
  private let exportQueue = DispatchQueue(label: "ie.jov.chat-measurement-export", qos: .utility)

  init(measurement: ChatPresentationMeasurement) {
    self.measurement = measurement
    super.init()
    measurement.onStart = { [weak self] in self?.start() }
    measurement.onStop = { [weak self] in self?.stop() }
  }

  static func fixture(processInfo: ProcessInfo = .processInfo) -> ChatPresentationMonitor? {
    // A live-auth launch or an arbitrary environment flag cannot enable this.
    guard LaunchMode.resolving(arguments: processInfo.arguments, isXCTest: false) == .uiTestingChat,
          processInfo.environment["JOVIE_IOS_CHAT_MEASUREMENT"] == "1",
          let sha = AppBuildInfo.gitCommit(),
          let identity = ChatMeasurementIdentity(sourceSHA: sha,
            buildNumber: Bundle.main.observabilityBuildNumber,
            maximumFramesPerSecond: UIScreen.main.maximumFramesPerSecond) else { return nil }
    return ChatPresentationMonitor(measurement: ChatPresentationMeasurement(identity: identity, now: CACurrentMediaTime))
  }

  func begin() {
    _ = measurement.begin(runIndex: measurement.samples.count)
  }

  func register(_ marker: ChatPresentationMarker) { markers.add(marker) }

  private func start() {
    let link = CADisplayLink(target: self, selector: #selector(frame(_:)))
    displayLink = link
    // Do not change the product's refresh policy; record the system cadence.
    link.add(to: .main, forMode: .common)
    let timer = Timer(timeInterval: ChatPresentationMeasurement.timeoutSeconds, repeats: false) { [weak self] _ in
      MainActor.assumeIsolated { self?.measurement.checkDeadline() }
    }
    deadline = timer
    RunLoop.main.add(timer, forMode: .common)
    backgroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.measurement.cancel(.backgrounded) }
    }
  }

  private func stop() {
    displayLink?.invalidate()
    displayLink = nil
    deadline?.invalidate()
    deadline = nil
    if let backgroundObserver { NotificationCenter.default.removeObserver(backgroundObserver) }
    backgroundObserver = nil
    // Serialize bounded reports off the main actor, replacing one fixed file.
    if let data = try? measurement.export(),
       let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
         .appendingPathComponent("chat-measurement.json") {
      exportQueue.async { try? data.write(to: url, options: .atomic) }
    }
  }

  @objc private func frame(_ link: CADisplayLink) {
    guard UIApplication.shared.applicationState == .active else {
      measurement.cancel(.backgrounded)
      return
    }
    func layout(_ kind: ChatPresentationMarker.Kind) -> Double? {
      markers.allObjects.filter { $0.kind == kind && $0.generation == measurement.generation && $0.isPresentedInWindow }
        .compactMap(\.laidOutAt).min()
    }
    measurement.displayedFrame(generation: measurement.generation, timestamp: link.timestamp,
      targetTimestamp: link.targetTimestamp, feedbackLaidOutAt: layout(.feedback),
      replyLaidOutAt: layout(.reply), inputLaidOutAt: layout(.input))
  }
}

private struct ChatPresentationMonitorKey: EnvironmentKey {
  static let defaultValue: ChatPresentationMonitor? = nil
}

extension EnvironmentValues {
  var chatPresentationMonitor: ChatPresentationMonitor? {
    get { self[ChatPresentationMonitorKey.self] }
    set { self[ChatPresentationMonitorKey.self] = newValue }
  }
}

@MainActor
struct ChatPresentationCheckpoint: UIViewRepresentable {
  let monitor: ChatPresentationMonitor
  let generation: Int
  let kind: ChatPresentationMarker.Kind
  let eligible: Bool
  var revision: Int = 0

  func makeUIView(context: Context) -> ChatPresentationMarker {
    let view = ChatPresentationMarker()
    view.isUserInteractionEnabled = false
    view.isAccessibilityElement = false
    monitor.register(view)
    return view
  }

  func updateUIView(_ view: ChatPresentationMarker, context: Context) {
    view.configure(kind: kind, generation: generation,
                   revision: revision, eligible: eligible)
  }
}

/// Invisible, layout-neutral marker in the actual row/composer background.
@MainActor
final class ChatPresentationMarker: UIView {
  enum Kind { case feedback, reply, input }
  private(set) var kind = Kind.feedback
  private(set) var generation = 0
  private(set) var laidOutAt: Double?
  private var revision = 0
  private var eligible = false

  func configure(kind: Kind, generation: Int, revision: Int, eligible: Bool) {
    guard self.kind != kind || self.generation != generation || self.revision != revision || self.eligible != eligible else { return }
    self.kind = kind
    self.generation = generation
    self.revision = revision
    self.eligible = eligible
    laidOutAt = nil
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    if eligible, laidOutAt == nil, window != nil, !bounds.isEmpty { laidOutAt = CACurrentMediaTime() }
  }

  var isPresentedInWindow: Bool {
    guard eligible, let window, window.windowScene?.activationState == .foregroundActive,
          !bounds.isEmpty else { return false }
    var visible = convert(bounds, to: window).intersection(window.bounds)
    var ancestor: UIView? = self
    while let view = ancestor {
      if view.isHidden || view.alpha <= 0.01 { return false }
      if view.clipsToBounds { visible = visible.intersection(view.convert(view.bounds, to: window)) }
      ancestor = view.superview
    }
    return !visible.isEmpty && !visible.isNull
  }
}
#endif
