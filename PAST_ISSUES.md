# Past Issues

Reference notes for problems we have already hit while using or debugging this skill.
This is intentionally a scratchpad-style memory file, not formal documentation.

## 2026-04-13: Chrome DevTools MCP `list_pages` failed even though localhost was fine

### What happened

- `chrome-devtools/list_pages` hung or returned `Transport closed`.
- The localhost app tabs were fine.
- The actual problem was unrelated open browser tabs poisoning page enumeration.

### What the issue actually was

- Some tabs can hang on `Network.enable`.
- When that happens, Chrome DevTools MCP page enumeration can break even if the target app is healthy.
- In this case, the bad tabs were unrelated YouTube tabs.

### What actually helped

- Inspect open tabs left to right.
- Treat unrelated tabs as suspects, not just the localhost tab.
- Close or replace only the confirmed bad tabs.
- Retry `chrome-devtools/list_pages` after bad-tab cleanup.

### Things we tried that were not the real fix

- Killing stale `chrome-devtools-mcp` / `npm exec chrome-devtools-mcp@latest --autoConnect` processes.
- Retrying `list_pages` repeatedly without changing the browser tab state.
- Assuming the localhost app itself was the problem.

### Future ideas / reminders

- If `list_pages` fails but the app seems healthy, suspect poisoned tabs before switching to Playwright.
- A fresh Codex process can be useful to verify whether the browser is healthy again after tab cleanup.
- If this happens again, note the exact bad tabs so we can see if a pattern keeps repeating.

## 2026-04-13: Codex auth mode looked mixed between `Chatgpt` and `ApiKey`

### What happened

- Current auth state later showed `chatgpt`, but local logs showed some threads running with `ApiKey`.
- This caused concern that Codex had switched away from subscription auth and triggered charges.

### Evidence we found

- `~/.codex/auth.json` later showed `auth_mode: "chatgpt"` and `OPENAI_API_KEY: null`.
- `~/.codex/logs_2.sqlite` contained events with both `auth_mode="Chatgpt"` and `auth_mode="ApiKey"`.
- The same Codex Desktop process logged both modes.
- The `ApiKey` events logged `auth.env_openai_api_key_present=false`.

### What we do not know yet

- We do not have a proven root cause.
- We did not prove that a local config edit caused the auth mode mix.
- We did not prove that a shell environment variable caused it.

### Future ideas / reminders

- If this happens again, capture timestamps, thread ids, and the current `~/.codex/auth.json` state immediately.
- Check `~/.codex/logs_2.sqlite` for `auth_mode` entries before restarting things.
- Treat this as a Codex Desktop/session-state issue unless stronger evidence points somewhere else.
