# dsh-delete-session

[中文](README.md) | [English](README.en.md)

A plugin for **DeepSeek Harness (DSH)** that adds permanent conversation deletion (built on the Cordis plugin architecture, verified against DSH `0.2.2-rc.5`).

## Features

- **Sidebar Menu Entry**: Adds a danger-styled **"Delete permanently…"** action to each session row's context / `…` menu (placed right after Archive).
- **Confirmation Modal**: Displays the conversation title and session ID in a confirmation dialog before deleting.
- **Safety Checks**:
  - Strictly validates `sessionId` (`^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$`) to prevent path traversal.
  - Refuses deletion with HTTP `409` (`SESSION_RUNNING`) and a localized error message if the session has an active running agent or background activity.
- **Complete Cleanup**:
  1. Disposes any idle in-memory session handle.
  2. Removes the on-disk JSONL session log directory (`~/.dsh/sessions/<project>/<sessionId>/`).
  3. Removes the projection cache (`~/.dsh/storages/session_projcache/sessions/<sessionId>.json`).
  4. Detaches the session from workspace lists, pinned lists, and archived lists, and notifies the UI to update immediately.

## Build

```bash
npm install
npm run build
```

## Installation (Example: `desktop` profile)

This plugin declares `dsh.bundle` in `package.json`, so `cordis.patch.yml` is applied automatically:

1. Install the local plugin into your `desktop` profile:

```powershell
& "C:\Users\Jenision\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "C:\Users\Jenision\.gemini\antigravity\scratch\dsh-delete-session"
```

2. Restart DeepSeek Harness to activate the plugin.
