#!/usr/bin/env node

// Improved Vast.ai deployment script for Jan-v1-4B with better error handling

import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

class VastAIDeployer {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://console.vast.ai/api/v0';
    this.headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
  }

  async searchOffers(filters = {}) {
    const defaultFilters = {
      gpu_ram: '>=10',  // Jan-v1-4B needs ~8GB but 10GB is safer
      rentable: true,
      verified: true,
      cuda_vers: '>=12.0',
      inet_up: '>=100',  // Good upload for model download
      direct_port_count: '>=1',
      reliability: '>=0.95',  // High reliability
      sort_order: 'dphtotal',
      limit: 10
    };

    const params = { ...defaultFilters, ...filters };
    
    try {
      const response = await axios.get(`${this.baseUrl}/bundles`, {
        headers: this.headers,
        params
      });
      
      return response.data.offers || [];
    } catch (error) {
      throw new Error(`Failed to search offers: ${error.message}`);
    }
  }

  async createInstance(offerId, config = {}) {
    // Improved configuration with proper environment setup
    const deployConfig = {
      client_id: 'me',
      image: 'vllm/vllm-openai:latest',
      disk: 60,  // 60GB for model + cache
      
      // Environment variables - these are critical
      env: {
        // vLLM specific
        VLLM_MODEL: 'janhq/Jan-v1-4B',
        MAX_MODEL_LEN: '2048',
        DTYPE: 'auto',
        GPU_MEMORY_UTILIZATION: '0.9',
        HOST: '0.0.0.0',
        PORT: '8000',
        DOWNLOAD_DIR: '/workspace/models',
        HF_HOME: '/workspace/models',
        
        // Override any default model settings
        MODEL: 'janhq/Jan-v1-4B',
        USE_ALL_GPUS: 'false',
        
        // Complete VLLM_ARGS to override defaults
        VLLM_ARGS: '--max-model-len 2048 --dtype auto --gpu-memory-utilization 0.9 --download-dir /workspace/models --host 0.0.0.0 --port 8000 --tensor-parallel-size 1',
        
        // Optional: Hugging Face token if needed
        HF_TOKEN: process.env.HF_TOKEN || '',
        
        ...config.env
      },
      
      // Startup script that ensures Jan-v1-4B loads
      onstart: `#!/bin/bash
set -e

echo "🚀 Jan-v1-4B vLLM Deployment Starting..."
echo "============================================"

# Kill any existing vLLM processes
echo "Cleaning up existing processes..."
pkill -f 'vllm' || true
pkill -f 'ray' || true
sleep 3

# Create necessary directories
mkdir -p /workspace/models
mkdir -p /var/log

# Export environment variables explicitly
export VLLM_MODEL="janhq/Jan-v1-4B"
export MAX_MODEL_LEN="2048"
export DTYPE="auto"
export GPU_MEMORY_UTILIZATION="0.9"
export HOST="0.0.0.0"
export PORT="8000"
export DOWNLOAD_DIR="/workspace/models"
export HF_HOME="/workspace/models"

# Check GPU availability
echo "Checking GPU..."
nvidia-smi || { echo "ERROR: No GPU detected!"; exit 1; }

# Start vLLM based on available command
echo "Starting vLLM server with Jan-v1-4B..."

if [ -f /venv/main/bin/vllm ]; then
    echo "Using venv vLLM installation..."
    /venv/main/bin/vllm serve janhq/Jan-v1-4B \\
        --max-model-len 2048 \\
        --dtype auto \\
        --gpu-memory-utilization 0.9 \\
        --download-dir /workspace/models \\
        --host 0.0.0.0 \\
        --port 8000 \\
        --tensor-parallel-size 1 \\
        --served-model-name jan-v1-4b \\
        2>&1 | tee /var/log/vllm.log &
elif command -v vllm &> /dev/null; then
    echo "Using system vLLM installation..."
    vllm serve janhq/Jan-v1-4B \\
        --max-model-len 2048 \\
        --dtype auto \\
        --gpu-memory-utilization 0.9 \\
        --download-dir /workspace/models \\
        --host 0.0.0.0 \\
        --port 8000 \\
        --tensor-parallel-size 1 \\
        --served-model-name jan-v1-4b \\
        2>&1 | tee /var/log/vllm.log &
else
    echo "Using Python module fallback..."
    python -m vllm.entrypoints.openai.api_server \\
        --model janhq/Jan-v1-4B \\
        --max-model-len 2048 \\
        --dtype auto \\
        --gpu-memory-utilization 0.9 \\
        --download-dir /workspace/models \\
        --host 0.0.0.0 \\
        --port 8000 \\
        --tensor-parallel-size 1 \\
        --served-model-name jan-v1-4b \\
        --trust-remote-code \\
        2>&1 | tee /var/log/vllm.log &
fi

VLLM_PID=$!
echo "vLLM PID: $VLLM_PID"

# Monitor startup
echo "Waiting for vLLM to start (this may take 2-3 minutes)..."
for i in {1..60}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ vLLM server is ready!"
        echo "📊 Available at: http://0.0.0.0:8000"
        curl -s http://localhost:8000/v1/models | python3 -m json.tool || true
        break
    fi
    echo "Waiting... ($i/60)"
    sleep 5
done

# Keep the container alive
echo "Server running. Tailing logs..."
tail -f /var/log/vllm.log 2>/dev/null || tail -f /dev/null
`.trim(),
      
      docker_opts: '-p 8000:8000 --gpus all --ipc=host',
      runtype: 'ssh',
      python_utf8: true,
      lang_utf8: true,
      
      ...config
    };

    try {
      const response = await axios.put(
        `${this.baseUrl}/asks/${offerId}/`,
        deployConfig,
        { headers: this.headers }
      );
      
      return response.data;
    } catch (error) {
      console.error('Full error:', error.response?.data || error.message);
      throw new Error(`Failed to create instance: ${error.message}`);
    }
  }

  async getInstanceInfo(instanceId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/instances/${instanceId}`,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get instance info: ${error.message}`);
    }
  }

  async destroyInstance(instanceId) {
    try {
      const response = await axios.delete(
        `${this.baseUrl}/instances/${instanceId}/`,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to destroy instance: ${error.message}`);
    }
  }
}

// Main deployment function
async function deployJanModel() {
  console.log(chalk.bold.cyan('\n🚀 Jan-v1-4B vLLM Deployment Tool\n'));
  
  const spinner = ora('Checking API key...').start();
  
  if (!process.env.VAST_API_KEY) {
    spinner.fail('VAST_API_KEY not found');
    console.log(chalk.yellow('\nPlease add to .env file:'));
    console.log(chalk.gray('VAST_API_KEY=your_api_key_here'));
    process.exit(1);
  }

  const deployer = new VastAIDeployer(process.env.VAST_API_KEY);

  try {
    // Search for GPUs
    spinner.text = 'Searching for suitable GPUs...';
    const offers = await deployer.searchOffers({
      gpu_ram: '>=10',
      gpu_name: 'RTX 3090,RTX 4090,RTX A5000,RTX 3080,RTX A4000,A100',
      reliability: '>=0.95'
    });

    if (offers.length === 0) {
      spinner.fail('No suitable GPUs found');
      console.log(chalk.yellow('Try relaxing the filters'));
      process.exit(1);
    }

    spinner.succeed(`Found ${offers.length} suitable GPUs`);
    
    // Display options
    console.log(chalk.cyan('\nAvailable GPUs (sorted by price):'));
    const displayOffers = offers.slice(0, 5);
    displayOffers.forEach((offer, i) => {
      console.log(`\n  ${chalk.bold(i + 1)}. ${chalk.green(offer.gpu_name)}`);
      console.log(`     ${chalk.gray('VRAM:')} ${offer.gpu_ram}GB`);
      console.log(`     ${chalk.gray('Price:')} $${offer.dph_total}/hr`);
      console.log(`     ${chalk.gray('Reliability:')} ${(offer.reliability * 100).toFixed(1)}%`);
      console.log(`     ${chalk.gray('Location:')} ${offer.geolocation || 'Unknown'}`);
    });

    // Auto-select cheapest
    const selected = offers[0];
    console.log(chalk.yellow(`\n✓ Auto-selecting cheapest option: ${selected.gpu_name}`));
    
    // Deploy
    spinner.start('Creating instance...');
    const instance = await deployer.createInstance(selected.id);
    spinner.succeed('Instance created!');
    
    // Save instance info
    const instanceInfo = {
      id: instance.new_contract,
      gpu: selected.gpu_name,
      price: selected.dph_total,
      created: new Date().toISOString()
    };
    
    await fs.writeFile('.vast-instance.json', JSON.stringify(instanceInfo, null, 2));
    
    // Display success info
    console.log(chalk.green('\n✅ Deployment Successful!\n'));
    console.log(chalk.bold('Instance Details:'));
    console.log(`  ${chalk.gray('ID:')} ${instance.new_contract}`);
    console.log(`  ${chalk.gray('GPU:')} ${selected.gpu_name}`);
    console.log(`  ${chalk.gray('Price:')} $${selected.dph_total}/hour`);
    
    console.log(chalk.bold('\n📋 Next Steps:'));
    console.log('1. Wait 2-3 minutes for instance to start');
    console.log('2. Check status: ' + chalk.cyan('node vast-deploy-improved.js status'));
    console.log('3. Get SSH access: ' + chalk.cyan('node vast-deploy-improved.js ssh'));
    console.log('4. Test API: ' + chalk.cyan('node vast-deploy-improved.js test'));
    
  } catch (error) {
    spinner.fail(`Deployment failed: ${error.message}`);
    process.exit(1);
  }
}

// Status check function
async function checkStatus() {
  try {
    const data = await fs.readFile('.vast-instance.json', 'utf8');
    const instance = JSON.parse(data);
    
    const deployer = new VastAIDeployer(process.env.VAST_API_KEY);
    const info = await deployer.getInstanceInfo(instance.id);
    
    console.log(chalk.bold.cyan('\n📊 Instance Status\n'));
    console.log(`${chalk.gray('ID:')} ${info.id}`);
    console.log(`${chalk.gray('Status:')} ${info.actual_status}`);
    console.log(`${chalk.gray('GPU:')} ${instance.gpu}`);
    console.log(`${chalk.gray('Price:')} $${instance.price}/hour`);
    
    if (info.public_ipaddr && info.ssh_port) {
      console.log(chalk.bold.green('\n✅ Instance is ready!\n'));
      console.log(chalk.bold('Connection Info:'));
      console.log(`${chalk.gray('SSH:')} ssh -p ${info.ssh_port} root@${info.ssh_host}`);
      console.log(`${chalk.gray('API:')} http://${info.public_ipaddr}:8000/v1`);
      console.log(`${chalk.gray('Docs:')} http://${info.public_ipaddr}:8000/docs`);
      
      // Test the API
      console.log(chalk.cyan('\nTesting API...'));
      try {
        const response = await axios.get(`http://${info.public_ipaddr}:8000/v1/models`, {
          timeout: 5000
        });
        console.log(chalk.green('✅ API is responding!'));
        console.log('Models:', response.data.data.map(m => m.id).join(', '));
      } catch (e) {
        console.log(chalk.yellow('⏳ API not ready yet (model may still be loading)'));
      }
    } else {
      console.log(chalk.yellow('\n⏳ Instance is still starting...'));
    }
    
  } catch (error) {
    console.error(chalk.red('Error:', error.message));
    console.log(chalk.yellow('No instance found. Deploy first with: node vast-deploy-improved.js'));
  }
}

