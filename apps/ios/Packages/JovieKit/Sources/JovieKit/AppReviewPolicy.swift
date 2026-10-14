import Foundation

/// Shared admission policy. StoreKit owns presentation and exposes no display,
/// dismissal, star-rating, or review-submission callback.
public enum AppReview {
  public static let schemaVersion = 1
  public static let requestWindow: TimeInterval = 365 * 24 * 60 * 60

  public enum ValueMoment: String, Codable, Sendable {
    case completedWorkflow
    case publishedWork
    case returnedToValue
  }

  public struct Opportunity: Equatable, Sendable {
    /// Opaque local dedupe key. Never include this in analytics.
    public let id: String
    public let moment: ValueMoment
    public let achievedAt: Date

    public init(id: String, moment: ValueMoment, achievedAt: Date) {
      self.id = id
      self.moment = moment
      self.achievedAt = achievedAt
    }
  }

  public struct Policy: Codable, Equatable, Sendable {
    public var version = AppReview.schemaVersion
    public var revision: String
    public var enabled: Bool
    /// Conservative starting prior, configurable without screen/launch counts.
    public var minimumInterval: TimeInterval
    public var opportunityLifetime: TimeInterval
    /// Our request ceiling, not a measurement of Apple's display allowance.
    public var maximumRequests: Int
    public var experiment: String?

    public init(revision: String = "review-policy-v1", enabled: Bool = true,
                minimumInterval: TimeInterval = 30 * 24 * 60 * 60,
                opportunityLifetime: TimeInterval = 24 * 60 * 60,
                maximumRequests: Int = 3, experiment: String? = nil) {
      self.revision = revision
      self.enabled = enabled
      self.minimumInterval = minimumInterval
      self.opportunityLifetime = opportunityLifetime
      self.maximumRequests = maximumRequests
      self.experiment = experiment
    }
  }

  public struct Context: Equatable, Sendable {
    public var now: Date
    public var isAppStoreBuild: Bool
    public var isForegroundActive: Bool
    public var hasExperiencedValue: Bool
    public var isQuietMoment: Bool
    public var isOnline: Bool
    /// Includes editing, capture, navigation, auth, payment, and assistive interaction.
    /// VoiceOver being enabled is not itself a reason to suppress a request.
    public var hasBlockingActivity: Bool

    public init(now: Date, isAppStoreBuild: Bool, isForegroundActive: Bool,
                hasExperiencedValue: Bool, isQuietMoment: Bool,
                isOnline: Bool, hasBlockingActivity: Bool) {
      self.now = now
      self.isAppStoreBuild = isAppStoreBuild
      self.isForegroundActive = isForegroundActive
      self.hasExperiencedValue = hasExperiencedValue
      self.isQuietMoment = isQuietMoment
      self.isOnline = isOnline
      self.hasBlockingActivity = hasBlockingActivity
    }
  }

  /// Opaque, already-stable enrollment from the existing experiment owner.
  /// This package never randomizes or changes provider assignments.
  public struct Assignment: Codable, Equatable, Sendable {
    public let experiment: String
    public let variant: String
    public let isHoldout: Bool

    public init(experiment: String, variant: String, isHoldout: Bool) {
      self.experiment = experiment
      self.variant = variant
      self.isHoldout = isHoldout
    }
  }

  public struct Receipt: Codable, Equatable, Sendable {
    public let version: Int
    public let policyRevision: String
    public let opportunityID: String
    public let moment: ValueMoment
    public let requestedAt: Date
    public let assignment: Assignment?
    public let display: String
    public let reviewOutcome: String

    public var telemetry: [String: String] {
      // Fixed, non-domain payload. No event IDs, health data, text, account IDs,
      // entitlements, or invented impression/conversion measurements.
      var result = ["schema": "app-review/v1", "policy_revision": policyRevision,
                    "value_moment": moment.rawValue, "action": "request_invoked",
                    "display": display, "review_outcome": reviewOutcome]
      if let assignment {
        result["experiment"] = assignment.experiment
        result["variant"] = assignment.variant
      }
      return result
    }
  }

  public struct Ledger: Codable, Equatable, Sendable {
    public var version = AppReview.schemaVersion
    public var optedOut = false
    public var requests: [Receipt] = []
    public var assignments: [String: Assignment] = [:]
    public init() {}
  }

  public enum Reason: String, Equatable, Sendable {
    case eligible, requested, disabled, invalidPolicy, invalidState
    case unsupportedDistribution, inactive, valueNotEstablished, interrupted, offline
    case staleOpportunity, duplicate, cooldown, requestBudget, optedOut
    case holdout, assignmentChanged, persistenceUnavailable
  }

