# Multi-stage Dockerfile for Angular PDF Translator App using Alpine 24

# Stage 1: Build stage
FROM node:lts-alpine3.22 AS build-stage

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files
COPY package*.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the Angular application
RUN pnpm run build --configuration=production

# Stage 2: Production stage
FROM nginx:alpine3.22 AS production-stage

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built application from build stage
COPY --from=build-stage /app/dist/pdf-translator /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"] 