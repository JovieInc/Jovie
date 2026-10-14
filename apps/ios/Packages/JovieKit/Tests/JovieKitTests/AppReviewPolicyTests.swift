import Foundation
import Testing
@testable import JovieKit

@MainActor
struct AppReviewPolicyTests {
  private let now = Date(timeIntervalSince1970: 1_800_000_000)
  private let day: TimeInterval = 24 * 60 * 60

  private func context(at date: Date? = nil) -> AppReview.Context {
    AppReview.Context(now: date ?? now, isAppStoreBuild: true, isForegroundActive: true,
                      hasExperiencedValue: true, isQuietMoment: true,
                      isOnline: true, hasBlockingActivity: false)
  }

  private func opportunity(_ id: String = "saved-work", at date: Date? = nil) -> AppReview.Opportunity {
    AppReview.Opportunity(id: id, moment: .completedWorkflow, achievedAt: date ?? now)
  }

  @Test func semanticEligibilityHasNoLaunchScreenSentimentOrCommerceInput() {
    #expect(AppReview.evaluate(opportunity(), context: context(), policy: .init(), ledger: .init()) == .eligible)
    let cases: [(AppReview.Reason, (inout AppReview.Context) -> Void)] = [
      (.unsupportedDistribution, { $0.isAppStoreBuild = false }),
      (.inactive, { $0.isForegroundActive = false }),
      (.valueNotEstablished, { $0.hasExperiencedValue = false }),
      (.interrupted, { $0.isQuietMoment = false }),
      (.interrupted, { $0.hasBlockingActivity = true }),
      (.offline, { $0.isOnline = false }),
    ]
    for (reason, change) in cases {
      var ctx = context()
      change(&ctx)
      #expect(AppReview.evaluate(opportunity(), context: ctx, policy: .init(), ledger: .init()) == reason)
    }
  }

