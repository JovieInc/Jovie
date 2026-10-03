import Foundation
import Testing
@testable import Jovie

// Exercise the same provenance-to-channel path consumed by Settings.
struct ReleaseChannelTests {
  @Test func appStoreReceiptMapsToStable() {
    let info = buildInfo(receiptName: "receipt")
    #expect(info.provenance == .appStore)
    #expect(info.channel == .stable)
  }

  @Test func sandboxReceiptMapsToTestFlightBeta() {
    let info = buildInfo(receiptName: "sandboxReceipt")
    #expect(info.provenance == .testFlight)
    #expect(info.channel == .beta)
  }

  @Test(arguments: [nil, "", "unexpected"] as [String?])
  func missingOrUnrecognizedReceiptDoesNotInferAChannel(receiptName: String?) {
    let info = buildInfo(receiptName: receiptName)
    #expect(info.provenance == .unknown)
    #expect(info.channel == nil)
  }

  @Test(arguments: [nil, "receipt", "sandboxReceipt", "unexpected"] as [String?])
  func debugBuildsSitOnNoPublishedChannel(receiptName: String?) {
    let info = buildInfo(receiptName: receiptName, isDebugBuild: true)
    #expect(info.provenance == .development)
    #expect(info.channel == nil)
  }

  @Test func laterReceiptAvailabilityUsesTheNewProvenance() {
    let initial = buildInfo(receiptName: nil)
    let resolved = buildInfo(receiptName: "sandboxReceipt")
    #expect(initial.channel == nil)
    #expect(resolved.provenance == .testFlight)
    #expect(resolved.channel == .beta)
  }

  @Test func channelLabelsMatchCanonicalVocabulary() {
    #expect(ReleaseChannel.stable.displayName == "Stable")
    #expect(ReleaseChannel.beta.displayName == "Beta")
    #expect(ReleaseChannel.nightly.displayName == "Nightly")
  }

  private func buildInfo(receiptName: String?, isDebugBuild: Bool = false) -> AppBuildInfo {
    AppBuildInfo(
      version: "1.0", build: "1",
      provenance: AppBuildInfo.provenance(receiptName: receiptName, isDebugBuild: isDebugBuild),
      commit: nil
    )
  }
}
