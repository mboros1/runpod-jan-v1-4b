#!/usr/bin/env node

// Test script for vLLM server on Vast.ai using correct port mapping

import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';

// Vast.ai port mapping configuration
const PUBLIC_IP = '50.173.192.54';
const EXTERNAL_PORT = 40118;  // Vast.ai mapped port for internal 8000
const API_BASE = `http://${PUBLIC_IP}:${EXTERNAL_PORT}`;
const MODEL_NAME = 'janhq/Jan-v1-4B';
const MODEL_ALIAS = 'jan-v1-4b';

console.log(chalk.bold.cyan('\n🚀 Vast.ai vLLM Public API Tester\n'));
console.log(chalk.gray('Configuration:'));
console.log(chalk.gray(`  Public IP: ${PUBLIC_IP}`));
console.log(chalk.gray(`  External Port: ${EXTERNAL_PORT} (maps to internal 8000)`));
console.log(chalk.gray(`  API Base: ${API_BASE}`));
console.log(chalk.gray(`  Expected Model: ${MODEL_NAME}\n`));

// Test functions
async function testEndpoint(name, method, path, data = null) {
  const spinner = ora(`Testing ${name}...`).start();
  
  try {
    const config = {
      method,
      url: `${API_BASE}${path}`,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    spinner.succeed(`${name} - Success`);
    return response.data;
  } catch (error) {
    if (error.response) {
      spinner.fail(`${name} - HTTP ${error.response.status}: ${error.response.statusText}`);
      console.log(chalk.red(`  Response: ${JSON.stringify(error.response.data).substring(0, 200)}`));
    } else if (error.code === 'ECONNREFUSED') {
      spinner.fail(`${name} - Connection refused (port might be wrong)`);
    } else if (error.code === 'ETIMEDOUT') {
      spinner.fail(`${name} - Connection timeout (firewall or wrong IP?)`);
    } else {
      spinner.fail(`${name} - ${error.message}`);
    }
    return null;
  }
}

async function runTests() {
  console.log(chalk.bold('🧪 Starting API Tests\n'));
  
  // 1. Test health endpoint
  console.log(chalk.cyan('1. Health Check'));
  const health = await testEndpoint('Health', 'GET', '/health');
  if (health !== null) {
    console.log(chalk.green('  ✓ Server is healthy\n'));
  }
  
  // 2. Test models endpoint
  console.log(chalk.cyan('2. Models Endpoint'));
  const models = await testEndpoint('Models', 'GET', '/v1/models');
  let modelId = MODEL_ALIAS;
  
  if (models && models.data) {
    console.log(chalk.green(`  ✓ Found ${models.data.length} model(s):`));
    models.data.forEach(model => {
      console.log(chalk.gray(`    - ${model.id} (max_tokens: ${model.max_model_len})`));
      modelId = model.id; // Use actual model ID
    });
    console.log();
  }
  
  // 3. Test chat completion
  console.log(chalk.cyan('3. Chat Completion'));
  const chatResponse = await testEndpoint(
    'Chat Completion',
    'POST',
    '/v1/chat/completions',
    {
      model: modelId,
      messages: [
        { role: 'user', content: 'Say "Hello from Vast.ai!" and nothing else.' }
      ],
      max_tokens: 50,
      temperature: 0.1
    }
  );
  
  if (chatResponse && chatResponse.choices) {
    const content = chatResponse.choices[0].message.content;
    console.log(chalk.green('  ✓ Response received:'));
    console.log(chalk.white(`    "${content}"`));
    console.log(chalk.gray(`    Tokens used: ${chatResponse.usage.total_tokens}\n`));
  }
  
  // 4. Test completion endpoint
  console.log(chalk.cyan('4. Text Completion'));
  const completionResponse = await testEndpoint(
    'Text Completion',
    'POST',
    '/v1/completions',
    {
      model: modelId,
      prompt: 'The weather today is',
      max_tokens: 30,
      temperature: 0.7
    }
  );
  
  if (completionResponse && completionResponse.choices) {
    const text = completionResponse.choices[0].text;
    console.log(chalk.green('  ✓ Completion received:'));
    console.log(chalk.white(`    "The weather today is${text}"\n`));
  }
  
  // 5. Performance test
  console.log(chalk.cyan('5. Performance Test'));
  const startTime = Date.now();
  const perfResponse = await testEndpoint(
    'Performance',
    'POST',
    '/v1/chat/completions',
    {
      model: modelId,
      messages: [
        { role: 'user', content: 'Count from 1 to 3.' }
      ],
      max_tokens: 20
    }
  );
  
  if (perfResponse) {
    const elapsed = Date.now() - startTime;
    console.log(chalk.green(`  ✓ Response time: ${elapsed}ms\n`));
  }
  
  // Summary
  console.log(chalk.bold.cyan('\n📊 Connection Summary\n'));
  console.log(chalk.bold('Working Endpoints:'));
  console.log(`  ${chalk.gray('API Base:')} ${API_BASE}`);
  console.log(`  ${chalk.gray('Models:')} ${API_BASE}/v1/models`);
  console.log(`  ${chalk.gray('Chat:')} ${API_BASE}/v1/chat/completions`);
  console.log(`  ${chalk.gray('Completions:')} ${API_BASE}/v1/completions`);
  console.log(`  ${chalk.gray('Docs:')} ${API_BASE}/docs`);
  
  console.log(chalk.bold('\n💻 Example Usage:'));
  console.log(chalk.gray('\nPython:'));
  console.log(`import requests
response = requests.post(
    "${API_BASE}/v1/chat/completions",
    json={
        "model": "${modelId}",
        "messages": [{"role": "user", "content": "Hello!"}],
        "max_tokens": 100
    }
)
print(response.json())`);
  
  console.log(chalk.gray('\ncURL:'));
  console.log(`curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'`);
  
  console.log(chalk.gray('\nOpenAI Python Client:'));
  console.log(`from openai import OpenAI
client = OpenAI(
    base_url="${API_BASE}/v1",
    api_key="dummy"  # vLLM doesn't require API key
)
response = client.chat.completions.create(
    model="${modelId}",
    messages=[{"role": "user", "content": "Hello!"}],
    max_tokens=100
)
print(response.choices[0].message.content)`);
}

// Alternative port test
async function testAlternativePorts() {
  console.log(chalk.yellow('\n🔍 Testing alternative ports...\n'));
  
  // Common Vast.ai port ranges
  const alternativePorts = [
    40118,  // From VAST_TCP_PORT_8000
    40069,  // From VAST_TCP_PORT_1111
    41999,  // Machine Copy Port you mentioned
    8000,   // Direct port
    18000   // Alternative vLLM port
  ];
  
  for (const port of alternativePorts) {
    const testUrl = `http://${PUBLIC_IP}:${port}/v1/models`;
    try {
      const response = await axios.get(testUrl, { timeout: 2000 });
      console.log(chalk.green(`✓ Port ${port} is accessible - Found API!`));
      if (response.data && response.data.data) {
        console.log(chalk.gray(`  Models: ${response.data.data.map(m => m.id).join(', ')}`));
      }
    } catch (error) {
      if (error.response) {
        console.log(chalk.yellow(`⚠ Port ${port} responded with HTTP ${error.response.status}`));
      } else if (error.code === 'ECONNREFUSED') {
        console.log(chalk.red(`✗ Port ${port} - Connection refused`));
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        console.log(chalk.gray(`✗ Port ${port} - Timeout (likely closed)`));
      } else {
        console.log(chalk.gray(`✗ Port ${port} - ${error.code || error.message}`));
      }
    }
  }
}

// Main execution
async function main() {
  // First test the expected port
  await runTests();
  
  // Then scan for alternative ports
  await testAlternativePorts();
}

main().catch(error => {
  console.error(chalk.red('\n❌ Fatal error:'), error.message);
  process.exit(1);
});