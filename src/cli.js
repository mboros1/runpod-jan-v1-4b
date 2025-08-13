#!/usr/bin/env node

import { program } from 'commander';
import { RunPodIaC } from './iac.js';
import dotenv from 'dotenv';
import chalk from 'chalk';
import readline from 'readline';

// Load environment variables
dotenv.config();

// Check for API key
if (!process.env.RUNPOD_API_KEY) {
  console.error(chalk.red('Error: RUNPOD_API_KEY not found in environment variables'));
  console.error(chalk.yellow('Please create a .env file with your RunPod API key'));
  console.error(chalk.gray('Example: RUNPOD_API_KEY=your_api_key_here'));
  process.exit(1);
}

const iac = new RunPodIaC(process.env.RUNPOD_API_KEY);

// Utility function to confirm dangerous operations
async function confirmAction(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(chalk.yellow(`${message} (y/N): `), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

program
  .name('runpod-iac')
  .description('RunPod Infrastructure as Code CLI for Jan-v1-4B deployment')
  .version('1.0.0');

program
  .command('deploy')
  .description('Deploy or update the Jan-v1-4B endpoint from config')
  .action(async () => {
    try {
      console.log(chalk.bold('\n🚀 Deploying Jan-v1-4B to RunPod Serverless\n'));
      await iac.deploy();
    } catch (error) {
      console.error(chalk.red(`\nDeployment failed: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all RunPod serverless endpoints')
  .action(async () => {
    try {
      await iac.list();
    } catch (error) {
      console.error(chalk.red(`\nFailed to list endpoints: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('scale')
  .description('Scale endpoint workers')
  .argument('<endpoint-id>', 'Endpoint ID to scale')
  .option('-min, --min-workers <number>', 'Minimum workers', '0')
  .option('-max, --max-workers <number>', 'Maximum workers', '3')
  .action(async (endpointId, options) => {
    try {
      const minWorkers = parseInt(options.minWorkers);
      const maxWorkers = parseInt(options.maxWorkers);
      
      if (minWorkers > maxWorkers) {
        console.error(chalk.red('Error: Minimum workers cannot be greater than maximum workers'));
        process.exit(1);
      }
      
      console.log(chalk.bold(`\n⚡ Scaling endpoint ${endpointId}\n`));
      await iac.scale(endpointId, minWorkers, maxWorkers);
    } catch (error) {
      console.error(chalk.red(`\nFailed to scale endpoint: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('delete')
  .description('Delete an endpoint')
  .argument('<endpoint-id>', 'Endpoint ID to delete')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (endpointId, options) => {
    try {
      if (!options.force) {
        const confirmed = await confirmAction(`Are you sure you want to delete endpoint ${endpointId}?`);
        if (!confirmed) {
          console.log(chalk.gray('Deletion cancelled'));
          return;
        }
      }
      
      console.log(chalk.bold(`\n🗑️  Deleting endpoint ${endpointId}\n`));
      await iac.delete(endpointId);
    } catch (error) {
      console.error(chalk.red(`\nFailed to delete endpoint: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('gpu-types')
  .description('List available GPU types and pricing')
  .action(async () => {
    try {
      await iac.showGpuPricing();
    } catch (error) {
      console.error(chalk.red(`\nFailed to fetch GPU types: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Test endpoint with a sample request')
  .argument('<endpoint-id>', 'Endpoint ID to test')
  .action(async (endpointId) => {
    try {
      console.log(chalk.bold('\n🧪 Testing endpoint...\n'));
      
      const url = `https://api.runpod.ai/v2/${endpointId}/openai/v1/chat/completions`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'janhq/Jan-v1-4B',
          messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
          max_tokens: 50,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error (${response.status}): ${error}`);
      }

      const data = await response.json();
      
      if (data.choices && data.choices[0]) {
        console.log(chalk.green('✓ Endpoint is working!'));
        console.log(chalk.bold('\nResponse:'));
        console.log(data.choices[0].message.content);
        console.log(chalk.gray(`\nTokens used: ${data.usage?.total_tokens || 'N/A'}`));
      } else {
        console.log(chalk.yellow('Response received but no content generated'));
        console.log(JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.error(chalk.red(`\nTest failed: ${error.message}`));
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}