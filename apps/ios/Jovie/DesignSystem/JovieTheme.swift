import SwiftUI
import UIKit

enum JovieColor {
  static let backgroundBase = Color(hex: 0x08090A)
  static let surface0 = Color(hex: 0x0F1011)
  static let surface1 = Color(hex: 0x17171A)
  static let textPrimary = Color(hex: 0xFFFFFF)
  static let textSecondary = Color(hex: 0xE3E4E6)
  static let textTertiary = Color(hex: 0x969799)
  static let borderSubtle = Color.white.opacity(0.05)
  static let borderDefault = Color.white.opacity(0.08)
  static let borderStrong = Color.white.opacity(0.10)
  static let accent = Color(hex: 0x7170FF)
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

struct JoviePillButtonStyle: ButtonStyle {
  let filled: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(JovieFont.body(size: 14, weight: .semibold))
      .foregroundStyle(filled ? JovieColor.backgroundBase : JovieColor.textPrimary)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 14)
      .background(
        RoundedRectangle(cornerRadius: 999, style: .continuous)
          .fill(filled ? Color.white : JovieColor.surface1)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 999, style: .continuous)
          .stroke(
            filled ? Color.clear : JovieColor.borderDefault,
            lineWidth: 1
          )
      }
      .opacity(configuration.isPressed ? 0.8 : 1)
      .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
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
