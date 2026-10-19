import SwiftUI
#if canImport(UIKit)
import UIKit
#else
import AppKit
import CoreText
#endif

/// Native projection of ZiaWI palette + the product semantic emitter.
/// Regenerate/check with apps/ios/scripts/native-design-system.mjs; never hand-tune hexes.
enum JovieColor {
  // BEGIN GENERATED NATIVE COLORS
  /// Source: elevations.dark.canvas
  static let backgroundBase = Color(hex: 0x030406)
  /// Source: elevations.dark.shell
  static let surface0 = Color(hex: 0x07080A)
  /// Source: elevations.dark.card
  static let surface1 = Color(hex: 0x131417)
  /// Source: elevations.dark.elevated
  static let surface2 = Color(hex: 0x1A1B1E)
  /// Source: elevations.dark.floating
  static let surface3 = Color(hex: 0x232427)
  /// Source: accents.hex.ion
  static let accentBlue = Color(hex: 0x11AFFF)
  /// Source: accents.hex.ultra
  static let accentPurple = Color(hex: 0x8E56F5)
  /// Source: accents.hex.pulse
  static let accentPink = Color(hex: 0xF52BB5)
  /// Source: accents.hex.mint
  static let accentMint = Color(hex: 0x3FFA8B)
  /// Source: accents.hex.orange
  static let accentOrange = Color(hex: 0xFF7800)
  /// Source: accents.hex.red
  static let statusDanger = Color(hex: 0xF72A36)
  /// Source: --color-text-primary-token
  static let textPrimary = Color(hex: 0xF5F7FB)
  /// Source: --color-text-secondary-token
  static let textSecondary = Color(hex: 0xA0A5AF)
  /// Source: --color-text-tertiary-token
  static let textTertiary = Color(hex: 0x9DA2AC)
  /// Source: --noir-ion-text-inverse
  static let textInverse = Color(hex: 0x020307)
  /// Source: --color-btn-primary-bg
  static let buttonPrimaryBackground = Color(hex: 0xE6E6E6)
  /// Source: --color-border-subtle
  static let borderSubtle = Color(hex: 0xA8B0C3).opacity(0.1)
  /// Source: --color-border-default
  static let borderDefault = Color(hex: 0xA8B0C3).opacity(0.16)
  /// Source: --color-border-strong
  static let borderStrong = Color(hex: 0xC7EDFF).opacity(0.26)
  /// Source: --noir-ion-text-strong
  static let imageForeground = Color(hex: 0xFFFFFF)
  // END GENERATED NATIVE COLORS

  /// Ion denotes focus, links and selection, never decorative glyphs or CTA fill.
  static let accent = accentBlue
  static let progressTrack = accentBlue.opacity(0.08)
  /// Error copy remains readable on every elevation; statusDanger paints status indicators.
  static let errorText = textPrimary
  /// Encoded black QR modules require this known white substrate, independent of app surfaces.
  static let qrSurface = Color.white

  enum EntityAccent {
    static let release = JovieColor.accentBlue
    static let artist = JovieColor.accentPurple
    static let track = JovieColor.accentBlue
    static let event = JovieColor.accentOrange
  }
}

enum JovieFont {
  /// Locked empty-chat greeting: 28 / 620.
  static let emptyGreetingSize: CGFloat = 28
  static let emptyGreetingWeight: CGFloat = 620
  /// ActionButton label weight (medium).
  static let actionLabelWeight: CGFloat = 510

  static func display(size: CGFloat, weight: Font.Weight = .semibold) -> Font {
    font(size: size, weight: weight)
  }

  static func display(size: CGFloat, numericWeight: CGFloat) -> Font {
    font(size: size, numericWeight: numericWeight)
  }

  static func body(size: CGFloat, weight: Font.Weight = .regular) -> Font {
    font(size: size, weight: weight)
  }

  static func body(size: CGFloat, numericWeight: CGFloat) -> Font {
    font(size: size, numericWeight: numericWeight)
  }

  private static func font(size: CGFloat, weight: Font.Weight) -> Font {
    #if canImport(UIKit)
    if UIFont(name: "Inter Variable", size: size) != nil {
      return .custom("Inter Variable", size: size).weight(weight)
    }

    if UIFont(name: "Inter", size: size) != nil {
      return .custom("Inter", size: size).weight(weight)
    }
    #else
    if NSFont(name: "Inter Variable", size: size) != nil {
      return .custom("Inter Variable", size: size).weight(weight)
    }

    if NSFont(name: "Inter", size: size) != nil {
      return .custom("Inter", size: size).weight(weight)
    }
    #endif

    return .system(size: size, weight: weight)
  }

  private static func font(size: CGFloat, numericWeight: CGFloat) -> Font {
    #if canImport(UIKit)
    let uiWeight = UIFont.Weight(rawValue: uiFontWeightRawValue(forCSSWeight: numericWeight))
    let descriptorBase =
      UIFont(name: "Inter Variable", size: size)
      ?? UIFont(name: "Inter", size: size)
      ?? UIFont.systemFont(ofSize: size)
    let descriptor = descriptorBase.fontDescriptor.addingAttributes([
      .traits: [UIFontDescriptor.TraitKey.weight: uiWeight.rawValue]
    ])
    return Font(UIFont(descriptor: descriptor, size: size))
    #else
    return Font(appKitBody(size: size, numericWeight: numericWeight) as CTFont)
    #endif
  }

