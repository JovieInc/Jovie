import CoreMotion
import Foundation
import SwiftUI
import UIKit

enum VlogActivationPreference {
  static let userDefaultsKey = "vlog.raise-to-open.enabled"
}

struct VlogActivationSample: Equatable, Sendable {
  let timestamp: TimeInterval
  let isLandscape: Bool
  let gravityX: Double
  let gravityZ: Double
  let userAccelerationMagnitude: Double
}

struct VlogActivationContext: Equatable, Sendable {
  let isEnabled: Bool
  let isAppActive: Bool
  let isEligibleSurface: Bool
  let allowsMotionActivation: Bool
}

enum VlogActivationCancellationReason: String, Equatable, Sendable {
  case accessibility
  case appInactive = "app_inactive"
  case featureDisabled = "feature_disabled"
  case liftExpired = "lift_expired"
  case motionUnavailable = "motion_unavailable"
  case motionContinued = "motion_continued"
  case postureLost = "posture_lost"
  case sampleGap = "sample_gap"
  case surfaceBlocked = "surface_blocked"
}

enum VlogActivationDecision: Equatable, Sendable {
  case none
  case candidateStarted
  case candidateCancelled(VlogActivationCancellationReason)
  case activate
}

/// Pure raise-to-open policy. Landscape is necessary but never sufficient:
/// activation also requires a recent lift impulse, a steady upright posture,
/// an eligible app surface, and an explicit user opt-in.
struct VlogActivationPolicy: Equatable, Sendable {
  struct Configuration: Equatable, Sendable {
    let liftAccelerationThreshold: Double
    let steadyAccelerationMaximum: Double
    let uprightGravityMinimum: Double
    let faceTiltGravityMaximum: Double
    let liftWindow: TimeInterval
    let maximumSampleGap: TimeInterval
    let stableDwell: TimeInterval
    let cooldown: TimeInterval

    static let standard = Configuration(
      liftAccelerationThreshold: 0.18,
      steadyAccelerationMaximum: 0.10,
      uprightGravityMinimum: 0.72,
      faceTiltGravityMaximum: 0.45,
      liftWindow: 2.5,
      maximumSampleGap: 0.25,
      stableDwell: 0.8,
      cooldown: 30
    )
  }

  let configuration: Configuration
  private(set) var candidateStartedAt: TimeInterval?
  private(set) var lastStableSampleAt: TimeInterval?
  private(set) var liftExpiresAt: TimeInterval?
  private(set) var cooldownUntil: TimeInterval?

  init(configuration: Configuration = .standard) {
    self.configuration = configuration
  }

  mutating func ingest(
    _ sample: VlogActivationSample,
    context: VlogActivationContext
  ) -> VlogActivationDecision {
    guard context.isEnabled else {
      return cancelCandidate(reason: .featureDisabled)
    }
    guard context.allowsMotionActivation else {
      return cancelCandidate(reason: .accessibility)
    }
    guard context.isAppActive else {
      return cancelCandidate(reason: .appInactive)
    }
    guard context.isEligibleSurface else {
      return cancelCandidate(reason: .surfaceBlocked)
    }
    if let cooldownUntil, sample.timestamp < cooldownUntil {
      candidateStartedAt = nil
      lastStableSampleAt = nil
      liftExpiresAt = nil
      return .none
    }

    if sample.userAccelerationMagnitude >= configuration.liftAccelerationThreshold {
      liftExpiresAt = sample.timestamp + configuration.liftWindow
    }

    let isUprightLandscape = sample.isLandscape
      && abs(sample.gravityX) >= configuration.uprightGravityMinimum
      && abs(sample.gravityZ) <= configuration.faceTiltGravityMaximum
    guard isUprightLandscape else {
      return cancelCandidate(reason: .postureLost)
    }
    guard sample.userAccelerationMagnitude <= configuration.steadyAccelerationMaximum else {
      return cancelCandidate(reason: .motionContinued)
    }
    guard let liftExpiresAt, sample.timestamp <= liftExpiresAt else {
      return cancelCandidate(reason: .liftExpired)
    }

    guard let candidateStartedAt else {
      self.candidateStartedAt = sample.timestamp
      lastStableSampleAt = sample.timestamp
      return .candidateStarted
    }
    guard let lastStableSampleAt,
          sample.timestamp - lastStableSampleAt <= configuration.maximumSampleGap
    else {
      return cancelCandidate(reason: .sampleGap)
    }
    self.lastStableSampleAt = sample.timestamp
    guard sample.timestamp - candidateStartedAt >= configuration.stableDwell else {
      return .none
    }

    self.candidateStartedAt = nil
    self.lastStableSampleAt = nil
    self.liftExpiresAt = nil
    cooldownUntil = sample.timestamp + configuration.cooldown
    return .activate
  }

