# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./
COPY tsconfig.json ./

# Copy source code (needed before npm install because of prepare script)
COPY src ./src

# Install all dependencies (including dev dependencies for build)
RUN npm install

# Build is handled by the prepare script in npm install
# But we'll run it explicitly to be sure
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built package.json and package-lock.json for production dependencies
COPY --from=builder /app/package* ./

# Install production dependencies only
RUN npm install --omit=dev --ignore-scripts

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
