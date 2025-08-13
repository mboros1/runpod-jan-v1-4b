#!/usr/bin/env node

import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

dotenv.config();

class VastAI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://console.vast.ai/api/v0';
    this.headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
  }

  async searchOffers(filters = {}) {
    // Default filters for Jan-v1-4B (needs ~10GB VRAM for BF16)
    const defaultFilters = {
      gpu_ram: '>=10',  // At least 10GB VRAM
      rentable: true,
      verified: true,
      cuda_vers: '>=12.0',
      sort_order: 'dphtotal',  // Sort by price ascending
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
    const defaultConfig = {
      image: 'vllm/vllm-openai:latest',
      disk: 50,  // 50GB disk for model storage
      onstart: `
        # Auto-start vLLM with Jan-v1-4B
        python -m vllm.entrypoints.openai.api_server \
          --model janhq/Jan-v1-4B \
          --dtype bfloat16 \
          --max-model-len 2048 \
          --port 8000 \
          --host 0.0.0.0 \
          --gpu-memory-utilization 0.9
      `.trim(),
      env: {
        MODEL_NAME: 'janhq/Jan-v1-4B',
        HF_TOKEN: process.env.HF_TOKEN || ''
      },
      docker_opts: '-p 8000:8000'
    };

    const payload = {
      client_id: 'me',
      image: config.image || defaultConfig.image,
      disk: config.disk || defaultConfig.disk,
      onstart: config.onstart || defaultConfig.onstart,
      env: { ...defaultConfig.env, ...config.env },
      runtype: 'ssh',
      python_utf8: true,
      lang_utf8: true,
      docker_opts: config.docker_opts || defaultConfig.docker_opts
    };

    try {
      const response = await axios.put(
        `${this.baseUrl}/asks/${offerId}/`,
        payload,
        { headers: this.headers }
      );
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create instance: ${error.message}`);
    }
  }

  async listInstances() {
    try {
      const response = await axios.get(`${this.baseUrl}/instances`, {
        headers: this.headers,
        params: { owner: 'me' }
      });
      
      return response.data.instances || [];
    } catch (error) {
      throw new Error(`Failed to list instances: ${error.message}`);
    }
  }

  async getInstanceStatus(instanceId) {
    try {
      const response = await axios.get(`${this.baseUrl}/instances/${instanceId}`, {
        headers: this.headers
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get instance status: ${error.message}`);
    }
  }

  async stopInstance(instanceId) {
    try {
      const response = await axios.put(
        `${this.baseUrl}/instances/${instanceId}/`,
        { state: 'stopped' },
        { headers: this.headers }
      );
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to stop instance: ${error.message}`);
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

// Deployment script
async function deployJanModel() {
  const spinner = ora('Initializing Vast.ai client...').start();
  
  if (!process.env.VAST_API_KEY) {
    spinner.fail('VAST_API_KEY not found in .env');
    console.log(chalk.yellow('Add VAST_API_KEY=your_key to .env file'));
    process.exit(1);
  }

  const vast = new VastAI(process.env.VAST_API_KEY);

  try {
    // 1. Search for suitable GPUs
    spinner.text = 'Searching for GPUs (min 10GB VRAM, sorted by price)...';
    const offers = await vast.searchOffers({
      gpu_ram: '>=10',
      gpu_name: 'RTX 3090,RTX 4090,RTX A5000,RTX 3080,RTX A4000',
      cuda_vers: '>=12.0',
      inet_up: '>=100',  // Good upload speed for model download
      direct_port_count: '>=1',  // Need at least 1 port
      sort_order: 'dphtotal'  // Sort by price
    });

    if (offers.length === 0) {
      spinner.fail('No suitable GPUs found');
      process.exit(1);
    }

    spinner.succeed(`Found ${offers.length} suitable offers`);
    
    // Display top 5 options
    console.log(chalk.cyan('\nTop 5 GPU Options (sorted by price):'));
    offers.slice(0, 5).forEach((offer, i) => {
      console.log(`  ${i + 1}. ${chalk.green(offer.gpu_name)} - ${offer.num_gpus}x GPU`);
      console.log(`     VRAM: ${offer.gpu_ram}GB, Price: $${offer.dph_total}/hr`);
      console.log(`     Location: ${offer.geolocation}`);
      console.log(`     Reliability: ${(offer.reliability * 100).toFixed(1)}%`);
      console.log(`     ID: ${offer.id}`);
    });

    // Select cheapest suitable option
    const selected = offers[0];
    console.log(chalk.yellow(`\n✓ Auto-selecting cheapest: ${selected.gpu_name} at $${selected.dph_total}/hr`));

    // 2. Create instance
    spinner.start('Creating instance with vLLM and Jan-v1-4B...');
    
    const instance = await vast.createInstance(selected.id, {
      image: 'vllm/vllm-openai:latest',
      disk: 60,  // 60GB for model + cache
      onstart: `
#!/bin/bash
echo "Starting vLLM with Jan-v1-4B model..."

# Start vLLM server
python -m vllm.entrypoints.openai.api_server \
  --model janhq/Jan-v1-4B \
  --dtype bfloat16 \
  --max-model-len 2048 \
  --port 8000 \
  --host 0.0.0.0 \
  --gpu-memory-utilization 0.9 \
  --download-dir /workspace/models \
  --served-model-name jan-v1-4b
      `.trim(),
      docker_opts: '-p 8000:8000 --gpus all'
    });

    spinner.succeed('Instance created successfully!');
    
    // 3. Display connection info
    console.log(chalk.green('\n✅ Deployment Complete!\n'));
    console.log(chalk.cyan('Instance Details:'));
    console.log(`  Instance ID: ${instance.new_contract}`);
    console.log(`  GPU: ${selected.gpu_name}`);
    console.log(`  Price: $${selected.dph_total}/hour`);
    console.log(`  Status: Initializing...`);
    
    console.log(chalk.cyan('\nNext Steps:'));
    console.log('1. Wait ~2-3 minutes for instance to start and model to load');
    console.log('2. Get instance IP: node vast-deploy.js status');
    console.log('3. Access API at: http://INSTANCE_IP:8000/v1');
    console.log('4. Test with: curl http://INSTANCE_IP:8000/v1/models');
    
    // Save instance ID
    const fs = await import('fs/promises');
    await fs.writeFile('.vast-instance', instance.new_contract.toString());
    console.log(chalk.gray('\nInstance ID saved to .vast-instance'));

  } catch (error) {
    spinner.fail(`Deployment failed: ${error.message}`);
    process.exit(1);
  }
}

// CLI commands
const command = process.argv[2];

switch (command) {
  case 'deploy':
    deployJanModel();
    break;
    
  case 'list':
    (async () => {
      const vast = new VastAI(process.env.VAST_API_KEY);
      const instances = await vast.listInstances();
      
      if (instances.length === 0) {
        console.log(chalk.yellow('No instances found'));
        return;
      }
      
      console.log(chalk.cyan('\nActive Instances:'));
      instances.forEach(inst => {
        console.log(`  ID: ${inst.id}`);
        console.log(`  Status: ${inst.actual_status}`);
        console.log(`  GPU: ${inst.gpu_name}`);
        console.log(`  IP: ${inst.public_ipaddr || 'Waiting...'}`);
        console.log(`  Price: $${inst.dph_total}/hr`);
        console.log('');
      });
    })();
    break;
    
  case 'status':
    (async () => {
      const fs = await import('fs/promises');
      try {
        const instanceId = await fs.readFile('.vast-instance', 'utf8');
        const vast = new VastAI(process.env.VAST_API_KEY);
        const status = await vast.getInstanceStatus(instanceId.trim());
        
        console.log(chalk.cyan('\nInstance Status:'));
        console.log(`  ID: ${status.id}`);
        console.log(`  Status: ${status.actual_status}`);
        console.log(`  IP: ${status.public_ipaddr || 'Not ready'}`);
        
        if (status.public_ipaddr) {
          console.log(chalk.green('\n✓ Instance is ready!'));
          console.log(`  API URL: http://${status.public_ipaddr}:8000/v1`);
          console.log(`  Test: curl http://${status.public_ipaddr}:8000/v1/models`);
        }
      } catch (error) {
        console.error(chalk.red('No instance ID found. Run "deploy" first.'));
      }
    })();
    break;
    
  case 'stop':
    (async () => {
      const fs = await import('fs/promises');
      try {
        const instanceId = await fs.readFile('.vast-instance', 'utf8');
        const vast = new VastAI(process.env.VAST_API_KEY);
        await vast.stopInstance(instanceId.trim());
        console.log(chalk.green('Instance stopped'));
      } catch (error) {
        console.error(chalk.red(`Failed to stop: ${error.message}`));
      }
    })();
    break;
    
  case 'destroy':
    (async () => {
      const fs = await import('fs/promises');
      try {
        const instanceId = await fs.readFile('.vast-instance', 'utf8');
        const vast = new VastAI(process.env.VAST_API_KEY);
        await vast.destroyInstance(instanceId.trim());
        await fs.unlink('.vast-instance');
        console.log(chalk.green('Instance destroyed'));
      } catch (error) {
        console.error(chalk.red(`Failed to destroy: ${error.message}`));
      }
    })();
    break;
    
  default:
    console.log(chalk.cyan('Vast.ai Jan-v1-4B Deployment Tool\n'));
    console.log('Commands:');
    console.log('  node vast-deploy.js deploy   - Deploy Jan-v1-4B on cheapest GPU');
    console.log('  node vast-deploy.js list     - List all instances');
    console.log('  node vast-deploy.js status   - Check instance status');
    console.log('  node vast-deploy.js stop     - Stop instance (keep data)');
    console.log('  node vast-deploy.js destroy  - Destroy instance (delete all)');
}

export { VastAI };