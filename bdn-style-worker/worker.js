/**
 * BDN Style Editor — Cloudflare Worker
 *
 * GET  /         → serves the HTML editor page
 * POST /api      → analyzes copy via Claude tool_use with a cached system prompt
 *
 * The system prompt is assembled from Markdown files in ./prompt/ at module load,
 * so rule edits land as prose diffs and version with git.
 *
 * Deployment:
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. cd bdn-style-worker && wrangler deploy
 *   4. wrangler secret put CLAUDE_API_KEY   (paste your sk-ant-... key)
 */

import HTML from './index.html';

import PREAMBLE from './prompt/00_preamble.md';
import HEADLINE_RULES from './prompt/10_headline_rules.md';
import STYLE_RULES from './prompt/20_style_rules.md';
import STRUCTURE from './prompt/30_structure.md';
import OUTPUT from './prompt/40_output.md';
import CRITICAL_RULES from './prompt/50_critical_rules.md';

const SYSTEM_PROMPT = [
  PREAMBLE,
  HEADLINE_RULES,
  STYLE_RULES,
  STRUCTURE,
  OUTPUT,
  CRITICAL_RULES,
].join('\n\n');

const REPORT_TOOL = {
  name: 'report_style_analysis',
  description: 'Report the structured style analysis for the submitted headline and/or story text.',
  input_schema: {
    type: 'object',
    properties: {
      headline_analysis: {
        type: 'object',
        description: 'Present only if a headline was submitted. Omit entirely otherwise.',
        properties: {
          score: { type: 'string', enum: ['strong', 'adequate', 'weak'] },
          ws_answered: {
            type: 'array',
            items: { type: 'string', enum: ['who', 'what', 'when', 'where', 'why'] },
          },
          ws_missing: {
            type: 'array',
            items: { type: 'string', enum: ['who', 'what', 'when', 'where', 'why'] },
          },
          verb: { type: 'string' },
          red_flags: { type: 'array', items: { type: 'string' } },
          assessment: { type: 'string' },
          suggested_rewrite: { type: ['string', 'null'] },
        },
        required: ['score', 'ws_answered', 'ws_missing', 'verb', 'red_flags', 'assessment'],
      },
      nut_graf: {
        type: 'object',
        properties: {
          found: { type: 'boolean' },
          location: { type: ['integer', 'null'] },
          text: { type: ['string', 'null'] },
          assessment: { type: 'string' },
        },
        required: ['found', 'assessment'],
      },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            original: { type: 'string' },
            category: { type: 'string', enum: ['style', 'tighten', 'structure'] },
            suggestion: { type: 'string' },
            explanation: { type: 'string' },
          },
          required: ['original', 'category', 'suggestion', 'explanation'],
        },
      },
    },
    required: ['nut_graf', 'issues'],
  },
};

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 4096;

// Origins allowed to call /api from a browser other than the worker's own page.
// The WordPress plugin runs from these. Add new newsroom domains here.
const CORS_ALLOWED_ORIGINS = new Set([
  'https://www.bangordailynews.com',
  'https://bangordailynews.com',
  'https://staging.bangordailynews.com',
  'https://bangordailynews-mar2025.newspackstaging.com',
]);

