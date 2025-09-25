# AWS Amplify Next.js Deployment - Quick Reference Checklist

## Pre-Deployment Checklist

### Environment Setup
- [ ] Check disk space: `df -h` (need at least 2GB)
- [ ] Node.js version: `node --version` (v18+ recommended)
- [ ] npm version: `npm --version` (v8+ recommended)

### Code Quality
- [ ] Run local build: `npm run build`
- [ ] Check linting: `npm run lint`
- [ ] TypeScript check: `npx tsc --noEmit`
- [ ] Test locally: `npm run dev`

### Git Configuration
- [ ] Verify .gitignore excludes .env.local
- [ ] Check no secrets in tracked files: `git status`
- [ ] Commit message follows standards

## Amplify Configuration

### Required Files
- [ ] `amplify.yml` exists in project root
- [ ] `next.config.js` has proper configuration
- [ ] `package.json` has all required scripts

### amplify.yml Template
```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - echo "Installing dependencies..."
        - npm install
    build:
      commands:
        - echo "Building Next.js application..."
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

### next.config.js Essentials
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false  // Disable if not all routes implemented
  },
  env: {
    // Only expose non-sensitive env vars
    DEFAULT_REGION: process.env.DEFAULT_REGION
  }
}
module.exports = nextConfig
```

## Common Issues & Fixes

### Build Failures
1. **npm install fails**
   - Check if package-lock.json exists
   - Use `npm install` not `npm ci` if no package-lock

2. **ESLint errors**
   - Escape apostrophes: `don't` → `don&apos;t`
   - Use proper HTML entities in JSX

3. **TypeScript errors**
   - Disable typed routes if routes don't exist
   - Check all imports are valid

4. **Space issues**
   - Clean npm cache: `npm cache clean --force`
   - Remove node_modules before fresh install

### Deployment Issues
1. **404 errors**
   - Check correct URL: `https://master.<app-id>.amplifyapp.com`
   - Not: `https://<app-id>.amplifyapp.com`

2. **Environment variables**
   - Set in Amplify console, not in code
   - Use BAWS_ prefix for AWS credentials

## AWS CLI Commands

### Check App Status
```bash
aws amplify get-app --app-id <app-id> --region <region>
```

### List Jobs
```bash
aws amplify list-jobs --app-id <app-id> --branch-name <branch> --region <region>
```

### Get Job Details
```bash
aws amplify get-job --app-id <app-id> --branch-name <branch> --job-id <job-id> --region <region>
```

### Trigger Manual Build
```bash
aws amplify start-job --app-id <app-id> --branch-name <branch> --job-type RELEASE --region <region>
```

## URL Patterns

### Branch-based URLs (Default)
- Production: `https://main.<app-id>.amplifyapp.com`
- Feature: `https://feature-branch.<app-id>.amplifyapp.com`

### App-level URLs (Custom domains)
- Custom: `https://<app-id>.amplifyapp.com`
- Domain: `https://yourdomain.com`

## Troubleshooting Steps

### When Build Fails
1. Check build logs in AWS console
2. Verify amplify.yml syntax
3. Test local build process
4. Check for code quality issues

### When App Returns 404
1. Verify correct URL pattern
2. Check if deployment actually succeeded
3. Verify artifacts were uploaded
4. Check CloudFront distribution status

### When Environment Issues
1. Verify all env vars in Amplify console
2. Check build compute size
3. Verify npm install works locally
4. Check disk space in build environment

## Performance Optimization

### Build Speed
- Use npm cache in amplify.yml
- Only install production dependencies
- Use appropriate compute size

### Runtime Performance
- Enable Next.js caching
- Use CloudFront CDN (automatic)
- Optimize images with next/image
- Use proper meta tags for SEO

---

**Last Updated:** September 24, 2025
**Use Case:** Quick reference during AWS Amplify deployments