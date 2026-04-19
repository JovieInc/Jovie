import SwiftUI

struct SplashView: View {
  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      Image("Jovie-logo")
        .resizable()
        .scaledToFit()
        .frame(width: 112)
        .accessibilityHidden(true)
    }
  }
}