function corsHeadersFor(request) {
  const origin = request.headers.get('Origin') || '';
  if (!CORS_ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-bdn-token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function withCors(response, request) {
  const headers = corsHeadersFor(request);
  if (!Object.keys(headers).length) return response;
  const merged = new Headers(response.headers);
  for (const [k, v] of Object.entries(headers)) merged.set(k, v);
  return new Response(response.body, { status: response.status, headers: merged });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname === '/api') {
      return withCors(new Response(null, { status: 204 }), request);
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      // Inject the access token so the same-origin page can call /api without
      // the user having to paste it. Anyone who can load the page can call the
      // API, which is fine for an internal newsroom tool behind a link.
      const token = env.ACCESS_TOKEN || '';
      const page = HTML.replace(
        '</head>',
        `<script>window.BDN_STYLE_TOKEN=${JSON.stringify(token)};</script></head>`
      );
      return new Response(page, {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (request.method === 'POST' && url.pathname === '/api') {
      const apiKey = env.CLAUDE_API_KEY;
      if (!apiKey) {
        return withCors(json({ error: { message: 'CLAUDE_API_KEY secret is not configured' } }, 500), request);
      }

      const expectedToken = env.ACCESS_TOKEN;
      if (expectedToken) {
        const presented = request.headers.get('x-bdn-token') || '';
        if (!timingSafeEqual(presented, expectedToken)) {
          return withCors(json({ error: { message: 'Unauthorized.' } }, 401), request);
        }
      }

      if (env.BDN_STYLE_RL) {
        const rl = await checkRateLimit(request, env);
        if (!rl.ok) {
          return withCors(
            json({ error: { message: `Rate limit exceeded: ${rl.reason}. Try again later.` } }, 429),
            request
          );
        }
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return withCors(json({ error: { message: 'Request body must be JSON.' } }, 400), request);
      }

      const headline = (body.headline || '').trim();
      const story = (body.story || '').trim();
      if (!headline && !story) {
        return withCors(json({ error: { message: 'Provide a headline, story text, or both.' } }, 400), request);
      }

      let userContent = '';
      if (headline) userContent += `HEADLINE: ${headline}\n\n`;
      userContent += story;

      const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: body.model || DEFAULT_MODEL,
          max_tokens: MAX_TOKENS,
          system: [
            {
              type: 'text',
              text: SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          tools: [REPORT_TOOL],
          tool_choice: { type: 'tool', name: REPORT_TOOL.name },
          messages: [
            {
              role: 'user',
              content: `Analyze this copy for BDN/AP style issues:\n\n${userContent}`,
            },
          ],
        }),
      });

      const raw = await apiResponse.text();
      if (!apiResponse.ok) {
        return withCors(
          new Response(raw, {
            status: apiResponse.status,
            headers: { 'Content-Type': 'application/json' },
          }),
          request
        );
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        return withCors(json({ error: { message: `Malformed API response: ${err.message}` } }, 502), request);
      }

      const toolBlock = (parsed.content || []).find(
        (b) => b.type === 'tool_use' && b.name === REPORT_TOOL.name
      );
      if (!toolBlock) {
        return withCors(
          json({ error: { message: 'Model did not return a tool_use block.' }, raw: parsed }, 502),
          request
        );
      }

      return withCors(
        json({
          result: toolBlock.input,
          usage: parsed.usage || null,
        }),
        request
      );
    }

    return new Response('Not found', { status: 404 });
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Per-IP rate limit backed by KV. Two windows:
//   - minute bucket  (RATE_LIMIT_PER_MIN, default 20)
//   - day bucket     (RATE_LIMIT_PER_DAY, default 300)
// KV writes are eventually consistent, so this is a soft limit meant to catch
// runaway clients, not a hardened abuse defense.
async function checkRateLimit(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  const minBucket = Math.floor(now / 60_000);
  const dayBucket = Math.floor(now / 86_400_000);
  const minKey = `rl:min:${ip}:${minBucket}`;
  const dayKey = `rl:day:${ip}:${dayBucket}`;
  const perMin = parseInt(env.RATE_LIMIT_PER_MIN || '20', 10);
  const perDay = parseInt(env.RATE_LIMIT_PER_DAY || '300', 10);

  const [minRaw, dayRaw] = await Promise.all([
    env.BDN_STYLE_RL.get(minKey),
    env.BDN_STYLE_RL.get(dayKey),
  ]);
  const minCount = parseInt(minRaw || '0', 10);
  const dayCount = parseInt(dayRaw || '0', 10);

  if (minCount >= perMin) return { ok: false, reason: `${perMin}/min` };
  if (dayCount >= perDay) return { ok: false, reason: `${perDay}/day` };

  await Promise.all([
    env.BDN_STYLE_RL.put(minKey, String(minCount + 1), { expirationTtl: 120 }),
    env.BDN_STYLE_RL.put(dayKey, String(dayCount + 1), { expirationTtl: 172_800 }),
  ]);
  return { ok: true };
}
