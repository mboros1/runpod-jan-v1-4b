# Vast.ai vLLM Deployment - Findings and Solutions

## Executive Summary

We successfully deployed the jan-v1-4b model using vLLM on vast.ai, but encountered significant challenges with public API access due to vast.ai's port mapping architecture. The optimal solution is using Cloudflare Tunnels to connect to a Cloudflare Workers API gateway, bypassing all port forwarding complexities.

## Key Findings

### 1. Port Mapping Complexity

**Problem**: Vast.ai doesn't provide direct port forwarding. Instead:
- Internal ports are mapped to random external ports
- Example: Internal port 8000 → External port 40118
- These external ports are often blocked or inaccessible
- Environment variables track mappings: `VAST_TCP_PORT_8000=40118`

**Impact**: Direct public API access is unreliable or impossible without additional configuration.

### 2. Model Configuration Issues

**Problem**: The vast.ai template was configured for a different model:
- Default: `VLLM_MODEL=deepseek-ai/DeepSeek-R1-Distill-Llama-8B`
- Needed: `VLLM_MODEL=janhq/Jan-v1-4B`
- Port mismatch: Portal expects port 18000, vLLM runs on 8000

**Solution**: Override environment variables in the deployment configuration.

### 3. Authentication Layer

**Problem**: Caddy proxy adds Basic Auth to all endpoints, blocking direct API access.

## Solutions Discovered

### Solution 1: Cloudflare Tunnel (Recommended)

**Best for**: Production deployments with Cloudflare Workers as API gateway

```bash
# Quick tunnel for testing
cloudflared tunnel --url http://localhost:8000

# Persistent tunnel for production
cloudflared tunnel create vllm-vast
cloudflared tunnel route dns vllm-vast vllm-api.yourdomain.com
cloudflared tunnel run vllm-vast
```

**Advantages**:
- No public IP exposure needed
- Works behind any firewall/NAT
- Secure encrypted connection
- Integrates perfectly with Cloudflare Workers

### Solution 2: SSH Port Forwarding

**Best for**: Development and testing

```bash
# From local machine
ssh -L 8000:localhost:8000 -p SSH_PORT root@VAST_IP
# Access at http://localhost:8000
```

**Advantages**:
- Always works
- Simple and secure
- Good for development

### Solution 3: Fix Instance Configuration

**For new deployments**, use these environment variables:

```bash
VLLM_MODEL=janhq/Jan-v1-4B
MAX_MODEL_LEN=2048
DTYPE=auto
GPU_MEMORY_UTILIZATION=0.9
HOST=0.0.0.0
PORT=8000
VLLM_ARGS=--max-model-len 2048 --dtype auto --gpu-memory-utilization 0.9 --download-dir /workspace/models --host 0.0.0.0 --port 8000
```

## Architecture Recommendations

### Recommended Production Architecture

```
[vLLM on Vast.ai] 
    ↓ (Cloudflare Tunnel)
[Cloudflare Network]
    ↓
[Cloudflare Worker API Gateway]
    ↓
[Public API Consumers]
```

### Benefits:
1. **Security**: vLLM server never exposed publicly
2. **Scalability**: Cloudflare handles DDoS, caching, rate limiting
3. **Flexibility**: Easy to add authentication, logging, transformations
4. **Reliability**: No port forwarding issues
5. **Cost-effective**: Cloudflare Workers are cheap/free tier available

## Files Created

### Deployment & Configuration
- `Dockerfile.jan-v1-4b` - Optimized Docker image for jan-v1-4b
- `vast-template.json` - Vast.ai template configuration
- `vast-deploy-improved.js` - Enhanced deployment script with proper env vars

### Testing & Debugging
- `test-vllm-direct.js` - Test vLLM API endpoints
- `test-vast-public.js` - Test public access with port mappings
- `find-access-method.sh` - Diagnose connectivity issues
- `fix-current-instance.sh` - Quick fix for misconfigured instances

### Cloudflare Integration
- `setup-cloudflare-tunnel.sh` - Complete tunnel setup guide
- `start-tunnel-quick.sh` - Quick tunnel launcher
- `cloudflare-worker-example.js` - API gateway implementation

### Documentation
- `vast-access-guide.md` - Comprehensive access methods
- `VAST-AI-FINDINGS.md` - This document

## Lessons Learned

1. **Always use SSH forwarding** for development/testing on vast.ai
2. **Cloudflare Tunnels** are the best solution for production API access
3. **Don't rely on direct port access** - vast.ai's port mapping is complex
4. **Override environment variables** to ensure correct model loads
5. **Instance Portal** provides Cloudflare tunnels but requires correct port configuration
6. **Check disk space** - Models require significant storage (jan-v1-4b needs ~8GB)

## Quick Start Commands

```bash
# 1. Fix current instance to use jan-v1-4b
./fix-current-instance.sh

# 2. Test local access
curl http://localhost:8000/v1/models

# 3. Start Cloudflare tunnel for external access
./start-tunnel-quick.sh

# 4. Deploy new instance with correct config
node vast-deploy-improved.js deploy
```

## Performance Notes

- jan-v1-4b model requires ~8GB VRAM
- Recommended GPU memory utilization: 0.9
- Max model length: 2048 tokens
- The model loads in approximately 2-3 minutes
- Response time for simple queries: ~500-1000ms

## Troubleshooting Checklist

- [ ] Check disk space: `df -h`
- [ ] Verify GPU availability: `nvidia-smi`
- [ ] Check vLLM process: `ps aux | grep vllm`
- [ ] Test local access: `curl http://localhost:8000/v1/models`
- [ ] Check port mappings: `env | grep VAST_TCP_PORT`
- [ ] Review logs: `tail -f /var/log/vllm.log`
- [ ] Verify model: `echo $VLLM_MODEL`

## Next Steps

1. Set up persistent Cloudflare Tunnel with your domain
2. Deploy Cloudflare Worker for API gateway
3. Implement authentication and rate limiting in Worker
4. Monitor usage and costs
5. Consider using vast.ai instances with `static_ip=true` for better reliability

## Contact & Support

For issues specific to:
- **vLLM**: Check [vLLM documentation](https://docs.vllm.ai)
- **Vast.ai**: Consult [Vast.ai docs](https://docs.vast.ai)
- **Cloudflare**: See [Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps)
- **Jan-v1-4B Model**: Visit [Hugging Face model page](https://huggingface.co/janhq/Jan-v1-4B)