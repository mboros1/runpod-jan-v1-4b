# RunPod Infrastructure as Code Capabilities Report

## Executive Summary
RunPod provides programmatic infrastructure management through **GraphQL and REST APIs** rather than a traditional CLI. While there's no official Terraform provider, the platform offers robust API-based automation suitable for IaC workflows.

## Available IaC Options

### 1. GraphQL API (Primary Method)
- **Endpoint**: `https://api.runpod.io/graphql`
- **Authentication**: API key-based
- **Capabilities**:
  - Create/update/delete serverless endpoints
  - Manage GPU pods
  - Configure templates
  - Scale workers dynamically
  - Monitor endpoint status

### 2. REST API (New in 2024)
- Recently introduced alternative to GraphQL
- Same functionality with improved performance
- Better suited for traditional HTTP-based automation tools
- Enables integration with existing CI/CD pipelines

### 3. Python SDK
- **Package**: `runpod-python`
- **Installation**: `pip install runpod`
- **Features**:
  - Programmatic endpoint management
  - Local testing capabilities
  - Synchronous and asynchronous execution
  - Pod lifecycle management

## Detailed GraphQL API Documentation

### Authentication
```javascript
// All GraphQL requests require API key authentication
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${RUNPOD_API_KEY}`
};

const endpoint = 'https://api.runpod.io/graphql';
```

### Core GraphQL Operations

#### 1. Template Management

**Create/Update Template Mutation**
```graphql
mutation SaveTemplate($input: SaveTemplateInput!) {
  saveTemplate(input: $input) {
    id
    name
    imageName
    dockerArgs
    containerDiskInGb
    volumeInGb
    volumeMountPath
    ports
    env {
      key
      value
    }
    isServerless
    isPublic
  }
}
```

**Input Type Definition**
```typescript
interface SaveTemplateInput {
  id?: string;                    // For updates
  name: string;                    // Unique template name
  imageName: string;               // Docker image
  dockerArgs?: string;             // Container startup args
  containerDiskInGb: number;       // Container disk size (5-100)
  volumeInGb: number;              // 0 for serverless
  volumeMountPath?: string;        // Default: /workspace
  ports?: string;                  // e.g., "8000/http,8888/http"
  env?: Array<{                    // Environment variables
    key: string;
    value: string;
  }>;
  isServerless?: boolean;          // True for serverless templates
  containerRegistryAuthId?: string; // For private registries
}
```

**Delete Template Mutation**
```graphql
mutation DeleteTemplate($templateName: String!) {
  deleteTemplate(templateName: $templateName)
}
```

#### 2. Endpoint Management

**Create/Update Endpoint Mutation**
```graphql
mutation SaveEndpoint($input: SaveEndpointInput!) {
  saveEndpoint(input: $input) {
    id
    name
    templateId
    gpuIds
    networkVolumeId
    locations
    idleTimeout
    scalerType
    scalerValue
    workersMin
    workersMax
    flashBootEnabled
  }
}
```

**Input Type Definition**
```typescript
interface SaveEndpointInput {
  id?: string;              // For updates
  name: string;             // Endpoint name (-fb suffix for FlashBoot)
  templateId: string;       // Template to use
  gpuIds: string;           // GPU type (e.g., "AMPERE_16")
  networkVolumeId?: string; // Optional persistent volume
  locations?: string;       // e.g., "US" or "EU_WEST"
  idleTimeout?: number;     // Minutes before scaling to zero (default: 5)
  scalerType?: string;      // "QUEUE_DELAY" or "REQUEST_COUNT"
  scalerValue?: number;     // Scaling threshold
  workersMin?: number;      // Minimum workers (default: 0)
  workersMax?: number;      // Maximum workers (default: 3)
}
```

**Query Endpoints**
```graphql
query GetEndpoints {
  myself {
    endpoints {
      id
      name
      templateId
      gpuIds
      networkVolumeId
      locations
      idleTimeout
      scalerType
      scalerValue
      workersMin
      workersMax
      pods {
        id
        name
        desiredStatus
        machineId
        machine {
          gpuDisplayName
        }
      }
      flashBootEnabled
    }
  }
}
```

**Delete Endpoint Mutation**
```graphql
mutation DeleteEndpoint($id: String!) {
  deleteEndpoint(id: $id)
}
```

#### 3. GPU and Hardware Queries

**Query Available GPU Types**
```graphql
query GetGPUTypes {
  gpuTypes {
    id
    displayName
    memoryInGb
    securePrice
    communityPrice
    lowestPrice {
      minimumBidPrice
      uninterruptablePrice
    }
  }
}
```

**Query Pod/Machine Details**
```graphql
query GetPod($podId: String!) {
  pod(input: { podId: $podId }) {
    id
    name
    runtime {
      uptimeInSeconds
      gpus {
        id
        gpuUtilPercent
        memoryUtilPercent
        tempC
      }
    }
    machine {
      gpuDisplayName
      cpuCount
      memoryInGb
    }
  }
}
```

### Node.js Implementation with GraphQL Client

#### Setup and Dependencies
```bash
npm install @apollo/client graphql node-fetch dotenv
```

#### Complete Node.js IaC Implementation
```javascript
// runpod-iac.js
import { ApolloClient, InMemoryCache, gql } from '@apollo/client';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

