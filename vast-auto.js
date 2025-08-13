#!/usr/bin/env node

import axios from 'axios';
import readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const MODEL_NAME = process.env.MODEL_NAME || 'janhq/Jan-v1-4B';
const MIN_VRAM_GB = 10; // Minimum VRAM for 4B model
const MAX_PRICE_PER_HOUR = 0.50; // Maximum willing to pay

class VastAI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://console.vast.ai/api/v0';
    this.headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
  }

  async getAccountInfo() {
    try {
      const response = await axios.get(`${this.baseUrl}/users/current`, {
        headers: this.headers
      });
      return response.data;
    } catch (error) {
      // Try alternate endpoint
      try {
        const response = await axios.get(`${this.baseUrl}/auth/me`, {
          headers: this.headers
        });
        return response.data;
      } catch (err) {
        throw new Error('Failed to get account info. Check API key.');
      }
    }
  }

  async searchOffers(minVram = MIN_VRAM_GB, maxPrice = MAX_PRICE_PER_HOUR, blacklist = []) {
    // Vast.ai expects a dictionary of conditions
    const query = {
      verified: { eq: true },
      external: { eq: false },
      rentable: { eq: true },
      gpu_ram: { gte: minVram * 1000 },  // Convert GB to MB
      dph_total: { lte: maxPrice },
      cuda_vers: { gte: 12.0 },
      inet_up: { gte: 100 },
      direct_port_count: { gte: 1 },
      reliability2: { gte: 0.95 },
      geolocation: { eq: 'US' }
    };

    try {
      const response = await axios.get(`${this.baseUrl}/bundles`, {
        headers: this.headers,
        params: {
          q: JSON.stringify(query),
          limit: 1000  // Get ALL results, not just first page
        }
      });
      
      let offers = response.data.offers || [];
      
      // Filter out blacklisted instances
      if (blacklist.length > 0) {
        offers = offers.filter(offer => !blacklist.includes(offer.id));
      }
      
      // Sort manually by price ascending (cheapest first)
      offers.sort((a, b) => a.dph_total - b.dph_total);
      return offers;
    } catch (error) {
      // Log more details for debugging
      console.error('Search error details:', error.response?.data);
      throw new Error(`Failed to search offers: ${error.message}`);
    }
  }

  async createInstance(offerId, modelName) {
    // vLLM requires explicit command args
    const payload = {
      client_id: 'me',
      image: 'vllm/vllm-openai:latest',
      disk: 60,
      args: [
        '--model', modelName,
        '--port', '8000',
        '--host', '0.0.0.0',
        '--max-model-len', '4096',
        '--dtype', 'auto',
        '--gpu-memory-utilization', '0.95'
      ],
      docker_opts: '--gpus all -p 8000:8000 --ipc=host',
      // No onstart script - the vLLM container has its own entrypoint
      runtype: 'docker'  // Run as docker container, not SSH
    };

    try {
      const response = await axios.put(
        `${this.baseUrl}/asks/${offerId}/`,
        payload,
        { headers: this.headers }
      );
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create instance: ${error.response?.data?.msg || error.message}`);
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
      throw new Error(`Failed to get instance info: ${error.message}`);
    }
  }

  async waitForInstance(instanceId, maxWaitTime = 300000) { // 5 minutes max
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const instance = await this.getInstanceInfo(instanceId);
      
      if (instance && instance.actual_status === 'running' && instance.public_ipaddr) {
        return instance;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
    }
    
    throw new Error('Timeout waiting for instance to start');
  }

  async destroyInstance(instanceId) {
    try {
      await axios.delete(`${this.baseUrl}/instances/${instanceId}/`, {
        headers: this.headers
      });
      return true;
    } catch (error) {
      console.error(chalk.yellow(`Warning: Failed to destroy instance: ${error.message}`));
      return false;
    }
  }

  async testModelEndpoint(ip, port = 8000, maxRetries = 60) {  // Increased to 10 minutes
    const url = `http://${ip}:${port}/v1/models`;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await axios.get(url, { timeout: 5000 });
        if (response.data && response.data.data && response.data.data.length > 0) {
          return true;
        }
      } catch (error) {
        // Model still loading - show progress every 30 seconds
        if (i > 0 && i % 3 === 0) {
          const minutes = Math.floor((i * 10) / 60);
          const seconds = (i * 10) % 60;
          process.stdout.write(chalk.gray(` (${minutes}m ${seconds}s elapsed)...`));
        }
      }
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    }
    
    return false;
  }
}

