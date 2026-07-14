import PassKit
import SwiftUI
import UIKit

struct AppleWalletPassSheet: Identifiable {
  let id = UUID()
  let pass: PKPass
}

struct AppleWalletAddPassButton: UIViewRepresentable {
  let isEnabled: Bool
  let action: @MainActor () -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(action: action)
  }

  func makeUIView(context: Context) -> PKAddPassButton {
    let button = PKAddPassButton(addPassButtonStyle: .black)
    button.addTarget(
      context.coordinator,
      action: #selector(Coordinator.didTap),
      for: .touchUpInside
    )
    return button
  }

  func updateUIView(_ button: PKAddPassButton, context: Context) {
    context.coordinator.action = action
    button.isUserInteractionEnabled = isEnabled
    button.alpha = isEnabled ? 1 : 0.6
  }

  final class Coordinator: NSObject {
    var action: @MainActor () -> Void

    init(action: @escaping @MainActor () -> Void) {
      self.action = action
    }

    @MainActor
    @objc func didTap() {
      action()
    }
  }
}

struct AppleWalletAddPassView: UIViewControllerRepresentable {
  let pass: PKPass

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  func makeUIViewController(context: Context) -> UIViewController {
    guard let controller = PKAddPassesViewController(pass: pass) else {
      return UIViewController()
    }
    controller.delegate = context.coordinator
    return controller
  }

  func updateUIViewController(_ controller: UIViewController, context: Context) {}

  final class Coordinator: NSObject, PKAddPassesViewControllerDelegate {
    func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
      controller.dismiss(animated: true)
    }
  }
}
