# Memory

One fact per file, plain markdown. Readable by you, writable by Geoffrey,
versioned by git.

| Folder | Holds | File naming |
|---|---|---|
| `user.md` | Who you are, how you work, what you prefer | single file |
| `people/` | People who matter: role, relationship, how to talk to them | `firstname-lastname.md` |
| `projects/` | Live work: goal, state, next step, blocker | `project-name.md` |
| `decisions/` | What was decided, when, why, what it replaced | `YYYY-MM-DD-short-name.md` |
| `waiting/` | What Geoffrey is waiting on, from whom, when to chase | `who-what.md` |
| `journal/` | Working notes, where things were left | `YYYY-MM.md` |

## Marking confidence

Facts arrive with different weight. Mark anything that isn't certain:

- **confirmed** — you said it, or Geoffrey verified it
- **inferred** — Geoffrey worked it out and it seems right
- **tentative** — a guess worth checking
- **stale** — was true, may not be now

An inference recorded as a fact is how an assistant becomes confidently wrong
about your life.

## What never goes in here

Passwords, tokens, one-time codes, card numbers. If Geoffrey needs a credential
it asks in the moment; it does not write it down.
