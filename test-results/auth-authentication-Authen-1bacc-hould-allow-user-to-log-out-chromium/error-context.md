# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e6]:
    - link "Chatbot App" [ref=e7] [cursor=pointer]:
      - /url: /
      - img [ref=e9] [cursor=pointer]
      - text: Chatbot App
    - generic [ref=e11]:
      - generic [ref=e12]:
        - heading "Login" [level=1] [ref=e13]
        - paragraph [ref=e14]: Enter your email below to login to your account
      - generic [ref=e15]: Incorrect username or password.
      - generic [ref=e16]:
        - generic [ref=e17]:
          - generic [ref=e18]: Email
          - textbox "Email" [ref=e19]: test@example.com
        - generic [ref=e20]:
          - generic [ref=e21]: Password
          - textbox "Password" [ref=e22]: password123
        - button "Login" [ref=e23] [cursor=pointer]
  - alert [ref=e24]
```