  public struct Decision: Equatable, Sendable {
    public let reason: Reason
    public let policyRevision: String
    public let receipt: Receipt?
  }

  private static func validIdentifier(_ value: String) -> Bool {
    !value.isEmpty && value.count <= 80
      && value.unicodeScalars.allSatisfy {
        CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.").contains($0)
      }
  }

  public static func evaluate(_ opportunity: Opportunity, context: Context,
                              policy: Policy, ledger: Ledger) -> Reason {
    guard policy.version == schemaVersion, validIdentifier(policy.revision),
          policy.minimumInterval.isFinite, policy.minimumInterval >= 24 * 60 * 60,
          policy.opportunityLifetime.isFinite, policy.opportunityLifetime > 0,
          policy.opportunityLifetime <= policy.minimumInterval,
          (1...3).contains(policy.maximumRequests),
          policy.experiment.map(validIdentifier) ?? true else { return .invalidPolicy }
    guard policy.enabled else { return .disabled }
    guard ledger.version == schemaVersion, context.now.timeIntervalSince1970.isFinite,
          ledger.requests.allSatisfy({
            $0.version == schemaVersion && $0.requestedAt.timeIntervalSince1970.isFinite
              && $0.requestedAt <= context.now && $0.display == "unobservable"
              && $0.reviewOutcome == "unobservable"
          }) else { return .invalidState }
    guard !ledger.optedOut else { return .optedOut }
    guard context.isAppStoreBuild else { return .unsupportedDistribution }
    guard context.isForegroundActive else { return .inactive }
    guard context.hasExperiencedValue else { return .valueNotEstablished }
    guard context.isQuietMoment, !context.hasBlockingActivity else { return .interrupted }
    guard context.isOnline else { return .offline }
    let age = context.now.timeIntervalSince(opportunity.achievedAt)
    guard !opportunity.id.isEmpty, age.isFinite, age >= 0,
          age <= policy.opportunityLifetime else { return .staleOpportunity }
    guard !ledger.requests.contains(where: { $0.opportunityID == opportunity.id }) else { return .duplicate }
    let recent = ledger.requests.filter { context.now.timeIntervalSince($0.requestedAt) < requestWindow }
    guard recent.count < policy.maximumRequests else { return .requestBudget }
    guard !recent.contains(where: {
      context.now.timeIntervalSince($0.requestedAt) < policy.minimumInterval
    }) else { return .cooldown }
    return .eligible
  }

  /// One process-wide instance per app installation. Serializes admission and
  /// reserves durable state before calling StoreKit, so reentry/relaunch cannot
  /// spend the same opportunity twice. Unknown/corrupt storage fails closed.
  @MainActor
  public final class Coordinator {
    private let load: () throws -> Data?
    private let save: (Data) throws -> Void

    public init(load: @escaping () throws -> Data?, save: @escaping (Data) throws -> Void) {
      self.load = load
      self.save = save
    }

    @discardableResult
    public func consider(_ opportunity: Opportunity, context: Context, policy: Policy = Policy(),
                         assignment: Assignment? = nil, request: () -> Void) -> Decision {
      func decision(_ reason: Reason, _ receipt: Receipt? = nil) -> Decision {
        Decision(reason: reason, policyRevision: policy.revision, receipt: receipt)
      }
      var ledger: Ledger
      do {
        ledger = try load().map { try JSONDecoder().decode(Ledger.self, from: $0) } ?? Ledger()
      } catch { return decision(.persistenceUnavailable) }
      let reason = AppReview.evaluate(opportunity, context: context, policy: policy, ledger: ledger)
      guard reason == .eligible else { return decision(reason) }
      guard assignment?.experiment == policy.experiment else { return decision(.assignmentChanged) }
      if let assignment {
        guard AppReview.validIdentifier(assignment.experiment),
              AppReview.validIdentifier(assignment.variant) else { return decision(.invalidPolicy) }
        if let existing = ledger.assignments[assignment.experiment], existing != assignment {
          return decision(.assignmentChanged)
        }
        ledger.assignments[assignment.experiment] = assignment
      }
      let receipt = Receipt(version: schemaVersion, policyRevision: policy.revision,
                            opportunityID: opportunity.id, moment: opportunity.moment,
                            requestedAt: context.now, assignment: assignment,
                            display: "unobservable", reviewOutcome: "unobservable")
      ledger.requests.removeAll { context.now.timeIntervalSince($0.requestedAt) >= requestWindow }
      if assignment?.isHoldout != true { ledger.requests.append(receipt) }
      do { try save(JSONEncoder().encode(ledger)) }
      catch { return decision(.persistenceUnavailable) }
      guard assignment?.isHoldout != true else { return decision(.holdout) }
      request()
      return decision(.requested, receipt)
    }
  }
}
