/**
 * BDN Style Editor — Cloudflare Worker
 *
 * GET /       → serves the HTML editor page
 * POST /api   → proxies requests to the Claude API
 *
 * Deployment:
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. cd bdn-style-worker && wrangler deploy
 *   4. wrangler secret put CLAUDE_API_KEY   (paste your sk-ant-... key)
 */

import HTML from './index.html';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve the HTML page on GET requests
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      return new Response(HTML, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }

    // API proxy on POST /api
    if (request.method === 'POST' && url.pathname === '/api') {
      try {
        const { system, messages, model, max_tokens } = await request.json();

        const apiKey = env.CLAUDE_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: { message: 'CLAUDE_API_KEY secret is not configured' } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model, max_tokens, system, messages }),
        });

        const body = await apiResponse.text();
        return new Response(body, {
          status: apiResponse.status,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: { message: err.message } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
