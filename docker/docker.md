## Docker Usage

This project includes a multi-stage `Dockerfile` located at the project root. It's optimized for building small and secure production images suitable for deployment on platforms like Google Cloud Run v2.

**Key Features of the Dockerfile:**

* **Multi-stage Build:** Creates intermediate stages for dependency installation and building, resulting in a smaller final production image.
* **Optimized Caching:** Layers are structured to maximize Docker build cache usage.
* **Prisma Integration:** Correctly handles Prisma Client generation (`prisma generate`) during the build.
* **Security:** Runs the application as a non-root user (`nodejs`) and removes development dependencies.
* **Cloud Run Ready:** Exposes the standard port (`8080`), includes a `HEALTHCHECK` instruction compatible with Cloud Run probes, and uses `dumb-init` for proper signal handling and graceful shutdown.

A `.dockerignore` file is also included to ensure unnecessary files (like `.git`, `node_modules`, `.env`, logs) are excluded from the build context sent to the Docker daemon, which speeds up builds and enhances security.

### Building the Image

To build the Docker image, run the following command from the project root. Replace `your-image-name:tag` with your desired image name and tag (e.g., `my-app:latest`, `us-central1-docker.pkg.dev/my-gcp-project/my-app:v1.0.0`).

```bash
# Using the npm script (which might use placeholders like {{DOCKER_IMAGE}})
# Ensure the image name in package.json's docker:build script is correct
# npm run docker:build -- --tag your-image-name:tag

# Or using the direct Docker command:
docker build -t your-image-name:tag .