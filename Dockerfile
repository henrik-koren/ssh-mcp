# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (including dev deps needed for TypeScript build)
# --ignore-scripts skips the `prepare` hook so npm doesn't try to compile
# before the source files are present; we run the build explicitly below
COPY package*.json ./
RUN npm ci --ignore-scripts

# Compile TypeScript → JavaScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy only production dependencies + compiled output
COPY package*.json ./
# --ignore-scripts prevents the `prepare` lifecycle hook (tsc build) from
# running here — the compiled output is already copied from the builder stage
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/build ./build

# Port the HTTP MCP server listens on
EXPOSE 8080

# Health check (matches the /health endpoint in http-server.ts)
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

# Run the HTTP MCP server (not the stdio server)
CMD ["node", "build/http-server.js"]
