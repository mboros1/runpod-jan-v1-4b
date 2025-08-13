#!/bin/bash

# Script to fix the current Vast.ai instance to serve Jan-v1-4B

echo "🔧 Fixing current Vast.ai instance for Jan-v1-4B..."
echo "============================================"

# 1. Kill existing vLLM processes
echo "Stopping existing vLLM processes..."
pkill -f "vllm serve" || true
pkill -f "vllm.entrypoints" || true
sleep 3

# 2. Set correct environment variables
echo "Setting environment variables..."
export VLLM_MODEL="janhq/Jan-v1-4B"
export MAX_MODEL_LEN="2048"
export DTYPE="auto"
export GPU_MEMORY_UTILIZATION="0.9"
export HOST="0.0.0.0"
export PORT="8000"
export DOWNLOAD_DIR="/workspace/models"
export HF_HOME="/workspace/models"
export VLLM_ARGS="--max-model-len 2048 --dtype auto --gpu-memory-utilization 0.9 --download-dir /workspace/models --host 0.0.0.0 --port 8000"

# 3. Create models directory
mkdir -p /workspace/models

# 4. Check GPU
echo "Checking GPU availability..."
nvidia-smi

# 5. Start vLLM with Jan-v1-4B
echo "Starting vLLM with Jan-v1-4B model..."

if [ -f /venv/main/bin/vllm ]; then
    echo "Using venv vLLM..."
    /venv/main/bin/vllm serve janhq/Jan-v1-4B \
        --max-model-len 2048 \
        --dtype auto \
        --gpu-memory-utilization 0.9 \
        --download-dir /workspace/models \
        --host 0.0.0.0 \
        --port 8000 \
        --tensor-parallel-size 1 \
        --served-model-name jan-v1-4b \
        2>&1 | tee /var/log/vllm-jan.log &
else
    echo "Using Python module..."
    python -m vllm.entrypoints.openai.api_server \
        --model janhq/Jan-v1-4B \
        --max-model-len 2048 \
        --dtype auto \
        --gpu-memory-utilization 0.9 \
        --download-dir /workspace/models \
        --host 0.0.0.0 \
        --port 8000 \
        --tensor-parallel-size 1 \
        --served-model-name jan-v1-4b \
        2>&1 | tee /var/log/vllm-jan.log &
fi

echo "✅ vLLM started in background"
echo ""
echo "Monitor progress with:"
echo "  tail -f /var/log/vllm-jan.log"
echo ""
echo "Test when ready:"
echo "  curl http://localhost:8000/v1/models"
echo "  curl http://localhost:8000/v1/chat/completions \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"model\": \"jan-v1-4b\", \"messages\": [{\"role\": \"user\", \"content\": \"Hello!\"}], \"max_tokens\": 50}'"