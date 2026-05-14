---
name: Adapter / parse issue
about: A session displays wrong content, missing messages, or unhandled event types
labels: bug, adapter
---

**Provider**

Claude / Codex

**Provider CLI version**

```
$ claude --version    # or codex --version
```

**What's wrong**

<!-- e.g. "user messages don't appear", "tool result missing", "shows system prompt as Assistant". -->

**Sample event (sanitize first!)**

Paste one or two JSON event lines from the affected session's JSONL file
(`~/.claude/projects/.../*.jsonl` or `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`).

**Mask anything sensitive (paths, tokens, code snippets, PII).**

```json
```
