# Saraha Brain — Master Checkpoint List

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: BRAIN CORE ENGINE                                │
│  Target: Proposals, receipts, anti-patterns, governance,   │
│          idle cycle working                                 │
│  Where: saraha-brain worker                                 │
├─────────────────────────────────────────────────────────────┤
│  PHASE 2: MONITOR WORKER                                    │
│  Target: New worker, proposals UI, kill switch, summary,    │
│          sub-agents, notifications                          │
│  Where: saraha-monitor worker (new)                        │
├─────────────────────────────────────────────────────────────┤
│  PHASE 3: ISOLATED RAG                                      │
│  Target: 3 knowledge bases, FTS5, replace hardcoded rules  │
│  Where: All 3 projects                                     │
├─────────────────────────────────────────────────────────────┤
│  PHASE 4: APK ANDROID APP                                   │
│  Target: Android app, calls brain + monitor from one app   │
│  Where: New repo                                            │
└─────────────────────────────────────────────────────────────┘
```

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    APK (Android App)                          │
│                                                              │
│  User chats with brain → POST /think                         │
│  User asks "what did you do?" → GET /monitor/api/summary     │
│  → APK LM reads summary → reports in plain text             │
│  User approves → POST /api/proposals/approve/:id             │
│                                                              │
│  RAG: apk_knowledge (isolated, can't see other RAGs)        │
│  • Which endpoints to call                                   │
│  • How to format reports                                     │
│  • When unsure → check RAG, don't invent                    │
└──────────────────────────┬───────────────────────────────────┘
                           │
           ┌───────────────┼──────────────────┐
           │               │                  │
           ▼               ▼                  ▼
┌─────────────────────┐    ┌──────────────────────────────┐
│   BRAIN (Worker)     │    │  MONITOR (Worker)             │
│   saraha-brain       │    │  saraha-monitor               │
│                      │    │                              │
│ RAG: brain_knowledge │    │ RAG: monitor_knowledge        │
│ (isolated)           │    │ (isolated)                    │
│                      │    │                              │
│ Active mode:         │    │ Monitors brain:               │
│ /think → respond     │    │ • Reads proposals table       │
│                      │    │ • Reads authority_receipts    │
│ Idle mode (cron):    │    │ • Reads anti_patterns         │
│ 1. Check kill_switch │    │ • Reads kill switch status    │
│ 2. Check anti-       │    │                              │
│    patterns for top  │    │ Sub-agents (parallel):        │
│    failure           │    │ ├─ ActivityTrackerAgent       │
│ 3. web_search + LLM  │    │ │  tracks brain cycles       │
│    → research        │    │ ├─ ProposalVerifierAgent     │
│ 4. LLM + RAG check   │    │ │  verifies risk claims      │
│    → create proposal  │    │ └─ HealthWatcherAgent        │
│ 5. Governance gate:   │    │    checks brain health       │
│    prompt/config/tool │    │                              │
│    ≤30% auto | >30%  │    │ Endpoints:                   │
│    core/security/cron │    │ ├─ /monitor (UI dashboard)   │
│    → ALWAYS human    │    │ │  Proposals tab              │
│ 6. Execute or queue  │    │ │  Activity tab               │
│ 7. Store receipt     │    │ │  Kill switch toggle         │
│ 8. If fail → anti-   │    │ ├─ /monitor/api/summary       │
│    pattern           │    │ │  (APK reads this)           │
│ 9. Iteration memory  │    │ ├─ /monitor/api/kill-switch   │
│    check for         │    │ └─ /monitor/api/proposals     │
│    duplicates        │    │                              │
│                      │    │ Calls brain via service       │
│ D1 tables (owns):    │    │ binding to read/write:        │
│ proposals,           │    │ proposals, receipts,          │
│ authority_receipts,  │    │ kill_switch                   │
│ anti_patterns,       │    │                              │
│ brain_knowledge +    │    │ Notifications to APK:         │
│ existing tables     │    │ • Auto-approved → APK alert    │
│                      │    │ • Pending → APK alert         │
│ Kill switch:         │    │ • Duplicate blocked → APK     │
│ identity key checked │    │                              │
│ every idle cycle     │    │                              │
└──────────────────────┘    └──────────────────────────────┘
```

## Governance Gates

| Resource Type | ≤30% risk | >30% risk |
|---------------|-----------|-----------|
| prompt | Auto | Human |
| config | Auto | Human |
| tool_code | Auto | Human |
| core_architecture | **Always Human** | **Always Human** |
| security_boundary | **Always Human** | **Always Human** |
| cron_schedule | Always Human | Always Human |

---

## PHASE 1 — Brain Core Engine

### Checkpoint 1.1: Tables + Endpoints

