# BDN Style Editor

AP and house style checker for the Bangor Daily News. Reporters paste their headline and story text, and get back annotated copy with flagged issues and an accept/dismiss workflow.

Built as a single-page app served by a Cloudflare Worker that proxies requests to the Claude API (Sonnet 4.6).

## How it works

1. Reporter pastes a headline (optional) and story text into the editor
2. Claude analyzes the text against BDN/AP style rules and returns structured JSON
3. The UI highlights issues in three categories:
   - **Style violations** (red) — AP/BDN rule breaks, with the specific rule cited
   - **Tighten/clarity** (yellow) — genuinely wordy or unclear text
   - **Structure** (blue) — missing nut graf, redundant sections, attribution problems
4. A dedicated **nut graf assessment** appears for every story, confirming whether it was found and how effective it is
5. Reporters **accept or dismiss** each suggestion, then copy corrected text with one click

### Features

- **Separate headline field** — no more pipe convention; headline is evaluated against BDN headline rules automatically
- **Accept/dismiss workflow** — work through issues one by one; accepted fixes are applied when you copy
- **Copy corrected text** — one click to grab clean copy with all accepted fixes applied
- **Category filters** — toggle style, tighten, and structure issues on/off
- **Score summary** — at-a-glance quality grade (A-D) with per-category breakdown
- **Word count / read time** — word count, paragraph count, estimated read time
- **Keyboard shortcuts** — Ctrl+Enter to analyze, arrow keys (or j/k) to navigate issues, `a` to accept, `d` to dismiss
- **Auto-save** — localStorage preserves your draft across page refreshes

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
- Mandatory nut graf identification and assessment on every story
- Attribution pattern checks
- BDN-specific rule citations on every flagged issue
- 18 critical rules to minimize false positives

See `BDN_headline_rules.md` for the full headline guidelines.

## Future

`wordpress-plugin-plan.md` outlines converting this into a Gutenberg sidebar plugin so reporters can run style checks without leaving the WordPress editor.
