import { RunPodClient } from './runpod-client.js';
import { RunPodIaC } from './iac.js';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

class EndpointVerifier {
  constructor(apiKey) {
    this.client = new RunPodClient(apiKey);
    this.iac = new RunPodIaC(apiKey);
  }

  async loadConfig() {
    try {
      const configData = await fs.readFile('runpod.config.json', 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      throw new Error(`Failed to load config: ${error.message}`);
    }
  }

  async verifyEndpoint(endpointId) {
    const spinner = ora('Running post-deployment verification...').start();
    const results = {
      endpoint: false,
      gpuConfig: false,
      scaling: false,
      accessibility: false,
      gpuAvailability: false,
      issues: []
    };

    try {
      // 1. Check endpoint exists
      spinner.text = 'Checking endpoint exists...';
      const endpoints = await this.client.listEndpoints();
      const endpoint = endpoints.find(ep => ep.id === endpointId);
      
      if (!endpoint) {
        results.issues.push('Endpoint not found');
        spinner.fail('Endpoint not found');
        return results;
      }
      results.endpoint = true;

      // 2. Load expected configuration
      const config = await this.loadConfig();
      
      // 3. Verify GPU configuration
      spinner.text = 'Verifying GPU configuration...';
      const expectedGpus = config.endpoint.gpuType.split(',');
      const actualGpus = endpoint.gpuIds ? endpoint.gpuIds.split(',') : [];
      
      if (actualGpus.length === 0) {
        results.issues.push('GPU configuration is empty!');
      } else if (actualGpus.join(',') !== expectedGpus.join(',')) {
        results.issues.push(`GPU mismatch: Expected [${expectedGpus}], Got [${actualGpus}]`);
      } else {
        results.gpuConfig = true;
      }

      // 4. Verify scaling configuration
      spinner.text = 'Verifying scaling configuration...';
      if (endpoint.workersMin !== config.endpoint.workersMin || 
          endpoint.workersMax !== config.endpoint.workersMax) {
        results.issues.push(
          `Scaling mismatch: Expected ${config.endpoint.workersMin}-${config.endpoint.workersMax}, ` +
          `Got ${endpoint.workersMin}-${endpoint.workersMax}`
        );
      } else {
        results.scaling = true;
      }

      // 5. Check GPU availability
      spinner.text = 'Checking GPU availability...';
      const gpuTypes = await this.client.getGpuTypes();
      const availableGpuIds = gpuTypes.map(g => g.id);
      
      const unavailableGpus = actualGpus.filter(gpu => {
        // Check if GPU type exists in the system
        return !availableGpuIds.some(availableId => 
          availableId.toLowerCase() === gpu.toLowerCase() ||
          availableId.replace(/_/g, '').toLowerCase() === gpu.replace(/_/g, '').toLowerCase()
        );
      });

      if (unavailableGpus.length > 0) {
        results.issues.push(`Unknown GPU types: ${unavailableGpus.join(', ')}`);
      } else {
        results.gpuAvailability = true;
      }

      // 6. Test accessibility (quick health check)
      spinner.text = 'Testing endpoint accessibility...';
      try {
        const response = await fetch(
          `https://api.runpod.ai/v2/${endpointId}/health`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`
            }
          }
        );
        
        if (response.ok || response.status === 404) {
          // 404 is ok - endpoint exists but no health route
          results.accessibility = true;
        } else {
          results.issues.push(`Endpoint not accessible: HTTP ${response.status}`);
        }
      } catch (error) {
        results.issues.push(`Endpoint not accessible: ${error.message}`);
      }

      // Report results
      spinner.stop();
      this.printResults(endpoint, results);
      
      return results;
    } catch (error) {
      spinner.fail(`Verification failed: ${error.message}`);
      throw error;
    }
  }

  printResults(endpoint, results) {
    console.log(chalk.bold('\n📋 Post-Deployment Verification Report\n'));
    
    // Endpoint info
    console.log(chalk.cyan('Endpoint Information:'));
    console.log(`  Name: ${endpoint.name}`);
    console.log(`  ID: ${endpoint.id}`);
    console.log(`  Status: ${endpoint.pods?.length > 0 ? chalk.green('Active') : chalk.yellow('Idle')}`);
    
    // Verification results
    console.log(chalk.cyan('\nVerification Results:'));
    console.log(`  ${results.endpoint ? '✅' : '❌'} Endpoint exists`);
    console.log(`  ${results.gpuConfig ? '✅' : '❌'} GPU configuration`);
    console.log(`  ${results.scaling ? '✅' : '❌'} Scaling configuration`);
    console.log(`  ${results.gpuAvailability ? '✅' : '❌'} GPU types valid`);
    console.log(`  ${results.accessibility ? '✅' : '❌'} Endpoint accessible`);
    
    // Configuration details
    console.log(chalk.cyan('\nCurrent Configuration:'));
    console.log(`  GPUs: ${endpoint.gpuIds || chalk.red('NONE')}`);
    console.log(`  Workers: ${endpoint.workersMin}-${endpoint.workersMax}`);
    console.log(`  Idle Timeout: ${endpoint.idleTimeout} minutes`);
    console.log(`  Scaler: ${endpoint.scalerType || 'Default'}`);
    
    // Issues
    if (results.issues.length > 0) {
      console.log(chalk.red('\n⚠️  Issues Found:'));
      results.issues.forEach(issue => {
        console.log(`  • ${issue}`);
      });
      
      // Recommendations
      console.log(chalk.yellow('\n💡 Recommendations:'));
      if (results.issues.some(i => i.includes('GPU configuration is empty'))) {
        console.log('  • Run "npm run deploy" to reconfigure GPUs');
        console.log('  • Check RunPod dashboard for GPU availability');
      }
      if (results.issues.some(i => i.includes('GPU mismatch'))) {
        console.log('  • Run "npm run deploy" to update configuration');
      }
      if (results.issues.some(i => i.includes('Unknown GPU types'))) {
        console.log('  • Check GPU type names in runpod.config.json');
        console.log('  • Run "node src/cli.js gpu-types" to see available GPUs');
      }
    } else {
      console.log(chalk.green('\n✅ All checks passed! Endpoint is properly configured.'));
    }
    
    // API endpoints
    console.log(chalk.cyan('\nAPI Endpoints:'));
    console.log(`  OpenAI: ${chalk.gray(`https://api.runpod.ai/v2/${endpoint.id}/openai/v1`)}`);
    console.log(`  RunPod: ${chalk.gray(`https://api.runpod.ai/v2/${endpoint.id}/runsync`)}`);
  }

  async fixGpuConfiguration(endpointId) {
    const spinner = ora('Attempting to fix GPU configuration...').start();
    
    try {
      const config = await this.loadConfig();
      
      spinner.text = 'Updating endpoint with correct GPU configuration...';
      const updated = await this.client.updateEndpoint(endpointId, {
        name: config.endpoint.name,
        gpuIds: config.endpoint.gpuType,
        workersMin: config.endpoint.workersMin,
        workersMax: config.endpoint.workersMax
      });
      
      spinner.succeed('GPU configuration updated');
      return updated;
    } catch (error) {
      spinner.fail(`Failed to fix configuration: ${error.message}`);
      throw error;
    }
  }
}

// CLI usage
async function main() {
  const verifier = new EndpointVerifier(process.env.RUNPOD_API_KEY);
  
  // Get endpoint ID from env or use default
  const endpointId = process.env.RUNPOD_ENDPOINT_ID || 'pyoszyar8clv6z';
  
  try {
    const results = await verifier.verifyEndpoint(endpointId);
    
    // If GPU config is broken, offer to fix
    if (!results.gpuConfig && results.issues.some(i => i.includes('GPU configuration is empty'))) {
      console.log(chalk.yellow('\n🔧 Attempting automatic fix...'));
      await verifier.fixGpuConfiguration(endpointId);
      
      // Re-verify after fix
      console.log(chalk.cyan('\n🔄 Re-verifying after fix...'));
      await verifier.verifyEndpoint(endpointId);
    }
    
    process.exit(results.issues.length > 0 ? 1 : 0);
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { EndpointVerifier };