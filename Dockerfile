# --- Stage 1: Build ---
FROM node:20-slim AS build-stage

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Build arguments for Cloud Run backend URLs
ARG REACT_APP_REST_API_URL=PLACEHOLDER_REACT_APP_REST_API_URL
ARG REACT_APP_CAR_API_URL=PLACEHOLDER_REACT_APP_CAR_API_URL
ARG REACT_APP_TRUCK_API_URL=PLACEHOLDER_REACT_APP_TRUCK_API_URL
ARG REACT_APP_INRIX_API_URL=PLACEHOLDER_REACT_APP_INRIX_API_URL
ARG REACT_APP_INRIX_HAAS_API_URL=PLACEHOLDER_REACT_APP_INRIX_HAAS_API_URL

ENV REACT_APP_REST_API_URL=$REACT_APP_REST_API_URL
ENV REACT_APP_CAR_API_URL=$REACT_APP_CAR_API_URL
ENV REACT_APP_TRUCK_API_URL=$REACT_APP_TRUCK_API_URL
ENV REACT_APP_INRIX_API_URL=$REACT_APP_INRIX_API_URL
ENV REACT_APP_INRIX_HAAS_API_URL=$REACT_APP_INRIX_HAAS_API_URL

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

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Run entrypoint script on startup
ENTRYPOINT ["/entrypoint.sh"]
