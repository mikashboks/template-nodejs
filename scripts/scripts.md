# Scripts Documentation

This folder contains custom helper scripts for development, deployment, building, or other automation tasks relevant to this boilerplate.

## Available Scripts

### `init.ts` (Run via: `npm run init`)

- **Purpose:** Initializes a **new project** from this template repository. **Run this script only once** immediately after cloning the template.
- **Functionality:**
  - Interactively prompts for project-specific details (name, description, author, Docker image name, etc.) using `inquirer`.
  - Replaces placeholder variables (like `{{PROJECT_NAME}}`) throughout the codebase (in `package.json`, READMEs, configuration files, etc.).
  - Optionally initializes a new Git repository (`git init`) and creates an initial commit.
  - Optionally installs project dependencies (`npm install`).
  - Removes itself (`scripts/init.ts`) upon successful completion.
- **Usage:**
  1.  Clone the template repository.
  2.  `cd` into the new project directory.
  3.  Run `npm install` (to install script dependencies like `inquirer`).
  4.  Run `npm run init` and follow the prompts.

### `generate.ts` (Run via: `npm run generate` or `npx tsx scripts/generate.ts`)

- **Purpose:** Generates boilerplate code for **new modules** (controllers, services, routes, tests, Prisma models) within an **existing, initialized project**. Use this repeatedly during development to scaffold new features quickly.
- **Functionality:**
  - Can be run interactively (`inquirer` prompts) or non-interactively (using CLI flags via `commander`). Run `npm run generate -- --help` to see all flags.
  - Generates files based on default or custom templates (override defaults by placing `.template` files in `scripts/templates/`).
  - Creates files like `*.controller.ts`, `*.service.ts`, `*.routes.ts`, `*.test.ts`.
  - Attempts to automatically append a basic model definition to `prisma/schema.prisma`.
  - Attempts to automatically update `src/routes/index.ts` to import and use the new routes.
  - Includes options specifically for Cloud Run v2, such as generating standard health check endpoints.
- **Usage:**
  - **Interactive:** `npm run generate`
  - **Non-Interactive:** `npm run generate -- --name myModule --types controller,service,route --yes` (See `--help` for all options).
