# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]:
    - img [ref=e8]
  - alert [ref=e12]
  - generic [ref=e13]:
    - link "Skip to form" [ref=e14] [cursor=pointer]:
      - /url: "#auth-form"
    - link "Go to homepage" [ref=e16] [cursor=pointer]:
      - /url: /
      - img "Jovie" [ref=e18]
    - heading "Log in to Jovie" [level=1] [ref=e19]
    - main [ref=e20]:
      - generic [ref=e22]:
        - alert [ref=e23]
        - form "Enter your email address" [ref=e24]:
          - generic [ref=e25]:
            - generic [ref=e26]:
              - generic [ref=e27]: Email Address
              - textbox "Email Address" [ref=e29]
            - button "Continue with Email" [ref=e30]
    - paragraph [ref=e31]:
      - text: Don't have access?
      - link "Join the waitlist" [ref=e32] [cursor=pointer]:
        - /url: /waitlist
    - navigation "Legal" [ref=e33]:
      - link "Terms" [ref=e34] [cursor=pointer]:
        - /url: /legal/terms
      - link "Privacy Policy" [ref=e35] [cursor=pointer]:
        - /url: /legal/privacy
```