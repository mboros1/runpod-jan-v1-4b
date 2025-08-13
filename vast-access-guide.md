# Accessing vLLM on Vast.ai - Complete Guide

## Current Instance Configuration

Based on the environment variables, your instance has:
- **vLLM Internal Port**: 8000 (where vLLM is actually running)
- **Portal Internal Port**: 18000 (configured in PORTAL_CONFIG)
- **External Port Mapping**: 40118 → 8000 (from VAST_TCP_PORT_8000)

## Problem: Why Direct Access Isn't Working

1. **Port Confusion**: The PORTAL_CONFIG shows `localhost:8000:18000` but vLLM is running on port 8000
2. **Firewall/NAT Issues**: External ports (40118) may not be directly accessible
3. **Authentication**: Caddy proxy is adding authentication layers

## Solution 1: SSH Port Forwarding (Most Reliable)

This is the most reliable way to access your vLLM API:

```bash
# From your local machine
ssh -L 8000:localhost:8000 -p YOUR_SSH_PORT root@YOUR_VAST_IP

# Now you can access vLLM at http://localhost:8000 on your local machine
```

To find your SSH details:
1. Go to vast.ai console
2. Click on your instance
3. Look for SSH connection string

## Solution 2: Fix the Portal Configuration

The Instance Portal should expose vLLM, but it's misconfigured. To fix:

```bash
# Kill existing vLLM
pkill -f vllm

# Restart on the port Portal expects (18000)
/venv/main/bin/vllm serve janhq/Jan-v1-4B \
  --host 0.0.0.0 \
  --port 18000 \
  --max-model-len 2048 \
  --dtype auto \
  --gpu-memory-utilization 0.9 \
  --download-dir /workspace/models
```

Then access via Portal's Cloudflare tunnel.

## Solution 3: Direct Template Configuration (For New Instances)

When creating a new instance, use this configuration:

### Docker Options
```
-p 8000:8000 --gpus all --ipc=host
```

### Environment Variables
```
VLLM_MODEL=janhq/Jan-v1-4B
PORT=8000
HOST=0.0.0.0
MAX_MODEL_LEN=2048
```

### On-start Script
```bash
#!/bin/bash
# Start vLLM directly
vllm serve $VLLM_MODEL \
  --host $HOST \
  --port $PORT \
  --max-model-len $MAX_MODEL_LEN
```

## How to Test Access

### 1. Test Local Access (Inside Instance)
```bash
curl http://localhost:8000/v1/models
```

### 2. Test External Access
```bash
# Find your external IP and port
# In vast.ai console, click IP Port Info button
# Look for: PUBLIC_IP:EXTERNAL_PORT -> 8000/tcp

curl http://PUBLIC_IP:EXTERNAL_PORT/v1/models
```

### 3. Test via Instance Portal
```bash
# Access the portal at:
http://PUBLIC_IP:40069  # Port 40069 maps to portal (1111)

# Or use the Cloudflare tunnel URL provided
```

## Recommended Approach for Production

1. **Use Static IP Instances**: Filter for `static_ip=true`
2. **Reserve Direct Ports**: Look for `direct_port_count > 1`
3. **Use Instance Portal**: Provides secure Cloudflare tunnels
4. **Consider a Reverse Proxy**: Use nginx/caddy for better control

## Quick Debug Commands

```bash
# Check what's listening
ss -tlnp | grep 8000

# Check vLLM logs
ps aux | grep vllm

# Check environment
env | grep -E "VLLM|PORT|VAST"

# Test local API
curl -s http://0.0.0.0:8000/v1/models | jq

# Check external port mappings
env | grep VAST_TCP_PORT
```

## API Testing Script

Save this as `test-vast-api.py`:

```python
import requests
import sys

# Configuration - update these
INTERNAL_TEST = "http://localhost:8000"
EXTERNAL_TEST = "http://50.173.192.54:40118"  # Update with your IP:PORT

def test_endpoint(url):
    try:
        response = requests.get(f"{url}/v1/models", timeout=5)
        if response.status_code == 200:
            print(f"✓ {url} - Success")
            print(f"  Models: {response.json()}")
        else:
            print(f"✗ {url} - HTTP {response.status_code}")
    except Exception as e:
        print(f"✗ {url} - {e}")

print("Testing vLLM Access...")
test_endpoint(INTERNAL_TEST)
test_endpoint(EXTERNAL_TEST)
```

## Summary

The issue is that vast.ai uses complex port mapping and the Instance Portal is misconfigured for vLLM on port 8000. The most reliable solution is SSH port forwarding, or reconfiguring vLLM to run on port 18000 to match the Portal's expectations.