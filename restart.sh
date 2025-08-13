#!/bin/bash

echo "🔄 Restarting RunPod endpoint..."

# Scale down to 0 to force stop
echo "Scaling down to 0 workers..."
node src/cli.js scale pyoszyar8clv6z --min-workers 0 --max-workers 0

# Wait a moment
echo "Waiting 5 seconds..."
sleep 5

# Scale back up
echo "Scaling back up to 1 worker..."
node src/cli.js scale pyoszyar8clv6z --min-workers 0 --max-workers 1

echo "✅ Restart complete. Check status with: npm run list"