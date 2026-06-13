# Multi-stage Dockerfile for Angular PDF Translator App using Alpine 24

# Stage 1: Build stage
FROM node:alpine3.24 AS build-stage

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files and pnpm config (allowBuilds lives in pnpm-workspace.yaml)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the Angular application
RUN pnpm run build --configuration=production

# Stage 2: Production stage
FROM nginx:alpine AS production-stage

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built application from build stage
COPY --from=build-stage /app/dist/pdf-translator/browser /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
