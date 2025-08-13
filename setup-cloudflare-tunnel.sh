#!/bin/bash

echo "🚀 Cloudflare Tunnel Setup for vLLM on Vast.ai"
echo "=============================================="
echo ""
echo "This script will set up a Cloudflare Tunnel to connect your vLLM"
echo "instance to Cloudflare Workers (or any Cloudflare service)."
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "📦 Installing cloudflared..."
    
    # Download and install cloudflared
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    dpkg -i cloudflared-linux-amd64.deb
    rm cloudflared-linux-amd64.deb
    
    echo "✅ cloudflared installed"
else
    echo "✅ cloudflared already installed"
fi

echo ""
echo "📋 Setup Instructions:"
echo "====================="
echo ""
echo "1. First, login to Cloudflare (run this command):"
echo "   cloudflared tunnel login"
echo ""
echo "2. Create a tunnel (replace 'vllm-vast' with your preferred name):"
echo "   cloudflared tunnel create vllm-vast"
echo ""
echo "3. Create a config file at ~/.cloudflared/config.yml:"
cat << 'EOF'

# Example ~/.cloudflared/config.yml
tunnel: YOUR_TUNNEL_ID
credentials-file: /root/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  # Route for vLLM API
  - hostname: vllm-api.yourdomain.com
    service: http://localhost:8000
  # Catch-all rule
  - service: http_status:404
EOF

echo ""
echo "4. Route the tunnel to your domain:"
echo "   cloudflared tunnel route dns vllm-vast vllm-api.yourdomain.com"
echo ""
echo "5. Run the tunnel:"
echo "   cloudflared tunnel run vllm-vast"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔧 Alternative: Quick Tunnel (No Configuration Needed)"
echo "======================================================"
echo ""
echo "For testing, you can use a quick tunnel without any setup:"
echo ""
echo "   cloudflared tunnel --url http://localhost:8000"
echo ""
echo "This will give you a random URL like:"
echo "   https://random-words.trycloudflare.com"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 Systemd Service (Run Tunnel Permanently)"
echo "==========================================="
echo ""
echo "Create /etc/systemd/system/cloudflared.service:"
cat << 'EOF'

[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/cloudflared tunnel run vllm-vast
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo "Then enable and start:"
echo "   systemctl enable cloudflared"
echo "   systemctl start cloudflared"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"