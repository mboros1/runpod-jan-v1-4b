#!/bin/bash

# Test vLLM container locally with Jan-v1-4B

MODEL_NAME="janhq/Jan-v1-4B"
PORT=8000

echo "🐳 Testing vLLM container locally with $MODEL_NAME"
echo ""
echo "⚠️  Requirements:"
echo "  - Docker installed and running"
echo "  - NVIDIA GPU with Docker GPU support (nvidia-docker)"
echo "  - ~10GB free disk space for model"
echo ""
echo "Starting container on port $PORT..."
echo ""

# Run the vLLM container
docker run --rm \
  --gpus all \
  --ipc=host \
  -p $PORT:8000 \
  -e MODEL="$MODEL_NAME" \
  -e PORT=8000 \
  -e HOST=0.0.0.0 \
  -e MAX_MODEL_LEN=2048 \
  -e DTYPE=auto \
  -e GPU_MEMORY_UTILIZATION=0.9 \
  vllm/vllm-openai:latest

# Note: Use Ctrl+C to stop the container