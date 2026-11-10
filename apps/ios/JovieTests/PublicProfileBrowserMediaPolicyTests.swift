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

  @Test func webHapticStyleParsesOnlyKnownStyles() {
    for style in WebHapticStyle.allCases {
      #expect(WebHapticStyle(messageBody: ["style": style.rawValue]) == style)
    }
    #expect(WebHapticStyle(messageBody: ["style": "thunder"]) == nil)
    #expect(WebHapticStyle(messageBody: ["style": 3]) == nil)
    #expect(WebHapticStyle(messageBody: "selection") == nil)
    #expect(WebHapticStyle(messageBody: [String: Any]()) == nil)
  }

  @Test @MainActor func hapticBridgeRegistersTheAgreedHandlerName() {
    #expect(WebHapticsMessageHandler.name == "jovieHaptics")
    // WKUserContentController traps on a duplicate name within one
    // configuration, so each browser model installs on its own configuration.
    _ = WebHapticsMessageHandler.install(on: WKWebViewConfiguration())
    _ = WebHapticsMessageHandler.install(on: WKWebViewConfiguration())
  }
}
