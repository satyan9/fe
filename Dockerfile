# --- Stage 1: Build ---
FROM node:20-slim AS build-stage

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install
 
# Copy source code and build
COPY . .
RUN npm run build

# --- Stage 2: Production ---
FROM nginx:stable-alpine

# Set port environment variable (default to 8080 for Cloud Run)
ENV PORT=8080

# Copy built files from build-stage
COPY --from=build-stage /app/build /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Use a shell script to replace the port in nginx config at runtime
# This allows Cloud Run to inject the $PORT variable
CMD ["sh", "-c", "sed -i 's/listen       8080;/listen       '\"$PORT\"';/' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
