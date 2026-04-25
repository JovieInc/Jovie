import UIKit

protocol BrightnessControlling: Sendable {
  func setMaxBrightness() async
  func restoreBrightness() async
}

protocol ScreenBrightnessProviding: Sendable {
  var currentBrightness: CGFloat { get set }
}

struct UIScreenBrightnessProvider: ScreenBrightnessProviding {
  var currentBrightness: CGFloat {
    get { UIScreen.main.brightness }
    nonmutating set { UIScreen.main.brightness = newValue }
  }
}

final class ScreenBrightnessManager: BrightnessControlling, @unchecked Sendable {
  private var originalBrightness: CGFloat?
  private var provider: ScreenBrightnessProviding

  init(provider: ScreenBrightnessProviding = UIScreenBrightnessProvider()) {
    self.provider = provider
  }

  func setMaxBrightness() async {
    guard originalBrightness == nil else {
      provider.currentBrightness = 1
      return
    }

    originalBrightness = provider.currentBrightness
    provider.currentBrightness = 1
  }

  func restoreBrightness() async {
    guard let originalBrightness else { return }
    provider.currentBrightness = originalBrightness
    self.originalBrightness = nil
  }
}