class ChatInterface {
  constructor(apiUrl) {
    this.apiUrl = apiUrl;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async chat(message) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/v1/chat/completions`,
        {
          model: 'model',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant. Keep your responses concise and clear.'
            },
            {
              role: 'user',
              content: message
            }
          ],
          max_tokens: 500,
          temperature: 0.7,
          stream: false
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      throw new Error(error.response?.data?.error?.message || error.message);
    }
  }

  async startRepl() {
    console.log(chalk.cyan('\n💬 Chat Interface'));
    console.log(chalk.gray('Type "exit" or Ctrl+C to quit and stop the VM\n'));

    return new Promise((resolve) => {
      const askQuestion = () => {
        this.rl.question(chalk.green('You: '), async (input) => {
          if (input.toLowerCase() === 'exit') {
            this.rl.close();
            resolve();
            return;
          }

          if (!input.trim()) {
            askQuestion();
            return;
          }

          process.stdout.write(chalk.blue('AI: '));
          
          try {
            const startTime = Date.now();
            const response = await this.chat(input);
            const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);
            
            console.log(response);
            console.log(chalk.gray(`(${responseTime}s)\n`));
          } catch (error) {
            console.log(chalk.red(`Error: ${error.message}\n`));
          }

          askQuestion();
        });
      };

      // Handle Ctrl+C
      this.rl.on('SIGINT', () => {
        console.log(chalk.yellow('\n\nExiting...'));
        this.rl.close();
        resolve();
      });

      askQuestion();
    });
  }
}

async function main() {
  console.log(chalk.bold.cyan('\n🚀 Vast.ai Auto-Deploy & Chat\n'));
  
  // Check for API key
  if (!process.env.VAST_API_KEY) {
    console.error(chalk.red('❌ VAST_API_KEY not found in .env file'));
    console.log(chalk.yellow('Get your API key from: https://vast.ai/console/cli/'));
    process.exit(1);
  }

  const vast = new VastAI(process.env.VAST_API_KEY);
  let instanceId = null;
  let spinner = ora();
  const blacklist = [];  // Track failed GPU offers
  let attemptCount = 0;
  const maxAttempts = 3;

  try {
    // 1. Check account status
    spinner.start('Checking account status...');
    let accountInfo;
    try {
      accountInfo = await vast.getAccountInfo();
      const balance = accountInfo.credit || accountInfo.balance || 0;
      spinner.succeed(`Account verified (Balance: $${balance.toFixed(2)})`);
      
      if (balance < 0.10) {
        console.log(chalk.yellow('⚠️  Low balance! Add credits at https://vast.ai/billing/'));
      }
    } catch (error) {
      spinner.info('Account check failed, continuing anyway...');
    }

    // Retry loop for GPU rental
    let success = false;
    while (!success && attemptCount < maxAttempts) {
      attemptCount++;
      
      try {
        // 2. Search for optimal VM
        spinner.start(`Searching for US GPUs (min ${MIN_VRAM_GB}GB VRAM, max $${MAX_PRICE_PER_HOUR}/hr)...`);
        const offers = await vast.searchOffers(MIN_VRAM_GB, MAX_PRICE_PER_HOUR, blacklist);
        
        if (offers.length === 0) {
          spinner.fail('No suitable GPUs found within price range (after filtering blacklist)');
          process.exit(1);
        }
        
        spinner.succeed(`Found ${offers.length} suitable offers`);
        
        // Display selected GPU
        const selected = offers[0];
        console.log(chalk.cyan(`\n📊 Selected GPU (Attempt ${attemptCount}/${maxAttempts}):`));
        console.log(`  Type: ${chalk.green(selected.gpu_name)}`);
        console.log(`  VRAM: ${(selected.gpu_ram / 1000).toFixed(0)}GB`);
        console.log(`  Price: ${chalk.green(`$${selected.dph_total.toFixed(3)}/hr`)}`);
        console.log(`  Location: ${selected.geolocation || 'Unknown'}`);
        console.log(`  Reliability: ${(selected.reliability2 * 100).toFixed(0)}%`);
        
        // 3. Rent the VM
        spinner.start(`Renting VM with ${MODEL_NAME}...`);
        const instance = await vast.createInstance(selected.id, MODEL_NAME);
        instanceId = instance.new_contract;
        
        if (!instanceId) {
          throw new Error('Failed to get instance ID from creation response');
        }
        
        spinner.succeed(`VM rented! Instance ID: ${instanceId}`);

        // 4. Wait for VM to be ready
        spinner.start('Waiting for VM to start...');
        const runningInstance = await vast.waitForInstance(instanceId);
        const instanceIP = runningInstance.public_ipaddr;
        spinner.succeed(`VM is running at ${instanceIP}:8000`);

        // 5. Wait for model to load
        spinner.start(`Loading ${MODEL_NAME} (this may take 5-10 minutes for first load)...`);
        const modelReady = await vast.testModelEndpoint(instanceIP);
        
        if (!modelReady) {
          // If model fails to load, blacklist this offer and retry
          throw new Error('Model failed to load within 10 minute timeout');
        }
        
        spinner.succeed('Model is ready!');
        success = true;

        // 6. Start chat interface
        console.log(chalk.green(`\n✅ Connected to ${MODEL_NAME} at http://${instanceIP}:8000`));
        console.log(chalk.gray(`Cost: $${selected.dph_total.toFixed(3)}/hour\n`));
        
        const chat = new ChatInterface(`http://${instanceIP}:8000`);
        await chat.startRepl();
        
      } catch (error) {
        console.error(chalk.red(`\n❌ Attempt ${attemptCount} failed: ${error.message}`));
        
        // Clean up failed instance
        if (instanceId) {
          console.log(chalk.yellow('Cleaning up failed instance...'));
          try {
            await vast.destroyInstance(instanceId);
            console.log(chalk.green('Failed instance destroyed'));
          } catch (cleanupError) {
            console.error(chalk.red('Failed to destroy instance:', cleanupError.message));
          }
          instanceId = null;
        }
        
        // Add the failed offer to blacklist
        const offers = await vast.searchOffers(MIN_VRAM_GB, MAX_PRICE_PER_HOUR, blacklist);
        if (offers.length > 0) {
          blacklist.push(offers[0].id);
          console.log(chalk.yellow(`Blacklisted offer ${offers[0].id}, trying next option...`));
        }
        
        if (attemptCount >= maxAttempts) {
          throw new Error(`Failed after ${maxAttempts} attempts`);
        }
      }
    }

  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
  } finally {
    // 7. Clean up - always stop the VM
    if (instanceId) {
      const cleanupSpinner = ora('Stopping VM to prevent charges...').start();
      try {
        await vast.destroyInstance(instanceId);
        cleanupSpinner.succeed('VM stopped and destroyed');
        console.log(chalk.green('✅ No further charges will occur'));
      } catch (error) {
        cleanupSpinner.fail(`Failed to stop VM automatically`);
        console.log(chalk.red(`⚠️  IMPORTANT: Manually destroy instance ${instanceId} at https://vast.ai/`));
      }
    }
  }

  process.exit(0);
}

// Handle unexpected exits
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\nReceived interrupt signal...'));
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red(`\nUnexpected error: ${error.message}`));
  process.exit(1);
});

// Run the main function
main().catch(error => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  process.exit(1);
});