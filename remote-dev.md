# Remote Development on Vast.ai with Claude Code

## Quick Start

### 1. Rent a Development VM
```bash
node vast-dev.js
```
This will:
- Find cheapest GPU under $1/hr
- Install Docker, nvidia-docker, Node.js, npm
- Install Claude Code CLI globally
- Clone your repository (or create project structure)
- Set up the development environment

### 2. Sync Your Local Files
```bash
./sync-to-vast.sh
```
This copies your project files to the VM.

### 3. Connect and Use Claude Code
```bash
# SSH into the VM (connection details shown after rental)
ssh -p PORT root@HOST

# Navigate to project
cd /root/runpod-jan-v1-4b

# Set up your Anthropic API key
export ANTHROPIC_API_KEY="your-key-here"

# Run Claude Code
claude-code

# Or run specific commands
claude-code "test the vLLM deployment"
claude-code "debug why the container isn't starting"
```

## Working with Claude Code on the VM

### Testing vLLM Deployment
```bash
# Claude Code can run these directly on the VM
claude-code "run the vLLM docker container with Jan-v1-4B model and test it"
```

### Debugging
```bash
# Check logs
claude-code "check docker logs and tell me why vLLM isn't starting"

# Fix issues
claude-code "fix the docker command to properly run vLLM"
```

### Iteration Workflow
1. Make changes locally
2. Run `./sync-to-vast.sh` to upload
3. SSH in and test with Claude Code
4. Claude Code can edit files directly on the VM
5. Copy working solutions back locally

## Example Claude Code Commands

```bash
# Test the current deployment script
claude-code "run vast-auto.js and debug any issues"

# Check GPU and Docker status
claude-code "check if Docker and nvidia-docker are working properly"

# Test vLLM container
claude-code "start vLLM container with Jan-v1-4B and verify it's serving on port 8000"

# Fix configuration
claude-code "update the vast-auto.js createInstance method to use the working Docker configuration"
```

## Copying Files Back

After Claude Code fixes something on the VM:
```bash
# From your local machine
scp -P PORT root@HOST:/root/runpod-jan-v1-4b/vast-auto.js ./
```

## Clean Up

```bash
# When done, destroy the VM
node vast-dev.js destroy
```

## Tips

1. **Keep VM Running**: While iterating, keep the VM running. It's only ~$0.20-0.40/hr
2. **Use Claude Code for Testing**: Let Claude Code run the actual tests on the GPU
3. **Save Working Configs**: Once something works, immediately copy it back locally
4. **Check Logs**: Claude Code can read and interpret Docker/system logs
5. **Iterative Development**: Make small changes and test frequently

## Cost Management

- Dev VMs are typically $0.15-0.40/hr
- A 2-hour session costs ~$0.30-0.80
- Always run `node vast-dev.js destroy` when done
- Check remaining balance: `node vast-dev.js balance` (if implemented)