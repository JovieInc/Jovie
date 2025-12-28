# Puppeteer MCP Auth Screen Audit Commands

This document contains the systematic Puppeteer MCP commands to audit all auth screens.
Execute these commands using your Puppeteer MCP server in the IDE.

## Setup

**Dev Server:** http://localhost:3000
**Viewports to test:**
- Mobile Small: 375x667 (iPhone SE)
- Mobile Medium: 390x844 (iPhone 12/13)
- Mobile Large: 414x896 (iPhone 11 Pro Max)
- Tablet: 768x1024 (iPad)
- Desktop Small: 1024x768
- Desktop Medium: 1440x900
- Desktop Large: 1920x1080

---

## Screen 1: Sign-In Page (/signin)

### 1.1 Initial State - MethodSelector

```
Navigate to http://localhost:3000/signin
Wait for selector: h1
Take screenshot: signin-desktop-1440x900.png
```

**Accessibility Checks:**
```
Check ARIA attributes on page
Get element by role: heading, level 1
Verify text content: "Log in to Jovie"
Find all buttons
Verify button text: ["Continue with Google", "Continue with email", "Continue with Spotify"]
Check for role="alert" elements (should be none initially)
```

**Layout Checks - Desktop (1440x900):**
```
Set viewport: 1440x900
Query all interactive elements (buttons, links, inputs)
Get bounding boxes for each element
Check for overlapping elements
Verify no horizontal scroll
Measure vertical spacing between buttons
```

**Layout Checks - Mobile (375x667):**
```
Set viewport: 375x667
Take screenshot: signin-mobile-375x667.png
Get computed style for .min-h-\[48px\] elements
Verify all touch targets are >= 48px height
Check logo visibility (should be visible)
Measure padding on container
```

**Color Contrast Check:**
```
Get computed styles for h1 (heading)
  - color: should be text-primary-token
  - background: should be bg-base
  - Calculate contrast ratio (must be >= 4.5:1)
Get computed styles for button text
  - Calculate contrast for each button variant
Get computed styles for footer link "Join the waitlist"
  - Calculate contrast ratio
```

**Focus Management:**
```
Tab through page (simulate keyboard navigation)
  1. First tab should focus "Skip to form" link
  2. Second tab should focus first button (likely Google)
  3. Continue through all buttons
  4. Tab to footer link
Verify each focused element has visible outline
Take screenshot of each focus state
```

### 1.2 Email Step

```
Click button: "Continue with email"
Wait for email input to appear
Take screenshot: signin-email-step.png
```

**Input Field Checks:**
```
Find input[type="email"]
Get bounding box
Verify height >= 48px
Verify font-size >= 16px (prevents iOS zoom)
Check for associated label (implicit or explicit)
```

**Error State:**
```
Type invalid email: "notanemail"
Click outside input or submit
Wait for error message
Verify role="alert" on error message
Take screenshot: signin-email-error.png
Check error message has sufficient contrast
```

### 1.3 Verification Step

```
Clear email field
Type valid email: "test@example.com"
Submit (or click continue if button exists)
Wait for OTP input
Take screenshot: signin-otp-step.png
```

**OTP Input Checks:**
```
Find all OTP input fields (should be 6)
Get bounding boxes for all 6 inputs
Verify equal spacing between inputs
Type "1" in first input
Verify focus automatically moves to second input
Type "23456" to complete
Verify auto-submit behavior or button state
```

### 1.4 Mobile Keyboard Simulation

```
Set viewport: 375x667
Navigate to http://localhost:3000/signin
Focus on email input
Reduce viewport height to: 375x500 (simulates keyboard open)
Take screenshot: signin-mobile-keyboard-open.png
```

**Expected Behavior:**
```
Query logo element
Verify logo has opacity-0 class or hidden
Query h1 heading
Verify heading has opacity-0 class or hidden
Verify smooth transition (duration-200)
Verify form remains visible and centered
```

---

## Screen 2: Sign-Up Page (/signup)

