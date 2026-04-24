import SwiftUI

struct NeedsOnboardingView: View {
  let continueURL: URL
  @Environment(\.openURL) private var openURL

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(alignment: .leading, spacing: JovieSpacing.large) {
        Text("Complete Your Profile On Web")
          .font(JovieFont.display(size: 28))
          .foregroundStyle(JovieColor.textPrimary)

        Text("Complete your profile at jov.ie to use the app.")
          .font(JovieFont.body(size: 16))
          .foregroundStyle(JovieColor.textSecondary)

        Button("Continue On Web") {
          openURL(continueURL)
        }
        .buttonStyle(JoviePillButtonStyle(filled: true))
      }
      .padding(JovieSpacing.xLarge)
    }
  }
}
