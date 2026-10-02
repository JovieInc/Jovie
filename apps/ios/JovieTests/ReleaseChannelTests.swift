import Foundation
import Testing
@testable import Jovie

// Canonical release-channel IA (JOV-7535): iOS derives the channel from
// install provenance and never offers an in-app switch.
struct ReleaseChannelTests {
  @Test func appStoreReceiptMapsToStable() {
    #expect(
      ReleaseChannelResolver.provenance(
        receiptLastPathComponent: "receipt",
        isDebugBuild: false
      ) == .appStore
    )
    #expect(ReleaseChannelResolver.channel(for: .appStore) == .stable)
  }

  @Test func sandboxReceiptMapsToTestFlightBeta() {
    #expect(
      ReleaseChannelResolver.provenance(
        receiptLastPathComponent: "sandboxReceipt",
        isDebugBuild: false
      ) == .testFlight
    )
    #expect(ReleaseChannelResolver.channel(for: .testFlight) == .beta)
  }

  @Test func debugBuildsSitOnNoPublishedChannel() {
    #expect(
      ReleaseChannelResolver.provenance(
        receiptLastPathComponent: nil,
        isDebugBuild: true
      ) == .development
    )
    #expect(ReleaseChannelResolver.channel(for: .development) == nil)
  }

  @Test func channelLabelsMatchCanonicalVocabulary() {
    #expect(ReleaseChannel.stable.displayName == "Stable")
    #expect(ReleaseChannel.beta.displayName == "Beta")
    #expect(ReleaseChannel.nightly.displayName == "Nightly")
  }
}
