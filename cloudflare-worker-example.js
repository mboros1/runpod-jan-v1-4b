// Cloudflare Worker Example for API Gateway to vLLM
// This worker can route requests to your vLLM instance via Cloudflare Tunnel

export default {
  async fetch(request, env, ctx) {
    // Your vLLM API endpoint via Cloudflare Tunnel
    // This could be either:
    // 1. A configured tunnel: https://vllm-api.yourdomain.com
    // 2. A quick tunnel: https://random-words.trycloudflare.com
    const VLLM_ENDPOINT = env.VLLM_ENDPOINT || 'https://your-tunnel.trycloudflare.com';
    
    // Parse the incoming request
    const url = new URL(request.url);
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }
    
    // Rate limiting example
    const clientIP = request.headers.get('CF-Connecting-IP');
    // Add your rate limiting logic here
    
    // Authentication example
    const apiKey = request.headers.get('X-API-Key');
    if (!apiKey || apiKey !== env.API_KEY) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Route to vLLM
    if (url.pathname.startsWith('/v1/')) {
      try {
        // Forward the request to vLLM
        const vllmUrl = `${VLLM_ENDPOINT}${url.pathname}${url.search}`;
        
        // Clone the request with the new URL
        const vllmRequest = new Request(vllmUrl, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        });
        
        // Remove the API key header before forwarding
        vllmRequest.headers.delete('X-API-Key');
        
        // Make the request to vLLM
        const response = await fetch(vllmRequest);
        
        // Log the request for analytics
        ctx.waitUntil(
          logRequest(request, response.status, clientIP)
        );
        
        // Return the response
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
        
      } catch (error) {
        console.error('Error forwarding to vLLM:', error);
        return new Response(
          JSON.stringify({ error: 'Internal server error' }), 
          { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    }
    
    // Default response for unmatched routes
    return new Response('Not Found', { status: 404 });
  },
};

// Logging function (example)
async function logRequest(request, status, clientIP) {
  // You could send this to a logging service
  console.log({
    timestamp: new Date().toISOString(),
    method: request.method,
    path: new URL(request.url).pathname,
    status: status,
    clientIP: clientIP,
  });
}

/* 
Environment Variables to set in Cloudflare Worker:
- VLLM_ENDPOINT: Your Cloudflare Tunnel URL
- API_KEY: Your API key for authentication

To deploy:
1. Create a Cloudflare Worker
2. Set the environment variables
3. Deploy this code
4. Your API will be available at: https://your-worker.workers.dev

Benefits of this approach:
- No public IP exposure needed
- Built-in DDoS protection from Cloudflare
- Global edge caching possibilities
- Easy rate limiting and authentication
- Request/response transformation
- Analytics and logging
*/