| Task | Status | Notes |
|------|--------|-------|
| `proposals` table (diff, rollback, resource_type, risk_pct, status) | ✅ | |
| `authority_receipts` table (approved_by, outcome, metrics, prev_ref) | ✅ | |
| `anti_patterns` table (pattern, root_cause, fix, count, linked_proposal) | ✅ | |
| `GET /brain/proposals` — list all | ✅ | Returns 10 entries |
| `GET /brain/proposals/:id` — detail with diff + receipt | ✅ | |
| `POST /api/proposals/approve/:id` — approve → execute | ✅ | |
| `POST /api/proposals/deny/:id` — deny | ✅ | |
| `GET /brain/authority-receipts` — recent receipts | ✅ | Returns 7 entries |
| `GET /brain/anti-patterns` — immune system status | ✅ | |

**Done ✅** — 3 D1 tables + 6 endpoints deployed and verified. Later added: `/brain/anti-patterns`, `/brain/feedback`.

---

### Checkpoint 1.2: Governance Gates

| Task | Status | Notes |
|------|--------|-------|
| Resource type routing: prompt/config/tool_code → ≤30% auto, >30% human | ✅ | |
| Resource type routing: core/security/cron → ALWAYS human | ✅ | |
| Proposal status auto-set on route (approved/auto/pending) | ✅ | |
| Auto-approved proposal executes immediately | ✅ | |
| Pending proposal shows on Monitor | ✅ | |

**Done ✅** — `governanceGate()` helper with RAG-backed resource_type + risk_pct routing. Plus monitor healer rate-limits >3 high-risk/hr and auto-rolls back if brain unhealthy. Master cron override hard-blocks cron proposals.

---

### Checkpoint 1.3: Idle Cycle

| Task | Status | Notes |
|------|--------|-------|
| Check: was /think called in last 5 min? → skip if active | ✅ | Pre-existing busy_until mechanism |
| Check kill_switch → skip if true | ✅ | `isKillSwitchActive()` checks identity table |
| Query anti_patterns for top failure → improvement area | ✅ | |
| web_search + cheap LLM → research topic | ✅ | Brave API + DuckDuckGo fallback |
| LLM + context → generate structured proposal (diff, risk, resource_type) | ✅ | RAG context injected |
| Governance gate → auto or pending | ✅ | |
| Auto-execute: apply change, store authority_receipt | ✅ | 7 auto-approved + 32 human-approved proposals executed |
| Pending: store in proposals, notify Monitor | ✅ | |
| On failure → create anti_pattern entry | ✅ | |
| Iteration memory: check duplicates → block if matched | ✅ | |
| Success → reference in receipt for future similarity | ✅ | |
| Auto-execute approved proposals on next cycle | ✅ | Queries `status='approved' AND executed_at IS NULL` — marks executed, creates receipt, bumps happy +1 |
| Feedback injection (fbStr) into proposal prompt | ✅ | Queries last 24h approvals/denials — prompt includes "Evaluate: what worked, what user denied, adjust accordingly" |
| Master cron interval check | ✅ | Skips if `master_cron_minutes` set and interval not elapsed |
| Track last_cycle_time | ✅ | Updates identity key after each completed cycle |

**Done ✅** — 13-step idle cycle with everything above plus master cron override, auto-execution of user-approved proposals, and feedback-loop injection.

---

## PHASE 2 — Monitor Worker

### Checkpoint 2.1: New Worker + Deploy

| Task | Status | Notes |
|------|--------|-------|
| Create saraha-monitor worker (separate repo or same project) | ✅ | Separate repo: richardbrownmiami-commits/saraha-monitor |
| wrangler.toml — service binding to saraha-brain | ✅ | `BRAIN` binding |
| D1 binding to same DB (read brain tables) | ✅ | Bound to saraha-brain-db |
| Deploy and verify connection to brain | ✅ | `/status` returns alive, db, brain all true |

**Done ✅** — Worker deployed at https://saraha-monitor.richard-brown-miami.workers.dev

---

### Checkpoint 2.2: Monitor Dashboard UI

