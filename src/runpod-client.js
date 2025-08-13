import { GraphQLClient, gql } from 'graphql-request';

export class RunPodClient {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('RunPod API key is required');
    }

    this.client = new GraphQLClient('https://api.runpod.io/graphql', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
  }

  async createTemplate(config) {
    const CREATE_TEMPLATE = gql`
      mutation CreateTemplate($input: SaveTemplateInput!) {
        saveTemplate(input: $input) {
          id
          name
          imageName
          isServerless
        }
      }
    `;

    const variables = {
      input: {
        name: config.name,
        imageName: config.image,
        dockerArgs: config.dockerArgs || '',
        containerDiskInGb: config.containerDiskInGb || 10,
        volumeInGb: 0, // Always 0 for serverless
        ports: config.ports || '8000/http',
        isServerless: true,
        env: config.env || []
      }
    };

    try {
      const result = await this.client.request(CREATE_TEMPLATE, variables);
      return result.saveTemplate;
    } catch (error) {
      this.handleError(error, 'Failed to create template');
    }
  }

  async createEndpoint(config) {
    const CREATE_ENDPOINT = gql`
      mutation CreateEndpoint($input: EndpointInput!) {
        saveEndpoint(input: $input) {
          id
          name
          templateId
          gpuIds
          workersMin
          workersMax
        }
      }
    `;

    const variables = {
      input: {
        name: config.name,
        templateId: config.templateId,
        gpuIds: config.gpuType,
        locations: config.locations || 'US',
        idleTimeout: config.idleTimeout || 5,
        scalerType: config.scalerType || 'QUEUE_DELAY',
        scalerValue: config.scalerValue || 4,
        workersMin: config.workersMin || 0,
        workersMax: config.workersMax || 3
      }
    };

    try {
      const result = await this.client.request( CREATE_ENDPOINT, variables);
      return result.saveEndpoint;
    } catch (error) {
      this.handleError(error, 'Failed to create endpoint');
    }
  }

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
            idleTimeout
            scalerType
            pods {
              id
              desiredStatus
            }
          }
        }
      }
    `;

    try {
      const result = await this.client.request(GET_ENDPOINTS);
      return result.myself.endpoints;
    } catch (error) {
      this.handleError(error, 'Failed to list endpoints');
    }
  }

  async getEndpoint(endpointId) {
    const endpoints = await this.listEndpoints();
    return endpoints.find(ep => ep.id === endpointId);
  }

  async updateEndpoint(endpointId, updates) {
    const UPDATE_ENDPOINT = gql`
      mutation UpdateEndpoint($input: EndpointInput!) {
        saveEndpoint(input: $input) {
          id
          name
          workersMin
          workersMax
          gpuIds
        }
      }
    `;

    const variables = {
      input: {
        id: endpointId,
        ...updates
      }
    };

    try {
      const result = await this.client.request( UPDATE_ENDPOINT, variables);
      return result.saveEndpoint;
    } catch (error) {
      this.handleError(error, 'Failed to update endpoint');
    }
  }

  async deleteEndpoint(endpointId) {
    const DELETE_ENDPOINT = gql`
      mutation DeleteEndpoint($id: String!) {
        deleteEndpoint(id: $id)
      }
    `;

    try {
      const result = await this.client.request(DELETE_ENDPOINT, { id: endpointId });
      return result.deleteEndpoint;
    } catch (error) {
      this.handleError(error, 'Failed to delete endpoint');
    }
  }

  async deleteTemplate(templateName) {
    const DELETE_TEMPLATE = gql`
      mutation DeleteTemplate($templateName: String!) {
        deleteTemplate(templateName: $templateName)
      }
    `;

    try {
      const result = await this.client.request(DELETE_TEMPLATE, { templateName });
      return result.deleteTemplate;
    } catch (error) {
      this.handleError(error, 'Failed to delete template');
    }
  }

  async getGpuTypes() {
    const GET_GPU_TYPES = gql`
      query GetGPUTypes {
        gpuTypes {
          id
          displayName
          memoryInGb
          securePrice
          communityPrice
        }
      }
    `;

    try {
      const result = await this.client.request(GET_GPU_TYPES);
      return result.gpuTypes;
    } catch (error) {
      this.handleError(error, 'Failed to get GPU types');
    }
  }

  async getEndpointStatus(endpointId) {
    const GET_STATUS = gql`
      query GetEndpointStatus {
        myself {
          endpoints {
            id
            name
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

    try {
      const result = await this.client.request(GET_STATUS);
      const endpoint = result.myself.endpoints.find(ep => ep.id === endpointId);
      if (!endpoint) return null;
      
      return {
        id: endpoint.id,
        name: endpoint.name,
        gpuType: endpoint.gpuIds,
        runningWorkers: endpoint.pods.filter(p => p.desiredStatus === 'RUNNING').length,
        totalPods: endpoint.pods.length,
        workersMin: endpoint.workersMin,
        workersMax: endpoint.workersMax
      };
    } catch (error) {
      this.handleError(error, 'Failed to get endpoint status');
    }
  }

  handleError(error, message) {
    if (error.graphQLErrors?.length > 0) {
      const graphQLError = error.graphQLErrors[0];
      throw new Error(`${message}: ${graphQLError.message}`);
    }
    if (error.networkError) {
      throw new Error(`${message}: Network error - ${error.networkError.message}`);
    }
    throw new Error(`${message}: ${error.message}`);
  }
}