### 2.1 Initial State - MethodSelector

```
Navigate to http://localhost:3000/signup
Wait for selector: h1
Take screenshot: signup-desktop-1440x900.png
```

**Heading Check:**
```
Get element by role: heading, level 1
Verify text content: "Create your Jovie account"
```

**Footer Check:**
```
Find link with text: "Sign in"
Verify href="/signin"
Get computed styles
Verify color contrast
```

**Legal Links Check:**
```
Find link with text: "Terms"
Verify href="/legal/terms"
Find link with text: "Privacy Policy"
Verify href="/legal/privacy"
Get position of legal links container
Verify positioned at bottom with safe-area-inset support
```

**Responsive Check:**
```
Set viewport: 375x667
Take screenshot: signup-mobile-375x667.png
Verify legal links are visible (not hidden by keyboard)
```

### 2.2 Repeat Steps from Sign-In

```
Follow same Email Step and Verification Step checks as /signin
```

---

## Screen 3: Waitlist Page (/waitlist)

**Note:** This page requires authentication. You may need to sign in first.

### 3.1 Step 0 - Primary Goal Selection

```
Navigate to http://localhost:3000/waitlist
Wait for page load
Take screenshot: waitlist-step0-desktop.png
```

**Goal Cards Check:**
```
Find all radio buttons or clickable cards for goal selection
Verify 3 options: streams, merch, tickets
Get bounding boxes for each card
Check spacing between cards
Verify touch targets on mobile
```

**Responsive:**
```
Set viewport: 375x667
Take screenshot: waitlist-step0-mobile.png
Verify cards stack vertically or horizontally
Check for overflow
```

### 3.2 Step 1 - Social Platform & URL

```
Click on one of the goal options
Wait for next step
Take screenshot: waitlist-step1-desktop.png
```

**Platform Selection:**
```
Find platform selection controls (Instagram/TikTok/YouTube)
Verify radio buttons or dropdown
```

**URL Input:**
```
Find URL input field
Verify placeholder text
Type invalid URL: "notaurl"
Check for validation error
Type valid URL: "https://instagram.com/test"
Verify error clears
```

### 3.3 Step 2 - Additional Info

```
Continue to next step
Take screenshot: waitlist-step2-desktop.png
```

**Spotify URL Field:**
```
Find Spotify URL input
Test validation with invalid URL
```

**Heard About Field:**
```
Find "heard about" input/select
Verify options if dropdown
```

### 3.4 Success View

```
Complete all steps and submit
Wait for success view
Take screenshot: waitlist-success.png
```

---

## Screen 4: Onboarding Page (/onboarding)

**Note:** Requires authentication and may redirect if already onboarded.

### 4.1 Step 1 - Display Name

```
Navigate to http://localhost:3000/onboarding
Wait for page load
Take screenshot: onboarding-step1-desktop.png
```

**Input Check:**
```
Find display name input field
Verify label text
Check character limit if shown
Type long name (test limit)
```

**Logout Button:**
```
Find logout button in top-right
Verify it's a dropdown trigger
Click to open dropdown
Verify "Log out" option appears
Take screenshot: onboarding-logout-dropdown.png
```

### 4.2 Step 2 - Handle/Username

```
Continue to next step
Take screenshot: onboarding-step2-desktop.png
```

**Handle Input:**
```
Find handle/username input
Type invalid characters: "test user!"
Verify validation error
Type valid handle: "testuser123"
Wait for availability check
Verify indicator shows available/unavailable
```

**Availability Indicator:**
```
Get element showing availability status
Verify dynamic updates as user types
Check for loading indicator during API call
```

### 4.3 Step 3 - Confirmation

```
Continue to final step
Take screenshot: onboarding-step3-desktop.png
```

**Confirmation UI:**
```
Verify display name and handle are shown
Find "Go to Dashboard" button
Verify button is enabled
```

---

## Responsive Breakpoint Full Test

For each auth screen, run this complete responsive test:

