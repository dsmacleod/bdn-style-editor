# BDN Style Editor

AP and house style checker for the Bangor Daily News. Paste draft copy (with optional headline), get back annotated text with flagged issues.

Built as a single-page app served by a Cloudflare Worker that proxies requests to the Claude API (Sonnet 4.6).

## How it works

1. Reporter pastes story text into the editor
2. If the first line ends with `|`, it's treated as a headline and evaluated against BDN headline rules
3. Claude analyzes the text against BDN/AP style rules and returns structured JSON
4. The UI highlights issues in three categories:
   - **Style violations** (red) — AP/BDN rule breaks
   - **Tighten/clarity** (yellow) — genuinely wordy or unclear text
   - **Structure** (blue) — missing nut graf, redundant sections, attribution problems

Click any highlight to jump to the issue details. Click any issue to jump to the highlighted text.

## Architecture

```
Browser → Cloudflare Worker (GET / serves UI, POST /api proxies to Claude) → Claude API
```

## Deployment

```bash
cd bdn-style-worker
npm install -g wrangler    # if not already installed
wrangler login
wrangler deploy
wrangler secret put CLAUDE_API_KEY   # paste your sk-ant-... key
```

## Style rules

The system prompt covers:

- BDN house style (Maine-specific terms, police/courts, politics)
- AP Style as fallback
- Headline rules with red-flag word list
- Nut graf detection
- Attribution pattern checks
- 19 critical rules to minimize false positives

See `BDN_headline_rules.md` for the full headline guidelines.

## Future

`wordpress-plugin-plan.md` outlines converting this into a Gutenberg sidebar plugin so reporters can run style checks without leaving the WordPress editor.
