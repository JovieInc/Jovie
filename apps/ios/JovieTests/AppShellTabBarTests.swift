import Testing
@testable import Jovie

struct AppShellTabBarTests {
  @Test func primaryTabsMatchChatLibraryCalendarInbox() {
    let tabs = AppShellPrimaryTab.allCases.map(\.shellTab)
    #expect(tabs == [.chat, .library, .calendar, .inbox])
  }

  @Test func profileAndAudienceAreNotPrimary() {
    #expect(AppShellTab.profile.isPrimaryTab == false)
    #expect(AppShellTab.audience.isPrimaryTab == false)
    #expect(AppShellTab.chat.isPrimaryTab)
    #expect(AppShellTab.library.isPrimaryTab)
  }

  @Test func accessibilityIDsAreStable() {
    #expect(AppShellTab.chat.accessibilityID == "shell-tab-chat")
    #expect(AppShellTab.library.accessibilityID == "shell-tab-library")
    #expect(AppShellTab.calendar.accessibilityID == "shell-tab-calendar")
    #expect(AppShellTab.inbox.accessibilityID == "shell-tab-inbox")
  }

  @Test func gesturePolicyNeverSwitchesTabsFromHorizontalSwipe() {
    #expect(AppShellGesturePolicy.shouldSwitchTabFromHorizontalSwipe() == false)
  }

  @Test func leftEdgeOpenRecognizesLeadingEdgeDrag() {
    #expect(
      AppShellGesturePolicy.isLeftEdgeOpen(startX: 12, translationX: 90, predictedX: 100)
    )
    #expect(
      AppShellGesturePolicy.isLeftEdgeOpen(startX: 80, translationX: 90, predictedX: 100)
        == false
    )
  }

  @Test func rightEdgeOpenRecognizesTrailingEdgeDrag() {
    #expect(
      AppShellGesturePolicy.isRightEdgeOpen(
        startX: 390,
        containerWidth: 400,
        translationX: -90,
        predictedX: -130
      )
    )
    #expect(
      AppShellGesturePolicy.isRightEdgeOpen(
        startX: 200,
        containerWidth: 400,
        translationX: -90,
        predictedX: -130
      ) == false
    )
  }

  @Test func resolveInitialTabKeepsPrimaryWhenChatEnabled() {
    #expect(resolveShellInitialTab(.library, chatEnabled: true) == .library)
    #expect(resolveShellInitialTab(.calendar, chatEnabled: true) == .calendar)
    #expect(resolveShellInitialTab(.inbox, chatEnabled: true) == .inbox)
  }

  @Test func resolveInitialTabFallsToProfileWhenChatDisabled() {
    #expect(resolveShellInitialTab(.library, chatEnabled: false) == .profile)
    #expect(resolveShellInitialTab(.chat, chatEnabled: false) == .profile)
  }
}

struct SharedPressFeedbackStyleTests {
  @Test func plainRowPressFeedbackHasOneCanonicalDefaultOpacity() {
    #expect(JoviePressFeedbackButtonStyle.defaultPressedOpacity == 0.72)
  }
}

struct LibraryFeedTests {
  @Test func filterAllReturnsEveryAsset() {
    let assets = LibraryFeed.previewAssets
    #expect(LibraryFeed.filtered(assets: assets, filter: .all).count == assets.count)
  }

  @Test func filterByTypeNarrowsFeed() {
    let assets = LibraryFeed.previewAssets
    let releases = LibraryFeed.filtered(assets: assets, filter: .type(.release))
    #expect(releases.allSatisfy { $0.type == .release })
    #expect(releases.isEmpty == false)
  }

  @Test func filterChipsLeadWithAll() {
    #expect(LibraryFilter.chips.first == .all)
    #expect(LibraryFilter.chips.count == LibraryAssetType.allCases.count + 1)
  }

  @Test func emptyAssetsStayEmptyForEveryChip() {
    for chip in LibraryFilter.chips {
      #expect(LibraryFeed.filtered(assets: [], filter: chip).isEmpty)
    }
  }
}

struct LibraryInboxCalendarLaunchModeTests {
  @Test func libraryArgumentsParseToLibraryFixtures() {
    #expect(LaunchMode.resolving(arguments: ["-ui-testing-library"], isXCTest: false) == .uiTestingLibrary)
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-library-empty"], isXCTest: false)
        == .uiTestingLibraryEmpty
    )
    #expect(LaunchMode.uiTestingLibrary.defaultInitialTab == .library)
    #expect(LaunchMode.uiTestingLibraryEmpty.defaultInitialTab == .library)
    #expect(LaunchMode.uiTestingLibrary.usesEmptyLibraryPreview == false)
    #expect(LaunchMode.uiTestingLibraryEmpty.usesEmptyLibraryPreview)
  }

  @Test func inboxArgumentsParseToInboxFixtures() {
    #expect(LaunchMode.resolving(arguments: ["-ui-testing-inbox"], isXCTest: false) == .uiTestingInbox)
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-inbox-offline"], isXCTest: false)
        == .uiTestingInboxOffline
    )
    #expect(LaunchMode.uiTestingInbox.defaultInitialTab == .inbox)
    #expect(LaunchMode.uiTestingInboxOffline.defaultInitialTab == .inbox)
    #expect(LaunchMode.uiTestingInbox.usesLiveAuth == false)
    #expect(LaunchMode.uiTestingInboxOffline.usesLiveAuth == false)
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-inbox-loading"], isXCTest: false)
        == .uiTestingInboxLoading
    )
    #expect(LaunchMode.uiTestingInboxLoading.defaultInitialTab == .inbox)
    #expect(LaunchMode.uiTestingInboxLoading.holdsActionLoopLoading)
    #expect(LaunchMode.uiTestingInbox.holdsActionLoopLoading == false)
  }

  @Test func calendarArgumentsParseToCalendarFixtures() {
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-calendar"], isXCTest: false)
        == .uiTestingCalendar
    )
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-calendar-offline"], isXCTest: false)
        == .uiTestingCalendarOffline
    )
    #expect(LaunchMode.uiTestingCalendar.defaultInitialTab == .calendar)
    #expect(LaunchMode.uiTestingCalendarOffline.defaultInitialTab == .calendar)
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-calendar-loading"], isXCTest: false)
        == .uiTestingCalendarLoading
    )
    #expect(LaunchMode.uiTestingCalendarLoading.defaultInitialTab == .calendar)
    #expect(LaunchMode.uiTestingCalendarLoading.holdsActionLoopLoading)
  }
}

struct EntityContextTests {
  @Test func entityIDIsStableKindPlusID() {
    let item = EntityContextItem(kind: .release, entityID: "rel_1", label: "Midnight Drive")
    #expect(item.id == "release:rel_1")
    #expect(item.kindTitle == "Release")
    #expect(item.publicURL.contains("rel_1"))
  }

  @Test func statsSnapshotIsDeterministicForSameID() {
    let item = EntityContextItem(kind: .track, entityID: "trk_42", label: "Demo")
    let a = EntityContextStats.snapshot(for: item)
    let b = EntityContextStats.snapshot(for: item)
    #expect(a == b)
  }
}
