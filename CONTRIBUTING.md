# Contributing to ECHO RUN

Thanks for taking the time to contribute.

## Ground Rules

- Be respectful and constructive.
- Keep pull requests focused and small when possible.
- Open an issue before large feature work to align on direction.

## Local Setup

Requires Node.js 22.12+ (see `.nvmrc`).

```bash
npm install
npm run dev
```

## Development Workflow

1. Fork the repository.
2. Create a branch: `feat/short-description` or `fix/short-description`.
3. Make your changes with clear commit messages.
4. Run checks:
   - `npm test` (unit tests)
   - `npm run build`
   - `npm run test:e2e` (end-to-end tests in headless Chrome)
5. Open a pull request using the PR template.

## Pull Request Checklist

- [ ] Code builds successfully (`npm run build`)
- [ ] `npm test` and `npm run test:e2e` pass
- [ ] Changes are scoped to a single concern
- [ ] README/docs updated if behavior changed
- [ ] No secrets, generated files, or `node_modules` committed

## Reporting Bugs

Please use the bug report issue template and include:

- Expected behavior
- Actual behavior
- Steps to reproduce
- Browser/OS info

## Feature Requests

Please use the feature request template and include:

- Problem statement
- Proposed solution
- Alternatives considered
