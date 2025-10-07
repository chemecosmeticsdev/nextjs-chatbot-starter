# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e6]:
    - link "Chatbot App" [ref=e7] [cursor=pointer]:
      - /url: /
      - img [ref=e9] [cursor=pointer]
      - text: Chatbot App
    - generic [ref=e11]:
      - generic [ref=e12]:
        - heading "Login" [level=1] [ref=e13]
        - paragraph [ref=e14]: Enter your email below to login to your account
      - generic [ref=e15]:
        - generic [ref=e16]:
          - generic [ref=e17]: Email
          - textbox "Email" [ref=e18]: invalid-email
        - generic [ref=e19]:
          - generic [ref=e20]: Password
          - textbox "Password" [active] [ref=e21]: password123
        - button "Login" [ref=e22] [cursor=pointer]
  - alert [ref=e23]
```