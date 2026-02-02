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

# Use the existing node user (UID 1000 in alpine)
# Copy built assets and server
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/server ./server

# Switch to non-root user
USER node

# Set port from build arg
ARG PORT=8080
ENV PORT=${PORT}

# Expose port
EXPOSE ${PORT}

# Start the middleware server
CMD ["node", "server/index.js"]
