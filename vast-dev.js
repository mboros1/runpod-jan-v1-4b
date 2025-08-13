#!/usr/bin/env node

// Development VM for testing vLLM deployments on Vast.ai

import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { spawn } from 'child_process';

dotenv.config();

class VastDev {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://console.vast.ai/api/v0';
    this.headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
  }

  async findCheapestGPU() {
    const query = {
      verified: { eq: true },
      external: { eq: false },
      rentable: { eq: true },
      gpu_ram: { gte: 10000 },  // 10GB minimum
      dph_total: { lte: 1.0 },   // Max $1/hr for dev
      cuda_vers: { gte: 11.0 },  // Lower requirement for older GPUs
      inet_up: { gte: 50 },
      direct_port_count: { gte: 1 }, // At least 1 port
      reliability2: { gte: 0.80 },  // Lower threshold
      geolocation: { eq: 'US' }
    };

    try {
      const response = await axios.get(`${this.baseUrl}/bundles`, {
        headers: this.headers,
        params: {
          q: JSON.stringify(query),
          order_by: 'dph_total',
          // NO LIMIT - get all results and sort them ourselves
          limit: 1000  // High number to get all results
        }
      });
      
      return response.data.offers || [];
    } catch (error) {
      throw new Error(`Failed to search: ${error.message}`);
    }
  }

  async rentDevVM(offerId) {
    // Rent with Ubuntu base image for maximum flexibility
    const payload = {
      client_id: 'me',
      image: 'nvidia/cuda:12.1.0-base-ubuntu22.04',  // CUDA-ready Ubuntu
      disk: 40,
      runtype: 'ssh',  // SSH access for development
      env: {},
      onstart: `#!/bin/bash
# Basic setup for development
apt-get update
apt-get install -y docker.io docker-compose curl wget git vim nodejs npm
usermod -aG docker root
systemctl start docker

# Install Docker GPU support
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | tee /etc/apt/sources.list.d/nvidia-docker.list
apt-get update && apt-get install -y nvidia-docker2
systemctl restart docker

# Clone the repository
cd /root
git clone https://github.com/martinboros/runpod-jan-v1-4b.git || echo "Repo doesn't exist on GitHub yet"

# If repo doesn't exist, create project structure
if [ ! -d "/root/runpod-jan-v1-4b" ]; then
  mkdir -p /root/runpod-jan-v1-4b
  cd /root/runpod-jan-v1-4b
  
  # Copy essential files if they exist
  echo "Project directory created at /root/runpod-jan-v1-4b"
  echo "Upload your files with: scp -P PORT -r ./* root@HOST:/root/runpod-jan-v1-4b/"
fi

cd /root/runpod-jan-v1-4b

# Install Node.js dependencies if package.json exists
if [ -f "package.json" ]; then
  npm install
fi

# Install Claude Code CLI
npm install -g claude-code

# Create .env file template
cat > /root/runpod-jan-v1-4b/.env << 'EOF'
# Add your API keys here
VAST_API_KEY=${process.env.VAST_API_KEY || ''}
MODEL_NAME=janhq/Jan-v1-4B
EOF

echo "Dev environment ready!"
echo "- Docker and nvidia-docker installed"
echo "- Repository ready at /root/runpod-jan-v1-4b"
echo "- Claude Code installed (run: claude-code)"
`
    };

    try {
      const response = await axios.put(
        `${this.baseUrl}/asks/${offerId}/`,
        payload,
        { headers: this.headers }
      );
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to rent VM: ${error.message}`);
    }
  }

  async getInstanceInfo(instanceId) {
    try {
      const response = await axios.get(`${this.baseUrl}/instances`, {
        headers: this.headers,
        params: { owner: 'me' }
      });
      
      const instances = response.data.instances || [];
      return instances.find(i => i.id === instanceId);
    } catch (error) {
      throw new Error(`Failed to get instance: ${error.message}`);
    }
  }

  async waitForSSH(instanceId, maxWait = 180000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      const instance = await this.getInstanceInfo(instanceId);
      
      if (instance?.actual_status === 'running' && instance?.ssh_host && instance?.ssh_port) {
        return instance;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error('Timeout waiting for SSH');
  }

  async destroyInstance(instanceId) {
    try {
      await axios.delete(`${this.baseUrl}/instances/${instanceId}/`, {
        headers: this.headers
      });
      return true;
    } catch (error) {
      console.error(chalk.yellow(`Warning: ${error.message}`));
      return false;
    }
  }
}

async function main() {
  console.log(chalk.bold.cyan('\n🔧 Vast.ai Development VM\n'));
  
  if (!process.env.VAST_API_KEY) {
    console.error(chalk.red('❌ VAST_API_KEY not found in .env'));
    process.exit(1);
  }

  const vast = new VastDev(process.env.VAST_API_KEY);
  const spinner = ora();
  let instanceId = null;

  try {
    // Find cheapest GPU
    spinner.start('Finding cheapest development GPU...');
    const offers = await vast.findCheapestGPU();
    
    if (offers.length === 0) {
      spinner.fail('No GPUs available under $1/hr');
      process.exit(1);
    }
    
    const selected = offers[0];
    spinner.succeed(`Found: ${selected.gpu_name} at $${selected.dph_total.toFixed(3)}/hr`);

    // Rent it
    spinner.start('Renting development VM...');
    const result = await vast.rentDevVM(selected.id);
    instanceId = result.new_contract;
    spinner.succeed(`VM rented! ID: ${instanceId}`);

    // Wait for SSH
    spinner.start('Waiting for SSH access...');
    const instance = await vast.waitForSSH(instanceId);
    spinner.succeed('SSH is ready!');

    // Save connection info
    const sshInfo = {
      host: instance.ssh_host,
      port: instance.ssh_port,
      user: 'root',
      instanceId: instanceId,
      ip: instance.public_ipaddr,
      gpu: selected.gpu_name,
      price: selected.dph_total
    };

    await fs.writeFile('.vast-dev', JSON.stringify(sshInfo, null, 2));

    // Display connection info
    console.log(chalk.green('\n✅ Development VM Ready!\n'));
    console.log(chalk.cyan('📋 Connection Details:'));
    console.log(`  SSH: ${chalk.yellow(`ssh -p ${sshInfo.port} root@${sshInfo.host}`)}`);
    console.log(`  IP: ${sshInfo.ip}`);
    console.log(`  GPU: ${sshInfo.gpu}`);
    console.log(`  Cost: $${sshInfo.price}/hour`);

    // Create test script
    const testScript = `#!/bin/bash
# Test vLLM deployment on Vast.ai dev VM

echo "Testing vLLM with Jan-v1-4B..."

# Pull and run vLLM
docker run -d \\
  --gpus all \\
  --ipc=host \\
  -p 8000:8000 \\
  --name vllm-test \\
  -e MODEL="janhq/Jan-v1-4B" \\
  -e PORT=8000 \\
  -e HOST=0.0.0.0 \\
  -e MAX_MODEL_LEN=2048 \\
  -e DTYPE=auto \\
  -e GPU_MEMORY_UTILIZATION=0.9 \\
  vllm/vllm-openai:latest

echo "Container started. Checking logs..."
docker logs -f vllm-test
`;

    await fs.writeFile('test-vllm.sh', testScript);
    await fs.chmod('test-vllm.sh', 0o755);

    console.log(chalk.cyan('\n📝 Quick Start Commands:'));
    console.log(chalk.gray('\n1. Connect to VM:'));
    console.log(`   ssh -p ${sshInfo.port} root@${sshInfo.host}`);
    
    console.log(chalk.gray('\n2. Copy and run test script:'));
    console.log(`   scp -P ${sshInfo.port} test-vllm.sh root@${sshInfo.host}:/root/`);
    console.log(`   ssh -p ${sshInfo.port} root@${sshInfo.host} "/root/test-vllm.sh"`);
    
    console.log(chalk.gray('\n3. Test the API:'));
    console.log(`   curl http://${sshInfo.ip}:8000/v1/models`);

    console.log(chalk.gray('\n4. Monitor container:'));
    console.log(`   ssh -p ${sshInfo.port} root@${sshInfo.host} "docker logs -f vllm-test"`);

    console.log(chalk.yellow('\n⚠️  IMPORTANT: Run "node vast-dev.js destroy" when done to stop charges!\n'));

  } catch (error) {
    spinner.fail(error.message);
    if (instanceId) {
      console.log(chalk.yellow('Cleaning up...'));
      await vast.destroyInstance(instanceId);
    }
    process.exit(1);
  }
}

// Destroy command
if (process.argv[2] === 'destroy') {
  (async () => {
    try {
      const data = await fs.readFile('.vast-dev', 'utf8');
      const info = JSON.parse(data);
      
      const vast = new VastDev(process.env.VAST_API_KEY);
      const spinner = ora('Destroying development VM...').start();
      
      await vast.destroyInstance(info.instanceId);
      await fs.unlink('.vast-dev');
      
      spinner.succeed('VM destroyed! No more charges.');
    } catch (error) {
      console.error(chalk.red('Failed to destroy:', error.message));
    }
  })();
} else {
  main().catch(console.error);
}