| Task | Status | Notes |
|------|--------|-------|
| `/monitor` main page — tabs layout | ✅ | Overview, Proposals, Activity, Kill Switch, Knowledge |
| Proposals tab: list proposals, risk badge, status filter | ✅ | Color-coded risk, status badges, expand detail |
| Proposal expand: title, what, how, diff viewer, research sources | ✅ | Click title to expand/collapse |
| Approve/Deny buttons on pending proposals | ✅ | Proxy to brain via service binding + healer validation |
| Auto-approved badge + receipt link | ✅ | badge-auto CSS class |
| Kill switch toggle UI | ✅ | Dedicated tab with ON/OFF toggle |
| Master cron control UI | ✅ | Dropdown: 1/2/4/10/15/30 min, 1/2/5 hrs. Brain respects this. |
| Activity tab: recent idle cycles, steps | ✅ | Table with step badges, live dot indicator |
| Logs tab: brain_logs from brain | ✅ | Activity tab shows auto/propose/research/duplicate/error logs |
| Overview: evolution card | ✅ | Shows count + list of evolved (auto-executed) proposals |
| Overview: cron activity card | ✅ | Shows current interval (master/default), last cycle timestamp |
| Knowledge tab: brain endpoints (filtered) | ✅ | Fetches brain_knowledge via BRAIN binding, hides D1 schema |
| Proposals tab: full text wrapping | ✅ | No more truncated columns — what/how/title fully readable |

**Done ✅** — Dashboard served at root `/` with auto-refresh every 8s. 5 tabs with all features above.

---

### Checkpoint 2.3: Monitor Endpoints

| Task | Status | Notes |
|------|--------|-------|
| `GET /monitor/api/summary` — APK-friendly JSON | ✅ | Proposals grouped, kill switch, last activity, anti-pattern count, master cron, last cycle time, executed count |
| `GET /monitor/api/kill-switch` — current status | ✅ | Returns `{active: bool}` |
| `POST /monitor/api/kill-switch` — toggle | ✅ | Accepts `{active: bool}`, writes to identity table |
| `GET /monitor/api/proposals` — filtered list | ✅ | Supports `?status=` filter |
| `GET /monitor/api/master-cron` — current interval | ✅ | Returns `{active, interval_minutes}` |
| `POST /monitor/api/master-cron` — set interval | ✅ | Accepts `{interval_minutes:N}` or `{active:false}` |
| `GET /monitor/api/evolution` — evolved items | ✅ | Count + list of auto-executed proposals |
| `GET /monitor/api/knowledge` — brain_knowledge proxied | ✅ | Fetches from brain via BRAIN binding, filters D1 schema |
| Healer: approve validates and checks health | ✅ | Blocks >3 high-risk/hr, saves backup, checks brain health post-approval, auto-rolls back |
| Notifications: Auto-approved → APK alert | ☐ | Phase 4 (APK reads /api/summary) |
| Notifications: Pending → APK alert | ☐ | Phase 4 (APK reads /api/summary) |
| Notifications: Duplicate blocked → APK alert | ☐ | Phase 4 (APK reads /api/summary) |

**Done ✅** — 9+ endpoints deployed. Healer + master cron + evolution added. Notifications deferred to Phase 4.

---

### Checkpoint 2.4: Sub-agents (Cloudflare Agents SDK)

| Task | Status | Notes |
|------|--------|-------|
| Install Cloudflare Agents SDK | ☐ | |
| ActivityTrackerAgent — tracks brain cycles in parallel | ☐ | |
| ProposalVerifierAgent — double-checks risk claims | ☐ | |
| HealthWatcherAgent — checks brain health status | ☐ | |
| Sub-agents spawn and report to Monitor | ☐ | |

**Done ☐** — Discussion:

---

## PHASE 3 — Isolated RAG

### Checkpoint 3.1: Knowledge Tables

| Task | Status | Notes |
|------|--------|-------|
| `brain_knowledge` table + LIKE search | ✅ | FTS5 abandoned (duplicate rows on seed); LIKE sufficient |
| `monitor_knowledge` table + LIKE search | ✅ | |
| `apk_knowledge` table + FTS5 | ☐ | Phase 4 |
| Seed data: brain identity, tools, governance rules | ✅ | 19 seed entries (added structure, feedback, healer, master cron) |
| Seed data: monitor dashboard rules, display rules | ✅ | 14 seed entries (added master cron, evolution, healer) |
| Seed data: apk endpoints, report format | ☐ | Phase 4 |
| RAG search helper function (query → rank → inject) | ✅ | `searchKnowledge()` with LIKE fallback |

**Done ✅** — Both workers have isolated RAG tables with seed data. `GET /brain/knowledge` returns 11 entries, search/filter works.

---

### Checkpoint 3.2: Replace Hardcoded Rules

| Task | Status | Notes |
|------|--------|-------|
| Governance gates read resource rules from brain_knowledge | ✅ | `governanceGate()` queries RAG first, falls back to hardcoded |
| Idle cycle queries RAG for "what should I improve" | ✅ | `searchKnowledge()` called with topic before proposal generation |
| Proposal creation injects matching RAG entries | ✅ | RAG context injected into LLM system prompt |
| Monitor UI queries own RAG for display rules | ✅ | Knowledge tab with category grouping |
| APK reads own RAG before calling endpoints | ☐ | Phase 4 |

