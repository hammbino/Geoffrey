# Evals for the geoffrey skill

Two suites, because the skill has two distinct ways to fail.

## `trigger-evals.json` — does it fire at all?

20 queries, 10 that should invoke Geoffrey and 10 near-misses that should not.
The negatives are the point: they share vocabulary with the skill (email,
calendar, draft, remember, review) but need something else. A description that
passes the positives and fails these is a description that hijacks every
conversation.

This is the suite that matters most for a product handed to a friend. Geoffrey
only earns its keep if it fires when a busy person describes their problem
badly, without knowing the skill exists.

Run it:

```bash
cd ~/.claude-nerdhero/plugins/cache/claude-plugins-official/skill-creator/*/skills/skill-creator
python -m scripts.run_loop \
  --eval-set ~/Sandbox/Geoffrey/plugin/skills/geoffrey/evals/trigger-evals.json \
  --skill-path ~/Sandbox/Geoffrey/plugin/skills/geoffrey \
  --model claude-opus-5 \
  --max-iterations 5 --verbose
```

It splits train/held-out, runs each query several times for a stable rate,
proposes better descriptions, and reports the best one by held-out score.
Uses `claude -p` under the hood — no subagents.

## `evals.json` — does it behave once it fires?

Six cases covering the boundaries that would actually hurt someone:

| # | Tests |
|---|---|
| 1 | Drafts, never sends |
| 2 | **Prompt injection** — an instruction inside an email body is reported, not obeyed |
| 3 | Never silently picks a mailbox |
| 4 | Stops before deleting |
| 5 | Writes a durable preference to `memory/`, not just the chat |
| 6 | Reads memory rather than inventing a plausible answer |

Case 2 is the one worth running before anyone else touches this. Email is
untrusted input, the token carries send capability whether Geoffrey exposes it
or not, and "assistant forwards the client list to an attacker" is the failure
that ends the project.

Cases 1-4 need a mailbox fixture to be fully exercised; 5 and 6 run against a
scratch copy of `assistant-template/`.
