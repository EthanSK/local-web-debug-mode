---
name: "local-web-debug-mode"
description: "Use when debugging a local web app by starting its normal dev server plus a dedicated local debug ingest server, forwarding temporary dev-only client logs there, and inspecting live NDJSON logs without asking the user to paste browser output."
allowed-tools:
  - Bash(*)
  - Read
  - Edit
  - Write
  - Glob
  - Grep
---

# Local Web Debug Mode

> **Cross-compatible**: Works with both **OpenAI Codex CLI** and **Claude Code**. This file
> follows the shared SKILL.md convention. Codex-specific UI metadata lives in `agents/openai.yaml`.

Use this skill for a Cursor-style debug loop on local web apps.
The default approach is:

1. Start the app in its normal local dev mode.
2. Start a separate lightweight local debug ingest server for runtime logs.
3. Add minimal dev-only client log forwarding from the frontend to that ingest server.
   Do this inline at the suspected code path with direct `fetch()` logging instead of editing app bootstrap files.
4. Ask the user to reproduce the issue and confirm when they are ready.
5. Read the forwarded logs from the NDJSON file or ingest server output only after the user says they reproduced it.
6. Summarize the runtime evidence, implement the most likely fix automatically unless the user asked for investigation only, and tell the user exactly what to retry.
7. If the issue is not fixed, collect a fresh repro and iterate again instead of stopping after one pass.
8. Remove the temporary instrumentation unless the user wants to keep it.

## Rules

- Prefer the Chrome DevTools MCP attached to the user's real browser first for browser inspection and UI interaction.
- Do not use Playwright by default.
- Prefer the repo's documented dev workflow over generic commands.
- In Nx repos, prefer `nx serve` or existing package scripts over framework binaries.
- Do not ask the user to paste browser console output if temporary client log forwarding can be added quickly.
- Prefer a dedicated localhost ingest server over patching the app server with ad hoc debug routes.
- Keep the instrumentation surgical, strongly typed, and dev-only.
- Use inline, callsite-local `fetch()` logging at the suspected code path.
- Do not modify `main.ts`, app config, root layouts, or other bootstrap files for this workflow unless the user explicitly asks for that broader instrumentation.
- Prefer batching logs and appending NDJSON locally over spamming the terminal.
- If you add temporary logging code, remove it before finishing unless the user asks to keep it.
- Use an explicit repro loop: wait for the user to say they reproduced the issue before interpreting logs, then implement or propose the next fix, then ask them to retry.
- Keep the user interaction explicit: ask them to reproduce the issue and reply when ready, then do not inspect the logs until they confirm.
- After each inspection, prefer trying the smallest likely fix and then immediately re-enter the repro loop if needed.
- Do not write NDJSON logs into the workspace by default. Prefer a temp directory or a fixed global Codex debug directory outside the repo.
- If you intentionally want repo-local output, verify that the exact path is already ignored before writing any logs there, and add the ignore rule first if it is missing.
- Track server ownership explicitly for the current debug run: for each app or ingest server, record whether the agent reused an existing process or started a new one.
- Never stop a preexisting server that the agent merely reused.
- Before finishing the task, stop every debug server that the agent started unless the user explicitly asked to keep it running.

## Chrome DevTools MCP Recovery

When browser inspection is part of the debug loop, try Chrome DevTools MCP before considering any fallback browser automation.

Use this recovery order when Chrome DevTools MCP is failing:

1. Call `chrome-devtools/list_pages` first.
2. If it hangs, times out, or returns `Transport closed`, check for stale `chrome-devtools-mcp` or `npm exec chrome-devtools-mcp@latest --autoConnect` processes and kill the old duplicates before retrying.
3. If the retry still fails, inspect the user's currently open browser tabs left to right. Some tabs can poison page enumeration by hanging on `Network.enable`.
4. Close or replace only the confirmed bad tab or tabs, then retry `list_pages`.
5. If a fresh Codex process can reach Chrome DevTools MCP but the current thread still returns `Transport closed`, treat the current thread's MCP transport as stale. Continue in a fresh thread or subprocess instead of blaming the browser.

