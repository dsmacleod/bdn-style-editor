# BDN Style Editor → WordPress Plugin Plan

## Overview

Convert the existing BDN Style Editor (single-page HTML app + Cloudflare Worker) into a WordPress/Gutenberg sidebar plugin for the Newspack CMS. Reporters and editors can analyze post content for BDN/AP style issues without leaving the editor.

## Current Architecture

```
bdn-style-editor.html  →  Cloudflare Worker (/api)  →  Claude API
     (frontend)              (proxy + host)
```

## Target Architecture

```
Gutenberg Sidebar Panel  →  Cloudflare Worker (/api)  →  Claude API
   (WP plugin JS)              (existing, no changes)
```

Keep the Cloudflare Worker as the API proxy. No backend WordPress changes needed for MVP.

## Plugin Structure

```
bdn-style-editor/
├── bdn-style-editor.php          # Plugin header, enqueue scripts
├── src/
│   ├── index.js                   # registerPlugin, sidebar panel
│   ├── components/
│   │   ├── StylePanel.js          # Main sidebar component
│   │   ├── IssueList.js           # Issues sidebar list
│   │   └── AnnotatedText.js       # Highlighted text display (modal)
│   ├── api.js                     # Fetch to Worker, parse response
│   ├── prompt.js                  # System prompt (exported from current HTML)
│   └── filters.js                 # Client-side false-positive filters
├── build/                         # Compiled output (wp-scripts)
├── package.json
└── readme.txt
```

## Implementation Steps

### Step 1: Plugin scaffold and build tooling

- `@wordpress/scripts` for build (standard WP block plugin toolchain)
- `@wordpress/plugins`, `@wordpress/edit-post`, `@wordpress/components` as dependencies
- Plugin PHP file: register script, enqueue on `enqueue_block_editor_assets`
- Settings page or `wp_options` entry for Worker URL (defaults to current Cloudflare URL)

### Step 2: Gutenberg sidebar panel

- Register a `PluginSidebar` with icon in the editor toolbar
- Panel contains:
  - "Analyze" button — pulls current post content from `wp.data.select('core/editor').getEditedPostContent()`
  - Strip HTML tags / block markup to get plain text for analysis
  - Spinner and status message during API call
  - Issue count badge on the sidebar icon when results are available

### Step 3: Port the analysis logic

- Extract system prompt from `bdn-style-editor.html` into `prompt.js`
- Extract API call + JSON parsing into `api.js`
- Port the client-side false-positive filter into `filters.js`
- Point fetch at the existing Cloudflare Worker URL

### Step 4: Results display

- **Issue list in sidebar**: Each issue as a collapsible card (category color, original text, suggestion, explanation). This is the primary view — it fits naturally in the sidebar width.
- **Annotated text in modal**: "View annotated text" button opens a full-width modal (`@wordpress/components` Modal) showing the highlighted text with clickable spans. This is the secondary view for seeing issues in context.
- Click issue → scrolls/highlights in modal. Click highlight → expands issue in sidebar.

### Step 5: Headline handling

- Auto-detect the post title from `wp.data.select('core/editor').getEditedPostAttribute('title')`
- Prepend it to the body text with a pipe (`|`) before sending to the API, so headline rules apply automatically
- Reporter doesn't need to think about it

### Step 6: Optional enhancements (post-MVP)

- **Auto-analyze on save/preview**: Run analysis when the reporter hits "Save Draft" or "Preview" — show a badge if issues are found
- **Settings panel**: Admin page to configure Worker URL and toggle auto-analyze
- **Per-issue "Apply fix" button**: For simple text replacements, offer a one-click fix that patches the post content directly (requires mapping issue offsets back to Gutenberg blocks — nontrivial)
- **WP REST endpoint**: Move the API proxy into WordPress itself (`register_rest_route`) so the plugin is fully self-contained. Store Claude API key in `wp_options`. Eliminates Cloudflare Worker dependency.

## Dependencies

- `@wordpress/scripts` (build)
- `@wordpress/plugins` (sidebar registration)
- `@wordpress/edit-post` (PluginSidebar)
- `@wordpress/components` (Panel, Button, Spinner, Modal)
- `@wordpress/data` (access post content and title)
- Existing Cloudflare Worker (no changes needed)

## What Does NOT Change

- The system prompt (all BDN/AP rules, nut graf check, headline rules)
- The Cloudflare Worker proxy
- The Claude model and parameters
- The client-side false-positive filter logic

## Estimated Effort

| Step | Time |
|------|------|
| 1. Scaffold + build | 1-2 hours |
| 2. Sidebar panel | 2-3 hours |
| 3. Port analysis logic | 1 hour |
| 4. Results display | 3-4 hours |
| 5. Headline auto-detect | 30 min |
| **MVP total** | **~1 day** |
| 6. Enhancements | 1-2 days additional |

## CORS Note

The Cloudflare Worker currently doesn't set CORS headers (it serves its own HTML, so same-origin). When called from the WordPress admin (different origin), the Worker will need CORS headers added to `POST /api` responses:

```js
headers: {
  'Access-Control-Allow-Origin': 'https://bangordailynews.com',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
}
```

Plus handle `OPTIONS` preflight. This is a ~10-line change to `worker.js`.
