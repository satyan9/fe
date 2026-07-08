# deploy.ps1
# PowerShell script to build, push, and deploy tmc-frontend to GCP Cloud Run using local Docker

$ServiceName = "tmc-frontend"
$RepositoryName = "tmc-repo"
$Region = "us-central1"

# Get active GCP Project ID
Write-Host "Retrieving active Google Cloud project..." -ForegroundColor Cyan
$ProjectId = (gcloud config get-value project 2>$null)
if ($ProjectId) {
    $ProjectId = $ProjectId.Trim()
}
if (-not $ProjectId) {
    Write-Host "ERROR: No active GCP project configured. Run 'gcloud config set project <PROJECT_ID>' first." -ForegroundColor Red
    exit 1
}
Write-Host "Active Project ID: $ProjectId" -ForegroundColor Green

# Check if Docker CLI is installed and running
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker CLI is not installed or not in PATH. Please install Docker Desktop and start it." -ForegroundColor Red
    exit 1
}
docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker daemon is not running. Please make sure Docker Desktop is started." -ForegroundColor Red
    exit 1
}

# Load environment variables from .env file if it exists
$EnvVars = @{}
if (Test-Path ".env") {
    Write-Host "Reading configurations from local .env file..." -ForegroundColor Cyan
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line -split "=", 2
            $key = $parts[0].Trim()
            $value = $parts[1].Trim()
            $EnvVars[$key] = $value
        }
    }
} else {
    Write-Host "WARNING: No .env file found. Using default values." -ForegroundColor Yellow
}

# Determine values, using .env as default
$RestApiUrl = $EnvVars["REACT_APP_REST_API_URL"]
$CarApiUrl = $EnvVars["REACT_APP_CAR_API_URL"]
$TruckApiUrl = $EnvVars["REACT_APP_TRUCK_API_URL"]
$InrixApiUrl = $EnvVars["REACT_APP_INRIX_API_URL"]
if (-not $InrixApiUrl) {
    $InrixApiUrl = $EnvVars["REACT_APP_INRIX_HAAS_API_URL"]
}
$InrixHaasApiUrl = $EnvVars["REACT_APP_INRIX_HAAS_API_URL"]
if (-not $InrixHaasApiUrl) {
    $InrixHaasApiUrl = $InrixApiUrl
}

# Use defaults if not specified anywhere
if (-not $RestApiUrl) { $RestApiUrl = "https://tmc-backend-rest-607020806390.us-central1.run.app" }
if (-not $CarApiUrl) { $CarApiUrl = "https://tmc-backend-car-607020806390.us-central1.run.app" }
if (-not $TruckApiUrl) { $TruckApiUrl = "https://tmc-backend-truck-iot-607020806390.us-central1.run.app" }
if (-not $InrixApiUrl) { $InrixApiUrl = "https://tmc-backend-inrix-haas-607020806390.us-central1.run.app" }
if (-not $InrixHaasApiUrl) { $InrixHaasApiUrl = "https://tmc-backend-inrix-haas-607020806390.us-central1.run.app" }

# Define image URLs
$RegistryHost = "$Region-docker.pkg.dev"
$ImageUrl = "$RegistryHost/$ProjectId/$RepositoryName/$ServiceName:latest"

Write-Host "--------------------------------------------------" -ForegroundColor Gray
Write-Host "Deploying service: $ServiceName" -ForegroundColor Green
Write-Host "Registry host:     $RegistryHost" -ForegroundColor Green
Write-Host "Repository name:   $RepositoryName" -ForegroundColor Green
Write-Host "Image URL:         $ImageUrl" -ForegroundColor Green
Write-Host "Region:            $Region" -ForegroundColor Green
Write-Host "--------------------------------------------------" -ForegroundColor Gray

# Step 1: Ensure Artifact Registry Repository exists
Write-Host "Checking if Artifact Registry repository '$RepositoryName' exists..." -ForegroundColor Cyan
$RepoExists = gcloud artifacts repositories list --location=$Region --filter="name:projects/$ProjectId/locations/$Region/repositories/$RepositoryName" --format="value(name)"
if (-not $RepoExists) {
    Write-Host "Repository '$RepositoryName' does not exist. Creating it..." -ForegroundColor Cyan
    gcloud artifacts repositories create $RepositoryName --repository-format=docker --location=$Region --description="Docker repository for TMC services"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create Artifact Registry repository." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Repository '$RepositoryName' exists." -ForegroundColor Green
}

# Step 2: Configure Docker authorization
Write-Host "Configuring Docker authentication for GCP ($RegistryHost)..." -ForegroundColor Cyan
gcloud auth configure-docker $RegistryHost --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to configure docker authentication." -ForegroundColor Red
    exit 1
}

# Step 3: Build docker image locally
Write-Host "Building Docker image locally..." -ForegroundColor Cyan
docker build -t $ImageUrl .
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker build failed." -ForegroundColor Red
    exit 1
}
Write-Host "Docker build successful!" -ForegroundColor Green

# Step 4: Push docker image to Artifact Registry
Write-Host "Pushing Docker image to Artifact Registry..." -ForegroundColor Cyan
docker push $ImageUrl
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker push failed." -ForegroundColor Red
    exit 1
}
Write-Host "Docker image pushed successfully!" -ForegroundColor Green

# Step 5: Deploy image to Cloud Run
Write-Host "Deploying to Cloud Run..." -ForegroundColor Cyan
$EnvVarsString = "REACT_APP_REST_API_URL=$RestApiUrl,REACT_APP_CAR_API_URL=$CarApiUrl,REACT_APP_TRUCK_API_URL=$TruckApiUrl,REACT_APP_INRIX_API_URL=$InrixApiUrl,REACT_APP_INRIX_HAAS_API_URL=$InrixHaasApiUrl"

gcloud run deploy $ServiceName `
  --image $ImageUrl `
  --region $Region `
  --allow-unauthenticated `
  --set-env-vars $EnvVarsString

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Cloud Run deployment failed." -ForegroundColor Red
    exit 1
}

Write-Host "Deployment completed successfully!" -ForegroundColor Green
