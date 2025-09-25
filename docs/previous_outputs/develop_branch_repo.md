Based on your CI/CD setup in CLAUDE.md, here's when to merge back to master:

  Good times to merge to master:
  1. Feature is complete and tested - All functionality works as intended
  2. All CI checks pass - Linting, type checking, build succeed
  3. Code review approved - PR has been reviewed and approved
  4. Ready for production - Since master triggers automatic AWS Amplify deployment
  5. No breaking changes - Or breaking changes are intentional for a release

  Your CI/CD pipeline will:
  - Run automated checks (lint, type-check, build)
  - Deploy to production via AWS Amplify
  - Send notifications (if configured)

  Best practice workflow:
  1. Work on feature branch
  2. Open PR to master
  3. CI runs automatically (pr-checks.yml)
  4. Get code review approval
  5. Merge PR (triggers deploy.yml)
  6. Automatic production deployment

  Avoid merging when:
  - Work is incomplete/experimental
  - Tests are failing
  - Breaking changes without proper versioning
  - During sensitive production periods

  Since your master branch auto-deploys, treat it as your production branch and only merge production-ready code.