#!/bin/bash

# PDF Translator K3s Deployment Script
set -e

echo "🚀 Starting PDF Translator deployment to K3s..."

# Configuration
IMAGE_NAME="pdf-translator"
IMAGE_TAG="latest"
NAMESPACE="pdf-translator"
INGRESS_HOST="pdf-translator.local"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Step 1: Build the Docker image
print_step "Building Docker image..."
if docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .; then
    print_success "Docker image built successfully"
else
    print_error "Failed to build Docker image"
    exit 1
fi

# Step 2: Import image to K3s (if using local K3s)
print_step "Importing image to K3s..."
if command -v k3s &> /dev/null; then
    if docker save ${IMAGE_NAME}:${IMAGE_TAG} | sudo k3s ctr images import -; then
        print_success "Image imported to K3s successfully"
    else
        print_warning "Failed to import image to K3s (continuing anyway)"
    fi
else
    print_warning "K3s not found, skipping image import"
fi

# Step 3: Apply Kubernetes manifests
print_step "Applying Kubernetes manifests..."
if kubectl apply -k k8s/; then
    print_success "Kubernetes manifests applied successfully"
else
    print_error "Failed to apply Kubernetes manifests"
    exit 1
fi

# Step 4: Wait for deployment to be ready
print_step "Waiting for deployment to be ready..."
if kubectl wait --for=condition=available --timeout=300s deployment/pdf-translator -n ${NAMESPACE}; then
    print_success "Deployment is ready!"
else
    print_error "Deployment failed to become ready"
    exit 1
fi

# Step 5: Display deployment status
print_step "Deployment Status:"
echo ""
kubectl get pods -n ${NAMESPACE} -l app=pdf-translator
echo ""
kubectl get services -n ${NAMESPACE}
echo ""
kubectl get ingress -n ${NAMESPACE}

# Step 6: Display access information
echo ""
print_success "🎉 Deployment completed successfully!"
echo ""
print_step "Access Information:"
echo -e "  📱 Application URL: http://${INGRESS_HOST}"
echo -e "  🔍 Health Check: http://${INGRESS_HOST}/health"
echo ""
print_step "Useful Commands:"
echo -e "  📊 Check pods: ${BLUE}kubectl get pods -n ${NAMESPACE}${NC}"
echo -e "  📋 View logs: ${BLUE}kubectl logs -f deployment/pdf-translator -n ${NAMESPACE}${NC}"
echo -e "  🔄 Restart: ${BLUE}kubectl rollout restart deployment/pdf-translator -n ${NAMESPACE}${NC}"
echo -e "  🗑️  Delete: ${BLUE}kubectl delete -k k8s/${NC}"
echo ""

# Step 7: Add host entry reminder
print_warning "Don't forget to add this entry to your /etc/hosts file:"
echo -e "  ${YELLOW}<K3S_NODE_IP> ${INGRESS_HOST}${NC}"

print_success "Deployment script completed! 🚀" 