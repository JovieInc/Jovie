import ClerkKitUI
import SwiftUI

struct AuthScreen: View {
  let isMock: Bool

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      if isMock {
        VStack(spacing: JovieSpacing.large) {
          Text("Sign In")
            .font(JovieFont.display(size: 28))
            .foregroundStyle(JovieColor.textPrimary)

          Text("Clerk auth is mocked for UI testing.")
            .font(JovieFont.body(size: 15))
            .foregroundStyle(JovieColor.textTertiary)
        }
        .padding()
      } else {
        AuthView(isDismissable: false)
          .padding()
      }
    }
  }
}
