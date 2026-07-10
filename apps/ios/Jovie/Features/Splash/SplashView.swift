import SwiftUI

struct SplashView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  // Logo is reserved at full frame size in every state (scaleEffect/opacity
  // never change the layout size SwiftUI reports to the parent), so this
  // entrance never shifts layout.
  @State private var logoOpacity: Double = 0
  @State private var logoScale: CGFloat = 0.96

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      JovieLogoMark(size: 29)
        .scaleEffect(logoScale)
        .opacity(logoOpacity)
        .accessibilityHidden(true)
        .accessibilityIdentifier("cinematic-loading-logo")
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Jovie is loading")
    .accessibilityIdentifier("cinematic-loading")
    .task {
      await runLogoAnimation(reduceMotion: reduceMotion)
    }
  }

  @MainActor
  private func runLogoAnimation(reduceMotion: Bool) async {
    if reduceMotion {
      // Opacity-only: no scale motion, and the logo is instantly at its
      // final (unscaled) size so it never gets stuck mid-entrance.
      logoScale = 1
      withAnimation(JovieMotion.subtle) {
        logoOpacity = 1
      }
      return
    }

    logoOpacity = 0
    logoScale = 0.96

    // Primary reveal: never animate from scale(0) -- start at 0.96 and land
    // on scale 1 / full opacity together on the cinematic curve so the first
    // frame the user sees feels intentional, not a hard cut.
    withAnimation(JovieMotion.cinematic) {
      logoOpacity = 1
      logoScale = 1
    }

    try? await Task.sleep(for: .seconds(JovieMotion.cinematicDuration))
    guard !Task.isCancelled else { return }

    // Secondary settle ("breathe"): a restrained overshoot-and-return on
    // scale only -- opacity is already full, so this reads as the logo
    // gently arriving rather than a second fade.
    withAnimation(JovieMotion.subtle) {
      logoScale = 1.03
    }

    try? await Task.sleep(for: .seconds(JovieMotion.subtleDuration))
    guard !Task.isCancelled else { return }

    withAnimation(JovieMotion.subtle) {
      logoScale = 1
    }
  }
}
