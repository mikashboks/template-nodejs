# Source Directory (`src`) Documentation

This directory contains the core application source code, written in TypeScript.

## Structure

- **`controllers/`**: Handles incoming requests, validates input (optional), and calls appropriate services. Should contain minimal business logic.
- **`middlewares/`**: Express middleware functions for tasks like logging, authentication, validation, error handling, etc.
- **`routes/`**: Defines API endpoints and maps them to controller functions. Organizes routes, often by resource.
- **`services/`**: Contains the main business logic of the application. Interacts with data layers, external APIs, etc.
- **`utils/`**: Utility functions and helpers used across the application (e.g., logger, constants, helper functions).
- **`index.ts`**: The main entry point of the application. Sets up the Express server, middleware, routes, and starts listening for connections.

This structure promotes separation of concerns and maintainability.
