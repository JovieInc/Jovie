#!/usr/bin/env bash
# Quick script to find and list prop types that need Readonly<> wrapper

FILES=(
  "app/out/[id]/page.tsx"
  "app/waitlist/error.tsx"
  "components/atoms/Logo.tsx"
  "components/atoms/LogoLink.tsx"
  "components/auth/forms/VerificationStep.tsx"
  "components/site/theme-toggle/ThemeToggleIcon.tsx"
  "components/site/theme-toggle/ThemeToggleSkeleton.tsx"
  "components/site/theme-toggle/ThemeToggleSegmented.tsx"
  "components/dashboard/organisms/audience-member-sidebar/AudienceMemberReferrers.tsx"
  "components/dashboard/organisms/audience-member-sidebar/AudienceMemberActions.tsx"
  "app/hud/HudClockClient.tsx"
  "components/dashboard/molecules/CopyToClipboardButton.tsx"
  "components/admin/VerificationStatusToggle.tsx"
  "components/pricing/PricingCTA.tsx"
  "components/molecules/ArtistCard.tsx"
)

for file in "${FILES[@]}"; do
  echo "=== $file ==="
  # Find interface/type definitions near the component
  grep -n "^interface\|^type\|^export interface\|^export type" "$file" | head -5
  echo ""
done