  #if canImport(AppKit) && !canImport(UIKit)
  /// The native editor shares the same Inter resolution and weight mapping as SwiftUI.
  static func appKitBody(size: CGFloat, numericWeight: CGFloat = 400) -> NSFont {
    let weight = NSFont.Weight(rawValue: uiFontWeightRawValue(forCSSWeight: numericWeight))
    let descriptorBase =
      NSFont(name: "Inter Variable", size: size)
      ?? NSFont(name: "Inter", size: size)
      ?? NSFont.systemFont(ofSize: size)
    let descriptor = descriptorBase.fontDescriptor.addingAttributes([
      .traits: [NSFontDescriptor.TraitKey.weight: weight.rawValue]
    ])
    return NSFont(descriptor: descriptor, size: size) ?? descriptorBase
  }
  #endif

  /// Maps CSS/Satoshi weights onto UIFont.Weight raw values.
  static func uiFontWeightRawValue(forCSSWeight cssWeight: CGFloat) -> CGFloat {
    let anchors: [(css: CGFloat, ui: CGFloat)] = [
      (100, -0.8),
      (200, -0.6),
      (300, -0.4),
      (400, 0.0),
      (500, 0.23),
      (600, 0.3),
      (700, 0.4),
      (800, 0.56),
      (900, 0.62),
    ]
    if cssWeight <= anchors[0].css { return anchors[0].ui }
    if cssWeight >= anchors[anchors.count - 1].css { return anchors[anchors.count - 1].ui }
    for index in 1..<anchors.count {
      let upper = anchors[index]
      let lower = anchors[index - 1]
      if cssWeight <= upper.css {
        let t = (cssWeight - lower.css) / (upper.css - lower.css)
        return lower.ui + ((upper.ui - lower.ui) * t)
      }
    }
    return 0
  }
}

enum JovieActionButtonMetrics {
  static let height: CGFloat = 32
  static let labelWeight = JovieFont.actionLabelWeight
  static let radius = JovieRadius.pill
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
  /// Ambient indicator pulse — constant-motion surfaces only (e.g. the chat
  /// thinking dots). Not a UI transition; deliberately above the <300ms ladder
  /// so a repeated cycle reads as calm, not frantic.
  static let calmDuration: Double = 1.2

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
    if #available(iOS 26.0, macOS 26.0, *) {
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
  static let visibleHeight: CGFloat = 28
  static let minimumHitHeight: CGFloat = 44
  static let hitInset = JovieSpacing.small
  static let pressedOpacity: Double = 0.8

  let filled: Bool
  @ScaledMetric(relativeTo: .body) private var labelSize: CGFloat = 14

  init(filled: Bool) { self.filled = filled }

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(JovieFont.body(size: labelSize, numericWeight: JovieActionButtonMetrics.labelWeight))
      .foregroundStyle(filled ? JovieColor.textInverse : JovieColor.textPrimary)
      .frame(maxWidth: .infinity)
      .padding(.vertical, JovieSpacing.xSmall)
      .frame(minHeight: JoviePillButtonStyle.visibleHeight)
      .background(
        RoundedRectangle(cornerRadius: JovieRadius.pill, style: .continuous)
          .fill(filled ? JovieColor.buttonPrimaryBackground : JovieColor.surface1)
      )
      .overlay {
        RoundedRectangle(cornerRadius: JovieRadius.pill, style: .continuous)
          .stroke(
            filled ? Color.clear : JovieColor.borderDefault,
            lineWidth: 1
          )
      }
      .padding(.vertical, JoviePillButtonStyle.hitInset)
      .contentShape(Rectangle())
      .opacity(configuration.isPressed ? JoviePillButtonStyle.pressedOpacity : 1)
      .animation(JovieMotion.subtle, value: configuration.isPressed)
  }
}

struct JovieIconButtonStyle: ButtonStyle {
  static let pressedOpacity: Double = 0.72
  static let targetSize: CGFloat = 44

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 17, weight: .semibold))
      .foregroundStyle(JovieColor.textPrimary)
      .frame(
        width: JovieIconButtonStyle.targetSize,
        height: JovieIconButtonStyle.targetSize
      )
      .background(JovieColor.surface1, in: Circle())
      .overlay {
        Circle().stroke(JovieColor.borderDefault, lineWidth: 1)
      }
      .opacity(configuration.isPressed ? JovieIconButtonStyle.pressedOpacity : 1)
      .scaleEffect(configuration.isPressed ? JovieMotion.pressScale : 1)
      .animation(JovieMotion.subtle, value: configuration.isPressed)
  }
}

/// Shared tactile feedback for plain-content rows that do not own a filled
/// control background. Feature-specific styles may opt into a different
/// opacity only when that difference is intentional and tested.
struct JoviePressFeedbackButtonStyle: ButtonStyle {
  static let defaultPressedOpacity: Double = 0.72

  let pressedOpacity: Double

  init(pressedOpacity: Double = JoviePressFeedbackButtonStyle.defaultPressedOpacity) {
    self.pressedOpacity = pressedOpacity
  }

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(configuration.isPressed ? pressedOpacity : 1)
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
      .foregroundStyle(JovieColor.imageForeground)
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
