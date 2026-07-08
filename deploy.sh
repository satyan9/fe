#!/bin/bash
# deploy.sh
# Bash script to build, push, and deploy tmc-frontend to GCP Cloud Run using local Docker

SERVICE_NAME="tmc-frontend"
REPOSITORY_NAME="tmc-repo"
REGION="us-central1"

# Get active GCP Project ID
echo "Retrieving active Google Cloud project..."
PROJECT_ID=$(gcloud config get-value project 2>/dev/null | tr -d '\n\r')

if [ -z "$PROJECT_ID" ]; then
    echo "ERROR: No active GCP project configured. Run 'gcloud config set project <PROJECT_ID>' first."
    exit 1
fi
echo "Active Project ID: $PROJECT_ID"

# Check if Docker CLI is installed and running
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker CLI is not installed or not in PATH. Please install Docker and start it."
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "ERROR: Docker daemon is not running. Please make sure Docker is started."
    exit 1
fi

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  echo "Reading configurations from local .env file..."
  export $(grep -v '^#' .env | xargs)
fi

# Determine values, using .env as default
RestApiUrl="${REACT_APP_REST_API_URL}"
CarApiUrl="${REACT_APP_CAR_API_URL}"
TruckApiUrl="${REACT_APP_TRUCK_API_URL}"
InrixApiUrl="${REACT_APP_INRIX_API_URL:-$REACT_APP_INRIX_HAAS_API_URL}"
InrixHaasApiUrl="${REACT_APP_INRIX_HAAS_API_URL:-$REACT_APP_INRIX_API_URL}"

# Use defaults if not specified anywhere
if [ -z "$RestApiUrl" ]; then RestApiUrl="https://tmc-backend-rest-607020806390.us-central1.run.app"; fi
if [ -z "$CarApiUrl" ]; then CarApiUrl="https://tmc-backend-car-607020806390.us-central1.run.app"; fi
if [ -z "$TruckApiUrl" ]; then TruckApiUrl="https://tmc-backend-truck-iot-607020806390.us-central1.run.app"; fi
if [ -z "$InrixApiUrl" ]; then InrixApiUrl="https://tmc-backend-inrix-haas-607020806390.us-central1.run.app"; fi
if [ -z "$InrixHaasApiUrl" ]; then InrixHaasApiUrl="https://tmc-backend-inrix-haas-607020806390.us-central1.run.app"; fi

# Define image URLs
RegistryHost="$REGION-docker.pkg.dev"
ImageUrl="$RegistryHost/$PROJECT_ID/$REPOSITORY_NAME/$SERVICE_NAME:latest"

echo "--------------------------------------------------"
echo "Deploying service: $SERVICE_NAME"
echo "Registry host:     $RegistryHost"
echo "Repository name:   $REPOSITORY_NAME"
echo "Image URL:         $ImageUrl"
echo "Region:            $REGION"
echo "--------------------------------------------------"

# Step 1: Ensure Artifact Registry Repository exists
echo "Checking if Artifact Registry repository '$REPOSITORY_NAME' exists..."
RepoExists=$(gcloud artifacts repositories list --location="$REGION" --filter="name:projects/$PROJECT_ID/locations/$REGION/repositories/$REPOSITORY_NAME" --format="value(name)")
if [ -z "$RepoExists" ]; then
    echo "Repository '$REPOSITORY_NAME' does not exist. Creating it..."
    gcloud artifacts repositories create "$REPOSITORY_NAME" --repository-format=docker --location="$REGION" --description="Docker repository for TMC services"
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to create Artifact Registry repository."
        exit 1
    fi
else
    echo "Repository '$REPOSITORY_NAME' exists."
fi

# Step 2: Configure Docker authorization
echo "Configuring Docker authentication for GCP ($RegistryHost)..."
gcloud auth configure-docker "$RegistryHost" --quiet
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to configure docker authentication."
    exit 1
fi

# Step 3: Build docker image locally
echo "Building Docker image locally..."
docker build -t "$ImageUrl" .
if [ $? -ne 0 ]; then
    echo "ERROR: Docker build failed."
    exit 1
fi
echo "Docker build successful!"

# Step 4: Push docker image to Artifact Registry
echo "Pushing Docker image to Artifact Registry..."
docker push "$ImageUrl"
if [ $? -ne 0 ]; then
    echo "ERROR: Docker push failed."
    exit 1
fi
echo "Docker image pushed successfully!"

# Step 5: Deploy image to Cloud Run
echo "Deploying to Cloud Run..."
ENV_VARS="REACT_APP_REST_API_URL=$RestApiUrl,REACT_APP_CAR_API_URL=$CarApiUrl,REACT_APP_TRUCK_API_URL=$TruckApiUrl,REACT_APP_INRIX_API_URL=$InrixApiUrl,REACT_APP_INRIX_HAAS_API_URL=$InrixHaasApiUrl"

gcloud run deploy "$SERVICE_NAME" \
  --image "$ImageUrl" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "$ENV_VARS"

if [ $? -ne 0 ]; then
    echo "ERROR: Cloud Run deployment failed."
    exit 1
fi

echo "Deployment completed successfully!"
