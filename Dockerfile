# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (full install for build)
RUN npm ci --legacy-peer-deps && npm cache clean --force

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build
RUN npm run build

# Stage 2: Install production deps only
FROM node:22-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --only=production --ignore-scripts && npm cache clean --force

# Stage 3: Runtime
FROM node:22-alpine AS runtime

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built artifacts and prod deps
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node dist/healthcheck.js || exit 1

# Expose port for MCP server
EXPOSE 3000

# Default command
CMD ["node", "dist/cli.js"]
