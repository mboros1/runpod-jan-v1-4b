#!/usr/bin/env node

// Test script for vLLM server using public IP address

import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';

// Server configuration - using the public IP
const PUBLIC_IP = '50.173.192.54';
const PORT = 8000;
const API_BASE = `http://${PUBLIC_IP}:${PORT}`;
const MODEL_NAME = 'janhq/Jan-v1-4B';  // Try both full name and alias
const MODEL_ALIAS = 'jan-v1-4b';

// Test functions
async function testHealth() {
  const spinner = ora('Testing health endpoint...').start();
  try {
    const response = await axios.get(`${API_BASE}/health`, { timeout: 5000 });
    spinner.succeed(`Health check passed (status: ${response.status})`);
    return true;
  } catch (error) {
    spinner.fail(`Health check failed: ${error.message}`);
    return false;
  }
}

async function testModels() {
  const spinner = ora('Fetching available models...').start();
  try {
    const response = await axios.get(`${API_BASE}/v1/models`, { timeout: 5000 });
    const models = response.data.data || [];
    
    if (models.length > 0) {
      spinner.succeed(`Found ${models.length} model(s):`);
      models.forEach(model => {
        console.log(chalk.gray(`  - ${model.id} (max_tokens: ${model.max_model_len || 'N/A'})`));
      });
      return models[0].id; // Return first model ID for testing
    } else {
      spinner.warn('No models found');
      return null;
    }
  } catch (error) {
    spinner.fail(`Failed to fetch models: ${error.message}`);
    if (error.response) {
      console.log(chalk.red('Response:', JSON.stringify(error.response.data, null, 2)));
    }
    return null;
  }
}

