import SwiftUI

struct MobileChatMerchOptionsView: View {
  let artifact: MobileChatMerchArtifact
  let onSelectPrompt: (String) -> Void

  var body: some View {
    switch artifact {
    case let .productOptions(payload):
      productOptionsGrid(payload)
    case let .designCarousel(payload):
      designCarousel(payload)
    }
  }

  @ViewBuilder
  private func productOptionsGrid(_ payload: MobileChatMerchOptionsPayload) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      header(title: "Merch Options", subtitle: payload.nextStep ?? "Pick one to save it to Library")

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: JovieSpacing.medium) {
          ForEach(payload.options) { option in
            productOptionCard(option, generationId: payload.generationId)
          }
        }
      }
    }
    .accessibilityIdentifier("mobile-chat-merch-options")
  }

  @ViewBuilder
  private func designCarousel(_ payload: MobileChatMerchDesignsPayload) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      header(
        title: "Merch Designs",
        subtitle: payload.nextStep ?? "Pick one and I'll put it on products"
      )

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: JovieSpacing.medium) {
          ForEach(payload.designs) { design in
            designCard(design, generationId: payload.generationId)
          }
        }
      }
    }
    .accessibilityIdentifier("mobile-chat-merch-designs")
  }

  private func header(title: String, subtitle: String) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
      Text(title)
        .font(JovieFont.body(size: 15, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
      Text(subtitle)
        .font(JovieFont.body(size: 13))
        .foregroundStyle(JovieColor.textTertiary)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private func productOptionCard(
    _ option: MobileChatMerchOptionCard,
    generationId: String
  ) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      mockupImage(url: option.mockupURL, label: option.designName, accent: merchAccent(for: option.optionNumber))
        .overlay(alignment: .topLeading) {
          Text("Option \(option.optionNumber)")
            .font(JovieFont.body(size: 11, weight: .medium))
            .foregroundStyle(Color.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Color.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .padding(JovieSpacing.small)
        }

      VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
        Text(option.designName)
          .font(JovieFont.body(size: 14, weight: .semibold))
          .foregroundStyle(JovieColor.textPrimary)
          .lineLimit(1)

        Text(productSubtitle(option))
          .font(JovieFont.body(size: 12))
          .foregroundStyle(JovieColor.textTertiary)
          .lineLimit(1)

        Text(option.concept)
          .font(JovieFont.body(size: 12))
          .foregroundStyle(JovieColor.textSecondary)
          .lineLimit(3)
          .frame(minHeight: 48, alignment: .topLeading)

        if let salePrice = option.salePrice {
          Text(salePrice)
            .font(JovieFont.body(size: 13, weight: .semibold))
            .foregroundStyle(JovieColor.textPrimary)
        }

        Button("Save") {
          onSelectPrompt(
            "Select merch option \(option.optionNumber) from generation \(generationId)."
          )
        }
        .buttonStyle(MobileChatMerchActionButtonStyle())
        .accessibilityIdentifier("mobile-chat-merch-save-\(option.optionNumber)")
      }
    }
    .frame(width: 168)
    .padding(JovieSpacing.medium)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(option.designName), option \(option.optionNumber)")
  }

  private func designCard(
    _ design: MobileChatMerchDesignCard,
    generationId: String
  ) -> some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      mockupImage(url: design.previewURL, label: design.designName, accent: merchAccent(for: design.optionNumber))
        .overlay {
          if !design.isReady {
            VStack(spacing: JovieSpacing.xSmall) {
              ProgressView()
                .tint(JovieColor.textTertiary)
              Text("Rendering")
                .font(JovieFont.body(size: 11, weight: .medium))
                .foregroundStyle(JovieColor.textTertiary)
            }
          }
        }

      Text(design.designName)
        .font(JovieFont.body(size: 14, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
        .lineLimit(1)

      if !design.concept.isEmpty {
        Text(design.concept)
          .font(JovieFont.body(size: 12))
          .foregroundStyle(JovieColor.textSecondary)
          .lineLimit(2)
      }

      Button("Use This One") {
        onSelectPrompt(
          "Use design \(design.optionNumber) from generation \(generationId)."
        )
      }
      .buttonStyle(MobileChatMerchActionButtonStyle())
      .disabled(!design.isReady)
      .accessibilityIdentifier("mobile-chat-merch-use-\(design.optionNumber)")
    }
    .frame(width: 168)
    .padding(JovieSpacing.medium)
    .background(JovieColor.surface1, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
  }

  @ViewBuilder
  private func mockupImage(url: URL?, label: String, accent: Color) -> some View {
    ZStack {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(
          LinearGradient(
            colors: [accent.opacity(0.22), JovieColor.surface2],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )

      if let url {
        MobileChatMerchMockupImage(url: url, label: label)
      } else {
        Image(systemName: "tshirt")
          .font(.system(size: 28, weight: .light))
          .foregroundStyle(JovieColor.textTertiary)
      }
    }
    .aspectRatio(1, contentMode: .fit)
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(JovieColor.borderSubtle, lineWidth: 1)
    }
  }

  private func productSubtitle(_ option: MobileChatMerchOptionCard) -> String {
    if let colorway = option.colorway, !colorway.isEmpty {
      return "\(option.productLabel) · \(colorway)"
    }
    return option.productLabel
  }

  private func merchAccent(for optionNumber: Int) -> Color {
    switch optionNumber % 3 {
    case 1:
      return JovieColor.EntityAccent.artist
    case 2:
      return JovieColor.EntityAccent.track
    default:
      return JovieColor.EntityAccent.release
    }
  }
}

private struct MobileChatMerchMockupImage: View {
  let url: URL
  let label: String

  @State private var image: UIImage?

  init(url: URL, label: String) {
    self.url = url
    self.label = label
    _image = State(initialValue: AvatarImageCache.image(for: url))
  }

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
      } else {
        Color.clear
      }
    }
    .task(id: url) {
      guard image == nil else { return }
      image = await AvatarImageLoader.load(url)
    }
    .accessibilityLabel("\(label) mockup")
  }
}

private struct MobileChatMerchActionButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(JovieFont.body(size: 13, weight: .semibold))
      .foregroundStyle(JovieColor.backgroundBase)
      .frame(maxWidth: .infinity)
      .padding(.vertical, JovieSpacing.small)
      .background(Color.white.opacity(configuration.isPressed ? 0.88 : 1), in: Capsule())
  }
}