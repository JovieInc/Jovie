import SwiftUI
import WebKit

struct PublicProfileBrowserDestination: Identifiable, Equatable {
  let url: URL
  let policy: PublicProfileURLPolicy
  var id: URL { url }
}

struct PublicProfileURLPolicy: Equatable {
  let allowedHost: String
  let allowedProfileRoot: String

  /// Canonical public-profile reserved roots from desktop `navigation.ts`
  /// plus iOS `mobile-auth-return`. First-path-segment match only.
  private static let reservedRootSegments: Set<String> = [
    ".well-known",
    "_next",
    "__clerk",
    "a",
    "about",
    "account",
    "actions",
    "admin",
    "ai",
    "alternatives",
    "api",
    "app",
    "artist-notifications",
    "artist-profile",
    "artist-profiles",
    "artist-selection",
    "artists",
    "auth",
    "auth-return",
    "billing",
    "blog",
    "brand",
    "changelog",
    "claim",
    "clerk",
    "compare",
    "demo",
    "demovideo",
    "desktop-auth",
    "docs",
    "download",
    "drop",
    "favicon.ico",
    "go",
    "hud",
    "hud-tv",
    "investor-portal",
    "investors",
    "launch",
    "legal",
    "llms-full.txt",
    "llms.txt",
    "mobile-auth-return",
    "new",
    "og",
    "onboarding",
    "out",
    "p",
    "pay",
    "pricing",
    "r",
    "renders",
    "s",
    "share",
    "sign-in",
    "sign-up",
    "signin",
    "signup",
    "sso-callback",
    "support",
    "unavailable",
    "waitlist",
  ]

  private static let allowedHosts: Set<String> = [
    "jov.ie",
    "staging.jov.ie",
  ]

  private static let usernamePattern = /^[A-Za-z][A-Za-z0-9._-]{1,28}[A-Za-z0-9]$/
  private static let childSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/

  init?(webBaseURL: URL) {
    guard webBaseURL.scheme?.lowercased() == "https",
          let host = webBaseURL.host?.lowercased(),
          allowedHosts.contains(host),
          let profileRoot = Self.validatedProfileRoot(for: webBaseURL)
    else {
      return nil
    }

    allowedHost = host
    allowedProfileRoot = profileRoot
  }

  init?(publicProfileURL: String) {
    guard let url = URL(string: publicProfileURL) else { return nil }
    self.init(webBaseURL: url)
  }

  func validatedURL(from value: String?) -> URL? {
    guard let value,
          let url = URL(string: value),
          allows(url)
    else {
      return nil
    }

    return url
  }

  func allows(_ url: URL) -> Bool {
    url.scheme?.lowercased() == "https"
      && url.host?.lowercased() == allowedHost
      && Self.validatedProfileRoot(for: url) == allowedProfileRoot
  }

  private static func validatedProfileRoot(for url: URL) -> String? {
    guard let decodedPath = url.path.removingPercentEncoding,
          !decodedPath.contains("\\"),
          !decodedPath.contains("//")
    else {
      return nil
    }

    let segments = decodedPath.split(separator: "/", omittingEmptySubsequences: true)
      .map(String.init)
    guard let root = segments.first,
          segments.count <= 4,
          root.wholeMatch(of: usernamePattern) != nil,
          !reservedRootSegments.contains(root.lowercased()),
          segments.dropFirst().allSatisfy({
            $0.wholeMatch(of: childSegmentPattern) != nil
          })
    else {
      return nil
    }

    return root.lowercased()
  }
}

@MainActor
final class PublicProfileBrowserModel: NSObject, ObservableObject, WKNavigationDelegate {
  @Published private(set) var isLoading = true
  @Published private(set) var canGoBack = false
  @Published private(set) var canGoForward = false
  @Published private(set) var errorMessage: String?

  let webView: WKWebView

  private let initialURL: URL
  private let policy: PublicProfileURLPolicy
  private var didPresentUITestFailure = false

  init(initialURL: URL, policy: PublicProfileURLPolicy) {
    self.initialURL = initialURL
    self.policy = policy

    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    webView = WKWebView(frame: .zero, configuration: configuration)

    super.init()

    webView.navigationDelegate = self
    webView.allowsBackForwardNavigationGestures = true
  }

  func load() {
    errorMessage = nil
    isLoading = true

    if ProcessInfo.processInfo.arguments.contains("-ui-testing-public-profile-error"),
       !didPresentUITestFailure
    {
      didPresentUITestFailure = true
      isLoading = false
      errorMessage = "Couldn't load this profile."
      return
    }

    if ProcessInfo.processInfo.arguments.contains("-ui-testing-ready") {
      webView.loadHTMLString(
        "<html><body style='background:#0a0a0b;color:white;font:24px -apple-system;padding:32px'>Public Profile</body></html>",
        baseURL: initialURL
      )
      return
    }

    webView.load(URLRequest(url: initialURL))
  }

