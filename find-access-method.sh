#!/bin/bash

echo "🔍 Vast.ai vLLM Access Finder"
echo "=============================="
echo ""

# Get instance info
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "Unknown")
echo "📍 Public IP: $PUBLIC_IP"
echo ""

# Check environment
echo "🔧 Configuration:"
echo "  VLLM_MODEL: $VLLM_MODEL"
echo "  VLLM_ARGS: $VLLM_ARGS"
echo ""

# Check port mappings
echo "🌐 Port Mappings (External -> Internal):"
env | grep VAST_TCP_PORT | while read line; do
    PORT_NAME=$(echo $line | cut -d= -f1 | sed 's/VAST_TCP_PORT_//')
    EXTERNAL_PORT=$(echo $line | cut -d= -f2)
    echo "  $PUBLIC_IP:$EXTERNAL_PORT -> localhost:$PORT_NAME"
done
echo ""

# Check what's actually running
echo "🚀 Running Services:"
ss -tlnp 2>/dev/null | grep -E "8000|18000|1111" | while read line; do
    PORT=$(echo $line | awk '{print $4}' | rev | cut -d: -f1 | rev)
    PROCESS=$(echo $line | grep -oP 'users:\(\("\K[^"]+')
    echo "  Port $PORT: $PROCESS"
done
echo ""

# Test local endpoints
echo "🧪 Testing Local Access:"
for PORT in 8000 18000 1111 11111; do
    printf "  localhost:$PORT - "
    if curl -s -m 2 http://localhost:$PORT/health > /dev/null 2>&1; then
        echo "✅ Health endpoint responding"
    elif curl -s -m 2 http://localhost:$PORT/v1/models > /dev/null 2>&1; then
        echo "✅ vLLM API responding"
        MODEL=$(curl -s http://localhost:$PORT/v1/models | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'] if d.get('data') else 'Unknown')" 2>/dev/null)
        echo "     Model: $MODEL"
    elif curl -s -m 2 http://localhost:$PORT > /dev/null 2>&1; then
        echo "⚠️  Something responding (not vLLM)"
    else
        echo "❌ No response"
    fi
done
echo ""

# Provide recommendations
echo "📋 Recommendations:"
echo ""

# Check if vLLM is on wrong port
if curl -s -m 2 http://localhost:8000/v1/models > /dev/null 2>&1; then
    echo "1. vLLM is running on port 8000 but Portal expects 18000"
    echo "   Fix: Restart vLLM on port 18000:"
    echo "   pkill -f vllm"
    echo "   vllm serve janhq/Jan-v1-4B --port 18000 --host 0.0.0.0"
    echo ""
fi

echo "2. Use SSH Port Forwarding (most reliable):"
echo "   From your local machine:"
echo "   ssh -L 8000:localhost:8000 -p [SSH_PORT] root@$PUBLIC_IP"
echo "   Then access: http://localhost:8000"
echo ""

echo "3. Try these external endpoints:"
env | grep VAST_TCP_PORT_8000 > /dev/null 2>&1 && {
    EXTERNAL_8000=$(env | grep VAST_TCP_PORT_8000 | cut -d= -f2)
    echo "   http://$PUBLIC_IP:$EXTERNAL_8000/v1/models"
}
env | grep VAST_TCP_PORT_1111 > /dev/null 2>&1 && {
    EXTERNAL_1111=$(env | grep VAST_TCP_PORT_1111 | cut -d= -f2)
    echo "   http://$PUBLIC_IP:$EXTERNAL_1111 (Instance Portal)"
}
echo ""

echo "4. Check vast.ai console for:"
echo "   - Click 'IP Port Info' button on your instance"
echo "   - Look for Cloudflare tunnel URLs"
echo "   - Check SSH connection details"