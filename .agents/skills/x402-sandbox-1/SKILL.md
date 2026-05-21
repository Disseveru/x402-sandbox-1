```markdown
# x402-sandbox-1 Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill introduces the core development patterns and conventions used in the `x402-sandbox-1` TypeScript codebase. It covers file and code organization, commit message styles, and testing patterns, providing practical examples and suggested commands to streamline your workflow.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `userProfile.ts`, `dataFetcher.test.ts`

### Import Style
- Mixed import styles are used.
  - **Named imports:**
    ```typescript
    import { fetchData } from './dataFetcher';
    ```
  - **Default imports:**
    ```typescript
    import UserProfile from './userProfile';
    ```

### Export Style
- Prefer **named exports**.
  - Example:
    ```typescript
    // dataFetcher.ts
    export function fetchData() { /* ... */ }
    export const API_URL = 'https://api.example.com';
    ```

### Commit Messages
- Mixed types, but commonly use the `feat` prefix for features.
- Average commit message length: ~38 characters.
  - Example: `feat: add user authentication logic`

## Workflows

### Feature Development
**Trigger:** When adding a new feature.
**Command:** `/feature`

1. Create a new TypeScript file using camelCase naming.
2. Implement the feature using named exports.
3. Add or update tests in a corresponding `*.test.ts` file.
4. Commit changes with a message prefixed by `feat:`.
5. Push your branch and open a pull request.

### Testing
**Trigger:** When verifying code correctness.
**Command:** `/test`

1. Identify or create a test file matching `*.test.ts`.
2. Write or update tests for your feature or bugfix.
3. Run the test suite using your preferred test runner.
4. Ensure all tests pass before merging.

## Testing Patterns

- Test files follow the `*.test.ts` naming convention.
- The specific testing framework is not defined, but typical test files might look like:
  ```typescript
  // dataFetcher.test.ts
  import { fetchData } from './dataFetcher';

  describe('fetchData', () => {
    it('should return data', async () => {
      const data = await fetchData();
      expect(data).toBeDefined();
    });
  });
  ```
- Place test files alongside the code they test or in a dedicated `tests/` directory.

## Commands

| Command   | Purpose                                 |
|-----------|-----------------------------------------|
| /feature  | Start a new feature development workflow |
| /test     | Run or write tests for the codebase     |
```
