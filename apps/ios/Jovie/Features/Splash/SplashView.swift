import SwiftUI

struct SplashView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var isActive = false
  @State private var stageIndex = 0

  private let stages = ["Syncing profile", "Preparing QR", "Opening workspace"]

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      CinematicLoadingBackdrop(isActive: isActive && !reduceMotion)

      VStack(spacing: JovieSpacing.xLarge) {
        Spacer(minLength: JovieSpacing.xxLarge)

        VStack(spacing: JovieSpacing.large) {
          ZStack {
            TailWeightedSpinner(isActive: isActive && !reduceMotion)
              .frame(width: 96, height: 96)

            Image("Jovie-logo")
              .resizable()
              .scaledToFit()
              .frame(width: 56, height: 56)
              .accessibilityHidden(true)
          }

          VStack(spacing: JovieSpacing.small) {
            Text("Jovie")
              .font(JovieFont.display(size: 24, weight: .semibold))
              .foregroundStyle(JovieColor.textPrimary)

            Text(stages[stageIndex])
              .font(JovieFont.body(size: 13, weight: .medium))
              .foregroundStyle(JovieColor.textTertiary)
              .contentTransition(.opacity)
          }
        }

        CinematicShellPreview(isActive: isActive && !reduceMotion)
          .frame(maxWidth: 360)

        CinematicProgressBar(isActive: isActive && !reduceMotion)
          .frame(width: 176, height: 4)

        Spacer(minLength: JovieSpacing.xxLarge)
      }
      .padding(.horizontal, JovieSpacing.xLarge)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Jovie is loading")
    .task {
      if reduceMotion {
        stageIndex = 1
        return
      }

      isActive = true

      while !Task.isCancelled {
        for index in stages.indices {
          stageIndex = index
          try? await Task.sleep(for: .milliseconds(900))
        }
      }
    }
  }
}

private struct CinematicLoadingBackdrop: View {
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

private struct TailWeightedSpinner: View {
  let isActive: Bool

  var body: some View {
    Circle()
      .trim(from: 0.08, to: 0.82)
      .stroke(
        AngularGradient(
          colors: [
            Color.white.opacity(0),
            Color.white.opacity(0.42),
            JovieColor.accent,
            Color.white
          ],
          center: .center
        ),
        style: StrokeStyle(lineWidth: 7, lineCap: .round)
      )
      .rotationEffect(.degrees(isActive ? 360 : -40))
      .animation(
        .linear(duration: 1.15).repeatForever(autoreverses: false),
        value: isActive
      )
      .overlay {
        Circle()
          .stroke(Color.white.opacity(0.08), lineWidth: 1)
      }
  }
}

private struct CinematicShellPreview: View {
  let isActive: Bool

  var body: some View {
    HStack(alignment: .top, spacing: JovieSpacing.small) {
      SkeletonPanel(width: 72) {
        VStack(alignment: .leading, spacing: 9) {
          SkeletonLine(width: 28, height: 7, isActive: isActive)
          ForEach([46, 36, 52, 30], id: \.self) { width in
            SkeletonLine(width: CGFloat(width), height: 6, isActive: isActive)
          }
        }
      }

      SkeletonPanel(width: 160) {
        VStack(alignment: .leading, spacing: 10) {
          SkeletonLine(width: 92, height: 8, isActive: isActive)
          SkeletonLine(width: 116, height: 5, isActive: isActive)

          RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
            .fill(Color.white.opacity(0.90))
            .frame(width: 78, height: 78)
            .overlay {
              VStack(spacing: 5) {
                ForEach(0..<4, id: \.self) { row in
                  HStack(spacing: 5) {
                    ForEach(0..<4, id: \.self) { column in
                      RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                        .fill((row + column).isMultiple(of: 2) ? JovieColor.backgroundBase : Color.clear)
                        .frame(width: 9, height: 9)
                    }
                  }
                }
              }
            }
            .padding(.top, 2)
        }
      }

      SkeletonPanel(width: 82) {
        VStack(alignment: .leading, spacing: 9) {
          Circle()
            .fill(Color.white.opacity(0.12))
            .frame(width: 24, height: 24)
          SkeletonLine(width: 46, height: 7, isActive: isActive)
          SkeletonLine(width: 58, height: 6, isActive: isActive)
          SkeletonLine(width: 34, height: 6, isActive: isActive)
        }
      }
    }
    .padding(JovieSpacing.small)
    .background(JovieColor.surface0.opacity(0.78), in: RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
  }
}

private struct SkeletonPanel<Content: View>: View {
  let width: CGFloat
  @ViewBuilder let content: Content

  var body: some View {
    content
      .padding(JovieSpacing.medium)
      .frame(width: width, height: 132, alignment: .topLeading)
      .background(JovieColor.surface1.opacity(0.82), in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous))
  }
}

private struct SkeletonLine: View {
  let width: CGFloat
  let height: CGFloat
  let isActive: Bool

  var body: some View {
    RoundedRectangle(cornerRadius: height / 2, style: .continuous)
      .fill(JovieColor.surface3)
      .overlay(alignment: .leading) {
        Rectangle()
          .fill(
            LinearGradient(
              colors: [
                Color.clear,
                Color.white.opacity(0.22),
                Color.clear
              ],
              startPoint: .leading,
              endPoint: .trailing
            )
          )
          .frame(width: width * 0.7)
          .offset(x: isActive ? width : -width)
      }
      .clipShape(RoundedRectangle(cornerRadius: height / 2, style: .continuous))
      .frame(width: width, height: height)
      .animation(
        .easeInOut(duration: 1.4).repeatForever(autoreverses: false),
        value: isActive
      )
  }
}

private struct CinematicProgressBar: View {
  let isActive: Bool

  var body: some View {
    GeometryReader { proxy in
      ZStack(alignment: .leading) {
        Capsule()
          .fill(Color.white.opacity(0.08))

        Capsule()
          .fill(
            LinearGradient(
              colors: [Color.white, JovieColor.accent],
              startPoint: .leading,
              endPoint: .trailing
            )
          )
          .frame(width: proxy.size.width * (isActive ? 0.78 : 0.24))
          .animation(
            .easeInOut(duration: 1.2).repeatForever(autoreverses: true),
            value: isActive
          )
      }
    }
  }
}