  func goBack() {
    guard webView.canGoBack else { return }
    webView.goBack()
  }

  func goForward() {
    guard webView.canGoForward else { return }
    webView.goForward()
  }

  func reload() {
    errorMessage = nil
    isLoading = true

    if webView.url == nil {
      load()
    } else {
      webView.reload()
    }
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.cancel)
      refuseNavigation(in: webView)
      return
    }

    // WKWebView uses about:blank while applying loadHTMLString / empty documents.
    // That is not an origin escape and must not trip the public-profile error state.
    if url.scheme?.lowercased() == "about" {
      decisionHandler(.allow)
      return
    }

    guard policy.allows(url) else {
      decisionHandler(.cancel)
      refuseNavigation(in: webView)
      return
    }

    decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation?) {
    errorMessage = nil
    isLoading = true
    updateNavigationState(webView)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
    isLoading = false
    updateNavigationState(webView)
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation?,
    withError error: Error
  ) {
    showLoadFailure(error, in: webView)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation?, withError error: Error) {
    showLoadFailure(error, in: webView)
  }

  private func showLoadFailure(_ error: Error, in webView: WKWebView) {
    let nsError = error as NSError
    guard nsError.code != NSURLErrorCancelled else { return }

    isLoading = false
    errorMessage = "Couldn't load this profile."
    updateNavigationState(webView)
  }

  private func refuseNavigation(in webView: WKWebView) {
    isLoading = false
    if webView.url == nil {
      errorMessage = "Couldn't load this profile."
    }
    updateNavigationState(webView)
  }

  private func updateNavigationState(_ webView: WKWebView) {
    canGoBack = webView.canGoBack
    canGoForward = webView.canGoForward
  }
}

private struct PublicProfileWebView: UIViewRepresentable {
  let webView: WKWebView

  func makeUIView(context: Context) -> WKWebView {
    webView
  }

  func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct PublicProfileBrowserView: View {
  @Environment(\.dismiss) private var dismiss
  @StateObject private var model: PublicProfileBrowserModel

  init(initialURL: URL, policy: PublicProfileURLPolicy) {
    _model = StateObject(
      wrappedValue: PublicProfileBrowserModel(initialURL: initialURL, policy: policy)
    )
  }

  var body: some View {
    VStack(spacing: 0) {
      toolbar

      ZStack {
        PublicProfileWebView(webView: model.webView)
          .accessibilityIdentifier("public-profile-web-view")

        if model.isLoading {
          ProgressView()
            .tint(JovieColor.textPrimary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(JovieColor.backgroundBase.opacity(0.82))
            .accessibilityLabel("Loading Public Profile")
        }

        if let errorMessage = model.errorMessage {
          VStack(spacing: JovieSpacing.large) {
            Text(errorMessage)
              .font(JovieFont.body(size: 16, weight: .medium))
              .foregroundStyle(JovieColor.textPrimary)

            Button("Retry") {
              model.reload()
            }
            .buttonStyle(JoviePillButtonStyle(filled: true))
            .frame(maxWidth: 220)
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(JovieColor.backgroundBase)
          .accessibilityIdentifier("public-profile-browser-error")
        }
      }
    }
    .background(JovieColor.backgroundBase.ignoresSafeArea())
    .task {
      model.load()
    }
  }

  private var toolbar: some View {
    HStack(spacing: JovieSpacing.medium) {
      Button {
        dismiss()
      } label: {
        Image(systemName: "xmark")
      }
      .buttonStyle(JovieIconButtonStyle())
      .accessibilityLabel("Close Public Profile")
      .accessibilityIdentifier("public-profile-browser-close")

      Spacer()

      Button {
        model.goBack()
      } label: {
        Image(systemName: "chevron.left")
      }
      .buttonStyle(JovieIconButtonStyle())
      .disabled(!model.canGoBack)
      .accessibilityLabel("Back")
      .accessibilityIdentifier("public-profile-browser-back")

      Button {
        model.goForward()
      } label: {
        Image(systemName: "chevron.right")
      }
      .buttonStyle(JovieIconButtonStyle())
      .disabled(!model.canGoForward)
      .accessibilityLabel("Forward")
      .accessibilityIdentifier("public-profile-browser-forward")

      Button {
        model.reload()
      } label: {
        Image(systemName: "arrow.clockwise")
      }
      .buttonStyle(JovieIconButtonStyle())
      .accessibilityLabel("Reload")
      .accessibilityIdentifier("public-profile-browser-reload")
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.vertical, JovieSpacing.small)
    .background(JovieColor.backgroundBase)
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(JovieColor.borderSubtle)
        .frame(height: 1)
    }
  }
}
