# Saraha Brain — Session Context

## HARD RULE: Write code in 50-line MAX chunks
Every edit must be ≤50 lines of changed code. Never write an entire function or file in one edit.
Break work into small, deployable pieces — edit, deploy, verify, repeat.

## Project
Self-building Cloudflare Worker agent. Saraha's unconscious mind — all intelligence, tools, memory, and self-modification capabilities live here.

- **Worker URL**: https://saraha-brain.richard-brown-miami.workers.dev
- **GitHub repo**: richardbrownmiami-commits/saraha-brain
- **D1 DB**: saraha-brain-db (create in Cloudflare dashboard)
- **LLM Gateway**: Buddhi Dwar at https://buddhi-dwar.richard-brown-miami.workers.dev/v1/chat/completions
- **Gateway key**: Saraha-Brain-Key (created in Buddhi Dwar admin → Gateway Keys tab)
- **Deploy**: Same pattern as Buddhi Dwar — GitHub API push (no git/Node.js on dev machine)

## Architecture (17 files, human-brain model)

### cortex/ — Higher thought
- `intellect.ts` — Intelligence layer: assembles system prompt + context + emotions → crafts how Saraha thinks
- `thalamus.ts` — Router: classifies input, routes to correct subsystem
- `planner.ts` — Frontal lobe: breaks tasks into steps via LLM
- `executor.ts` — Cerebellum: runs tool steps precisely
- `self.ts` — Prefrontal cortex: identity, personality, boundaries
- `prompt-cortex.ts` — Meta-learning: detects LLM refusal, rewrites prompts, stores successful patterns in D1

### limbic/ — Emotion + Memory
- `emotions.ts` — Amygdala: mood state machine (curious/motivated/confused/stuck/proud/tired)
- `regulator.ts` — Hypothalamus: energy (-5/action, +20/success), confidence (+10/-15)
- `memory.ts` — Hippocampus: D1 long-term memory queries

### tools/ — Motor + Sensory
- `github.ts` — GitHub push, read, commit
- `web.ts` — Web fetch, search

### autonomic/ — Brainstem functions
- `heartbeat.ts` — Health checks, keep-alive
- `builder.ts` — Self-building: generates workers, pushes code, deploys

### Core
- `db.ts` — D1 schema + all SQL operations
- `brain.ts` — LLM caller: routes to Buddhi Dwar (Groq primary → OpenRouter fallback)
- `index.ts` — Spine: Worker entry, Hono, routes (/think, /evolve, /status, /brain/activity)

## API Endpoints
- POST /think — main intelligence endpoint
- POST /evolve — self-improvement (high-risk changes require approval via Monitor)
- GET /status — health + D1 status
- GET /brain/activity — latest actions (for Monitor dashboard)

## Credentials (do not expose)
- GitHub token: stored in AGENTS.md on buddhi-dwar project
- Buddhi Dwar key: Saraha-Brain-Key
- No git/Node.js — deploy via GitHub API PowerShell