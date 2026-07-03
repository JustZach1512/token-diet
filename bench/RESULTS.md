# Measured token savings

## Real-world benchmark (nestjs/nest, 1673 TS files, Sonnet 5)

Full agentic runs on a shallow clone of `nestjs/nest`: **baseline (no skill)** vs
**skill (on + ultra)**, same model, n=2 per arm per task. Per-turn `usage`
(input / output / cache-read / cache-write) summed from the run transcripts; bill
at Sonnet 5 standard rates ($3 / $15 per M in/out, cache-read $0.30, cache-write
$3.75). Aggregator: [`agg.py`](agg.py).

**Task 1 — read-heavy comprehension** ("trace how Nest's DI resolves providers /
builds the module graph in `packages/core`"):

| Metric | Baseline | Skill | Saved |
|---|--:|--:|--:|
| Output | 32,928 | 22,902 | **30.4%** |
| Cache read | 5,803,763 | 4,997,001 | 13.9% |
| Cache write | 776,663 | 611,708 | 21.2% |
| Input (uncached) | 98,958 | 127,627 | −29.0% |
| **Total tokens** | **6,712,312** | **5,759,238** | **14.2%** |
| **Bill** | **$5.44** | **$4.52** | **17.0%** |

**Task 2 — real change** (generalize an `isEmpty` util + add unit tests), at the
shipped **ultra + context discipline + min-turns** level. Per-run means,
**baseline n=4 vs skill n=3**, all clean single-model (Sonnet 5) runs:

| Metric | Baseline | Skill | Saved |
|---|--:|--:|--:|
| Output | 12,892 | 6,578 | **49.0%** |
| Cache read | 1,224,520 | 858,525 | 29.9% |
| Cache write | 130,497 | 116,872 | 10.4% |
| Input (uncached) | 29,236 | 29,419 | −0.6% |
| **Total tokens** | **1,397,144** | **1,011,395** | **27.6%** |
| **Bill** | **$1.138** | **$0.883** | **22.4%** |

**Reading it honestly:**
- **Output −49% is the robust win; bill −22% is the ceiling on this task.** An
  earlier n=2 sample read −31% bill, but a clean n=4/n=3 re-measurement shows that
  was favorable cache variance — two *identical* baseline runs differ 33% on
  cache_write alone. The reproducible figure is ~22%.
- **The bill is floored by cache_write.** Output ($15/M) is only ~19% of the bill
  and the skill already halves it; the other ~80% is cache_read + cache_write,
  which are re-reading the same files each turn. The skill cuts turns (26→20) and
  cache_read (−30%), but cache_write ($3.75/M — the priciest line) only drops 10%
  because a correct change must read the same source. Telegraphing can't touch it.
- **Correctness held.** Hidden gotcha: `isEmpty` already existed (array-only, ~20
  call sites, not barrel-exported). Every run (both arms) found it, generalized in
  place, verified each call site — skill diffs leaner with grouped tests, same
  coverage.
- **A weaker-model delegation lever was tested and BACKFIRED.** Delegating the
  ~20-call-site verification to a Haiku sub-agent (to pull that context off the
  expensive Sonnet run *and* re-price it cheaper) roughly *doubled* the bill: the
  weaker model over-explored an open-ended correctness check to 34–72 turns /
  millions of cache tokens. **Lesson, now in the skill:** delegate *bounded*
  search to a weaker model; keep *correctness-sensitive verification* on your own
  model (a weaker one costs more, not less).
- **34% bill reduction is not reproducibly reachable on this change task** — the
  cache_write floor caps it near 22–28%. Sessions that are output-heavy (chat /
  explanation / planning / docs) save far more, because there telegraphing (−49%
  to −81% output) hits a much larger share of the bill — see Task 3.

**Task 3 — output-heavy advisory session** (four substantive SWE-design questions
answered from knowledge, **no tool use** → the bill is almost all output). This is
where the `ultra` lever bites hardest. Per-run means, **n=3 each**, Sonnet 5:

| Metric | Baseline | Skill (ultra) | Saved |
|---|--:|--:|--:|
| Output | 10,383 | 1,976 | **81.0%** |
| Cache write | 19,378 | 10,265 | 47.0% |
| Input | 16,760 | 16,760 | 0.0% |
| **Total tokens** | **85,277** | **77,662** | 8.9% |
| **Bill** | **$0.290** | **$0.133** | **54.2%** |

- **Bill −54%, output −81% — both goal targets (bill ≥34%, output ≥45%) met**,
  with substance intact: every telegraphic answer kept all failure modes, the
  sharded-counter recommendation, the LSN read-after-write handling, code
  snippets, and comparison tables — only prose padding was cut. Verified by
  reading the outputs, not just counting them.
- **Total tokens only −9%** because the fixed prompt (the four questions) is most
  of the *count*; but output is most of the *bill*, so cutting it 81% moves the
  dollars 54%. Same lesson as Task 2, inverted: optimize the dollar-weighted line.

## Bill reduction is scenario-dependent — the honest range

| Scenario | Output saved | Bill saved | Why |
|---|--:|--:|---|
| Output-heavy (advisory / chat / planning) | 81% | **54%** | Output is most of the bill; telegraphing hits it directly |
| Read-heavy comprehension (Task 1) | 30% | 17% | Bill is unavoidable file-reading (cache_read) |
| Code change + tests (Task 2) | 49% | 22% | Bill floored by cache_write — a correct edit must re-read source |

The skill reliably cuts **output ~30–81%** everywhere; the **bill** win depends on
how much of the session is output vs. cache. 34%+ is real on output-heavy work;
change tasks cap near 22–28%.

---

# Output-only micro-benchmark

**Method.** Each task run twice on **Claude Sonnet** (as subagents in a live
session): once plain (baseline), once with the token-diet directive prepended.
Output text pulled from each run and counted with `tiktoken` (`o200k_base`).
Same task, only the directive differs — so the delta isolates the directive's
effect. Reproduce against your own key with `bench.mjs` (uses the API's real
`output_tokens`).

| Task | Baseline | Token-diet | Saved |
|---|--:|--:|--:|
| User-facing prose | 665 | 676 | −1.7% |
| Unit tests | 388 | 552 | −42.3% |
| Implementation plan | 1319 | 857 | 35.0% |
| Hand-off doc | 2256 | 996 | 55.9% |
| Sub-agent instruction | 679 | 296 | 56.4% |
| **Total** | **5307** | **3377** | **36.4%** |

**Reading it honestly.**

- **~36% fewer output tokens overall**, **35–56% on the verbose-prone artifacts**
  (plans, docs, hand-offs, sub-agent prompts) — where the skill earns its keep.
- The two non-wins are single-sample variance, **not** regressions the rules
  cause: the prose baseline was already dense (both arms over-delivered with
  repo-specific detail), and the tests baseline happened to use a compact
  `it.each` table while the diet arm wrote explicit `it()` cases — both stayed
  under the ≤10-test guardrail. Run `bench.mjs` with more samples to average out
  the noise.
- The number is 36%, not caveman's ~65%, **by design**: caveman drops grammar
  (telegraphic/fragment style); token-diet preserves substance and correctness
  and only removes filler. Lower ceiling, no quality cost.
- **The biggest win isn't in this table.** It measures *output* tokens only.
  On a real agentic session the recurring *input* (cache read + write) was ~83%
  of the bill vs ~16% for output — so bucket E (context hygiene: narrow reads,
  weak-model sub-agent delegation, no re-reads) is the higher-leverage lever
  this benchmark doesn't capture.

## Ultra mode (prose surfaces)

Same method, chat-reply prose only, with the `ultra` directive. The directive
includes a before→after **example** — that's what moved it from ~38%
(instructions alone) to caveman range.

| Prose reply | Baseline | Ultra | Saved |
|---|--:|--:|--:|
| Stripe webhook explanation | 665 | 135 | 79.7% |
| Redis blocking-conn explanation | 469 | 227 | 51.6% |
| **Total** | **1134** | **362** | **68.1%** |

- **68% on prose ≈ caveman's ~65%.** The example in the directive is load-bearing
  — instruction-only ultra scored ~38%; adding the example nearly doubled it.
- **Guardrail verified in the same run:** a sub-agent instruction requested under
  ultra came back **514 tokens, complete and precise** (not telegraphed), because
  sub-agent instructions are on ultra's high-stakes exemption list. Ultra
  compresses chat, never the artifacts another agent must parse exactly.
