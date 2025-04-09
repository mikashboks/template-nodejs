# Test Directory Documentation

This folder contains all automated tests for the application, categorized by type:

- **`unit/`**: Unit tests focus on isolating and testing individual functions, modules, or classes. They should be fast and mock dependencies.
- **`integration/`**: Integration tests verify the interaction between different parts of the application (e.g., controller and service, service and database layer) without necessarily testing the full end-to-end flow.
- **`e2e/`**: End-to-end tests simulate real user scenarios by testing the application through its external interfaces (usually HTTP API endpoints) as a whole. They test the complete flow from request to response, including database interactions if applicable.

## Running Tests

Use the following npm scripts (defined in `package.json`):

- `npm test`: Run all tests once.
- `npm run test:watch`: Run tests in watch mode, re-running on file changes.
- `npm run coverage`: Run tests and generate a coverage report.