  mutating func recordManualActivation(at timestamp: TimeInterval) {
    candidateStartedAt = nil
    lastStableSampleAt = nil
    liftExpiresAt = nil
    cooldownUntil = timestamp + configuration.cooldown
  }

  mutating func reset() {
    candidateStartedAt = nil
    lastStableSampleAt = nil
    liftExpiresAt = nil
    cooldownUntil = nil
  }

  private mutating func cancelCandidate(
    reason: VlogActivationCancellationReason
  ) -> VlogActivationDecision {
    let hadCandidate = candidateStartedAt != nil
    candidateStartedAt = nil
    lastStableSampleAt = nil
    let canStillBecomeCandidate = !hadCandidate
      && (reason == .motionContinued || reason == .postureLost)
    if !canStillBecomeCandidate {
      liftExpiresAt = nil
    }
    return hadCandidate ? .candidateCancelled(reason) : .none
  }
}

@MainActor
final class VlogActivationMonitor {
  private let motionManager: CMMotionManager
  private var policy: VlogActivationPolicy
  private var context: (() -> VlogActivationContext)?
  private var onDecision: ((VlogActivationDecision) -> Void)?
  private var generation = 0
  private var ownsOrientationNotifications = false

  init(
    motionManager: CMMotionManager = CMMotionManager(),
    policy: VlogActivationPolicy = VlogActivationPolicy()
  ) {
    self.motionManager = motionManager
    self.policy = policy
  }

  @discardableResult
  func start(
    context: @escaping () -> VlogActivationContext,
    onDecision: @escaping (VlogActivationDecision) -> Void
  ) -> Bool {
    stop()
    guard motionManager.isDeviceMotionAvailable else { return false }

    self.context = context
    self.onDecision = onDecision
    UIDevice.current.beginGeneratingDeviceOrientationNotifications()
    ownsOrientationNotifications = true
    let generation = self.generation
    motionManager.deviceMotionUpdateInterval = 0.1
    motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, error in
      guard let motion else {
        guard error != nil else { return }
        Task { @MainActor [weak self] in
          guard let self, self.generation == generation else { return }
          let onDecision = self.onDecision
          self.stop()
          onDecision?(.candidateCancelled(.motionUnavailable))
        }
        return
      }
      let gravityX = motion.gravity.x
      let gravityZ = motion.gravity.z
      let timestamp = motion.timestamp
      let acceleration = motion.userAcceleration
      let magnitude = sqrt(
        acceleration.x * acceleration.x
          + acceleration.y * acceleration.y
          + acceleration.z * acceleration.z
      )
      Task { @MainActor [weak self] in
        guard let self, self.generation == generation else { return }
        self.ingest(
          timestamp: timestamp,
          gravityX: gravityX,
          gravityZ: gravityZ,
          userAccelerationMagnitude: magnitude
        )
      }
    }
    return true
  }

  func stop() {
    generation += 1
    motionManager.stopDeviceMotionUpdates()
    if ownsOrientationNotifications {
      UIDevice.current.endGeneratingDeviceOrientationNotifications()
      ownsOrientationNotifications = false
    }
    context = nil
    onDecision = nil
    policy.reset()
  }

  func recordManualActivation() {
    policy.recordManualActivation(at: ProcessInfo.processInfo.systemUptime)
  }

  private func ingest(
    timestamp: TimeInterval,
    gravityX: Double,
    gravityZ: Double,
    userAccelerationMagnitude: Double
  ) {
    guard let context, let onDecision else { return }
    let orientation = UIDevice.current.orientation
    let decision = policy.ingest(
      VlogActivationSample(
        timestamp: timestamp,
        isLandscape: orientation == .landscapeLeft || orientation == .landscapeRight,
        gravityX: gravityX,
        gravityZ: gravityZ,
        userAccelerationMagnitude: userAccelerationMagnitude
      ),
      context: context()
    )
    guard decision != .none else { return }
    onDecision(decision)
  }
}