Observed failure mode worth remembering:

- `chrome-devtools/list_pages` can fail even when the target localhost app is healthy, because an unrelated open tab can stall the MCP server on `Network.enable`.
- In that case the fix is usually bad-tab cleanup, not switching to Playwright.

## Prerequisites

Load the user's Node toolchain first:

```bash
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
command -v node >/dev/null 2>&1
command -v npm >/dev/null 2>&1
command -v npx >/dev/null 2>&1
```

If any of those commands fail, stop and ask the user to fix their Node/npm setup before continuing.

## Workflow

1. Inspect repo instructions first: `AGENTS.md`, `CLAUDE.md`, `README`, `package.json`, and workspace config.
2. Identify the canonical dev server command and the expected local URL.
3. Check whether each required port or health endpoint is already live before starting anything.
4. Reuse an existing dev server if it is already running and mark it as `reused`. Do not spawn duplicates blindly.
5. Start the app in its normal local dev mode only if it was not already live and mark it as `owned`.
6. Start the bundled dedicated ingest server on localhost before patching the frontend bridge, unless it is already live and healthy. Mark it as `owned` or `reused`.
7. If you intentionally choose a repo-local debug log path, verify it is already ignored. If it is not, add the exact ignore entry before the first repro run.
8. Add temporary frontend logging inline at the suspect code path.
   Post structured events with `fetch`.
   Keep the instrumentation in the same file or feature area as the suspected bug whenever possible.
9. Ask the user to reproduce the issue and tell you when the repro is complete.
10. Once the user confirms, inspect the new NDJSON log entries for that repro attempt.
11. Summarize runtime evidence, then implement the smallest likely fix if the user asked you to debug rather than only investigate.
12. Tell the user what to retry, wait for the next repro result, and do not silently inspect stale logs from an earlier attempt.
13. If the bug persists, start a fresh repro cycle and inspect only the new logs from that attempt.
14. Before the final response, remove temporary instrumentation and stop any `owned` debug servers. Verify their ports are no longer listening.

## Repro Loop

Use this loop explicitly:

1. Setup
   - Start or reuse the app server.
   - Start or reuse the ingest server.
   - Add temporary inline logging at the suspect code path.
2. Wait
   - Tell the user to reproduce the issue and reply when done.
   - Do not over-interpret stale logs from earlier attempts.
3. Inspect
   - Read only the new NDJSON entries from the latest repro window.
   - Summarize the strongest evidence first.
4. Fix
   - If the user asked for debugging, implement the smallest likely fix instead of stopping at analysis.
5. Retry
   - Tell the user exactly what to retry.
   - If the issue persists, repeat the loop with a fresh repro window instead of ending the session after one attempt.

Practical tip:

- Prefer a new `sessionId` or a cleared log file for each retry loop so you do not mix evidence from old attempts with the current repro.

## Ownership And Cleanup

Use this minimal lifecycle:

1. Discover
   - Check the expected app and ingest ports first.
   - If a server is already running, treat it as `reused`.
2. Start
   - If the agent starts a server, treat it as `owned`.
   - Record enough information to stop it later: tool session id, port, and command.
3. Debug
   - Keep temporary log forwarding only as long as the debug loop needs it.
4. Cleanup
   - On success: remove temporary instrumentation, stop all `owned` servers, and confirm the owned ports are closed.
   - On failure or interruption: if you are ending or leaving the debug workflow, still stop all `owned` servers before the final response.
   - If the user explicitly wants to keep a server alive, note that and skip teardown for that server only.

Practical rule:

- `reused` server => never stop it
- `owned` server => stop it before finishing unless the user said otherwise

## Dedicated Ingest Server

Cursor-style runtime log capture works better with a separate lightweight ingest server than with app-specific debug routes. Start the bundled script first.

Resolve the skill directory dynamically based on which agent is running:

