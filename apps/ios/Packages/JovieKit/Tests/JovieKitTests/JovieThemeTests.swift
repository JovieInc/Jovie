import JovieKit
import SwiftUI
import Testing

/// JOV-6750 — the canonical theme is owned by the shared JovieKit package.
/// These assertions pin the public module surface both targets compile and the
/// locked System B token values; the source-level canon guard
/// (AuthScreenStyleGuardTests) and the web CTA lock still hold the same bytes.
struct JovieThemeTests {
  @Test func publicActionMetricsMatchSystemBLocks() {
    #expect(JovieFont.actionLabelWeight == 510)
    #expect(JovieFont.emptyGreetingSize == 28)
    #expect(JovieFont.emptyGreetingWeight == 620)
    #expect(JovieActionButtonMetrics.height == 32)
    #expect(JovieActionButtonMetrics.labelWeight == 510)
    #expect(JovieActionButtonMetrics.radius == 999)
  }

  @Test func publicSpacingAndRadiusScaleStaysOnTheOpticalGrid() {
    #expect(JovieSpacing.xSmall == 4)
    #expect(JovieSpacing.small == 8)
    #expect(JovieSpacing.medium == 12)
    #expect(JovieSpacing.large == 16)
    #expect(JovieSpacing.xLarge == 24)
    #expect(JovieSpacing.xxLarge == 32)
    #expect(JovieRadius.small == 6)
    #expect(JovieRadius.medium == 8)
    #expect(JovieRadius.large == 12)
    #expect(JovieRadius.xLarge == 16)
    #expect(JovieRadius.pill == 999)
  }

  @Test func publicMotionTokensKeepTheLockedDurations() {
    #expect(JovieMotion.instantDuration == 0.05)
    #expect(JovieMotion.fastDuration == 0.10)
    #expect(JovieMotion.normalDuration == 0.16)
    #expect(JovieMotion.subtleDuration == 0.15)
    #expect(JovieMotion.slowDuration == 0.25)
    #expect(JovieMotion.cinematicDuration == 0.42)
    #expect(JovieMotion.calmDuration == 1.2)
    #expect(JovieMotion.pressScale == 0.96)
  }

  @Test func publicButtonStyleConstantsStayLocked() {
    #expect(JoviePillButtonStyle.pressedOpacity == 0.8)
    #expect(JovieIconButtonStyle.pressedOpacity == 0.72)
    #expect(JovieIconButtonStyle.targetSize == 44)
    #expect(JoviePressFeedbackButtonStyle.defaultPressedOpacity == 0.72)
  }

  @Test func publicCSSWeightMappingAnchorsBookAndMedium() {
    #expect(JovieFont.uiFontWeightRawValue(forCSSWeight: 100) == -0.8)
    #expect(JovieFont.uiFontWeightRawValue(forCSSWeight: 400) == 0)
    #expect(JovieFont.uiFontWeightRawValue(forCSSWeight: 900) == 0.62)
  }

  @Test func publicAccentResolvesThroughTheSharedHexInitializer() {
    #expect(JovieColor.accent == Color(hex: 0x11AFFF))
    #expect(JovieColor.accentBlue == Color(hex: 0x11AFFF))
    #expect(JovieColor.accentPurple == Color(hex: 0xA982FF))
    #expect(JovieColor.accentPink == Color(hex: 0xFF48D2))
    #expect(JovieColor.accentOrange == Color(hex: 0xFFC857))
    #expect(JovieColor.EntityAccent.release == Color(hex: 0x11AFFF))
    #expect(JovieColor.EntityAccent.artist == Color(hex: 0xA982FF))
    #expect(JovieColor.EntityAccent.track == Color(hex: 0x11AFFF))
    #expect(JovieColor.EntityAccent.event == Color(hex: 0xFFC857))
  }
}