/// Recordable video kinds understood by the chat wire format. Mirrors
/// `RECORDABLE_VIDEO_KINDS` in apps/web/lib/teleprompter/types.ts.
enum MobileChatVideoKind: String, Equatable, Sendable, CaseIterable {
  case promo
  case thankYou = "thank_you"
  case bts

  var label: String {
    switch self {
    case .promo: return "Promo video"
    case .thankYou: return "Thank-you video"
    case .bts: return "Behind-the-scenes video"
    }
  }
}

/// Parsed `proposeVideoRecording` tool result. Mirrors
/// `VideoRecordingProposalPayload` in apps/web/lib/teleprompter/types.ts --
/// this is the Jovie context that proposes a recording; its script auto-loads
/// into the teleprompter overlay (JOV-5075).
struct MobileChatVideoProposalPayload: Equatable, Identifiable, Sendable {
  let kind: MobileChatVideoKind
  let title: String
  let script: String

  var id: String {
    "video-proposal:\(kind.rawValue):\(title)"
  }
}

extension MobileChatContentParser {
  static let videoProposalToolNames: Set<String> = [
    "proposeVideoRecording",
  ]

  /// Decodes a `proposeVideoRecording` tool-result JSON payload. Tolerates a
  /// missing/unknown `showcaseVariant` (the iOS overlay has no showcase gate).
  static func decodeVideoProposal(from data: Data) -> MobileChatVideoProposalPayload? {
    guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return nil
    }

    guard (object["success"] as? Bool) == true else { return nil }
    guard
      let kindRaw = object["kind"] as? String,
      let kind = MobileChatVideoKind(rawValue: kindRaw)
    else {
      return nil
    }
    guard let title = object["title"] as? String, !title.isEmpty else { return nil }
    guard let script = object["script"] as? String, !script.isEmpty else { return nil }

    return MobileChatVideoProposalPayload(kind: kind, title: title, script: script)
  }
}

/// Chat card for a video-recording proposal. "Record in app" opens the
/// teleprompter overlay with the script pre-loaded (JOV-5075).
struct TeleprompterProposalCardView: View {
  let payload: MobileChatVideoProposalPayload
  let onRecord: (MobileChatVideoProposalPayload) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      HStack(alignment: .top, spacing: JovieSpacing.medium) {
        Image(systemName: "video.fill")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(JovieColor.accentBlue)
          .frame(width: 20, height: 20)
          .padding(.top, 1)
          .accessibilityHidden(true)

        VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
          Text(payload.title)
            .font(JovieFont.body(size: 15, weight: .semibold))
            .foregroundStyle(JovieColor.textPrimary)
            .fixedSize(horizontal: false, vertical: true)

          Text(payload.kind.label)
            .font(JovieFont.body(size: 13))
            .foregroundStyle(JovieColor.textTertiary)

          Text(payload.script)
            .font(JovieFont.body(size: 13))
            .foregroundStyle(JovieColor.textSecondary)
            .lineLimit(3)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }

      Button {
        onRecord(payload)
      } label: {
        Text("Record in app")
          .frame(maxWidth: .infinity)
      }
      .buttonStyle(JoviePillButtonStyle(filled: true))
      .accessibilityIdentifier("teleprompter-proposal-record")
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.vertical, JovieSpacing.medium)
    .background(JovieColor.surface2, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
    .accessibilityIdentifier("teleprompter-proposal-card")
  }
}
