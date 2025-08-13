#!/usr/bin/env node

// Test vLLM locally without GPU (CPU mode for testing)

import { spawn } from 'child_process';
import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';

const MODEL_NAME = 'janhq/Jan-v1-4B';
const PORT = 8000;

async function checkDocker() {
  return new Promise((resolve) => {
    const docker = spawn('docker', ['--version']);
    docker.on('close', (code) => resolve(code === 0));
    docker.on('error', () => resolve(false));
  });
}

async function waitForServer(maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(`http://localhost:${PORT}/health`, { timeout: 1000 });
      if (response.status === 200) return true;
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  return false;
}

async function testChat() {
  try {
    console.log(chalk.cyan('\n📝 Testing chat endpoint...'));
    const response = await axios.post(
      `http://localhost:${PORT}/v1/chat/completions`,
      {
        model: MODEL_NAME,
        messages: [
          { role: 'user', content: 'Say "Hello, I am working!" in exactly 5 words.' }
        ],
        max_tokens: 50,
        temperature: 0.1
      },
      { timeout: 30000 }
    );

    const content = response.data.choices[0].message.content;
    console.log(chalk.green('✅ Response:', content));
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Chat test failed:', error.message));
    return false;
  }
}

async function main() {
  console.log(chalk.bold.cyan('\n🧪 vLLM Local Test (No GPU Required)\n'));

  // Check Docker
  const spinner = ora('Checking Docker...').start();
  const hasDocker = await checkDocker();
  
  if (!hasDocker) {
    spinner.fail('Docker not found! Please install Docker first.');
    console.log(chalk.yellow('Install from: https://docs.docker.com/get-docker/'));
    process.exit(1);
  }
  spinner.succeed('Docker is installed');

  // Start container (CPU mode for testing)
  console.log(chalk.cyan('\n🐳 Starting vLLM container (CPU mode)...'));
  console.log(chalk.gray('Note: This will be VERY slow without GPU, just for testing\n'));

  const dockerArgs = [
    'run',
    '--rm',
    '-d',  // Detached mode
    '--name', 'vllm-test',
    '-p', `${PORT}:8000`,
    '-e', `MODEL=${MODEL_NAME}`,
    '-e', 'PORT=8000',
    '-e', 'HOST=0.0.0.0',
    '-e', 'MAX_MODEL_LEN=512',  // Smaller for CPU
    '-e', 'DTYPE=float32',  // CPU compatible
    '-e', 'DEVICE=cpu',  // Force CPU mode
    'vllm/vllm-openai:latest'
  ];

  const docker = spawn('docker', dockerArgs);
  let containerId = '';

  docker.stdout.on('data', (data) => {
    containerId = data.toString().trim();
  });

  docker.stderr.on('data', (data) => {
    console.error(chalk.red('Docker error:', data.toString()));
  });

  // Wait a moment for container to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  if (!containerId) {
    console.error(chalk.red('Failed to start container'));
    console.log(chalk.yellow('\nTry running with GPU instead:'));
    console.log(chalk.gray('./test-local.sh'));
    process.exit(1);
  }

  console.log(chalk.green(`✅ Container started: ${containerId.substring(0, 12)}`));

  // Check container logs
  console.log(chalk.cyan('\n📋 Container logs:'));
  const logs = spawn('docker', ['logs', '-f', 'vllm-test']);
  
  logs.stdout.on('data', (data) => {
    console.log(chalk.gray(data.toString().trim()));
  });

  logs.stderr.on('data', (data) => {
    const log = data.toString().trim();
    if (log.includes('error') || log.includes('Error')) {
      console.error(chalk.red(log));
    } else {
      console.log(chalk.gray(log));
    }
  });

  // Wait for server
  const serverSpinner = ora('Waiting for vLLM server to start...').start();
  const serverReady = await waitForServer();

  if (!serverReady) {
    serverSpinner.fail('Server failed to start');
    console.log(chalk.yellow('\n⚠️  The vLLM container might require a GPU'));
    console.log(chalk.yellow('For GPU testing, use: ./test-local.sh'));
  } else {
    serverSpinner.succeed('Server is ready!');
    
    // Test the API
    await testChat();
  }

  // Cleanup
  console.log(chalk.cyan('\n🧹 Cleaning up...'));
  spawn('docker', ['stop', 'vllm-test']);
  
  console.log(chalk.green('\n✅ Test complete!'));
  console.log(chalk.gray('\nTo test with real GPU performance:'));
  console.log(chalk.gray('  chmod +x test-local.sh'));
  console.log(chalk.gray('  ./test-local.sh'));
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\nStopping container...'));
  spawn('docker', ['stop', 'vllm-test']);
  process.exit(0);
});

main().catch(error => {
  console.error(chalk.red('Fatal error:', error.message));
  spawn('docker', ['stop', 'vllm-test']);
  process.exit(1);
});