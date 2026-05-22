import SwiftUI

struct SplashView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var logoOpacity = 0.0
  @State private var logoScale: CGFloat = 0.86
  @State private var logoRotation = 0.0

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      Image("Jovie-logo")
        .resizable()
        .scaledToFit()
        .frame(width: 58, height: 58)
        .opacity(logoOpacity)
        .scaleEffect(logoScale)
        .rotationEffect(.degrees(logoRotation))
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
      logoRotation = 0
      return
    }

    logoOpacity = 0
    logoScale = 0.86
    logoRotation = 0

    try? await Task.sleep(for: .milliseconds(180))
    guard !Task.isCancelled else { return }

    withAnimation(.easeOut(duration: 0.42)) {
      logoOpacity = 0.58
      logoScale = 1.06
      logoRotation = -700
    }

    try? await Task.sleep(for: .milliseconds(360))
    guard !Task.isCancelled else { return }

    withAnimation(.spring(response: 0.46, dampingFraction: 0.78, blendDuration: 0.08)) {
      logoOpacity = 0.92
      logoScale = 1
      logoRotation = -720
    }
  }
}

struct CinematicLoadingBackdrop: View {
  let isActive: Bool

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [
          JovieColor.backgroundBase,
          JovieColor.surface0.opacity(0.92),
          JovieColor.backgroundBase
        ],
        startPoint: .top,
        endPoint: .bottom
      )
      .ignoresSafeArea()

      VStack(spacing: 0) {
        ForEach(0..<7, id: \.self) { index in
          Rectangle()
            .fill(Color.white.opacity(index.isMultiple(of: 2) ? 0.020 : 0.008))
            .frame(height: 1)
            .padding(.bottom, 42)
        }
      }
      .opacity(isActive ? 1 : 0.65)
      .animation(.easeInOut(duration: 1.2), value: isActive)

      Rectangle()
        .fill(
          LinearGradient(
            colors: [
              Color.clear,
              Color.white.opacity(0.035),
              Color.clear
            ],
            startPoint: .leading,
            endPoint: .trailing
          )
        )
        .frame(width: 92)
        .offset(x: isActive ? 180 : -180)
        .blur(radius: 12)
        .animation(
          .easeInOut(duration: 2.4).repeatForever(autoreverses: false),
          value: isActive
        )
    }
  }
}
