# PDF Translator - K3s/Rancher Deployment

This directory contains Kubernetes manifests for deploying the PDF Translator application to K3s/Rancher.

## 📋 Prerequisites

- K3s or Rancher cluster running
- `kubectl` configured to access your cluster
- Docker installed (for building the image)
- `kustomize` (usually included with kubectl)

## 🚀 Quick Deployment

### Option 1: Using the Deployment Script (Recommended)

**Linux/macOS:**

```bash
./deploy.sh
```

**Windows PowerShell:**

```powershell
.\deploy.ps1
```

### Option 2: Manual Deployment

1. **Build the Docker image:**
   ```bash
   docker build -t pdf-translator:latest .
   ```

2. **Import image to K3s (if using local K3s):**
   ```bash
   docker save pdf-translator:latest | sudo k3s ctr images import -
   ```

3. **Deploy to Kubernetes:**
   ```bash
   kubectl apply -k k8s/
   ```

4. **Wait for deployment:**
   ```bash
   kubectl wait --for=condition=available --timeout=300s deployment/pdf-translator -n pdf-translator
   ```

## 📁 Manifest Files

| File                 | Description                                               |
|----------------------|-----------------------------------------------------------|
| `namespace.yaml`     | Creates the `pdf-translator` namespace                    |
| `configmap.yaml`     | Nginx configuration with proper MIME types for .mjs files |
| `deployment.yaml`    | Main application deployment with 2 replicas               |
| `service.yaml`       | ClusterIP service to expose the application internally    |
| `ingress.yaml`       | Ingress resource for external access                      |
| `kustomization.yaml` | Kustomize configuration to manage all resources           |

## 🔧 Configuration

### Ingress Configuration

By default, the application will be accessible at `http://pdf-translator.local`. To change this:

1. Edit `k8s/ingress.yaml` and change the `host` field
2. Update your `/etc/hosts` file (or `C:\Windows\System32\drivers\etc\hosts` on Windows):
   ```
   <K3S_NODE_IP> pdf-translator.local
   ```

### SSL/TLS Configuration

To enable HTTPS with Let's Encrypt:

1. Uncomment the TLS section in `ingress.yaml`
2. Install cert-manager in your cluster
3. Update the `cert-manager.io/cluster-issuer` annotation

### Resource Limits

The deployment includes resource requests and limits:

- **Requests**: 100m CPU, 128Mi memory
- **Limits**: 200m CPU, 256Mi memory

Adjust these in `deployment.yaml` based on your needs.

## 📊 Monitoring and Management

### Check Deployment Status

```bash
kubectl get pods -n pdf-translator
kubectl get services -n pdf-translator
kubectl get ingress -n pdf-translator
```

### View Application Logs

```bash
kubectl logs -f deployment/pdf-translator -n pdf-translator
```

### Scale the Application

```bash
kubectl scale deployment pdf-translator --replicas=3 -n pdf-translator
```

### Restart the Application

```bash
kubectl rollout restart deployment/pdf-translator -n pdf-translator
```

### Health Checks

The application includes health checks at `/health` endpoint:

- **Liveness Probe**: Checks if the container is running
- **Readiness Probe**: Checks if the container is ready to serve traffic

## 🔍 Troubleshooting

### Common Issues

1. **Image Pull Errors**
    - Ensure the Docker image is built and available
    - For local K3s, make sure to import the image using `k3s ctr images import`

2. **Ingress Not Working**
    - Check if Traefik is running: `kubectl get pods -n kube-system | grep traefik`
    - Verify your hosts file entry

3. **Pod Not Starting**
    - Check pod logs: `kubectl logs <pod-name> -n pdf-translator`
    - Check events: `kubectl describe pod <pod-name> -n pdf-translator`

4. **MIME Type Issues**
    - The ConfigMap includes the fixed nginx configuration
    - Restart the deployment if you see MIME type errors

### Debug Commands

```bash
# Get detailed pod information
kubectl describe pod <pod-name> -n pdf-translator

# Check configmap
kubectl get configmap pdf-translator-nginx-config -n pdf-translator -o yaml

# Test internal connectivity
kubectl run debug --image=busybox -it --rm --restart=Never -n pdf-translator -- sh
```

## 🗑️ Cleanup

To remove the entire deployment:

```bash
kubectl delete -k k8s/
```

Or delete the namespace (removes everything):

```bash
kubectl delete namespace pdf-translator
```

## 🔄 Updates

To update the application:

1. Build a new Docker image with a new tag:
   ```bash
   docker build -t pdf-translator:v1.1.0 .
   ```

2. Update the image in `kustomization.yaml`:
   ```yaml
   images:
     - name: pdf-translator
       newTag: v1.1.0
   ```

3. Apply the changes:
   ```bash
   kubectl apply -k k8s/
   ```

## 🌐 Production Considerations

For production deployments, consider:

- **Resource Limits**: Adjust CPU/memory based on load testing
- **Horizontal Pod Autoscaler**: Auto-scale based on CPU/memory usage
- **Persistent Volumes**: If you need to store uploaded files
- **Network Policies**: Restrict network access between pods
- **Security Context**: Run containers as non-root user
- **Image Security**: Scan images for vulnerabilities
- **Backup Strategy**: Regular backups of any persistent data
- **Monitoring**: Set up Prometheus/Grafana for monitoring
- **Logging**: Centralized logging with ELK stack or similar

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review Kubernetes events: `kubectl get events -n pdf-translator`
3. Check cluster resources: `kubectl top nodes` and `kubectl top pods -n pdf-translator` 