**Done ✅** — All worker-side RAG integration complete.

---

## PHASE 4 — APK Android App

### Checkpoint 4.1: App Setup

| Task | Status | Notes |
|------|--------|-------|
| New Android project | ☐ | |
| API client: call brain `/think` | ☐ | |
| API client: call monitor `/summary` | ☐ | |
| API client: approve/deny proposals | ☐ | |
| RAG: apk_knowledge table (on device or via backend?) | ☐ | |

**Done ☐** — Discussion:

---

### Checkpoint 4.2: APK Features

| Task | Status | Notes |
|------|--------|-------|
| Chat UI: user talks to brain | ☐ | |
| Activity report: "what did brain do?" in plain text | ☐ | |
| Pending proposals: user can review + approve/deny | ☐ | |
| Notifications: brain proposals, auto-approvals | ☐ | |
| Kill switch: toggle from app | ☐ | |
| RAG check: when unsure, query apk_knowledge | ☐ | |

**Done ☐** — Discussion:

---

## Change Log

| Date | Phase | Checkpoint | Change | Reason |
|------|-------|-----------|--------|--------|
| 2026-06-02 | 1 | 1.1 | 3 D1 tables + 6 endpoints | Core governance infrastructure |
| 2026-06-02 | 1 | 1.2 | governanceGate() helper | Auto vs human approval logic |
| 2026-06-02 | 1 | 1.3 | Idle cycle rewrite | Self-improvement engine |
| 2026-06-02 | 2 | 2.1 | saraha-monitor worker created | Separate worker with D1 + service binding |
| 2026-06-02 | 2 | 2.2 | Dashboard UI with 5 tabs | Monitor dashboard at root `/` |
| 2026-06-02 | 2 | 2.3 | 6 monitor endpoints | API layer for monitor UI |
| 2026-06-02 | 3 | 3.1 | brain_knowledge + monitor_knowledge tables | Isolated RAG for each worker |
| 2026-06-02 | 3 | 3.2 | Hardcoded rules replaced with RAG queries | governanceGate(), idle cycle, monitor Knowledge tab |
| 2026-06-02 | 3 | 3.2 | Schema-awareness RAG seeds added | schema_d1_tables, schema_endpoints, schema_deployment, schema_idle_cycle, schema_service_bindings, rule_master_cron + INSERT OR REPLACE fix |
| 2026-06-02 | — | — | Governance text fix: ≤ → <= | Unicode ≤ corrupted on CF deploy, replaced with ASCII <= |
| 2026-06-02 | 2 | 2.2-2.3 | Master cron control | Kill Switch tab dropdown, /api/master-cron GET/POST, brain skips if interval not elapsed |
| 2026-06-02 | 2 | 2.2 | Proposals tab wrapping | Full text display, no more truncation. Added What/How columns |
| 2026-06-02 | 2 | 2.2 | Evolution card in Overview | Shows count + list of brain-created changes from authority_receipts |
| 2026-06-02 | 2 | 2.2 | Cron activity in Overview | Shows current interval + last cycle timestamp |
| 2026-06-02 | 2 | 2.2 | Knowledge tab: brain endpoints | Proxies brain_knowledge, filters out D1 schema, shows key+content |
| 2026-06-02 | 1 | 1.3 | Auto-execution of user-approved proposals | Brain picks up `approved` proposals on idle cycle, marks executed, logs, bumps happy |
| 2026-06-02 | 1 | 1.3 | Feedback loop (fbStr) injected into proposal prompt | Brain sees last 24h approvals/denials + "Evaluate: what worked, what user denied" |
| 2026-06-02 | 1 | 1.3 | Track last_cycle_time | Updated after each completed idle cycle, used by master cron check |
| 2026-06-02 | 1 | 1.1 | /brain/feedback endpoint | Returns approvals24h, denials24h, evolution count, kill/cron state, recent decisions |
| 2026-06-02 | 2 | 2.3 | Healer: monitor validate before approve | Blocks >3 high-risk/hr, saves backup timestamps, checks brain health after, auto-rolls back |
| 2026-06-02 | 3 | 3.1 | RAG seeds for feedback + healer | feedback_loop, healer_monitor, governance_auto_execute — brain knows the full pipeline |
| 2026-06-02 | — | — | Deploy workflow: GitHub → CF | All pushes to main trigger GitHub Actions → wrangler deploy. Source backed up on GitHub |

---

## Build Rules

1. Each checkpoint = one session of work
2. Before starting → show what you'll do
3. After finishing → update ☐ to ✅ + write discussion notes
4. If change needed mid-phase → log in Change Log with reason
5. No extra features — only what's in the checkpoint
6. If new feature needed → pause, discuss, add to Change Log
