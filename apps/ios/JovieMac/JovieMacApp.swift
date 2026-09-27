import SwiftUI

/// Swift-native Mac spike (docs/macos/ADR-swift-native-mac.md). Electron
/// (`apps/desktop`) stays the shipped Mac app until this reaches parity.
@main
struct JovieMacApp: App {
  @State private var model = MacSessionModel()

  var body: some Scene {
    WindowGroup("Jovie") {
      MacRootView(model: model)
        .frame(minWidth: 720, minHeight: 480)
        .preferredColorScheme(.dark)
        .task { await model.bootstrap() }
    }
    .commands {
      CommandGroup(after: .appSettings) {
        Button("Sign Out") {
          Task { await model.signOut() }
        }
        .disabled(model.phase != .signedIn)
      }
    }
  }
}

struct MacRootView: View {
  let model: MacSessionModel

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()
      switch model.phase {
      case .signedOut, .signingIn:
        MacSignInView(model: model)
          .transition(.opacity)
      case .signedIn:
        MacOvieHomeView(model: model)
          .transition(.opacity)
      }
    }
    .animation(.easeOut(duration: JovieMotion.fastDuration), value: model.phase)
  }
}

struct MacSignInView: View {
  let model: MacSessionModel

  var body: some View {
    VStack(spacing: JovieSpacing.large) {
      JovieLogoMark(size: 40)
      Text("Sign in to Jovie")
        .font(JovieFont.display(size: JovieFont.emptyGreetingSize, numericWeight: JovieFont.emptyGreetingWeight))
        .foregroundStyle(JovieColor.textPrimary)
      Button {
        Task { await model.signInWithPasskey() }
      } label: {
        Label("Sign in with passkey", systemImage: "person.badge.key")
      }
      .buttonStyle(JoviePillButtonStyle(filled: true))
      .frame(maxWidth: 320)
      .keyboardShortcut(.defaultAction)
      .disabled(model.phase == .signingIn)
      .accessibilityIdentifier("mac-passkey-sign-in")

      // Reserved line so an error never shifts the button.
      Text(model.errorMessage ?? " ")
        .font(JovieFont.body(size: 12))
        .foregroundStyle(JovieColor.errorText)
        .multilineTextAlignment(.center)
        .frame(maxWidth: 420, minHeight: 32, alignment: .top)
        .opacity(model.errorMessage == nil ? 0 : 1)
      Text(model.baseURL.host ?? "")
        .font(JovieFont.body(size: 11))
        .foregroundStyle(JovieColor.textTertiary)
    }
    .padding(JovieSpacing.xxLarge)
  }
}

struct MacOvieHomeView: View {
  let model: MacSessionModel

  var body: some View {
    NavigationSplitView {
      List {
        Label("Ovie", systemImage: "sparkles")
      }
      .navigationSplitViewColumnWidth(min: 180, ideal: 200)
    } detail: {
      ScrollView {
        VStack(alignment: .leading, spacing: JovieSpacing.xLarge) {
          header
          metrics
        }
        .padding(JovieSpacing.xxLarge)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(JovieColor.surface0)
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
      HStack(spacing: JovieSpacing.small) {
        Text(greeting)
          .font(JovieFont.display(size: JovieFont.emptyGreetingSize, numericWeight: JovieFont.emptyGreetingWeight))
          .foregroundStyle(JovieColor.textPrimary)
        if model.isFixture {
          Text("Fixture")
            .font(JovieFont.body(size: 11, weight: .semibold))
            .foregroundStyle(JovieColor.accentOrange)
            .padding(.horizontal, JovieSpacing.small)
            .padding(.vertical, 2)
            .overlay(Capsule().stroke(JovieColor.accentOrange.opacity(0.5)))
        }
      }
      Text(model.me?.username.map { "@\($0)" } ?? " ")
        .font(JovieFont.body(size: 13))
        .foregroundStyle(JovieColor.textTertiary)
    }
  }

  private var greeting: String {
    guard let name = model.me?.displayName, !name.isEmpty else { return "Ovie" }
    return "Hi, \(name.split(separator: " ").first.map(String.init) ?? name)"
  }

  private var metrics: some View {
    HStack(alignment: .top, spacing: JovieSpacing.medium) {
      metricCard(
        title: "Reliability",
        value: model.ops.map { String(format: "%.1f%%", $0.reliability.reliabilityScorePercent) }
      )
      metricCard(
        title: "Incidents 24h",
        value: model.ops.map { String($0.reliability.incidents24h) }
      )
      metricCard(title: "Updated", value: model.ops.map { relativeTime($0.generatedAtIso) })
    }
    .overlay(alignment: .bottomLeading) {
      Text(model.opsNote ?? " ")
        .font(JovieFont.body(size: 12))
        .foregroundStyle(JovieColor.textTertiary)
        .offset(y: 24)
    }
  }

  private func metricCard(title: String, value: String?) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
      Text(title)
        .font(JovieFont.body(size: 12))
        .foregroundStyle(JovieColor.textTertiary)
      Text(value ?? "–")
        .font(JovieFont.display(size: 22))
        .foregroundStyle(JovieColor.textPrimary)
        .monospacedDigit()
    }
    .frame(maxWidth: .infinity, minHeight: 72, alignment: .topLeading)
    .padding(JovieSpacing.large)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: JovieRadius.large))
    .overlay(
      RoundedRectangle(cornerRadius: JovieRadius.large).stroke(JovieColor.borderSubtle)
    )
  }

  private func relativeTime(_ iso: String) -> String {
    guard let date = PasskeyAuthClient.parseDate(iso) else { return "–" }
    return date.formatted(.relative(presentation: .named))
  }
}