```javascript
const viewports = [
  { width: 375, height: 667, name: 'mobile-small' },
  { width: 390, height: 844, name: 'mobile-medium' },
  { width: 414, height: 896, name: 'mobile-large' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 834, height: 1194, name: 'tablet-large' },
  { width: 1024, height: 768, name: 'desktop-small' },
  { width: 1440, height: 900, name: 'desktop-medium' },
  { width: 1920, height: 1080, name: 'desktop-large' }
];

for (const viewport of viewports) {
  Set viewport: ${viewport.width}x${viewport.height}
  Navigate to [screen URL]
  Wait for load
  Take screenshot: [screen]-${viewport.name}.png
  Check for horizontal scrollbar
  Query all interactive elements
  Verify no overlapping
  Verify all touch targets >= 48px (if mobile)
}
```

---

## Accessibility Audit Checklist

Run these checks on EVERY screen:

### ARIA Attributes
```
Find all buttons
  - Verify each has accessible name (text content or aria-label)
Find all inputs
  - Verify each has associated label
Find all links
  - Verify each has accessible name
Find all images
  - Verify each has alt text (or aria-hidden if decorative)
Check for aria-busy on loading states
Check for role="alert" on error messages
Check for aria-hidden on decorative elements
```

### Keyboard Navigation
```
Tab through entire page
  - Verify logical focus order
  - Verify all interactive elements are reachable
  - Verify no focus traps (except intentional in modals)
Test Shift+Tab (reverse navigation)
Test Enter/Space on buttons
Test Escape on modals/dropdowns
```

### Color Contrast
```
For each text element:
  1. Get computed color
  2. Get background color (including gradients)
  3. Calculate contrast ratio
  4. Verify >= 4.5:1 for normal text (WCAG AA)
  5. Verify >= 3:1 for large text (18pt+)

Special attention to:
  - Headings (h1, h2, etc.)
  - Button text
  - Link text
  - Error messages
  - Placeholder text
  - Secondary/tertiary text colors
```

### Heading Hierarchy
```
Query all headings (h1-h6)
Verify logical hierarchy (no skipped levels)
Verify only one h1 per page
```

---

## Common Issues to Document

When you find issues, document them in this format:

```markdown
## Issue: [Brief description]

**Screen:** /signin | /signup | /waitlist | /onboarding
**State:** MethodSelector | EmailStep | VerificationStep | etc.
**Severity:** P0 | P1 | P2 | P3
**Breakpoint:** Mobile 375px | Desktop 1440px | etc.

**Description:**
[What's wrong]

**Screenshot:**
[filename.png]

**Reproduction:**
1. Navigate to URL
2. Action
3. Observe issue

**Code Location:**
File: [component file path]
Lines: [approximate]

**Recommendation:**
[How to fix]

**WCAG:** [If applicable: 1.4.3, 2.1.1, etc.]
```

---

## Priority Checks (Most Likely Issues)

Based on code review, pay special attention to:

1. **OTP Input Focus Chain** - Type 6 digits, verify smooth focus transitions
2. **Mobile Keyboard Handling** - Logo/heading should hide when keyboard opens
3. **Safe Area Insets** - Legal links should respect notch/home indicator
4. **Touch Target Sizes** - All buttons/inputs should be >= 48px on mobile
5. **Button Loading States** - Spinner should appear, other buttons should disable
6. **Error Message Animations** - Should fade in smoothly with role="alert"
7. **Gradient Readability** - Text should be readable over gradient backgrounds
8. **Footer Link Context** - /signin shows "Join waitlist", /signup shows "Sign in"

---

## Execution Strategy

1. Start with /signin at desktop resolution
2. Complete all states (MethodSelector → Email → OTP)
3. Repeat at mobile resolution
4. Move to /signup (faster since similar to /signin)
5. Audit /waitlist (requires auth)
6. Audit /onboarding (requires auth + fresh account)
7. Run responsive breakpoint tests on all screens
8. Run accessibility audit on all screens
9. Compile issue report

Total estimated time: 2-3 hours for comprehensive audit
