Refer to https://ui.shadcn.com/blocks/authentication with the login-03 - implement this so that the home page redirects users to this login page.
  And also refer to @docs/api-doc.md for API endpoints relating to login page. The user management engine is AWS cognito which is alreay setup with
  provided credentials in .env.local . After the user is successfully logged in the user is automatically redirected to /dashboard page (blank for
  now we will update it in the future). You need to also checked logged in user with the database to see if the logged in user is existing in the
  database if not you update the database with this user's info. And for the whole session that the user is logged in refer to this user by the id
  generated in the database. If the user is clicking the logout button (refer to api endpoint) the seesion is destoryed and the user is taken to the
  login page. 