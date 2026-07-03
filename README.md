# token-diet: Whole-Session Token Efficiency for Coding Agents

Always-on skill for **Claude Code, Codex, Cursor, Windsurf, Cline** — and anything
with an always-loaded context file. It trims tokens across the *entire* session —
replies, tests, docs, plans, code, context & tool use, sub-agent delegation — not
just chat prose. It preserves technical accuracy and code integrity: code,
commands, and errors stay byte-for-byte identical, and it **never drops grammar or
detail — only filler.**

**Tagline:** *"trim the fat, keep the muscle."*

## Key selling points

- **Cuts output ~30–81%; cuts the bill up to 54%** — measured on real Sonnet 5
  runs, correctness held. Savings are honestly *scenario-dependent* (range below),
  not one flat headline number.
- **Broader than prose.** Telegraphic output is only one lever. token-diet also
  enforces **context discipline** — grep-before-read, narrow reads, fewer turns,
  cheap sub-agent delegation — which is where the *bill* actually lives on agentic
  work (recurring cache tokens dwarf output).
- **Four levels:** `on` (default) · `lite` · `ultra` · `off`. **`ultra`** goes
  caveman-style telegraphic on chat — **~66–81% on prose, matching caveman** —
  while keeping code, tests, docs, and sub-agent instructions byte-precise.
- **Correctness is non-negotiable.** Hard guardrails: never trim money/auth/
  data-loss test coverage, verbatim code/commands/errors, or the reasoning a
  problem needs. Concision applies to *communication*, never to *thinking*.
- **Truly always-on.** Fires every session via a `SessionStart` hook (Claude Code)
  or an always-loaded context file (Codex `AGENTS.md`, Cursor/Windsurf/Cline
  rules) — no per-message command. `/token-diet [on|lite|ultra|off]` also works
  on demand.
- **Zero telemetry, no backend, no accounts.** One bash installer, everything
  local. ~10-second setup.

## Before / After (`ultra`, chat reply — token counts measured, `o200k_base`)

**Normal response (102 tokens):** "Great question! The reason your Stripe webhook
signature verification is failing is that you're passing the already-parsed JSON
body into `constructEvent`. Stripe computes the signature over the exact raw bytes
of the request, so once your framework has parsed the body into JSON the bytes no
longer match and verification fails. What you want to do is read the raw request
body instead — for example with `req.text()` in a Next.js route handler — and pass
that string to `constructEvent`. Let me know if you'd like a code snippet!"

**token-diet `ultra` (34 tokens, −66%):** "`constructEvent` verifies over raw
bytes → parsed JSON fails. Read raw body (`req.text()` / Buffer), pass that to
`constructEvent`. Fix at `webhook/route.ts`."

Same fix, same identifiers, same file path — just no filler. Code, tests, docs,
and sub-agent prompts are **never** telegraphed, only chat and progress notes.

## How it works

A skill body loads on-demand, so to make the behaviour *always* apply the installer
injects a short directive through a channel that fires every session regardless of
task: a `SessionStart` hook on Claude Code (its stdout becomes context), or an
always-loaded context file (`AGENTS.md`, editor rule files) everywhere else. No
manual `/token-diet` needed — same trick caveman uses.

## The honest range (real Sonnet 5 runs)

The skill reliably cuts *output* everywhere; the *bill* win depends on how much of
the session is output vs. unavoidable file-reading (cache):

| Scenario | Output | Bill | Method |
|---|--:|--:|---|
| Output-heavy (advisory / planning / explanation) | **−81%** | **−54%** | n=3 each, no tools |
| Code change + unit tests (`nestjs/nest`, 1673 files) | −49% | −22% | n=4 base / n=3 skill |
| Read-heavy comprehension | −30% | −17% | n=4 each |

Correctness held in every run (change-task runs all caught a hidden name-collision
gotcha and verified ~20 call sites; advisory answers kept every failure mode and
recommendation — only prose padding was cut). On a *change* task the bill is
floored by cache-write (a correct edit must re-read the same source), so
telegraphing — only ~19% of that bill — can't push it past ~22–28%; on
*output-heavy* work it clears 50%. Full tables + methodology:
[`bench/RESULTS.md`](bench/RESULTS.md).

## What it does

Full rules in [`SKILL.md`](SKILL.md). In short:

- **User replies** — lead with the answer, no preamble/postamble, report deltas.
- **Artifacts** — docs / memory / hand-offs / plans / comments: dense, skimmable, minimum words.
- **Tests** — key + critical/edge paths only, grouped; ≤10 per session.
- **Code** — YAGNI, concise-but-idiomatic, never cryptic.
- **Context** *(highest leverage)* — grep before you read, narrow reads, **fewer turns**, reuse context, never re-read a just-edited file.
- **Tools** — batch independent calls, stop when you can act, targeted test runs.
- **Sub-agents** — delegate broad *bounded* search to a **weaker/cheaper model** (but keep correctness-sensitive verification on your own — it over-explores); instructions detailed enough to keep quality, in as few words as possible.
- **Guardrails** — never trim correctness, money/auth/data-loss coverage, verbatim commands/errors, or the reasoning a problem needs.

## Install (always-on)

```bash
# auto-detect installed harnesses (Claude Code, Codex) and turn it on:
./install.sh

# or target one explicitly:
./install.sh -a claude       # SessionStart hook + /token-diet skill (global)
./install.sh -a codex        # ~/.codex/AGENTS.md (auto-loaded every run)
./install.sh -a cursor       # .cursor/rules/token-diet.mdc  (project)
./install.sh -a windsurf     # .windsurf/rules/token-diet.md (project)
./install.sh -a cline        # .clinerules/token-diet.md     (project)
./install.sh -a all          # all of the above
./install.sh -a print        # just print the directive to paste anywhere

./install.sh --project       # install into the current repo, not global config
./install.sh --ultra         # aggressive telegraphic level (caveman-style on chat)
./install.sh --uninstall     # remove it
```

Once published to the Vercel skills registry it also installs via
`npx skills add <your-org>/token-diet -a <harness>` (per-session `/token-diet`).

### How always-on works per harness

| Harness | Mechanism (fires every session, unconditionally) |
|---|---|
| **Claude Code** | a `SessionStart` hook prints the directive as context; `SKILL.md` also lands in `~/.claude/skills/` for `/token-diet` |
| **Codex** | the directive is a marker-fenced block in `~/.codex/AGENTS.md`, which Codex auto-loads at the start of every run |
| **Cursor / Windsurf / Cline** | an always-apply rule file in the project |
| **Anything else** | `-a print` the directive into your agent's system/context file |

The trick is the same one caveman uses: a skill body is loaded *on demand*, so
to make the behavior *always* apply you inject the directive through a channel
that fires every session regardless of the task — a hook (Claude Code) or an
always-loaded context file (`AGENTS.md`, rule files).

## Toggle

`/token-diet [on|lite|ultra|off]`, or say "token diet on/ultra/off" / "normal mode".
`lite` = communication + artifacts only. `ultra` = telegraphic on chat/progress,
artifacts stay precise (see [`SKILL.md`](SKILL.md) → Ultra mode).

## Reproduce the numbers

```bash
ANTHROPIC_API_KEY=sk-ant-... node bench/bench.mjs
```
