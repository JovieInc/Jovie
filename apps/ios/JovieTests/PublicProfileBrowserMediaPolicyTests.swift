import AVFoundation
import Testing
import WebKit
@testable import Jovie

struct PublicProfileBrowserMediaPolicyTests {
  @Test @MainActor func webViewAllowsInlineAndProgrammaticPlayback() {
    let configuration = WKWebViewConfiguration()
    PublicProfileBrowserMediaPolicy.configure(configuration)

    #expect(configuration.allowsInlineMediaPlayback)
    #expect(configuration.mediaTypesRequiringUserActionForPlayback.isEmpty)
  }

  @Test func audioSessionUsesPlaybackCategoryForWebMedia() {
    #expect(WebPlaybackAudioSessionPolicy.category == .playback)
    #expect(WebPlaybackAudioSessionPolicy.mode == .default)
    #expect(
      WebPlaybackAudioSessionPolicy.deactivationOptions.contains(.notifyOthersOnDeactivation)
    )
  }
}
