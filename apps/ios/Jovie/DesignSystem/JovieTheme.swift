import SwiftUI
import UIKit

enum JovieColor {
  static let backgroundBase = Color(hex: 0x06070A)
  static let surface0 = Color(hex: 0x0A0B0E)
  static let surface1 = Color(hex: 0x101216)
  static let surface2 = Color(hex: 0x161A20)
  static let surface3 = Color(hex: 0x2A2C32)
  static let textPrimary = Color(hex: 0xFFFFFF)
  static let textSecondary = Color(hex: 0xE3E4E6)
  static let textTertiary = Color(hex: 0x969799)
  static let borderSubtle = Color.white.opacity(0.05)
  static let borderDefault = Color.white.opacity(0.08)
  static let borderStrong = Color.white.opacity(0.10)
  static let accentBlue = Color(hex: 0x4D7DFF)
  static let accentPurple = Color(hex: 0x9B4DFF)
  static let accentPink = Color(hex: 0xEA4A9C)
  static let accentOrange = Color(hex: 0xFFAB2E)
  /// System B focus/active accent (`--color-accent`), not a CTA color.
  static let accent = Color(hex: 0x7170FF)
  static let progressTrack = accentBlue.opacity(0.08)
  static let errorText = Color(hex: 0xFF7A73)
  static let qrSurface = Color.white

  /// Per-entity-kind accent colors for inline chat chips (JOV-3608). Ported
  /// 1:1 from the dark-mode carbon-palette CSS vars in
  /// apps/web/styles/design-system.css (`--color-accent`,
  /// `--color-accent-purple`, `--color-accent-blue`,
  /// `--color-accent-orange`), which is what `EntityChip`/`EntityMentionSpan`
  /// resolve to via `ENTITY_KIND_ACCENT_VAR` on the web. Distinct from the
  /// generic `accentBlue`/`accentPurple`/`accentPink` above -- those back
  /// unrelated iOS-only UI (tool-call cards, buttons) and must not be reused
  /// here or web/iOS accent parity silently drifts on the next design pass.
  enum EntityAccent {
    /// release -> --color-accent
    static let release = Color(hex: 0x7170FF)
    /// artist -> --color-accent-purple
    static let artist = Color(hex: 0x9B4DFF)
    /// track -> --color-accent-blue
    static let track = Color(hex: 0x4D7DFF)
    /// event -> --color-accent-orange
    static let event = Color(hex: 0xFFAB2E)

    static func color(for kind: MobileChatEntityKind) -> Color {
      switch kind {
      case .release: return release
      case .artist: return artist
      case .track: return track
      case .event: return event
      }
    }
  }
}

enum JovieFont {
  static func display(size: CGFloat, weight: Font.Weight = .semibold) -> Font {
    font(size: size, weight: weight)
  }

  static func body(size: CGFloat, weight: Font.Weight = .regular) -> Font {
    font(size: size, weight: weight)
  }

  private static func font(size: CGFloat, weight: Font.Weight) -> Font {
    if UIFont(name: "Inter Variable", size: size) != nil {
      return .custom("Inter Variable", size: size).weight(weight)
    }

    if UIFont(name: "Inter", size: size) != nil {
      return .custom("Inter", size: size).weight(weight)
    }

    return .system(size: size, weight: weight)
  }
}

enum JovieSpacing {
  static let xSmall: CGFloat = 4
  static let small: CGFloat = 8
  static let medium: CGFloat = 12
  static let large: CGFloat = 16
  static let xLarge: CGFloat = 24
  static let xxLarge: CGFloat = 32
}

enum JovieRadius {
  static let small: CGFloat = 6
  static let medium: CGFloat = 8
  static let large: CGFloat = 12
  static let xLarge: CGFloat = 16
  static let pill: CGFloat = 999
}

/// System B motion tokens, ported from apps/web/styles/design-system.css.
/// SUBTLE for micro-interactions (press, color, toast); CINEMATIC for
/// high-impact reveals (drawer, modal, surface morph). Movement (offset/scale)
/// must be dropped under Reduce Motion; opacity transitions may remain.
enum JovieMotion {
  static let instantDuration: Double = 0.05
  static let fastDuration: Double = 0.10
  static let normalDuration: Double = 0.16
  static let subtleDuration: Double = 0.15
  static let slowDuration: Double = 0.25
  static let cinematicDuration: Double = 0.42

