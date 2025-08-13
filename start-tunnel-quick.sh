#!/bin/bash

echo "🚀 Starting Quick Cloudflare Tunnel for vLLM"
echo "==========================================="
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "📦 Installing cloudflared..."
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    sudo dpkg -i cloudflared-linux-amd64.deb 2>/dev/null || dpkg -i cloudflared-linux-amd64.deb
    rm cloudflared-linux-amd64.deb
    echo "✅ Installed cloudflared"
fi

# Check if vLLM is running
echo "🔍 Checking vLLM status..."
if curl -s http://localhost:8000/v1/models > /dev/null 2>&1; then
    echo "✅ vLLM is running on port 8000"
    VLLM_PORT=8000
elif curl -s http://localhost:18000/v1/models > /dev/null 2>&1; then
    echo "✅ vLLM is running on port 18000"
    VLLM_PORT=18000
else
    echo "⚠️  vLLM not detected. Make sure it's running!"
    VLLM_PORT=8000
fi

echo ""
echo "🌐 Starting Cloudflare Tunnel..."
echo "================================"
echo ""
echo "This will create a public URL that tunnels to your vLLM API."
echo "The URL can be used in your Cloudflare Worker."
echo ""
echo "Press Ctrl+C to stop the tunnel"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Start the tunnel
cloudflared tunnel --url http://localhost:$VLLM_PORT