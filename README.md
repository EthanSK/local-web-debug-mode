# Local Web Debug Mode

**An AI agent skill that gives Claude Code and Codex CLI a Cursor-style debug loop for local web apps -- no manual console copy-paste required.**

---

## The Problem

When an AI coding agent hits a runtime bug in your web app, it's blind. It can read your source code, but it can't see what's actually happening in the browser. The usual workaround -- "paste the browser console output" -- breaks your flow and wastes time.

## The Solution

This skill gives your AI agent **live access to browser runtime logs** by temporarily wiring up a lightweight log-forwarding bridge. The agent starts a local ingest server, instruments your frontend with a few lines of dev-only code, and reads the logs directly as NDJSON -- all without touching your production code or requiring browser extensions.

---

## How It Works

```
 Your Browser                    Ingest Server (port 7242)         AI Agent
 +-----------------+             +----------------------+          +-----------+
 |                 |   fetch()   |                      |   read   |           |
 | console.log     | ----------> | /ingest-client-logs  | -------> | Diagnose  |
 | console.error   |             |                      |          | & Fix     |
 | window.onerror  |             | Appends NDJSON to    |          |           |
 | unhandled       |             | .debug-runtime-logs/ |          | Auto-     |
 | rejections      |             |                      |          | cleanup   |
 +-----------------+             +----------------------+          +-----------+
                                       |
                                       v
                              session-abc.ndjson
```

**The debug loop:**

1. Agent starts your app's dev server (or reuses an existing one)
2. Agent starts a dedicated ingest server on `127.0.0.1:7242`
3. Agent adds a temporary frontend bridge that forwards runtime logs via `fetch()`
4. **You reproduce the bug** and tell the agent when you're done
5. Agent reads only the fresh NDJSON logs from that repro attempt
6. Agent diagnoses the issue and applies the smallest likely fix
7. You retry -- if it's not fixed, the loop repeats with fresh logs
8. Agent removes all temporary instrumentation when done

---

## What It Captures

| Source | Events |
|---|---|
| `console.*` | `log`, `info`, `warn`, `error`, `debug` |
| `window` `error` event | Uncaught exceptions with message and stack trace |
| `window` `unhandledrejection` event | Unhandled promise rejections |

All events are batched in memory and flushed every 200ms to avoid spamming the ingest server. Original `console` behavior is preserved -- your browser DevTools still work normally.

---

## Installation

### Claude Code

```bash
claude skill add --name local-web-debug-mode \
  https://github.com/EthanSK/local-web-debug-mode
```

### OpenAI Codex CLI

```bash
codex skill add --name local-web-debug-mode \
  https://github.com/EthanSK/local-web-debug-mode
```

The skill installs into `~/.claude/skills/` or `$CODEX_HOME/skills/` respectively and resolves its own path at runtime.

---

## Usage

Once installed, invoke the skill when you're debugging a local web app:

```
Use local-web-debug-mode to debug my app -- the login form
submits but nothing happens.
```

Or use the default prompt from the skill directly:

```
Use $local-web-debug-mode to start my local app, spin up the
dedicated local debug ingest server, add temporary client log
forwarding, explicitly wait for me to say I reproduced the issue,
inspect only the fresh NDJSON logs from that repro, implement
the likely fix automatically, and then ask me to retry until the
bug is resolved.
```

The agent handles the rest -- starting servers, instrumenting code, reading logs, and cleaning up.

---

## Repository Structure

```
.
├── SKILL.md                                  # Skill definition (the agent reads this)
├── agents/
│   └── openai.yaml                           # Codex CLI metadata
├── scripts/
│   └── debug_ingest_server.mjs               # Standalone Node.js ingest server
└── references/
    └── client-log-forwarding.example.ts      # Reference frontend bridge
```

---

## Requirements

- **Node.js** (any recent LTS version) -- the ingest server is a zero-dependency Node script
- **Claude Code** or **OpenAI Codex CLI** with skill support
- A local web app with a dev server

---

## Configuration

The ingest server respects two environment variables:

| Variable | Default | Description |
|---|---|---|
| `DEBUG_LOG_PORT` | `7242` | Port for the ingest server |
| `DEBUG_LOG_DIR` | `$PWD/.debug-runtime-logs` | Directory for NDJSON log files |

---

## Design Principles

- **Temporary by default** -- all instrumentation is removed when the debug session ends
- **Surgical** -- the frontend bridge is a small, dev-only snippet; no production code is modified
- **Explicit repro loop** -- the agent waits for you to reproduce the bug before reading logs, avoiding stale data
- **Server ownership tracking** -- the agent tracks which servers it started vs. reused, and only stops what it owns
- **Zero dependencies** -- the ingest server uses only Node.js built-in modules

