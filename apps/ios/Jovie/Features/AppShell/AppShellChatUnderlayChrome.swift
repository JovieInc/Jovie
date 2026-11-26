import SwiftUI

/// Chat stays mounted across tabs; visibility must gate empty-home measurement.
@ViewBuilder
func appShellChatUnderlayChrome<Content: View>(
  isChatSelected: Bool,
  @ViewBuilder content: () -> Content
) -> some View {
  content()
    .environment(\.chatSurfaceVisible, isChatSelected)
    .opacity(isChatSelected ? 1 : 0)
    .allowsHitTesting(isChatSelected)
    .accessibilityHidden(!isChatSelected)
}
