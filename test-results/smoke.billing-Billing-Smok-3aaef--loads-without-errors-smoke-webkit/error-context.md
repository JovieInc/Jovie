# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]:
    - img [ref=e8]
  - alert [ref=e13]
  - generic [ref=e14]:
    - link "Skip to form" [ref=e15]:
      - /url: "#auth-form"
    - link "Go to homepage" [ref=e17]:
      - /url: /
      - img "Jovie" [ref=e19]
    - heading "Log in to Jovie" [level=1] [ref=e20]
    - main [ref=e21]:
      - generic [ref=e23]:
        - alert [ref=e24]
        - form "Enter your email address" [ref=e25]:
          - generic [ref=e26]:
            - generic [ref=e27]:
              - generic [ref=e28]: Email Address
              - textbox "Email Address" [ref=e30]
            - button "Continue with Email" [ref=e31]
    - paragraph [ref=e32]:
      - text: Don't have access?
      - link "Join the waitlist" [ref=e33]:
        - /url: /waitlist
    - navigation "Legal" [ref=e34]:
      - link "Terms" [ref=e35]:
        - /url: /legal/terms
      - link "Privacy Policy" [ref=e36]:
        - /url: /legal/privacy
```