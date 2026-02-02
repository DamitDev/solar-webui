# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Run the middleware server
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Create non-root user
RUN adduser -D -u 1000 appuser

# Copy built assets and server
COPY --from=builder --chown=appuser:appuser /app/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/server ./server

# Switch to non-root user
USER appuser

# Set port from build arg
ARG PORT=8080
ENV PORT=${PORT}

# Expose port
EXPOSE ${PORT}

# Start the middleware server
CMD ["node", "server/index.js"]
