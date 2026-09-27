import Foundation
import Observation

/// Base URL for the Mac spike. `JOVIE_MAC_BASE_URL` (env) or the
/// `JovieMacBaseURL` default overrides production, e.g. staging while
/// production lags the passkey deploy.
enum MacConfiguration {
  static let defaultBaseURL = URL(string: "https://jov.ie")!

  static func baseURL(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    defaults: UserDefaults = .standard
  ) -> URL {
    let candidates = [environment["JOVIE_MAC_BASE_URL"], defaults.string(forKey: "JovieMacBaseURL")]
    for candidate in candidates {
      guard let raw = candidate?.trimmingCharacters(in: .whitespacesAndNewlines),
            let url = URL(string: raw),
            isSupported(url)
      else { continue }
      return url
    }
    return defaultBaseURL
  }

  static func isSupported(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased(), !host.isEmpty
    else { return false }
    if scheme == "https" { return true }
    return scheme == "http" && (host == "localhost" || host == "127.0.0.1")
  }

  static var isFixtureLaunch: Bool {
    ProcessInfo.processInfo.arguments.contains("-jovie-mac-fixture-home")
  }
}

/// Minimal slice of `/api/hud/metrics` (admin-only) for the Ovie home.
struct MacOpsSnapshot: Decodable, Equatable, Sendable {
  struct Reliability: Decodable, Equatable, Sendable {
    let reliabilityScorePercent: Double
    let incidents24h: Int
  }

  let reliability: Reliability
  let generatedAtIso: String

  static let fixture = MacOpsSnapshot(
    reliability: .init(reliabilityScorePercent: 99.2, incidents24h: 1),
    generatedAtIso: "2026-09-27T00:00:00.000Z"
  )
}

@MainActor
@Observable
final class MacSessionModel {
  enum Phase: Equatable {
    case signedOut
    case signingIn
    case signedIn
  }

  private(set) var phase: Phase = .signedOut
  private(set) var errorMessage: String?
  private(set) var me: MobileMeResponse?
  private(set) var ops: MacOpsSnapshot?
  private(set) var opsNote: String?
  let baseURL: URL
  let isFixture: Bool

  private let performer = PasskeyAssertionPerformer()

  init(baseURL: URL = MacConfiguration.baseURL(), isFixture: Bool = MacConfiguration.isFixtureLaunch) {
    self.baseURL = baseURL
    self.isFixture = isFixture
  }

  func bootstrap() async {
    if isFixture {
      me = .previewReady
      ops = .fixture
      phase = .signedIn
      return
    }
    guard NativeSessionTokenStore.load() != nil else {
      phase = .signedOut
      return
    }
    phase = .signedIn
    await loadHome()
  }

  func signInWithPasskey() async {
    guard phase != .signingIn else { return }
    phase = .signingIn
    errorMessage = nil
    let client = PasskeyAuthClient(baseURL: baseURL)
    do {
      let options = try await client.fetchOptions()
      let assertion = try await performer.assert(
        options: options,
        relyingParty: baseURL.host ?? "jov.ie"
      )
      let result = try await client.verify(assertion)
      NativeSessionTokenStore.save(
        token: result.token,
        userID: result.userID,
        expiresAt: result.expiresAt
      )
      phase = .signedIn
      await loadHome()
    } catch PasskeySignInError.cancelled {
      phase = .signedOut
    } catch {
      errorMessage = error.localizedDescription
      phase = .signedOut
    }
  }

  func signOut() async {
    if !isFixture {
      _ = await NativeSessionRevoker(baseURL: baseURL).revokeCurrentSession()
      NativeSessionTokenStore.clear()
    }
    me = nil
    ops = nil
    opsNote = nil
    phase = .signedOut
  }

  func loadHome() async {
    let api = APIClient(baseURL: baseURL, tokenProvider: NativeSessionTokenProvider())
    do {
      me = try await api.fetchMe()
    } catch {
      if NativeSessionTokenStore.load() == nil {
        phase = .signedOut
        errorMessage = "Your session ended. Sign in again."
        return
      }
      errorMessage = error.localizedDescription
    }
    await loadOps()
  }

  private func loadOps() async {
    guard let token = NativeSessionTokenStore.load()?.token else { return }
    var request = URLRequest(url: baseURL.appending(path: "/api/hud/metrics"))
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    do {
      let (data, response) = try await URLSession(configuration: .jovieMobile).data(for: request)
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      guard (200 ... 299).contains(status) else {
        opsNote = status == 401 || status == 403
          ? "Ops metrics need an admin session."
          : "Ops metrics unavailable (\(status))."
        return
      }
      ops = try JSONDecoder().decode(MacOpsSnapshot.self, from: data)
      opsNote = nil
    } catch {
      opsNote = "Ops metrics unavailable."
    }
  }
}
