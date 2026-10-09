from pathlib import Path
p=Path('apps/ios/Jovie/Features/AppShell/AppShellLeftDrawer.swift')
s=p.read_text()
a=s.index('  static func frozenIDs(')
b=s.index('\n}\n\nenum AppShellDrawerPinsPolicy',a)
s=s[:a]+'''  enum Bucket: String, CaseIterable { case today, earlier
    var title: String { self == .today ? "Today" : "Earlier" }
  }
  struct Entry: Equatable {
    let id: String
    let bucket: Bucket
  }
  struct Snapshot: Equatable {
    let scope: String?
    let entries: [Entry]
  }
  struct Group: Identifiable {
    let id: Bucket
    let conversations: [MobileConversationSummary]
  }

  /// Freeze membership and local-day assignment together. Empty first loads
  /// may capture once data arrives; revalidation never refills an open panel.
  static func capture(
    conversations: [MobileConversationSummary], scope: String?, current: Snapshot? = nil,
    now: Date = Date(), calendar: Calendar = .current
  ) -> Snapshot {
    if let current, current.scope == scope, !current.entries.isEmpty { return current }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let standard = ISO8601DateFormatter()
    func date(_ value: String) -> Date? {
      fractional.date(from: value) ?? standard.date(from: value)
    }
    var seen = Set<String>()
    let entries = conversations.lazy.filter { seen.insert($0.id).inserted }.prefix(5).map { conversation in
      let timestamp = date(conversation.updatedAt) ?? date(conversation.createdAt)
      let today = timestamp.map { calendar.isDate($0, inSameDayAs: now) } ?? false
      return Entry(id: conversation.id, bucket: today ? .today : .earlier)
    }
    return Snapshot(scope: scope, entries: Array(entries))
  }

  static func visible(
    conversations: [MobileConversationSummary], snapshot: Snapshot?, scope: String?
  ) -> [MobileConversationSummary] {
    guard let snapshot, snapshot.scope == scope else { return [] }
    return snapshot.entries.compactMap { entry in conversations.first { $0.id == entry.id } }
  }

  static func groups(
    conversations: [MobileConversationSummary], snapshot: Snapshot?, scope: String?
  ) -> [Group] {
    guard let snapshot, snapshot.scope == scope else { return [] }
    return Bucket.allCases.compactMap { bucket in
      let rows = snapshot.entries.filter { $0.bucket == bucket }.compactMap { entry in
        conversations.first { $0.id == entry.id }
      }
      return rows.isEmpty ? nil : Group(id: bucket, conversations: rows)
    }
  }'''+s[b:]
s=s.replace('@State private var recentIDs: [String] = []','@State private var recentSnapshot: AppShellDrawerRecentPolicy.Snapshot?')
s=s.replace('    recentIDs = AppShellDrawerRecentPolicy.frozenIDs(conversations: recentConversations, current: [])','''    recentSnapshot = value == .recent
      ? AppShellDrawerRecentPolicy.capture(conversations: recentConversations, scope: pinScope) : nil''')
s=s.replace('    panel = nil\n    focusedControl', '    panel = nil\n    recentSnapshot = nil\n    focusedControl',1)
s=s.replace('  private var filteredConversations:', '''  private var visibleRecent: [MobileConversationSummary] {
    AppShellDrawerRecentPolicy.visible(conversations: recentConversations, snapshot: recentSnapshot, scope: pinScope)
  }
  private var recentGroups: [AppShellDrawerRecentPolicy.Group] {
    AppShellDrawerRecentPolicy.groups(conversations: recentConversations, snapshot: recentSnapshot, scope: pinScope)
  }
  private var isAwaitingRecentCapture: Bool {
    !recentConversations.isEmpty && (recentSnapshot?.scope != pinScope || recentSnapshot?.entries.isEmpty != false)
  }
  private var filteredConversations:''',1)
s=s.replace('panel == .history ? filteredConversations : AppShellDrawerRecentPolicy.visible(conversations: recentConversations, frozenIDs: recentIDs)','panel == .history ? filteredConversations : visibleRecent')
s=s.replace('                  isLoading: isLoadingConversations,','                  isLoading: isLoadingConversations || (panel == .recent && isAwaitingRecentCapture),',1)
s=s.replace('                  showsSearch: panel == .history,','                  showsSearch: panel == .history,\n                  groups: panel == .recent ? recentGroups : nil,',1)
s=s.replace('            if panel == .recent && privateHistoryURL == nil {','''            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("shell-drawer-panel-list")
            if panel == .recent && privateHistoryURL == nil {''',1)
a=s.index('    .onChange(of: recentConversations) {');b=s.index('    .task(id: pinScope)',a)
s=s[:a]+'''    .onChange(of: recentConversations) {
      if panel == .recent {
        recentSnapshot = AppShellDrawerRecentPolicy.capture(
          conversations: recentConversations, scope: pinScope, current: recentSnapshot
        )
      }
    }
    .onChange(of: pinScope) {
      threadSearch = ""
      panel = nil
      recentSnapshot = nil
      focusedControl = nil
    }
    .onChange(of: isPresented) {
      guard !isPresented else { return }
      threadSearch = ""
      panel = nil
      recentSnapshot = nil
    }
'''+s[b:]
s=s.replace('  var showsSearch = true\n', '  var showsSearch = true\n  var groups: [AppShellDrawerRecentPolicy.Group]? = nil\n',1)
s=s.replace('        Text("No conversations match your search.")','        Text(showsSearch ? "No conversations match your search." : "No recent chats yet")',1)
a=s.index('        LazyVStack(spacing: JovieSpacing.xSmall) {\n          ForEach(conversations)');b=s.index('\n      }\n    }\n    .accessibilityElement',a)
s=s[:a]+'''        LazyVStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
          if let groups {
            ForEach(groups) { group in
              Text(group.id.title)
                .font(JovieFont.body(size: 13, weight: .medium))
                .foregroundStyle(JovieColor.textTertiary)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("shell-drawer-recent-group-\\(group.id.rawValue)")
              ForEach(group.conversations) { conversation in
                threadRow(conversation)
              }
            }
          } else {
            ForEach(conversations) { conversation in
              threadRow(conversation)
            }
          }
        }'''+s[b:]
a=s.index('\n}\n\nprivate struct DrawerThreadRow:',a)
s=s[:a]+'''

  private func threadRow(_ conversation: MobileConversationSummary) -> some View {
    DrawerThreadRow(
      conversation: conversation,
      isActive: activeConversationID == conversation.id,
      action: { onSelectConversation(conversation.id) }
    )
  }'''+s[a:]
p.write_text(s)
