# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]:
    - img [ref=e8]
  - alert [ref=e11]
  - generic [ref=e12]:
    - link "Skip to form" [ref=e13] [cursor=pointer]:
      - /url: "#auth-form"
    - link "Go to homepage" [ref=e15] [cursor=pointer]:
      - /url: /
      - img "Jovie" [ref=e17]
    - heading "Log in to Jovie" [level=1] [ref=e18]
    - main [ref=e19]:
      - generic [ref=e21]:
        - alert [ref=e22]
        - form "Enter your email address" [ref=e23]:
          - generic [ref=e24]:
            - generic [ref=e25]:
              - generic [ref=e26]: Email Address
              - textbox "Email Address" [ref=e28]
            - button "Continue with Email" [ref=e29]
    - paragraph [ref=e30]:
      - text: Don't have access?
      - link "Join the waitlist" [ref=e31] [cursor=pointer]:
        - /url: /waitlist
    - navigation "Legal" [ref=e32]:
      - link "Terms" [ref=e33] [cursor=pointer]:
        - /url: /legal/terms
      - link "Privacy Policy" [ref=e34] [cursor=pointer]:
        - /url: /legal/privacy
```