async function testChatCompletion(modelId, prompt) {
  const spinner = ora(`Testing chat completion: "${prompt.substring(0, 50)}..."`).start();
  
  // Try different model name variations
  const modelNames = [modelId, MODEL_NAME, MODEL_ALIAS];
  
  for (const model of modelNames) {
    try {
      const response = await axios.post(
        `${API_BASE}/v1/chat/completions`,
        {
          model: model,
          messages: [
            { role: 'user', content: prompt }
          ],
          max_tokens: 150,
          temperature: 0.7,
          stream: false
        },
        { 
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content;
      spinner.succeed(`Chat completion successful (model: ${model})`);
      console.log(chalk.cyan('Response:'));
      console.log(chalk.white(content.substring(0, 500))); // Limit output length
      
      if (response.data.usage) {
        console.log(chalk.gray(`\nTokens - Prompt: ${response.data.usage.prompt_tokens}, Completion: ${response.data.usage.completion_tokens}, Total: ${response.data.usage.total_tokens}`));
      }
      
      return true;
    } catch (error) {
      // Try next model name
      continue;
    }
  }
  
  spinner.fail(`Chat completion failed for all model variations`);
  return false;
}

async function testCompletion(modelId, prompt) {
  const spinner = ora(`Testing text completion: "${prompt}"`).start();
  
  const modelNames = [modelId, MODEL_NAME, MODEL_ALIAS];
  
  for (const model of modelNames) {
    try {
      const response = await axios.post(
        `${API_BASE}/v1/completions`,
        {
          model: model,
          prompt: prompt,
          max_tokens: 100,
          temperature: 0.7
        },
        { 
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const text = response.data.choices[0].text;
      spinner.succeed(`Text completion successful (model: ${model})`);
      console.log(chalk.cyan('Completion:'));
      console.log(chalk.white(prompt + text));
      return true;
    } catch (error) {
      continue;
    }
  }
  
  spinner.fail('Text completion failed for all model variations');
  return false;
}

async function testStreamingChat(modelId) {
  const spinner = ora('Testing streaming chat completion...').start();
  
  try {
    const response = await axios.post(
      `${API_BASE}/v1/chat/completions`,
      {
        model: modelId || MODEL_ALIAS,
        messages: [
          { role: 'user', content: 'Count from 1 to 5.' }
        ],
        max_tokens: 50,
        temperature: 0.7,
        stream: true
      },
      { 
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }
    );

    spinner.succeed('Streaming response received');
    console.log(chalk.cyan('Stream chunks received (first 5):'));
    
    let chunkCount = 0;
    response.data.on('data', (chunk) => {
      if (chunkCount < 5) {
        console.log(chalk.gray(`  Chunk ${chunkCount + 1}: ${chunk.toString().substring(0, 100)}`));
        chunkCount++;
      }
    });
    
    return true;
  } catch (error) {
    spinner.fail(`Streaming failed: ${error.message}`);
    return false;
  }
}

// Performance test
async function testPerformance(modelId) {
  console.log(chalk.cyan('\n📊 Performance Test'));
  console.log(chalk.gray('Testing response times for different prompt lengths...\n'));
  
  const prompts = [
    { name: 'Short', text: 'Hi!' },
    { name: 'Medium', text: 'Explain what machine learning is in one sentence.' },
    { name: 'Long', text: 'Write a detailed explanation of how neural networks work, including information about layers, neurons, weights, biases, activation functions, and backpropagation.' }
  ];
  
  for (const { name, text } of prompts) {
    const start = Date.now();
    try {
      await axios.post(
        `${API_BASE}/v1/chat/completions`,
        {
          model: modelId || MODEL_ALIAS,
          messages: [{ role: 'user', content: text }],
          max_tokens: 100,
          temperature: 0.7
        },
        { timeout: 30000 }
      );
      const elapsed = Date.now() - start;
      console.log(chalk.green(`  ✓ ${name} prompt: ${elapsed}ms`));
    } catch (error) {
      console.log(chalk.red(`  ✗ ${name} prompt: Failed`));
    }
  }
}

// Main test suite
async function runTests() {
  console.log(chalk.bold.cyan('\n🧪 vLLM Public API Test Suite\n'));
  console.log(chalk.gray(`Server: ${API_BASE}`));
  console.log(chalk.gray(`Public IP: ${PUBLIC_IP}`));
  console.log(chalk.gray(`Expected Model: ${MODEL_NAME}\n`));
  
  let testsPassed = 0;
  let totalTests = 0;
  
  // 1. Health check
  console.log(chalk.bold('\n1️⃣  Health Check'));
  totalTests++;
  if (await testHealth()) testsPassed++;
  
  // 2. Models endpoint
  console.log(chalk.bold('\n2️⃣  Models Endpoint'));
  totalTests++;
  const modelId = await testModels();
  if (modelId) testsPassed++;
  
  // 3. Chat completions
  console.log(chalk.bold('\n3️⃣  Chat Completions'));
  const chatPrompts = [
    'Hello! Please respond with a simple greeting.',
    'What is 2+2? Just give me the number.',
    'Write a haiku about artificial intelligence.'
  ];
  
  for (const prompt of chatPrompts) {
    totalTests++;
    if (await testChatCompletion(modelId, prompt)) {
      testsPassed++;
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
  }
  
  // 4. Text completions
  console.log(chalk.bold('\n4️⃣  Text Completions'));
  totalTests++;
  if (await testCompletion(modelId, 'The capital of France is')) {
    testsPassed++;
  }
  
  // 5. Streaming (optional)
  console.log(chalk.bold('\n5️⃣  Streaming (Optional)'));
  await testStreamingChat(modelId);
  
  // 6. Performance test
  await testPerformance(modelId);
  
  // Summary
  console.log(chalk.bold.cyan('\n📊 Test Summary\n'));
  const passRate = ((testsPassed / totalTests) * 100).toFixed(1);
  
  if (testsPassed === totalTests) {
    console.log(chalk.green(`✅ All tests passed! (${testsPassed}/${totalTests})`));
  } else if (testsPassed > 0) {
    console.log(chalk.yellow(`⚠️  Partial success: ${testsPassed}/${totalTests} tests passed (${passRate}%)`));
  } else {
    console.log(chalk.red(`❌ All tests failed (0/${totalTests})`));
  }
  
  // Additional info
  console.log(chalk.bold('\n📝 Server Information'));
  console.log(`  ${chalk.gray('Public URL:')} ${API_BASE}`);
  console.log(`  ${chalk.gray('API Docs:')} ${API_BASE}/docs`);
  console.log(`  ${chalk.gray('OpenAPI Schema:')} ${API_BASE}/openapi.json`);
  
  console.log(chalk.bold('\n💡 Example cURL Commands'));
  console.log(chalk.gray('  # Check models:'));
  console.log(`  curl ${API_BASE}/v1/models\n`);
  console.log(chalk.gray('  # Chat completion:'));
  console.log(`  curl -X POST ${API_BASE}/v1/chat/completions \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"model": "${modelId || MODEL_ALIAS}", "messages": [{"role": "user", "content": "Hello!"}], "max_tokens": 50}'`);
}

// Error handler
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('\n❌ Unhandled error:'), error);
  process.exit(1);
});

// Run tests
console.log(chalk.yellow('Starting API tests against public endpoint...'));
console.log(chalk.gray('Note: Make sure the server is accessible from the internet\n'));

runTests().catch(error => {
  console.error(chalk.red('\n❌ Fatal error:'), error.message);
  process.exit(1);
});