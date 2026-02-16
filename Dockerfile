# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy source code (needed before npm ci because of prepare script)
COPY src ./src

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Build is handled by the prepare script in npm ci
# But we'll run it explicitly to be sure
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only (skip prepare script since we copy built files)
RUN npm ci --omit=dev --ignore-scripts

# Copy built application from builder stage
COPY --from=builder /app/build ./build

# Optional: Copy certificate if needed
# COPY Zerto-Root-CA.crt ./Zerto-Root-CA.crt

# Set environment variables (can be overridden at runtime)
ENV JENKINS_URL=""
ENV JENKINS_USER=""
ENV JENKINS_TOKEN=""
# ENV NODE_EXTRA_CA_CERTS="/app/Zerto-Root-CA.crt"

# Run the application
CMD ["node", "build/index.js"]
