#!/usr/bin/env node
// Reproduce the token-savings numbers: run each task twice on Sonnet (baseline
// vs token-diet), compare real output tokens from the API's usage field.
//
//   ANTHROPIC_API_KEY=sk-ant-... node bench/bench.mjs
//   MODEL=claude-sonnet-5 node bench/bench.mjs   # override model
//
// Thinking is disabled so we measure *response* verbosity, not reasoning depth
// (both arms share the setting, so it cancels either way).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("set ANTHROPIC_API_KEY"); process.exit(1); }
const MODEL = process.env.MODEL || "claude-sonnet-5";
const here = dirname(fileURLToPath(import.meta.url));

// The always-on directives, stripped of their HTML markers.
const DIRECTIVE = readFileSync(join(here, "..", "activation.md"), "utf8")
  .replace(/<!--.*?-->/g, "").trim();
const ULTRA = readFileSync(join(here, "..", "activation-ultra.md"), "utf8")
  .replace(/<!--.*?-->/g, "").trim();

// [name, prompt, isChat] — chat tasks also get an ultra arm.
const TASKS = [
  ["prose", "Explain to a developer, as a chat reply, how Stripe webhook signature verification works and why skipping it is dangerous.", true],
  ["tests", "Write vitest unit tests for parsePriceCents(input: string): number — parses '$1,299.50' to 129950, handles a leading $, thousands commas, optional decimal, surrounding spaces; throws Error('invalid price') on non-numeric, empty, or negative input."],
  ["plan", "Produce an implementation plan for adding Redis-backed rate limiting to an existing Express REST API: per-IP, 100 req/min, returning HTTP 429 with a Retry-After header."],
  ["handoff", "Write a handoff document for a feature you just built: a background worker that retries failed Stripe payouts up to 3 times with exponential backoff, logging each attempt."],
  ["subagent-prompt", "Write the instruction prompt you would give to a search sub-agent that must find every call site of a deprecated function legacyCharge() across a TypeScript monorepo and report each as file:line with surrounding context."],
];

async function outTokens(prompt, system) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 4096,
      thinking: { type: "disabled" },
      system: system || undefined,
      messages: [{ role: "user", content: "Respond directly with your final answer only.\n\n" + prompt }],
    }),
  });
  const j = await r.json();
  if (!j.usage) throw new Error(JSON.stringify(j).slice(0, 300));
  return j.usage.output_tokens;
}
const pct = (b, x) => `${(100*(b-x)/b).toFixed(1)}%`.padStart(7);

let tb = 0, td = 0;
console.log(`model: ${MODEL}\n${"task".padEnd(18)}${"base".padStart(7)}${"diet".padStart(7)}${"saved".padStart(8)}`);
for (const [name, prompt] of TASKS) {
  const b = await outTokens(prompt, null);
  const d = await outTokens(prompt, DIRECTIVE);
  tb += b; td += d;
  console.log(`${name.padEnd(18)}${String(b).padStart(7)}${String(d).padStart(7)}${pct(b, d)}`);
}
console.log("-".repeat(40));
console.log(`${"TOTAL".padEnd(18)}${String(tb).padStart(7)}${String(td).padStart(7)}${pct(tb, td)}`);

// Ultra arm — chat/prose surfaces only.
const chat = TASKS.filter(t => t[2]);
if (chat.length) {
  console.log(`\nultra (chat surfaces)\n${"task".padEnd(18)}${"base".padStart(7)}${"ultra".padStart(7)}${"saved".padStart(8)}`);
  for (const [name, prompt] of chat) {
    const b = await outTokens(prompt, null);
    const u = await outTokens(prompt, ULTRA);
    console.log(`${name.padEnd(18)}${String(b).padStart(7)}${String(u).padStart(7)}${pct(b, u)}`);
  }
}
