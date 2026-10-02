import JovieKit
import SwiftUI

@main
struct JovieMacApp: App {
  private let content = MacDevelopmentContent.resolve(arguments: ProcessInfo.processInfo.arguments)

  var body: some Scene {
    WindowGroup("Jovie Mac Development") {
      MacDevelopmentView(content: content)
        .preferredColorScheme(.dark)
    }
    .defaultSize(width: 640, height: 480)
  }
}

struct MacDevelopmentView: View {
  let content: MacDevelopmentContent

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.xLarge) {
      Text("Jovie Mac Development")
        .font(JovieFont.display(size: 24))
      switch content {
      case .unavailable:
        Text("The native Mac app is not available yet.")
          .font(JovieFont.body(size: 16))
      #if DEBUG
      case .fixture(let conversation, let messages):
        Text("Development fixture · Read only")
          .font(JovieFont.body(size: 14))
          .foregroundStyle(JovieColor.textSecondary)
        Text(conversation.title ?? "Untitled conversation")
          .font(JovieFont.display(size: 18))
        ScrollView {
          VStack(alignment: .leading, spacing: JovieSpacing.large) {
            ForEach(messages) { message in
              Text(message.content)
                .font(JovieFont.body(size: 16))
                .frame(maxWidth: .infinity, alignment: .leading)
            }
          }
        }
      #endif
      }
    }
    .padding(JovieSpacing.xxLarge)
    .frame(minWidth: 420, maxWidth: .infinity, minHeight: 320, maxHeight: .infinity, alignment: .topLeading)
    .foregroundStyle(JovieColor.textPrimary)
    .background(JovieColor.backgroundBase)
  }
}
