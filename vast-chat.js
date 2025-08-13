#!/usr/bin/env node

import axios from 'axios';
import readline from 'readline';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function getInstanceIP() {
  try {
    // Try to read saved instance info
    const instanceId = await fs.readFile('.vast-instance', 'utf8');
    
    // Get instance status
    const apiKey = process.env.VAST_API_KEY;
    const response = await axios.get(
      `https://console.vast.ai/api/v0/instances/${instanceId.trim()}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );
    
    return response.data.public_ipaddr;
  } catch (error) {
    return null;
  }
}

async function chat(apiUrl, message) {
  try {
    const response = await axios.post(
      `${apiUrl}/v1/chat/completions`,
      {
        model: 'jan-v1-4b',
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
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    if (error.response) {
      throw new Error(`API Error (${error.response.status}): ${error.response.data?.error?.message || error.response.statusText}`);
    } else if (error.request) {
      throw new Error('No response from server. The model might still be loading.');
    } else {
      throw new Error(`Request failed: ${error.message}`);
    }
  }
}

async function main() {
  console.log(chalk.cyan('\n🤖 Jan-v1-4B Chat (Vast.ai)\n'));
  
  // Get instance IP
  let instanceIP = process.argv[2]; // Allow passing IP as argument
  
  if (!instanceIP) {
    console.log(chalk.gray('Looking for instance...'));
    instanceIP = await getInstanceIP();
    
    if (!instanceIP) {
      console.error(chalk.red('No instance found!'));
      console.log(chalk.yellow('Options:'));
      console.log('  1. Run: node vast-deploy.js deploy');
      console.log('  2. Pass IP manually: node vast-chat.js YOUR_INSTANCE_IP');
      process.exit(1);
    }
  }
  
  const apiUrl = `http://${instanceIP}:8000`;
  console.log(chalk.green(`✓ Connected to: ${apiUrl}`));
  
  // Test connection
  console.log(chalk.gray('Testing connection...'));
  try {
    const modelsResponse = await axios.get(`${apiUrl}/v1/models`, { timeout: 5000 });
    const models = modelsResponse.data.data || [];
    if (models.length > 0) {
      console.log(chalk.green(`✓ Model loaded: ${models[0].id}`));
    }
  } catch (error) {
    console.log(chalk.yellow('⚠️  Model might still be loading. Responses may be slow initially.'));
  }
  
  console.log(chalk.gray('\nType "exit" to quit, "clear" to clear screen\n'));

  const askQuestion = () => {
    rl.question(chalk.green('You: '), async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log(chalk.yellow('\nGoodbye! 👋\n'));
        rl.close();
        return;
      }

      if (input.toLowerCase() === 'clear') {
        console.clear();
        console.log(chalk.cyan('\n🤖 Jan-v1-4B Chat (Vast.ai)\n'));
        console.log(chalk.gray(`Connected to: ${apiUrl}`));
        console.log(chalk.gray('Type "exit" to quit, "clear" to clear screen\n'));
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
        const response = await chat(apiUrl, input);
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
}

main().catch(error => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  process.exit(1);
});