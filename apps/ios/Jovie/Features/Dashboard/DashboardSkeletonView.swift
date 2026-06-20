import SwiftUI

struct DashboardSkeletonView: View {
  var body: some View {
    VStack(spacing: JovieSpacing.large) {
      RoundedRectangle(cornerRadius: JovieRadius.large, style: .continuous)
        .fill(JovieColor.surface1)
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: .infinity)
      RoundedRectangle(cornerRadius: JovieRadius.small, style: .continuous)
        .fill(JovieColor.surface1)
        .frame(width: 180, height: 16)
      HStack(spacing: JovieSpacing.medium) {
        RoundedRectangle(cornerRadius: JovieRadius.pill, style: .continuous)
          .fill(JovieColor.surface1)
          .frame(height: 46)
        RoundedRectangle(cornerRadius: JovieRadius.pill, style: .continuous)
          .fill(JovieColor.surface1)
          .frame(height: 46)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .redacted(reason: .placeholder)
  }
}