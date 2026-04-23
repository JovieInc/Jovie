import CoreGraphics
import Testing
@testable import Jovie

private final class MockBrightnessProvider: ScreenBrightnessProviding, @unchecked Sendable {
  var currentBrightness: CGFloat

  init(currentBrightness: CGFloat) {
    self.currentBrightness = currentBrightness
  }
}

struct ScreenBrightnessManagerTests {
  @Test func restoresOriginalBrightness() async {
    let provider = MockBrightnessProvider(currentBrightness: 0.4)
    let manager = ScreenBrightnessManager(provider: provider)

    await manager.setMaxBrightness()
    #expect(provider.currentBrightness == 1)

    await manager.restoreBrightness()
    #expect(provider.currentBrightness == 0.4)
  }
}
