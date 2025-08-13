#!/usr/bin/env node

import axios from 'axios';
import readline from 'readline';
import chalk from 'chalk';
import dotenv from 'dotenv';
import ora from 'ora';
import { RunPodClient } from './src/runpod-client.js';

dotenv.config();

if (!process.env.RUNPOD_API_KEY) {
  console.error(chalk.red('Error: RUNPOD_API_KEY not found in .env file'));
  process.exit(1);
}

if (!process.env.RUNPOD_ENDPOINT_ID) {
  console.error(chalk.red('Error: RUNPOD_ENDPOINT_ID not found in .env file'));
  console.error(chalk.yellow('Please add RUNPOD_ENDPOINT_ID=your_endpoint_id to your .env file'));
  process.exit(1);
}

const ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;
const MODEL_NAME = process.env.MODEL_NAME || 'janhq/Jan-v1-4B';
const API_URL = `https://api.runpod.ai/v2/${ENDPOINT_ID}/openai/v1/chat/completions`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const runpodClient = new RunPodClient(process.env.RUNPOD_API_KEY);

const checkEndpointStatus = async () => {
  try {
    const status = await runpodClient.getEndpointStatus(ENDPOINT_ID);
    return status;
  } catch (error) {
    console.error(chalk.red(`Failed to check endpoint status: ${error.message}`));
    return null;
  }
};

const startWorkerWithWarmup = async () => {
  const spinner = ora('Starting worker...').start();
  
  try {
    // Send a test request to trigger cold start
    spinner.text = 'Sending warmup request to start worker...';
    
    const warmupRequest = axios.post(
      API_URL,
      {
        model: MODEL_NAME,
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        max_tokens: 10,
        temperature: 0.1
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000 // 2 minute timeout for cold start
      }
    );
    
    // Don't wait for the warmup request, just let it trigger the worker
    warmupRequest.catch(() => {}); // Ignore errors, we just want to trigger start
    
    // Now poll for worker status
    const maxWaitTime = 90000; // 90 seconds max
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
      
      const status = await checkEndpointStatus();
      if (status && status.runningWorkers > 0) {
        spinner.succeed(`Worker started successfully (GPU: ${status.gpuType})`);
        return true;
      }
      
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      spinner.text = `Waiting for worker to start... (${elapsed}s)`;
    }
    
    spinner.fail('Timeout waiting for worker to start');
    return false;
  } catch (error) {
    spinner.fail(`Failed to start worker: ${error.message}`);
    return false;
  }
};

const chat = async (message, retries = 2) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
    const response = await axios.post(
      API_URL,
      {
        model: MODEL_NAME,
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
        headers: {
          'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

      return response.data.choices[0].message.content;
    } catch (error) {
      if (error.response) {
        const statusCode = error.response.status;
        const errorMsg = error.response.data?.error?.message || error.response.statusText;
        
        if ((statusCode === 500 || statusCode === 503) && attempt < retries) {
          console.log(chalk.yellow(`\nEndpoint starting... (attempt ${attempt}/${retries})`));
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        throw new Error(`API Error (${statusCode}): ${errorMsg}`);
      } else if (error.request) {
        if (attempt < retries) {
          console.log(chalk.yellow(`\nNo response. Retrying... (attempt ${attempt}/${retries})`));
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }
        throw new Error('No response from server. The endpoint might be unavailable.');
      } else {
        throw new Error(`Request failed: ${error.message}`);
      }
    }
  }
  throw new Error('Failed after maximum retries');
};

const main = async () => {
  console.log(chalk.cyan(`\n🤖 ${MODEL_NAME} Chat Interface`));
  console.log(chalk.gray(`Endpoint: ${ENDPOINT_ID}`));
  
  // Check initial status
  let status = await checkEndpointStatus();
  if (status) {
    console.log(chalk.green('✓ Endpoint found:'), status.name);
    console.log(chalk.gray(`  GPU: ${status.gpuType}, Workers: ${status.runningWorkers}/${status.workersMax}`));
    
    // Automatically start worker if none are running
    if (status.runningWorkers === 0) {
      console.log(chalk.yellow('\n⚠️  No workers running. Starting one for you...'));
      const started = await startWorkerWithWarmup();
      if (started) {
        // Refresh status after starting
        status = await checkEndpointStatus();
        console.log(chalk.green('✓ Ready to chat!'));
      } else {
        console.log(chalk.red('Failed to start worker. You may experience delays.'));
      }
    } else {
      console.log(chalk.green('✓ Worker is running and ready!'));
    }
  } else {
    console.log(chalk.red('⚠️  Could not verify endpoint status'));
  }
  
  console.log(chalk.gray('\nType "exit" to quit, "clear" to clear screen, "status" to check endpoint\n'));

  const askQuestion = () => {
    rl.question(chalk.green('You: '), async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log(chalk.yellow('\nGoodbye! 👋\n'));
        rl.close();
        return;
      }

      if (input.toLowerCase() === 'clear') {
        console.clear();
        console.log(chalk.cyan(`\n🤖 ${MODEL_NAME} Chat Interface`));
        console.log(chalk.gray(`Endpoint: ${ENDPOINT_ID}`));
        console.log(chalk.gray('Type "exit" to quit, "clear" to clear screen, "status" to check endpoint\n'));
        askQuestion();
        return;
      }
      
      if (input.toLowerCase() === 'status') {
        const status = await checkEndpointStatus();
        if (status) {
          console.log(chalk.cyan('\nEndpoint Status:'));
          console.log(`  Name: ${status.name}`);
          console.log(`  GPU: ${status.gpuType}`);
          console.log(`  Workers: ${status.runningWorkers}/${status.workersMax} running\n`);
        }
        askQuestion();
        return;
      }

      if (!input.trim()) {
        askQuestion();
        return;
      }

      process.stdout.write(chalk.blue('Jan: '));
      
      try {
        const startTime = Date.now();
        const response = await chat(input);
        const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        console.log(response);
        console.log(chalk.gray(`(${responseTime}s)\n`));
      } catch (error) {
        console.log(chalk.red(`\nError: ${error.message}\n`));
      }

      askQuestion();
    });
  };

  askQuestion();
};

main().catch(error => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  process.exit(1);
});