  /// --ease-subtle @ 150ms — hover/press/color micro-changes.
  static let subtle = Animation.timingCurve(0.4, 0, 0.2, 1, duration: subtleDuration)
  /// --ease-cinematic @ 420ms — drawers, modals, surface morphs.
  static let cinematic = Animation.timingCurve(0.22, 1, 0.36, 1, duration: cinematicDuration)
  /// --ease-out — enter/exit; starts fast so it feels responsive.
  static func easeOut(duration: Double = normalDuration) -> Animation {
    .timingCurve(0.16, 1, 0.3, 1, duration: duration)
  }
  /// --ease-spring — rare playful overshoot, opt-in only.
  static func spring(duration: Double = slowDuration) -> Animation {
    .timingCurve(0.34, 1.56, 0.64, 1, duration: duration)
  }

  /// --scale-press — canonical press-down scale for pressable elements.
  static let pressScale: CGFloat = 0.96
}

enum JovieQRCodePlate {
  static let padding = JovieSpacing.xLarge
  static let radius = JovieRadius.large
  static let background = JovieColor.qrSurface
}

private struct JovieSurfaceModifier: ViewModifier {
  let radius: CGFloat
  let interactive: Bool

  @ViewBuilder
  func body(content: Content) -> some View {
    if #available(iOS 26.0, *) {
      if interactive {
        content
          .glassEffect(
            .regular.tint(JovieColor.surface1.opacity(0.62)).interactive(),
            in: .rect(cornerRadius: radius)
          )
      } else {
        content
          .glassEffect(
            .regular.tint(JovieColor.surface1.opacity(0.62)),
            in: .rect(cornerRadius: radius)
          )
      }
    } else {
      content
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: radius, style: .continuous)
            .stroke(JovieColor.borderDefault, lineWidth: 1)
        }
    }
  }
}

private struct JovieQRCodePlateModifier: ViewModifier {
  func body(content: Content) -> some View {
    content
      .padding(JovieQRCodePlate.padding)
      .background(
        JovieQRCodePlate.background,
        in: RoundedRectangle(cornerRadius: JovieQRCodePlate.radius, style: .continuous)
      )
  }
}

extension View {
  func jovieSurface(radius: CGFloat = JovieRadius.large, interactive: Bool = false) -> some View {
    modifier(JovieSurfaceModifier(radius: radius, interactive: interactive))
  }

  func jovieQRCodePlate() -> some View {
    modifier(JovieQRCodePlateModifier())
  }
}

struct JoviePillButtonStyle: ButtonStyle {
  let filled: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(JovieFont.body(size: 14, weight: .semibold))
      .foregroundStyle(filled ? JovieColor.backgroundBase : JovieColor.textPrimary)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 14)
      .background(
        RoundedRectangle(cornerRadius: JovieRadius.pill, style: .continuous)
          .fill(filled ? Color.white : JovieColor.surface1)
      )
      .overlay {
        RoundedRectangle(cornerRadius: JovieRadius.pill, style: .continuous)
          .stroke(
            filled ? Color.clear : JovieColor.borderDefault,
            lineWidth: 1
          )
      }
      .opacity(configuration.isPressed ? 0.8 : 1)
      .scaleEffect(configuration.isPressed ? JovieMotion.pressScale : 1)
      .animation(JovieMotion.subtle, value: configuration.isPressed)
  }
}

struct JovieIconButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 17, weight: .semibold))
      .foregroundStyle(JovieColor.textPrimary)
      .frame(width: 44, height: 44)
      .background(JovieColor.surface1, in: Circle())
      .overlay {
        Circle().stroke(JovieColor.borderDefault, lineWidth: 1)
      }
      .opacity(configuration.isPressed ? 0.72 : 1)
      .scaleEffect(configuration.isPressed ? JovieMotion.pressScale : 1)
      .animation(JovieMotion.subtle, value: configuration.isPressed)
  }
}

struct JovieLogoMark: View {
  let size: CGFloat

  var body: some View {
    Image("Jovie-logo")
      .resizable()
      .renderingMode(.template)
      .scaledToFit()
      .foregroundStyle(Color.white)
      .frame(width: size, height: size)
      .accessibilityHidden(true)
  }
}

extension Color {
  init(hex: UInt32) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: 1
    )
  }
}