class RunPodIaC {
  constructor(apiKey) {
    this.client = new ApolloClient({
      uri: 'https://api.runpod.io/graphql',
      cache: new InMemoryCache(),
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      fetch
    });
  }

  // Create vLLM template for Jan-v1-4B
  async createTemplate() {
    const CREATE_TEMPLATE = gql`
      mutation CreateTemplate($input: SaveTemplateInput!) {
        saveTemplate(input: $input) {
          id
          name
        }
      }
    `;

    const variables = {
      input: {
        name: 'jan-v1-4b-vllm-template',
        imageName: 'runpod/worker-v1-vllm:v2.5.0stable-cuda12.1.0',
        dockerArgs: '',
        containerDiskInGb: 10,
        volumeInGb: 0,  // Serverless doesn't use persistent volumes
        ports: '8000/http',
        isServerless: true,
        env: [
          { key: 'MODEL_NAME', value: 'janhq/Jan-v1-4B' },
          { key: 'MAX_MODEL_LEN', value: '2048' },
          { key: 'DTYPE', value: 'bfloat16' },
          { key: 'GPU_MEMORY_UTILIZATION', value: '0.9' },
          { key: 'TEMPERATURE', value: '0.6' },
          { key: 'TOP_P', value: '0.95' },
          { key: 'TOP_K', value: '20' },
          { key: 'ENABLE_AUTO_TOOL_CHOICE', value: 'true' },
          { key: 'TOOL_CALL_PARSER', value: 'hermes' }
        ]
      }
    };

    const result = await this.client.mutate({
      mutation: CREATE_TEMPLATE,
      variables
    });
    
    return result.data.saveTemplate;
  }

  // Create serverless endpoint
  async createEndpoint(templateId) {
    const CREATE_ENDPOINT = gql`
      mutation CreateEndpoint($input: SaveEndpointInput!) {
        saveEndpoint(input: $input) {
          id
          name
          templateId
        }
      }
    `;

    const variables = {
      input: {
        name: 'jan-v1-4b-endpoint-fb', // -fb suffix enables FlashBoot
        templateId: templateId,
        gpuIds: 'AMPERE_16',  // RTX 4090
        locations: 'US',
        idleTimeout: 5,
        scalerType: 'QUEUE_DELAY',
        scalerValue: 4,
        workersMin: 0,
        workersMax: 3
      }
    };

    const result = await this.client.mutate({
      mutation: CREATE_ENDPOINT,
      variables
    });
    
    return result.data.saveEndpoint;
  }

  // List all endpoints
  async listEndpoints() {
    const GET_ENDPOINTS = gql`
      query GetEndpoints {
        myself {
          endpoints {
            id
            name
            templateId
            gpuIds
            workersMin
            workersMax
            pods {
              id
              desiredStatus
            }
          }
        }
      }
    `;

    const result = await this.client.query({
      query: GET_ENDPOINTS
    });
    
    return result.data.myself.endpoints;
  }

  // Scale endpoint workers
  async scaleEndpoint(endpointId, minWorkers, maxWorkers) {
    const SCALE_ENDPOINT = gql`
      mutation ScaleEndpoint($input: SaveEndpointInput!) {
        saveEndpoint(input: $input) {
          id
          workersMin
          workersMax
        }
      }
    `;

    const variables = {
      input: {
        id: endpointId,
        workersMin: minWorkers,
        workersMax: maxWorkers
      }
    };

    const result = await this.client.mutate({
      mutation: SCALE_ENDPOINT,
      variables
    });
    
    return result.data.saveEndpoint;
  }

  // Delete endpoint
  async deleteEndpoint(endpointId) {
    const DELETE_ENDPOINT = gql`
      mutation DeleteEndpoint($id: String!) {
        deleteEndpoint(id: $id)
      }
    `;

    const result = await this.client.mutate({
      mutation: DELETE_ENDPOINT,
      variables: { id: endpointId }
    });
    
    return result.data.deleteEndpoint;
  }

  // Full deployment pipeline
  async deploy() {
    try {
      console.log('Creating vLLM template...');
      const template = await this.createTemplate();
      console.log(`Template created: ${template.id}`);

      console.log('Creating serverless endpoint...');
      const endpoint = await this.createEndpoint(template.id);
      console.log(`Endpoint created: ${endpoint.id}`);
      console.log(`API URL: https://api.runpod.ai/v2/${endpoint.id}/openai/v1`);

      return endpoint;
    } catch (error) {
      console.error('Deployment failed:', error);
      throw error;
    }
  }
}

// Usage
async function main() {
  const iac = new RunPodIaC(process.env.RUNPOD_API_KEY);
  
  // Deploy Jan-v1-4B
  await iac.deploy();
  
  // List endpoints
  const endpoints = await iac.listEndpoints();
  console.log('Active endpoints:', endpoints);
}

