import SwiftUI

struct DetachedPillConsumer: View {
  var body: some View {
    Button("Detached") {}
      .buttonStyle(JoviePillButtonStyle(filled: true))
  }
}
