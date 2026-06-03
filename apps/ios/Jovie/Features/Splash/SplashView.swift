import SwiftUI

struct SplashView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var logoOpacity = 0.0

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      JovieLogoMark(size: 29)
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
      logoOpacity = 0.92
      return
    }

    logoOpacity = 0

    try? await Task.sleep(for: .milliseconds(180))
    guard !Task.isCancelled else { return }

    withAnimation(.easeOut(duration: 0.26)) {
      logoOpacity = 0.72
    }

    try? await Task.sleep(for: .milliseconds(180))
    guard !Task.isCancelled else { return }

    withAnimation(.easeOut(duration: 0.22)) {
      logoOpacity = 0.92
    }
  }
}
