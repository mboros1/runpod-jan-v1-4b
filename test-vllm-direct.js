#!/usr/bin/env node

// Test the already running vLLM server directly

import axios from 'axios';
import chalk from 'chalk';

const PORT = 8000;
const MODEL_NAME = 'janhq/Jan-v1-4B';

async function testModels() {
  try {
    console.log(chalk.cyan('\n📋 Checking available models...'));
    const response = await axios.get(`http://0.0.0.0:${PORT}/v1/models`);
    console.log(chalk.green('✅ Available models:'));
    response.data.data.forEach(model => {
      console.log(chalk.gray(`   - ${model.id} (max_tokens: ${model.max_model_len})`));
    });
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Failed to fetch models:', error.message));
    return false;
  }
}

async function testChat(prompt) {
  try {
    console.log(chalk.cyan(`\n📝 Testing chat with prompt: "${prompt}"`));
    const response = await axios.post(
      `http://0.0.0.0:${PORT}/v1/chat/completions`,
      {
        model: MODEL_NAME,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 150,
        temperature: 0.7
      },
      { timeout: 30000 }
    );

    const content = response.data.choices[0].message.content;
    console.log(chalk.green('✅ Response received:'));
    console.log(chalk.white(content));
    console.log(chalk.gray(`\nTokens used: ${response.data.usage.total_tokens}`));
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Chat test failed:', error.message));
    if (error.response) {
      console.error(chalk.red('Response:', JSON.stringify(error.response.data, null, 2)));
    }
    return false;
  }
}

async function testCompletion(prompt) {
  try {
    console.log(chalk.cyan(`\n📝 Testing completion with prompt: "${prompt}"`));
    const response = await axios.post(
      `http://0.0.0.0:${PORT}/v1/completions`,
      {
        model: MODEL_NAME,
        prompt: prompt,
        max_tokens: 100,
        temperature: 0.7
      },
      { timeout: 30000 }
    );

    const text = response.data.choices[0].text;
    console.log(chalk.green('✅ Completion received:'));
    console.log(chalk.white(text));
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Completion test failed:', error.message));
    return false;
  }
}

async function main() {
  console.log(chalk.bold.cyan('\n🧪 Testing vLLM Server with Jan-v1-4B Model\n'));
  console.log(chalk.gray(`Server: http://0.0.0.0:${PORT}`));
  console.log(chalk.gray(`Model: ${MODEL_NAME}\n`));

  // Test endpoints
  let allPassed = true;

  // 1. Test models endpoint
  allPassed = await testModels() && allPassed;

  // 2. Test chat completions
  const chatPrompts = [
    "Hello! Can you introduce yourself in one sentence?",
    "What is 2 + 2?",
    "Write a haiku about coding."
  ];

  for (const prompt of chatPrompts) {
    allPassed = await testChat(prompt) && allPassed;
    await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay between requests
  }

  // 3. Test text completions
  allPassed = await testCompletion("The capital of France is") && allPassed;

  // Summary
  console.log(chalk.bold.cyan('\n📊 Test Summary:'));
  if (allPassed) {
    console.log(chalk.green('✅ All tests passed successfully!'));
    console.log(chalk.gray('\nThe vLLM server is working correctly with the Jan-v1-4B model.'));
  } else {
    console.log(chalk.red('❌ Some tests failed. Check the output above for details.'));
  }

  console.log(chalk.cyan('\n💡 Server Info:'));
  console.log(chalk.gray(`   - API Base: http://0.0.0.0:${PORT}/v1`));
  console.log(chalk.gray(`   - Model: ${MODEL_NAME}`));
  console.log(chalk.gray(`   - Max tokens: 2048`));
  console.log(chalk.gray(`   - GPU memory utilization: 0.9`));
}

main().catch(error => {
  console.error(chalk.red('Fatal error:', error.message));
  process.exit(1);
});