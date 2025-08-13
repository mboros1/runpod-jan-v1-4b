# vLLM Testing Commands for Vast.ai

## Quick Iteration Workflow

### 1. Rent a Dev VM
```bash
node vast-dev.js
```
This gets you a cheap GPU VM with SSH access for testing.

### 2. Connect via SSH
```bash
# Connection details will be shown after rental
ssh -p PORT root@HOST
```

### 3. Test Docker Commands

#### Basic vLLM Test
```bash
# Simple test - should work
docker run --rm \
  --gpus all \
  -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model facebook/opt-125m \
  --dtype auto
```

#### Test with Jan-v1-4B
```bash
# Full model test
docker run -d \
  --gpus all \
  --ipc=host \
  -p 8000:8000 \
  --name jan-test \
  vllm/vllm-openai:latest \
  --model janhq/Jan-v1-4B \
  --dtype bfloat16 \
  --max-model-len 2048 \
  --gpu-memory-utilization 0.9
```

#### Alternative: Environment Variables
```bash
# Using env vars instead of CLI args
docker run -d \
  --gpus all \
  --ipc=host \
  -p 8000:8000 \
  --name jan-env \
  -e MODEL=janhq/Jan-v1-4B \
  -e MAX_MODEL_LEN=2048 \
  -e DTYPE=auto \
  -e GPU_MEMORY_UTILIZATION=0.9 \
  vllm/vllm-openai:latest
```

### 4. Monitor and Debug

```bash
# Check logs
docker logs -f jan-test

# Check if model loaded
curl http://localhost:8000/v1/models

# Test inference
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "janhq/Jan-v1-4B",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 50
  }'

# Check GPU usage
nvidia-smi

# Check container status
docker ps -a

# Stop/remove container
docker stop jan-test && docker rm jan-test
```

### 5. Test Different Configurations

#### Smaller model for faster testing
```bash
docker run --rm --gpus all -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model TinyLlama/TinyLlama-1.1B-Chat-v1.0 \
  --dtype auto
```

#### With volume for model cache
```bash
mkdir -p /root/models
docker run -d --gpus all \
  -v /root/models:/root/.cache/huggingface \
  -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model janhq/Jan-v1-4B \
  --download-dir /root/.cache/huggingface
```

### 6. Working vLLM Command Pattern

Once you find what works, the pattern for Vast.ai is:
```javascript
{
  image: 'vllm/vllm-openai:latest',
  docker_opts: '--gpus all -p 8000:8000 --ipc=host',
  args: '--model janhq/Jan-v1-4B --dtype auto --max-model-len 2048'
  // OR use env vars
  env: {
    MODEL: 'janhq/Jan-v1-4B',
    DTYPE: 'auto',
    MAX_MODEL_LEN: '2048'
  }
}
```

### 7. Clean Up
```bash
# On the VM
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)

# From your local machine
node vast-dev.js destroy
```

## Common Issues & Solutions

### Out of Memory
- Reduce `--gpu-memory-utilization` to 0.8 or 0.7
- Reduce `--max-model-len` to 1024 or 512
- Try `--dtype float16` instead of `bfloat16`

### Model Download Fails
- Check disk space: `df -h`
- Check internet: `curl -I https://huggingface.co`
- Try with smaller model first

### Port Not Accessible
- Check firewall: `iptables -L`
- Check docker: `docker port jan-test`
- Try different port: `-p 8080:8000`

### Container Exits Immediately
- Check logs: `docker logs jan-test`
- Try without `-d` to see output directly
- Check GPU: `nvidia-smi`