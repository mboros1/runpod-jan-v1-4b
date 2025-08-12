# Deploying Jan-v1-4B on RunPod Serverless - Summary

## Model Overview
**Jan-v1-4B** is a 4.02 billion parameter model based on Qwen3-4B-Thinking-2507, designed for agentic reasoning and problem-solving. It's Apache 2.0 licensed and optimized for deployment with vLLM.

## Hardware Requirements
For a 4B parameter model like Jan-v1-4B:
- **Recommended GPU**: RTX 4090 (24GB VRAM) or T4 (16GB VRAM)
- **Memory requirement**: ~8-10GB VRAM (BF16 format)
- **Estimated cost**: $0.34-0.40/hour for RTX 4090, $0.40/hour for T4

## RunPod Serverless Benefits
- **Pay-per-millisecond billing**: Only pay for actual usage
- **Fast cold starts**: 48% under 200ms with FlashBoot technology
- **OpenAI API compatibility**: Drop-in replacement for existing integrations
- **Auto-scaling**: Scales to zero when not in use

## Deployment Steps

### Quick Deploy Method (Recommended)
1. **Create RunPod account** at runpod.io
2. Navigate to **Serverless** → **Quick Deploy** → **vLLM**
3. Configure:
   - Model: `janhq/Jan-v1-4B`
   - GPU: Select RTX 4090 or T4
   - Max model length: 2048 (recommended)
4. Set environment variables:
   ```
   DTYPE=bfloat16
   GPU_MEMORY_UTILIZATION=0.9
   TEMPERATURE=0.6
   TOP_P=0.95
   TOP_K=20
   ```
5. Click **Deploy**

### Alternative: Docker Container Method
```dockerfile
# Use RunPod's optimized vLLM image
FROM runpod/worker-v1-vllm:v2.5.0stable-cuda12.1.0

# Set model environment
ENV MODEL_NAME="janhq/Jan-v1-4B"
ENV MAX_MODEL_LEN=2048
ENV DTYPE=bfloat16
```

## API Integration
Once deployed, you can access your model via:

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_RUNPOD_API_KEY",
    base_url="https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/openai/v1"
)

response = client.chat.completions.create(
    model="janhq/Jan-v1-4B",
    messages=[{"role": "user", "content": "Hello!"}],
    temperature=0.6,
    max_tokens=2048
)
```

## Cost Optimization Strategies
1. **Use Flex Workers** for variable workloads (scales to zero)
2. **Use Active Workers** for consistent traffic (20-30% discount)
3. **Optimize GPU memory utilization** to fit on smaller GPUs
4. **Set appropriate max_tokens** to control response length

## Expected Performance
- **Cold start**: <1 second for 4B model
- **Inference speed**: ~100 tokens/second on RTX 4090
- **Throughput**: 24x faster than HuggingFace Transformers

## Monitoring & Testing
1. Use RunPod's **Requests** tab to test deployment
2. Monitor usage via RunPod dashboard
3. Set up alerts for usage thresholds

## Total Estimated Costs
For moderate usage (100 hours/month):
- **Flex workers**: ~$34-40/month
- **Active workers (24/7)**: ~$180-220/month with 30% discount

## Next Steps
1. Sign up for RunPod account
2. Add credits to your account
3. Deploy using Quick Deploy method
4. Test with sample requests
5. Integrate into your application

## Additional Resources
- [RunPod vLLM Documentation](https://docs.runpod.io/serverless/workers/vllm/get-started)
- [Jan-v1-4B Model Card](https://huggingface.co/janhq/Jan-v1-4B)
- [RunPod Pricing](https://www.runpod.io/pricing)