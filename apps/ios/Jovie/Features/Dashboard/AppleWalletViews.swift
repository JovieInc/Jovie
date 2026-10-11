import PassKit
import SwiftUI
import UIKit

struct AppleWalletPassSheet: Identifiable {
  let id = UUID()
  let pass: PKPass
  let controller: PKAddPassesViewController
}

enum AppleWalletControlAvailability: Equatable {
  case serverUnavailable
  case deviceUnsupported
  case available

  init(serverAvailable: Bool, deviceCanAddPasses: Bool) {
    if !serverAvailable {
      self = .serverUnavailable
    } else if !deviceCanAddPasses {
      self = .deviceUnsupported
    } else {
      self = .available
    }
  }
}

enum AppleWalletFlowState: Equatable {
  case available
  case loading
  case presenting
  case installed
  case failed
  case controllerUnavailable

  var preventsRequest: Bool {
    self == .loading || self == .presenting || self == .installed
  }

  mutating func beginRequest() -> Bool {
    guard !preventsRequest else { return false }
    self = .loading
    return true
  }

  mutating func preparedPass(isInstalled: Bool, controllerAvailable: Bool = true) {
    if isInstalled {
      self = .installed
    } else if controllerAvailable {
      self = .presenting
    } else {
      self = .controllerUnavailable
    }
  }

  mutating func requestFailed() {
    self = .failed
  }

  mutating func presentationFinished(isInstalled: Bool) {
    self = isInstalled ? .installed : .available
  }
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
  let controller: PKAddPassesViewController
  let onFinish: @MainActor () -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(onFinish: onFinish)
  }

  func makeUIViewController(context: Context) -> PKAddPassesViewController {
    controller.delegate = context.coordinator
    return controller
  }

  func updateUIViewController(
    _ controller: PKAddPassesViewController,
    context: Context
  ) {}

  final class Coordinator: NSObject, PKAddPassesViewControllerDelegate {
    var onFinish: @MainActor () -> Void

    init(onFinish: @escaping @MainActor () -> Void) {
      self.onFinish = onFinish
    }

    @MainActor
    func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
      onFinish()
    }
  }
}
