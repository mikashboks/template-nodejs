# syntax=docker/dockerfile:1.4

#-----------------------------------------------------------------------------
# Base Stage: Common setup for Node.js Alpine with necessary tools
#-----------------------------------------------------------------------------
FROM node:22-alpine AS base
# Use alpine linux for a small image size. Node 22 matches project requirement.

# Set working directory
WORKDIR /app

# Install necessary tools:
# - dumb-init: Proper signal handling (PID 1 init system) for graceful shutdown.
# - curl: Used for health checks.
RUN apk add --no-cache dumb-init curl

# Set default Node environment to production for subsequent stages unless overridden
ENV NODE_ENV=production
# Set default port (Cloud Run injects $PORT, which overrides this at runtime if set)
ENV PORT=8080

#-----------------------------------------------------------------------------
# Dependencies Stage: Install ALL dependencies needed for build and runtime
#-----------------------------------------------------------------------------
FROM base AS deps

# Copy package manifests and prisma schema
# Copying schema ensures 'prisma generate' works correctly later if needed post-install
COPY package.json package-lock.json* ./
COPY prisma/* ./prisma/

# Install ALL dependencies using npm ci for reproducible builds
# Includes devDependencies needed for build steps (like typescript, prisma cli)
RUN npm ci

#-----------------------------------------------------------------------------
# Build Stage: Compile TypeScript, generate Prisma client, prune dev deps
#-----------------------------------------------------------------------------
FROM deps AS build

# Copy the rest of the application source code
# This benefits from layer caching - only runs if source code changes
COPY . .

# Generate Prisma Client based on schema copied in 'deps' stage
# Ensure the client is generated before building the app
RUN npm run prisma:generate

# Build the TypeScript application
RUN npm run build

# Prune development dependencies after build is complete
# This removes packages like typescript, eslint, vitest etc. from node_modules
RUN npm prune --production

#-----------------------------------------------------------------------------
# Production Stage: Create the final, small, secure image
#-----------------------------------------------------------------------------
FROM base AS production
# Start from the clean base stage again

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080 

# Copy necessary artifacts from the 'build' stage
COPY --from=build /app/package.json ./package.json 
COPY --from=build /app/dist ./dist 
COPY --from=build /app/node_modules ./node_modules 
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# DO NOT copy .env files - configuration should be injected via Cloud Run ENV variables / secrets
# COPY .env.production ./.env # <-- REMOVED / DO NOT DO THIS

# Optional: Copy prisma schema if needed for runtime migrations (less common for Cloud Run)
# COPY --from=build /app/prisma ./prisma

# Security: Create a non-root user and switch to it
# Reduces potential security risks if the application process is compromised.
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    # Optionally give ownership of necessary directories if needed, though often not required if app only reads/writes elsewhere
    chown -R nodejs:nodejs /app
USER nodejs

# Health Check Configuration for Cloud Run
# Uses the /readiness endpoint (adjust path if needed based on config/routes)
# Checks if the app is ready to serve traffic (e.g., DB connected)
# Cloud Run uses this to determine instance health and readiness.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/readiness || exit 1
    # Alternative using /liveness if readiness check is too heavy:
    # CMD curl -f http://localhost:${PORT}/liveness || exit 1

# Expose the port the application will listen on (matches $PORT)
EXPOSE 8080

# Use dumb-init as the entrypoint to handle signals correctly (like SIGTERM from Cloud Run)
# Ensures graceful shutdown logic in the application is triggered.
ENTRYPOINT ["dumb-init", "--"]

# Command to run the application
# Uses the compiled JavaScript output from the 'dist' directory.
CMD ["node", "dist/server.js"]