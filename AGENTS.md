# Repo Notes

Read [CLAUDE.md](/Users/mac/Developer/flux-panel-yoga/CLAUDE.md) first.

Repository-specific rules:

- Only modify `/Users/mac/Developer/flux-panel-yoga` unless the user explicitly asks for upstream changes.
- If `dev` is dirty or another agent is using this worktree, do not switch branches here. Use a separate worktree from `origin/dev`.
- Keep schema changes additive and merge-friendly.
- Treat `asset_host` as the core server identity layer, `xui_instance` as the x-ui / 3x-ui registry, and `monitor_instance` as the Komari / Pika registry.
- Prefer adapter-style integrations over editing upstream sibling repositories.