main().catch(console.error);
```

### GraphQL Schema Types

#### GPU Types
```graphql
type GPUType {
  id: String!
  displayName: String!
  memoryInGb: Int!
  securePrice: Float
  communityPrice: Float
  lowestPrice: LowestPrice
}

type LowestPrice {
  minimumBidPrice: Float
  uninterruptablePrice: Float
}
```

#### Available GPU IDs
- `AMPERE_16` - RTX 4090/L4 (16GB)
- `AMPERE_24` - RTX 4090/A5000 (24GB)  
- `AMPERE_48` - A6000/L40 (48GB)
- `AMPERE_80` - A100 (80GB)
- `ADA_24` - RTX 6000 Ada (24GB)
- `H100_80GB` - H100 (80GB)
- `H100_80GB_HBM3` - H100 HBM3 (80GB)

### Error Handling

```javascript
// Comprehensive error handling
try {
  const result = await client.mutate({ mutation, variables });
  return result.data;
} catch (error) {
  if (error.graphQLErrors?.length > 0) {
    // GraphQL errors (validation, business logic)
    console.error('GraphQL errors:', error.graphQLErrors);
  }
  if (error.networkError) {
    // Network errors (connection, auth)
    console.error('Network error:', error.networkError);
  }
  throw error;
}
```

### Rate Limits and Best Practices

1. **API Rate Limits**: No documented hard limits, but use reasonable request rates
2. **Pagination**: Use cursor-based pagination for large result sets
3. **Caching**: Implement client-side caching for frequently accessed data
4. **Idempotency**: Always check existing resources before creation
5. **Error Recovery**: Implement exponential backoff for transient failures

## Infrastructure as Code Implementation

### Complete Node.js IaC Solution
```javascript
// deploy.js - Full IaC deployment script
import { RunPodIaC } from './runpod-iac.js';
import fs from 'fs/promises';
import yaml from 'js-yaml';

async function loadConfig() {
  const config = await fs.readFile('runpod.config.yaml', 'utf8');
  return yaml.load(config);
}

async function deployFromConfig() {
  const config = await loadConfig();
  const iac = new RunPodIaC(process.env.RUNPOD_API_KEY);
  
  // Check for existing resources
  const endpoints = await iac.listEndpoints();
  const existing = endpoints.find(e => e.name === config.endpoint.name);
  
  if (existing) {
    console.log(`Updating existing endpoint: ${existing.id}`);
    await iac.scaleEndpoint(existing.id, config.scaling.min, config.scaling.max);
  } else {
    console.log('Creating new deployment...');
    await iac.deploy();
  }
}

deployFromConfig().catch(console.error);
```

### Third-Party Terraform Providers
- **Community providers exist** but are not officially supported
- Examples:
  - `chris-aeviator/terraform-provider-runpod`
  - `shbert/runpod_terraform`
- Use with caution as they may lag behind API updates

## Recommended IaC Approach

### Best Practice Architecture
```
1. Configuration Management
   - Store endpoint configs in version control (JSON/YAML)
   - Use environment variables for API keys
   - Template vLLM configurations for reuse

2. Deployment Pipeline
   - Python script using GraphQL API
   - Integrate with GitHub Actions/GitLab CI
   - Automated testing before deployment

3. State Management
   - Query existing endpoints before updates
   - Maintain deployment state in external store
   - Implement rollback capabilities
```

### Sample Workflow
```yaml
# .runpod/config.yaml
model:
  name: jan-v1-4b
  image: runpod/worker-v1-vllm:v2.5.0stable-cuda12.1.0
  gpu: AMPERE_16
  
scaling:
  min_workers: 0
  max_workers: 3
  idle_timeout: 5
  
environment:
  MODEL_NAME: janhq/Jan-v1-4B
  MAX_MODEL_LEN: 2048
  DTYPE: bfloat16
```

## Key Automation Features

### 1. GitHub Integration
- Direct deployment from GitHub repositories
- Auto-release on push
- One-click rollback capabilities

### 2. Auto-scaling
- Queue-based scaling (QUEUE_DELAY)
- Request-based scaling
- Time-based scaling policies

### 3. Cost Optimization
- Programmatic start/stop of resources
- Schedule-based worker management
- Automatic idle timeout configuration

## Limitations

1. **No Official CLI**: Must use API or SDK
2. **No Official Terraform Provider**: Rely on community or custom solutions
3. **State Management**: No built-in state tracking like Terraform
4. **Limited Declarative Support**: More imperative than declarative

## Recommendations

For your Jan-v1-4B deployment:

1. **Use Python script with GraphQL API** for initial setup
2. **Store configuration in git** for version control
3. **Implement idempotent deployment logic** to handle updates
4. **Use environment variables** for sensitive data
5. **Create wrapper scripts** for common operations:
   - `deploy.py` - Create/update endpoint
   - `scale.py` - Adjust worker counts
   - `monitor.py` - Check endpoint status
   - `teardown.py` - Clean up resources

## Conclusion

While RunPod lacks a traditional CLI, its comprehensive API support enables full IaC workflows. The GraphQL/REST APIs provide all necessary primitives for automated infrastructure management, making it suitable for production deployments with proper scripting and state management.