// Main CLI
const command = process.argv[2];

switch (command) {
  case 'deploy':
    deployJanModel();
    break;
    
  case 'status':
    checkStatus();
    break;
    
  case 'destroy':
    (async () => {
      try {
        const data = await fs.readFile('.vast-instance.json', 'utf8');
        const instance = JSON.parse(data);
        
        const deployer = new VastAIDeployer(process.env.VAST_API_KEY);
        await deployer.destroyInstance(instance.id);
        await fs.unlink('.vast-instance.json');
        
        console.log(chalk.green('✅ Instance destroyed'));
      } catch (error) {
        console.error(chalk.red('Failed:', error.message));
      }
    })();
    break;
    
  case 'ssh':
    (async () => {
      try {
        const data = await fs.readFile('.vast-instance.json', 'utf8');
        const instance = JSON.parse(data);
        
        const deployer = new VastAIDeployer(process.env.VAST_API_KEY);
        const info = await deployer.getInstanceInfo(instance.id);
        
        if (info.ssh_port && info.ssh_host) {
          console.log(chalk.cyan(`ssh -p ${info.ssh_port} root@${info.ssh_host}`));
        } else {
          console.log(chalk.yellow('Instance not ready yet'));
        }
      } catch (error) {
        console.error(chalk.red('Error:', error.message));
      }
    })();
    break;
    
  case 'test':
    (async () => {
      try {
        const data = await fs.readFile('.vast-instance.json', 'utf8');
        const instance = JSON.parse(data);
        
        const deployer = new VastAIDeployer(process.env.VAST_API_KEY);
        const info = await deployer.getInstanceInfo(instance.id);
        
        if (!info.public_ipaddr) {
          console.log(chalk.yellow('Instance not ready'));
          return;
        }
        
        const apiUrl = `http://${info.public_ipaddr}:8000`;
        console.log(chalk.cyan(`Testing API at ${apiUrl}...`));
        
        // Test chat completion
        const response = await axios.post(
          `${apiUrl}/v1/chat/completions`,
          {
            model: 'jan-v1-4b',
            messages: [{ role: 'user', content: 'Say hello!' }],
            max_tokens: 50
          },
          { timeout: 30000 }
        );
        
        console.log(chalk.green('✅ API Test Successful!'));
        console.log('Response:', response.data.choices[0].message.content);
        
      } catch (error) {
        console.error(chalk.red('Test failed:', error.message));
      }
    })();
    break;
    
  default:
    console.log(chalk.bold.cyan('Jan-v1-4B vLLM Deployer\n'));
    console.log('Commands:');
    console.log('  ' + chalk.cyan('deploy') + '  - Deploy Jan-v1-4B on Vast.ai');
    console.log('  ' + chalk.cyan('status') + '  - Check instance status');  
    console.log('  ' + chalk.cyan('ssh') + '     - Get SSH command');
    console.log('  ' + chalk.cyan('test') + '    - Test the API');
    console.log('  ' + chalk.cyan('destroy') + ' - Destroy instance');
}

export default VastAIDeployer;