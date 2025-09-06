## Description

Brief description of the changes in this PR.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Performance improvement
- [ ] Chore (maintenance, dependencies, etc.)

## Testing

- [ ] Unit tests pass
- [ ] E2E tests pass
- [ ] Manual testing completed
- [ ] New tests added (if applicable)

## Icon Usage Standards ✅

*Complete this section if your PR includes any icon usage*

- [ ] **General UI icons use Heroicons v2** (navigation, actions, states)
- [ ] **Social/brand icons use SocialIcon component** (social media, DSPs, brands)
- [ ] **No direct SVG imports** (except approved custom SVGs)
- [ ] **No inline SVG elements** (except in approved components)
- [ ] **Consistent icon sizing** (`h-4 w-4`, `h-5 w-5`, `h-6 w-6`, `h-8 w-8`)
- [ ] **Proper accessibility attributes** (`aria-hidden`, `aria-label` when needed)
- [ ] **ESLint icon-usage rule passes** (no violations)

### Custom SVG Usage (if applicable)

*Complete this section only if introducing new custom SVGs*

- [ ] **Justification provided** for why standard libraries don't meet the need
- [ ] **Design team approval** obtained
- [ ] **SVG is optimized** and follows accessibility standards
- [ ] **Added to approved list** in ESLint configuration

**Justification for custom SVG:**
<!-- Explain why Heroicons or SimpleIcons don't meet your needs -->

## Code Quality

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Code is properly commented (complex logic)
- [ ] No console.log statements left in code
- [ ] TypeScript types are properly defined
- [ ] Performance considerations addressed

## Accessibility

- [ ] Keyboard navigation works correctly
- [ ] Screen reader compatibility verified
- [ ] Color contrast meets WCAG standards
- [ ] Focus indicators are visible
- [ ] ARIA attributes used appropriately

## Browser Testing

- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Mobile browsers (if applicable)

## Database Changes

*Complete this section if your PR includes database changes*

- [ ] Migration scripts included
- [ ] Rollback plan documented
- [ ] Data integrity verified
- [ ] Performance impact assessed

## Breaking Changes

*Complete this section if your PR includes breaking changes*

- [ ] Breaking changes documented
- [ ] Migration guide provided
- [ ] Affected teams notified
- [ ] Backward compatibility considered

## Deployment Notes

*Any special deployment considerations*

- [ ] Environment variables updated (if needed)
- [ ] Feature flags configured (if applicable)
- [ ] Third-party service changes (if applicable)
- [ ] Cache invalidation needed (if applicable)

## Screenshots/Videos

*Add screenshots or videos to help explain your changes*

## Related Issues

Closes #(issue number)
Related to #(issue number)

## Checklist

- [ ] PR title follows conventional commit format
- [ ] Branch is up to date with target branch
- [ ] All CI checks pass
- [ ] Documentation updated (if needed)
- [ ] Changelog updated (if needed)

---

## For Reviewers

### Icon Usage Review

If this PR includes icon changes, please verify:

1. **Standard Library Usage**: Icons use appropriate libraries (Heroicons for UI, SocialIcon for social/brand)
2. **No Direct Imports**: No direct SVG imports or inline SVG usage
3. **Accessibility**: Proper ARIA attributes and consistent sizing
4. **ESLint Compliance**: No `@jovie/icon-usage` rule violations

### Custom SVG Review (if applicable)

If this PR introduces custom SVGs:

1. **Necessity**: Verify that standard libraries truly don't meet the need
2. **Quality**: SVG is optimized and follows accessibility standards
3. **Approval**: Design team approval documented
4. **Configuration**: Added to ESLint approved list

Use the [Design Review Checklist](docs/DESIGN_REVIEW_CHECKLIST.md) for detailed guidance.

