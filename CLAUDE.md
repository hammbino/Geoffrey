# Working on Geoffrey

This repository builds Geoffrey. It is not itself an instance of Geoffrey —
`assistant-template/` is the thing people get.

Read `docs/distribution-research.md` first. It carries the decisions: why local
before hosted, why a repo is the memory substrate, and what Google's OAuth
verification costs.

## The three pieces

- `assistant-template/` — cloned into a private repo per person. Keep it
  user-agnostic and free of anyone's name.
- `plugin/skills/geoffrey/SKILL.md` — **one** skill. The previous version of
  this project had seven, mirrored into three directories, and keeping them in
  sync consumed more effort than the skills delivered. If something feels like
  it needs a second skill, first try making the one skill better.
- `mcp/` — the MCP server. Moved in from the archived repo
  (`hammbino/Geoffrey-archive`) on 2026-09-20 at its Slice 2 state: mail,
  labels, drafts, calendar, and an unproven Microsoft provider. This copy is
  canonical now. Only the transport is throwaway; the account registry and
  provider code port directly to a hosted version.

## Boundaries

- No recipient's name, business, or workflow in any of the three pieces. That
  was the previous version's mistake and it made the thing unshippable to a
  second person.
- Credentials live in `~/.geoffrey/accounts.json`, chmod 600, outside this
  repo. Never commit a client secret, token, or `accounts.json`.
- Don't add a send tool. See rule 5 in `README.md`.

## Before saying something works

Run it. `mcp/smoke-test.mjs` exercises the tool list, a missing account, an
unknown account, a real search, and a real fetch. "It should work" is not a
result.