  @Test func invalidOrDisabledPoliciesFailClosed() {
    let invalid: [(inout AppReview.Policy) -> Void] = [
      { $0.version = 99 }, { $0.revision = "" }, { $0.revision = "private health value" },
      { $0.revision = String(repeating: "a", count: 81) },
      { $0.minimumInterval = .nan }, { $0.minimumInterval = 0 },
      { $0.opportunityLifetime = .infinity }, { $0.opportunityLifetime = 0 },
      { $0.opportunityLifetime = 100 * 24 * 60 * 60 },
      { $0.maximumRequests = 0 }, { $0.maximumRequests = 4 },
      { $0.experiment = "invalid key" },
    ]
    for change in invalid {
      var policy = AppReview.Policy()
      change(&policy)
      #expect(AppReview.evaluate(opportunity(), context: context(), policy: policy, ledger: .init()) == .invalidPolicy)
    }
    #expect(AppReview.evaluate(opportunity(), context: context(), policy: .init(enabled: false), ledger: .init()) == .disabled)
    var ledger = AppReview.Ledger()
    ledger.optedOut = true
    #expect(AppReview.evaluate(opportunity(), context: context(), policy: .init(), ledger: ledger) == .optedOut)
    ledger.version = 99
    #expect(AppReview.evaluate(opportunity(), context: context(), policy: .init(), ledger: ledger) == .invalidState)
    #expect(AppReview.evaluate(opportunity(), context: context(at: Date(timeIntervalSince1970: .infinity)),
                              policy: .init(), ledger: .init()) == .invalidState)
  }

  @Test func staleFutureEmptyAndNonfiniteOpportunitiesCannotBeReplayed() {
    for item in [opportunity(""), opportunity(at: now.addingTimeInterval(1)),
                 opportunity(at: now.addingTimeInterval(-day - 1)),
                 opportunity(at: Date(timeIntervalSince1970: .nan))] {
      #expect(AppReview.evaluate(item, context: context(), policy: .init(), ledger: .init()) == .staleOpportunity)
    }
    #expect(AppReview.evaluate(opportunity(at: now.addingTimeInterval(-day)), context: context(),
                              policy: .init(), ledger: .init()) == .eligible)
  }

  @Test func reserveBeforeRequestPreventsReentryAndRelaunchDuplicates() throws {
    let storage = ReviewMemory()
    let coordinator = storage.coordinator()
    var calls = 0
    let decision = coordinator.consider(opportunity(), context: context()) {
      calls += 1
      #expect(storage.data != nil)
      #expect(coordinator.consider(opportunity(), context: context()) { calls += 1 }.reason == .duplicate)
    }
    #expect(decision.reason == .requested)
    #expect(calls == 1)
    #expect(storage.coordinator().consider(opportunity(), context: context()) { calls += 1 }.reason == .duplicate)
    let receipt = try #require(decision.receipt)
    #expect(receipt.display == "unobservable")
    #expect(receipt.reviewOutcome == "unobservable")
    #expect(receipt.telemetry["action"] == "request_invoked")
    #expect(!receipt.telemetry.values.contains("saved-work"))
    #expect(receipt.telemetry.keys.sorted() == ["action", "display", "policy_revision", "review_outcome", "schema", "value_moment"])
    #expect(try JSONDecoder().decode(AppReview.Ledger.self, from: #require(storage.data)).requests == [receipt])
  }

  @Test func cooldownAndRollingBudgetSurvivePolicyRevisionsWithoutVersionRearming() throws {
    let storage = ReviewMemory()
    let coordinator = storage.coordinator()
    for index in 0..<3 {
      let date = now.addingTimeInterval(Double(index) * 30 * day)
      #expect(coordinator.consider(opportunity("work-\(index)", at: date), context: context(at: date)) {}.reason == .requested)
      if index == 0 {
        let early = date.addingTimeInterval(30 * day - 1)
        #expect(coordinator.consider(opportunity("new-release", at: early), context: context(at: early),
                                     policy: .init(revision: "new-policy")) {}.reason == .cooldown)
      }
    }
    let fourth = now.addingTimeInterval(90 * day)
    #expect(coordinator.consider(opportunity("fourth", at: fourth), context: context(at: fourth)) {}.reason == .requestBudget)
    let nextYear = now.addingTimeInterval(AppReview.requestWindow)
    #expect(coordinator.consider(opportunity("next-year", at: nextYear), context: context(at: nextYear)) {}.reason == .requested)
    #expect(try JSONDecoder().decode(AppReview.Ledger.self, from: #require(storage.data)).requests.count == 3)
  }

  @Test func failedReadCorruptDataAndFailedReservationNeverCallStoreKit() {
    for failure in 0..<3 {
      let storage = ReviewMemory()
      storage.failRead = failure == 0
      storage.data = failure == 1 ? Data("corrupt".utf8) : nil
      storage.failSave = failure == 2
      let result = storage.coordinator().consider(opportunity(), context: context()) {
        Issue.record("StoreKit must not run without a valid persisted reservation")
      }
      #expect(result.reason == .persistenceUnavailable)
      #expect(result.receipt == nil)
    }
    let storage = ReviewMemory()
    storage.failSave = true
    #expect(storage.coordinator().consider(opportunity(), context: context()) {}.reason == .persistenceUnavailable)
    storage.failSave = false
    #expect(storage.coordinator().consider(opportunity(), context: context()) {}.reason == .requested)
  }

  @Test func deferredContextCanRecoverWithoutSpendingTheRequestBudget() {
    let storage = ReviewMemory()
    let coordinator = storage.coordinator()
    var offline = context()
    offline.isOnline = false
    #expect(coordinator.consider(opportunity(), context: offline) { Issue.record("Offline request") }.reason == .offline)
    #expect(storage.data == nil)
    #expect(coordinator.consider(opportunity(), context: context()) {}.reason == .requested)
  }

  @Test func existingOwnerAssignmentIsStableAndHoldoutCannotEscapeOnMissingData() throws {
    let storage = ReviewMemory()
    let coordinator = storage.coordinator()
    let policy = AppReview.Policy(experiment: "review-timing-v1")
    let holdout = AppReview.Assignment(experiment: "review-timing-v1", variant: "control", isHoldout: true)
    #expect(coordinator.consider(opportunity(), context: context(), policy: policy, assignment: holdout) {
      Issue.record("Holdout called StoreKit")
    }.reason == .holdout)
    #expect(try JSONDecoder().decode(AppReview.Ledger.self, from: #require(storage.data)).requests.isEmpty)
    #expect(coordinator.consider(opportunity(), context: context(), policy: policy) {}.reason == .assignmentChanged)
    let changed = AppReview.Assignment(experiment: holdout.experiment, variant: "treatment", isHoldout: false)
    #expect(coordinator.consider(opportunity(), context: context(), policy: policy, assignment: changed) {}.reason == .assignmentChanged)
    #expect(storage.coordinator().consider(opportunity(), context: context(), policy: policy, assignment: holdout) {}.reason == .holdout)
    // An explicitly ended experiment may return to ordinary policy. Historical
    // enrollment is retained, rather than silently changing its old assignment.
    #expect(coordinator.consider(opportunity(), context: context()) {}.reason == .requested)
  }

  @Test func treatmentReceiptCarriesAssignmentAndInvalidAssignmentFailsClosed() throws {
    let policy = AppReview.Policy(experiment: "review-test")
    let storage = ReviewMemory()
    for key in ["", "contains spaces"] {
      let invalid = AppReview.Assignment(experiment: "review-test", variant: key, isHoldout: false)
      #expect(storage.coordinator().consider(opportunity(), context: context(), policy: policy,
                                             assignment: invalid) {}.reason == .invalidPolicy)
    }
    let treatment = AppReview.Assignment(experiment: "review-test", variant: "treatment", isHoldout: false)
    let decision = storage.coordinator().consider(opportunity(), context: context(), policy: policy, assignment: treatment) {}
    #expect(try #require(decision.receipt).telemetry["variant"] == "treatment")
    #expect(try #require(decision.receipt).assignment == treatment)
  }

  @Test func unknownOrImpossiblePersistedReceiptsDoNotResetFatigue() throws {
    let storage = ReviewMemory()
    let decision = storage.coordinator().consider(opportunity(), context: context()) {}
    let receipt = try #require(decision.receipt)
    let invalidReceipts = [
      AppReview.Receipt(version: 99, policyRevision: receipt.policyRevision, opportunityID: "id",
                        moment: .publishedWork, requestedAt: now, assignment: nil,
                        display: "unobservable", reviewOutcome: "unobservable"),
      AppReview.Receipt(version: 1, policyRevision: receipt.policyRevision, opportunityID: "id",
                        moment: .returnedToValue, requestedAt: now.addingTimeInterval(1), assignment: nil,
                        display: "unobservable", reviewOutcome: "unobservable"),
      AppReview.Receipt(version: 1, policyRevision: receipt.policyRevision, opportunityID: "id",
                        moment: .completedWorkflow, requestedAt: now, assignment: nil,
                        display: "shown", reviewOutcome: "unobservable"),
      AppReview.Receipt(version: 1, policyRevision: receipt.policyRevision, opportunityID: "id",
                        moment: .completedWorkflow, requestedAt: now, assignment: nil,
                        display: "unobservable", reviewOutcome: "rated"),
    ]
    for invalid in invalidReceipts {
      var ledger = AppReview.Ledger()
      ledger.requests = [invalid]
      #expect(AppReview.evaluate(opportunity(), context: context(), policy: .init(), ledger: ledger) == .invalidState)
    }
  }
}

@MainActor
private final class ReviewMemory {
  var data: Data?
  var failRead = false
  var failSave = false
  struct Failure: Error {}
  func coordinator() -> AppReview.Coordinator {
    AppReview.Coordinator(load: {
      if self.failRead { throw Failure() }
      return self.data
    }, save: {
      if self.failSave { throw Failure() }
      self.data = $0
    })
  }
}
