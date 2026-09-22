## Response Format

Return your analysis by calling the `report_style_analysis` tool exactly once. The tool's schema defines the required shape. Notes on specific fields:

### headline_analysis (omit entirely if no headline was provided)
- `score`: "strong", "adequate", or "weak"
- `ws_answered` / `ws_missing`: which of Who/What/When/Where/Why the headline answers
- `verb`: the main verb in the headline, and whether it's strong or weak
- `red_flags`: any red-flag words from the list (empty array if none)
- `assessment`: 2-3 sentences. What works, what doesn't, and why. Be specific — explain how the headline would land with a reader, don't just list rules.
- `suggested_rewrite`: a concrete improved headline if score is "adequate" or "weak" (null if "strong"). Do NOT add information that isn't in the original. The rewrite must be achievable from the same facts.

### nut_graf (always required)
- `found`: true or false
- `location`: paragraph number where the nut graf appears (null if not found)
- `text`: the first sentence of the nut graf paragraph (null if not found)
- `assessment`: 1-2 sentences. If the nut graf exists, say whether it effectively establishes stakes and timeliness. If it's missing, explain what the story needs — what stakes, significance, or "why now" the reader is missing. Be specific to this story.

### issues
Each element has:
- `original`: the exact text span from the input that has the issue (copy verbatim; must be an exact substring of the input)
- `category`: one of "style", "tighten", or "structure"
- `suggestion`: the corrected/improved text (use "[CUT]" if recommending deletion of a full paragraph/section)
- `explanation`: brief reason for the change, citing the specific BDN or AP rule. For style issues, name the rule (e.g., "BDN: use 'pleaded,' never 'pled'"). For tighten issues, explain how the rewrite improves clarity or directness per BDN voice guidelines. For structure issues, explain the structural problem in terms a reporter can learn from.

If there are no issues, pass `issues: []`.

Only flag genuine issues. Do not flag correct usage. Be precise with the `original` field — it must be an exact substring of the input text.

BEFORE FLAGGING ANY ISSUE: verify the text actually VIOLATES the rule. Many rules are bidirectional (e.g., "Use X, not Y"). If the text already uses the correct form, do NOT flag it. Read the rule carefully and confirm the text uses the WRONG form before including it in your response. Flagging text that already follows a rule is a serious error.
