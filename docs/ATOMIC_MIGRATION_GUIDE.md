# Atomic Migration Guide: Atoms → Molecules / Organisms

This guide is the standard path for fixing atoms that violate the "props-only" contract.

## Why this migration exists

Atoms are our most reusable UI primitives. To keep them stable and easy to reason about, atoms must not own business logic, side effects, or hook-driven orchestration.

As of JOV-694, ESLint enforces this rule for `apps/web/components/atoms/**/*.tsx`.

## Decision tree

Use this quick rubric before moving code:

1. **Does the component call any hook (`useState`, `useEffect`, `useMemo`, `useCallback`, custom `useX`)?**
   - Yes → It cannot stay as an atom.
2. **Is the behavior still small and compositional (form control + helper text, avatar + fallback, etc.)?**
   - Yes → Move to a **molecule**.
3. **Does it orchestrate data, navigation, async flows, or cross-cutting state?**
   - Yes → Move to an **organism**.

## Migration checklist

1. **Create target component** in `components/molecules/` or `components/organisms/`.
2. **Move hooks and side effects** into the new component.
3. **Keep or create a pure atom** that renders visual primitives from props only.
4. **Update imports** in all consumers.
5. **Move/update tests**:
   - Atom tests should assert rendering + accessibility.
   - Molecule/organism tests should cover behavior and state transitions.
6. **Run full quality checks** (lint, typecheck, format, relevant unit tests).

## Refactor pattern

```tsx
// Before (invalid atom)
export function AvatarCard() {
  const [isOpen, setIsOpen] = useState(false);
  return <Avatar onClick={() => setIsOpen(true)} />;
}
```

```tsx
// After: pure atom
export interface AvatarProps {
  readonly onPress?: () => void;
}

export function Avatar({ onPress }: AvatarProps) {
  return <button onClick={onPress}>...</button>;
}
```

```tsx
// After: molecule owns behavior
export function AvatarCard() {
  const [isOpen, setIsOpen] = useState(false);
  return <Avatar onPress={() => setIsOpen(true)} />;
}
```

## Temporary exception list

The following atoms currently have documented legacy exceptions while migration work is in progress:

- `components/atoms/AmountSelector.tsx`
- `components/atoms/ProgressIndicator.tsx`
- `components/atoms/SocialIcon.tsx`
- `components/atoms/TruncatedText.tsx`
- `components/atoms/CopyableMonospaceCell.tsx`
- `components/atoms/TableErrorFallback.tsx`
- `components/atoms/AvatarUploadOverlay.tsx`

These files are intentionally excluded from the lint rule until they are moved to the correct atomic layer.
