#!/bin/bash

# Sync local files to Vast.ai dev VM

if [ ! -f ".vast-dev" ]; then
  echo "❌ No dev VM found. Run 'node vast-dev.js' first."
  exit 1
fi

# Parse connection info from .vast-dev
HOST=$(grep '"host"' .vast-dev | cut -d'"' -f4)
PORT=$(grep '"port"' .vast-dev | cut -d':' -f2 | tr -d ' ,' | tr -d '"')

echo "📤 Syncing files to Vast.ai dev VM..."
echo "   Host: $HOST"
echo "   Port: $PORT"
echo ""

# Files to sync
FILES=(
  "package.json"
  "package-lock.json"
  "vast-auto.js"
  "vast-dev.js"
  "vast-deploy.js"
  "vast-chat.js"
  "vllm-test-commands.md"
  ".env"
  "runpod.config.json"
  "src/"
)

# Create remote directory
ssh -p $PORT root@$HOST "mkdir -p /root/runpod-jan-v1-4b"

# Sync each file/directory
for file in "${FILES[@]}"; do
  if [ -e "$file" ]; then
    echo "   Copying $file..."
    scp -P $PORT -r "$file" root@$HOST:/root/runpod-jan-v1-4b/
  fi
done

echo ""
echo "✅ Files synced!"
echo ""
echo "📝 Next steps:"
echo "   1. SSH into VM: ssh -p $PORT root@$HOST"
echo "   2. Navigate: cd /root/runpod-jan-v1-4b"
echo "   3. Run Claude Code: claude-code"
echo ""
echo "🔄 To sync again, just run: ./sync-to-vast.sh"