# MiKashBoks Node.js TypeScript Boilerplate

A production-ready Node.js TypeScript boilerplate providing a solid foundation with best practices for what we use as starting points for out services at MiKashBoks optimized for Cloud Run deployment.

[![CI](https://github.com/YOUR_GITHUB_USERNAME/my-awesome-project/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_GITHUB_USERNAME/my-awesome-project/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Table of Contents

- [MiKashBoks Node.js TypeScript Boilerplate](#mikashboks-nodejs-typescript-boilerplate)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Prerequisites](#prerequisites)
  - [Getting Started](#getting-started)
  - [Development Workflow](#development-workflow)
    - [Available Scripts](#available-scripts)
    - [Using the Init Script](#using-the-init-script)
    - [Generating Modules](#generating-modules)
  - [Project Structure](#project-structure)
  - [Docker Support](#docker-support)
  - [Deployment](#deployment)
    - [Cloud Run Deployment](#cloud-run-deployment)
    - [GitHub Actions CI/CD](#github-actions-cicd)
  - [Contributing](#contributing)
  - [License](#license)

## Features

- **TypeScript**: Strong typing for better code quality and maintainability
- **Express.js**: Fast, unopinionated web framework with ESM support
- **Prisma ORM**: Type-safe database access with migrations
- **Pino**: High-performance, structured JSON logging, suitable for Cloud Logging.
- **Zod**: TypeScript-first schema declaration and validation.
- **Configuration**: Type-safe environment variable loading and validation using Zod and `dotenv`.
- **Structured Layout**: Clear separation of concerns (controllers, services, routes, middleware, utils, lib).
- **GitHub Actions**: Comprehensive CI/CD pipeline for validation, testing, security scanning, building, pushing to Artifact Registry, and deploying to Cloud Run (Staging & Production).
- **Code Generation**: Includes scripts (`init`, `generate`) to initialize the template and scaffold new modules.
- **API Documentation**: Basic Swagger setup via `swagger-jsdoc` and `swagger-ui-express`.
- **Cloud Run Optimizations**:
  - Connection pooling and proper resource management
  - Health check endpoints for monitoring
  - Graceful shutdown handling
- **Docker**: Multi-stage builds for optimized production images
- **Security**: Includes `helmet`, `cors`, `express-rate-limit`, `eslint-plugin-security`, and `npm audit` checks.
- **Testing**: Vitest for fast, ESM-compatible unit and integration testing
- **Code Quality**:
  - ESLint & Prettier for consistent style
  - Husky for Git hooks
  - Commitlint for standardized commits
  - Vitest for Blazing fast unit, integration, and E2E testing framework.
- **Development Tools**:
  - Hot reloading with nodemon
  - Type checking and documentation generation
  - Module generator script for rapid scaffolding
- **CI/CD**: GitHub Actions workflow with GCP deployment

## Prerequisites

- [Node.js](https://nodejs.org/) v20+ (see `engines` field in `package.json`)
- [npm](https://www.npmjs.com/) v10+ (usually comes with Node.js)
- [Docker](https://www.docker.com/) (optional, for containerization)
- [Git](https://git-scm.com/) (for version control)

## Getting Started

1. **Clone the repository**:

   ```bash
   git clone https://github.com/mikashboks/nodejs-boilerplate.git my-project
   cd my-project
   ```

2. **Initialize your project**:

   ```bash
   npm install
   npm run init
   ```

   Follow the prompts to customize the project for your needs.

3. **Set up environment variables**:

   ```bash
   # Copy the example environment file
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```
   Your API will be available at http://localhost:3000.

## Development Workflow

### Available Scripts

| Command                 | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `npm run dev`           | Run server in development mode with auto-reloading           |
| `npm run build`         | Compile TypeScript to JavaScript (output in `dist/`)         |
| `npm start`             | Run the compiled JavaScript code (run `npm run build` first) |
| `npm run lint`          | Check code for linting errors                                |
| `npm run lint:fix`      | Fix linting errors automatically                             |
| `npm run format`        | Format code with Prettier                                    |
| `npm run format:fix`    | Fix formatting issues automatically                          |
| `npm test`              | Run all tests                                                |
| `npm run test:watch`    | Run tests in watch mode                                      |
| `npm run test:coverage` | Generate test coverage report                                |
| `npm run typecheck`     | Run TypeScript compiler checks without emitting files        |
| `npm run validate`      | Run linting, type checking, and tests                        |
| `npm run docker:build`  | Build Docker image                                           |
| `npm run docker:run`    | Run container from built image                               |
| `npm run init`          | Initialize a new project from this template                  |
| `npm run generate`      | Generate new module (controller, service, routes, etc.)      |

### Using the Init Script

The initialization script (`npm run init`) helps you quickly set up a new project with your specific details:

1. **Run the script**: After cloning the repository and installing dependencies

   ```bash
   npm run init
   ```

2. **Provide project details** when prompted:

   - Project name
   - Project description
   - Author name & email
   - Docker image name
   - Production URL
   - Git initialization preference
   - Dependency installation preference

3. **What the script does**:
   - Replaces template placeholders in all project files
   - Optionally initializes a new Git repository
   - Optionally installs dependencies
   - Removes itself after successful execution

### Generating Modules

The code generator script helps you scaffold new modules following recommended patterns:

1. **Interactive usage**:

   ```bash
   npm run generate
   ```

   Follow the prompts to enter module details.

2. **Command-line usage**:

   ```bash
   # Generate all components for 'product' module
   npm run generate -- --name product --all --yes

   # Generate specific components with custom path
   npm run generate -- --name order --types controller,service --base-path /api/v2 --yes
   ```

3. **Available options**:

   - `--name <name>`: Module name (required)
   - `--plural <plural>`: Plural form (default: name + 's')
   - `--types <types>`: Components to generate (comma-separated)
   - `--all`: Generate all components
   - `--cloud-run`: Add Cloud Run health checks
   - `--base-path <path>`: API path prefix
   - `--yes`: Skip confirmation prompts

4. **Generated files**:
   - Controller with CRUD operations and validation
   - Service with database operations and error handling
   - Routes with proper middleware and Swagger documentation
   - Test files with mocking setup
   - Prisma model definition
   - Cloud Run health check endpoints (if enabled)

## Project Structure

```
.
├── .github/workflows/    # GitHub Actions CI configuration
├── docker/               # Docker configuration
├── docs/                 # Project documentation
├── prisma/               # Prisma schema and migrations
├── scripts/              # Utility scripts (init, generate)
├── src/                  # Source code
│   ├── config/           # Application configuration
│   ├── controllers/      # Request handlers
│   ├── middleware/       # Express middleware
│   ├── routes/           # API route definitions
│   ├── services/         # Business logic
│   ├── utils/            # Utility functions
│   ├── app.ts            # Express application setup
│   └── server.ts         # Server entry point
├── test/                 # Test files
├── .env.example          # Example environment variables
├── tsconfig.json         # TypeScript configuration
└── package.json          # Project metadata and scripts
```

## Docker Support

This project includes Docker support for both development and production:

1. **Build the Docker image**:

   ```bash
   npm run docker:build
   # or directly:
   docker build -t my-project:latest .
   ```

2. **Run the container**:
   ```bash
   npm run docker:run
   # or directly:
   docker run -p 3000:3000 my-project:latest
   ```

The Dockerfile is optimized for Cloud Run with:

- Multi-stage builds to minimize image size
- Node Alpine base for smaller footprint
- Non-root user for security
- Proper health check configuration
- Optimized layer caching
- Signal handling with dumb-init

## Deployment

### Cloud Run Deployment

This project is optimized for Google Cloud Run deployment:

1. **Build and push the Docker image**:

   ```bash
   # Build the production image
   docker build -t gcr.io/YOUR_PROJECT_ID/my-service:latest .

   # Push to Google Container Registry
   docker push gcr.io/YOUR_PROJECT_ID/my-service:latest
   ```

2. **Deploy to Cloud Run**:

   ```bash
   gcloud run deploy my-service \
     --image gcr.io/YOUR_PROJECT_ID/my-service:latest \
     --platform managed \
     --region YOUR_REGION \
     --allow-unauthenticated \
     --port 8080 \
     --memory 512Mi \
     --min-instances 0 \
     --max-instances 10 \
     --set-env-vars="NODE_ENV=production" \
     --set-secrets="DATABASE_URL=DATABASE_URL:latest" \
     --concurrency 80
   ```

3. **Configure health checks**:
   ```bash
   gcloud run services update my-service \
     --http-health-check-path=/health \
     --initial-delay=10s \
     --timeout=5s \
     --period=30s
   ```

**Key Cloud Run optimizations included**:

- Database connection pooling and proper disconnection
- Memory management with request-scoped services
- Graceful shutdown handling
- Structured logging for Cloud Logging
- Health check endpoints
- Request tracing with unique IDs

### GitHub Actions CI/CD

This project includes a GitHub Actions workflow for CI/CD with Google Cloud Platform:

1. **Required secrets**:

   - `GCP_PROJECT_ID`: Your Google Cloud project ID
   - `GCP_SA_KEY`: Service account key JSON (with Container Registry and Cloud Run permissions)
   - `GCP_REGION`: Deployment region (e.g., `us-central1`)
   - `CODECOV_TOKEN`: (Optional) Codecov token for coverage reporting
   - `SLACK_WEBHOOK`: (Optional) Webhook for deployment notifications

2. **Workflow stages**:

   - Validate: Linting and type checking
   - Test: Run tests with coverage reporting
   - Security: Run vulnerability scans
   - Build: Compile TypeScript and create artifacts
   - Docker: Build and push container image
   - Deploy: Deploy to staging/production environments

3. **Deployment environments**:
   - Staging: Automated deployment from `develop` branch
   - Production: Automated deployment from `main` branch or version tags

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
