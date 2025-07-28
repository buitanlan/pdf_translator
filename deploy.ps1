# PDF Translator K3s Deployment Script (PowerShell)
param(
    [string]$ImageName = "pdf-translator",
    [string]$ImageTag = "latest",
    [string]$Namespace = "pdf-translator",
    [string]$IngressHost = "pdf-translator.local"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting PDF Translator deployment to K3s..." -ForegroundColor Cyan

function Write-Step {
    param([string]$Message)
    Write-Host "📋 $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

try {
    # Step 1: Build the Docker image
    Write-Step "Building Docker image..."
    docker build -t "${ImageName}:${ImageTag}" .
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Docker image built successfully"
    } else {
        throw "Failed to build Docker image"
    }

    # Step 2: Import image to K3s (if using local K3s)
    Write-Step "Importing image to K3s..."
    if (Get-Command k3s -ErrorAction SilentlyContinue) {
        docker save "${ImageName}:${ImageTag}" | k3s ctr images import -
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Image imported to K3s successfully"
        } else {
            Write-Warning "Failed to import image to K3s (continuing anyway)"
        }
    } else {
        Write-Warning "K3s not found, skipping image import"
    }

    # Step 3: Apply Kubernetes manifests
    Write-Step "Applying Kubernetes manifests..."
    kubectl apply -k k8s/
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Kubernetes manifests applied successfully"
    } else {
        throw "Failed to apply Kubernetes manifests"
    }

    # Step 4: Wait for deployment to be ready
    Write-Step "Waiting for deployment to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/pdf-translator -n $Namespace
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Deployment is ready!"
    } else {
        throw "Deployment failed to become ready"
    }

    # Step 5: Display deployment status
    Write-Step "Deployment Status:"
    Write-Host ""
    kubectl get pods -n $Namespace -l app=pdf-translator
    Write-Host ""
    kubectl get services -n $Namespace
    Write-Host ""
    kubectl get ingress -n $Namespace

    # Step 6: Display access information
    Write-Host ""
    Write-Success "🎉 Deployment completed successfully!"
    Write-Host ""
    Write-Step "Access Information:"
    Write-Host "  📱 Application URL: http://$IngressHost" -ForegroundColor White
    Write-Host "  🔍 Health Check: http://$IngressHost/health" -ForegroundColor White
    Write-Host ""
    Write-Step "Useful Commands:"
    Write-Host "  📊 Check pods: " -NoNewline -ForegroundColor White
    Write-Host "kubectl get pods -n $Namespace" -ForegroundColor Blue
    Write-Host "  📋 View logs: " -NoNewline -ForegroundColor White
    Write-Host "kubectl logs -f deployment/pdf-translator -n $Namespace" -ForegroundColor Blue
    Write-Host "  🔄 Restart: " -NoNewline -ForegroundColor White
    Write-Host "kubectl rollout restart deployment/pdf-translator -n $Namespace" -ForegroundColor Blue
    Write-Host "  🗑️  Delete: " -NoNewline -ForegroundColor White
    Write-Host "kubectl delete -k k8s/" -ForegroundColor Blue
    Write-Host ""

    # Step 7: Add host entry reminder
    Write-Warning "Don't forget to add this entry to your hosts file:"
    Write-Host "  C:\Windows\System32\drivers\etc\hosts" -ForegroundColor Yellow
    Write-Host "  <K3S_NODE_IP> $IngressHost" -ForegroundColor Yellow

    Write-Success "Deployment script completed! 🚀"
}
catch {
    Write-Error $_.Exception.Message
    exit 1
} 