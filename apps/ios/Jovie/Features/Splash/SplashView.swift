import SwiftUI

struct SplashView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var logoOpacity = 0.0
  @State private var logoScale: CGFloat = 0.94

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      JovieLogoMark(size: 58)
        .opacity(logoOpacity)
        .scaleEffect(logoScale)
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
      logoOpacity = 0.92
      logoScale = 1
      return
    }

    logoOpacity = 0
    logoScale = 0.94

    try? await Task.sleep(for: .milliseconds(180))
    guard !Task.isCancelled else { return }

    withAnimation(.easeOut(duration: 0.26)) {
      logoOpacity = 0.72
      logoScale = 1.015
    }

    try? await Task.sleep(for: .milliseconds(180))
    guard !Task.isCancelled else { return }

    withAnimation(.spring(response: 0.48, dampingFraction: 0.86, blendDuration: 0.08)) {
      logoOpacity = 0.92
      logoScale = 1
    }
  }
}
