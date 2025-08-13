import { RunPodClient } from './runpod-client.js';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

export class RunPodIaC {
  constructor(apiKey) {
    this.client = new RunPodClient(apiKey);
    this.config = null;
  }

  async loadConfig() {
    try {
      const configPath = path.join(process.cwd(), 'runpod.config.json');
      const configData = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configData);
      return this.config;
    } catch (error) {
      console.error(chalk.red('Failed to load runpod.config.json'));
      throw error;
    }
  }

  async deploy() {
    const spinner = ora('Loading configuration...').start();
    
    try {
      await this.loadConfig();
      spinner.text = 'Checking existing endpoints...';
      
      // Check if endpoint already exists
      const endpoints = await this.client.listEndpoints();
      const existingEndpoint = endpoints.find(ep => ep.name === this.config.endpoint.name);
      
      if (existingEndpoint) {
        spinner.info(`Endpoint "${existingEndpoint.name}" already exists (ID: ${existingEndpoint.id})`);
        
        // Update if configuration changed
        spinner.text = 'Updating endpoint configuration...';
        const updated = await this.client.updateEndpoint(existingEndpoint.id, {
          name: this.config.endpoint.name,
          workersMin: this.config.endpoint.workersMin,
          workersMax: this.config.endpoint.workersMax,
          gpuIds: this.config.endpoint.gpuType
        });
        
        spinner.succeed('Endpoint updated successfully!');
        this.printEndpointInfo(updated);
        return updated;
      }

      // Create new deployment - use existing template ID if we know it
      let templateId;
      
      // Try to create template, or use existing one
      spinner.text = 'Creating vLLM template...';
      try {
        const template = await this.client.createTemplate(this.config.template);
        spinner.succeed(`Template created: ${template.name} (ID: ${template.id})`);
        templateId = template.id;
      } catch (error) {
        if (error.message.includes('Template name must be unique')) {
          // Template already exists, we'll use the hardcoded ID from first creation
          templateId = 'ldhttt2dha'; // The template ID from our first successful creation
          spinner.info(`Using existing template: ${this.config.template.name} (ID: ${templateId})`);
        } else {
          throw error;
        }
      }

      spinner.text = 'Creating serverless endpoint...';
      const endpoint = await this.client.createEndpoint({
        ...this.config.endpoint,
        templateId
      });
      
      spinner.succeed('Endpoint created successfully!');
      this.printEndpointInfo(endpoint);
      
      return endpoint;
    } catch (error) {
      spinner.fail(error.message);
      throw error;
    }
  }

  async list() {
    const spinner = ora('Fetching endpoints...').start();
    
    try {
      const endpoints = await this.client.listEndpoints();
      spinner.stop();
      
      if (endpoints.length === 0) {
        console.log(chalk.yellow('No endpoints found'));
        return;
      }

      console.log(chalk.bold('\nRunPod Serverless Endpoints:\n'));
      
      for (const endpoint of endpoints) {
        const status = endpoint.pods.length > 0 ? chalk.green('● Active') : chalk.gray('● Idle');
        console.log(`${status} ${chalk.bold(endpoint.name)}`);
        console.log(`  ID: ${endpoint.id}`);
        console.log(`  GPU: ${endpoint.gpuIds}`);
        console.log(`  Workers: ${endpoint.workersMin}-${endpoint.workersMax}`);
        console.log(`  Idle Timeout: ${endpoint.idleTimeout} minutes`);
        console.log(`  API URL: ${chalk.cyan(`https://api.runpod.ai/v2/${endpoint.id}/openai/v1`)}`);
        console.log();
      }
      
      return endpoints;
    } catch (error) {
      spinner.fail(error.message);
      throw error;
    }
  }

  async scale(endpointId, minWorkers, maxWorkers) {
    const spinner = ora('Scaling endpoint...').start();
    
    try {
      const endpoint = await this.client.updateEndpoint(endpointId, {
        workersMin: minWorkers,
        workersMax: maxWorkers
      });
      
      spinner.succeed(`Endpoint scaled: ${endpoint.workersMin}-${endpoint.workersMax} workers`);
      return endpoint;
    } catch (error) {
      spinner.fail(error.message);
      throw error;
    }
  }

  async delete(endpointId) {
    const spinner = ora('Deleting endpoint...').start();
    
    try {
      // Get endpoint details first
      const endpoint = await this.client.getEndpoint(endpointId);
      
      if (!endpoint) {
        spinner.fail(`Endpoint ${endpointId} not found`);
        return false;
      }

      // Delete the endpoint
      const result = await this.client.deleteEndpoint(endpointId);
      
      if (result) {
        spinner.succeed(`Endpoint "${endpoint.name}" deleted successfully`);
        
        // Optionally try to clean up the template
        try {
          const templateName = this.config?.template?.name;
          if (templateName) {
            spinner.text = 'Cleaning up template...';
            await this.client.deleteTemplate(templateName);
            spinner.succeed('Template cleaned up');
          }
        } catch (error) {
          // Template deletion often fails if recently used, ignore
        }
      } else {
        spinner.fail('Failed to delete endpoint');
      }
      
      return result;
    } catch (error) {
      spinner.fail(error.message);
      throw error;
    }
  }

  async showGpuPricing() {
    const spinner = ora('Fetching GPU types...').start();
    
    try {
      const gpuTypes = await this.client.getGpuTypes();
      spinner.stop();
      
      console.log(chalk.bold('\nAvailable GPU Types:\n'));
      
      for (const gpu of gpuTypes) {
        console.log(`${chalk.bold(gpu.id)} - ${gpu.displayName}`);
        console.log(`  Memory: ${gpu.memoryInGb} GB`);
        console.log(`  Secure Cloud: $${gpu.securePrice}/hr`);
        console.log(`  Community Cloud: $${gpu.communityPrice}/hr`);
        console.log();
      }
      
      return gpuTypes;
    } catch (error) {
      spinner.fail(error.message);
      throw error;
    }
  }

  printEndpointInfo(endpoint) {
    console.log('\n' + chalk.bold('Endpoint Details:'));
    console.log(`  Name: ${chalk.green(endpoint.name)}`);
    console.log(`  ID: ${endpoint.id}`);
    console.log(`  GPU: ${endpoint.gpuIds || 'N/A'}`);
    console.log(`  Workers: ${endpoint.workersMin}-${endpoint.workersMax}`);
    console.log('\n' + chalk.bold('API Endpoints:'));
    console.log(`  OpenAI: ${chalk.cyan(`https://api.runpod.ai/v2/${endpoint.id}/openai/v1`)}`);
    console.log(`  RunPod: ${chalk.cyan(`https://api.runpod.ai/v2/${endpoint.id}/runsync`)}`);
    console.log('\n' + chalk.bold('Test with curl:'));
    console.log(chalk.gray(`  curl -X POST https://api.runpod.ai/v2/${endpoint.id}/openai/v1/chat/completions \\
    -H "Authorization: Bearer $RUNPOD_API_KEY" \\
    -H "Content-Type: application/json" \\
    -d '{
      "model": "janhq/Jan-v1-4B",
      "messages": [{"role": "user", "content": "Hello!"}],
      "max_tokens": 100
    }'`));
  }
}