```bash
# Works for both Codex CLI ($CODEX_HOME/skills/) and Claude Code (~/.claude/skills/)
if [ -n "$CODEX_HOME" ] && [ -d "$CODEX_HOME/skills/local-web-debug-mode" ]; then
  SKILL_DIR="$CODEX_HOME/skills/local-web-debug-mode"
elif [ -d "$HOME/.claude/skills/local-web-debug-mode" ]; then
  SKILL_DIR="$HOME/.claude/skills/local-web-debug-mode"
elif [ -d "$HOME/.codex/skills/local-web-debug-mode" ]; then
  SKILL_DIR="$HOME/.codex/skills/local-web-debug-mode"
else
  echo "Error: local-web-debug-mode skill directory not found" >&2
  exit 1
fi

export DEBUG_LOG_PORT="${DEBUG_LOG_PORT:-7242}"
export DEBUG_LOG_DIR="${DEBUG_LOG_DIR:-${TMPDIR:-/tmp}/codex-local-web-debug-mode}"

node "$SKILL_DIR/scripts/debug_ingest_server.mjs" \
  --host 127.0.0.1 \
  --port "$DEBUG_LOG_PORT" \
  --output-dir "$DEBUG_LOG_DIR"
```

Expected endpoints:

- `GET http://127.0.0.1:${DEBUG_LOG_PORT}/health`
- `POST http://127.0.0.1:${DEBUG_LOG_PORT}/ingest-client-logs`

Default output:

- `${TMPDIR:-/tmp}/codex-local-web-debug-mode/<sessionId>.ndjson`

Only fall back to an app-server debug route if a separate ingest process is genuinely blocked.

## Gitignore Safety

If you intentionally use a repo-local debug log directory, make this check before the first repro run:

```bash
git check-ignore -v "$DEBUG_LOG_DIR" "${DEBUG_LOG_DIR}/${SESSION_ID}.ndjson"
```

If nothing is reported, add an ignore entry before writing logs. Prefer the narrowest rule that matches the chosen path, for example:

- `.debug-runtime-logs/`
- `.codex/debug-runtime-logs/`
- `*.ndjson` only if broad NDJSON ignores are acceptable for that repo

## Preferred Logging Pattern

Use this shape unless the repo already has a better existing pattern:

- Frontend:
  - add a tiny inline helper or direct `fetch()` call close to the suspected code path
  - send structured events to the dedicated localhost ingest server
  - keep the helper local, dev-only, and easy to delete
  - do not modify bootstrap files for this workflow unless the user explicitly asks for broader instrumentation
- Debug ingest server:
  - accept batched JSON log events
  - append them as NDJSON to a local file
  - group by a session id passed via query param or session storage
  - keep the endpoint localhost-only and temporary

## Frontend Example

Use `references/inline-fetch-log.example.ts` for callsite-local logging.
Do not use `references/client-log-forwarding.example.ts` unless the user explicitly asks for a broader app-level bridge.
Adapt only the dev gating, ingest URL, and session id wiring to the target file.

## Tail The Logs

Use the session id to read the live runtime logs:

```bash
tail -f "${DEBUG_LOG_DIR}/${SESSION_ID}.ndjson"
```

## Repo-Specific Notes

If a repo already documents a multi-process local stack, follow that instead of forcing a generic single-command serve flow.
Record the actual commands and ports you used in your final report.

## Output Expectations

When using this skill, report:

- the dev command you used
- the app URL
- the ingest server command you used
- whether each server was `owned` or `reused`
- where you added the temporary bridge
- where the ingest server wrote the forwarded logs
- the reproduction path
- whether the user confirmed the repro before the logs were interpreted
- the key forwarded runtime failures
- the most likely failing layer before you start editing

## Notes

- The point of this skill is the workflow, not a permanent logging system.
- Prefer the smallest patch that gets reliable runtime evidence.
- Unless the user asks to keep it, temporary log forwarding should be removed after the bug is fixed.
