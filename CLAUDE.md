# Flux Panel Yoga Agent Guide

This repository is the main customization surface in `/Users/mac/Developer`.
Claude should treat sibling repositories as upstream references unless the user explicitly asks to modify them.

## Workspace Boundaries

- Main mutable project: `/Users/mac/Developer/flux-panel-yoga`
- Upstream/reference projects: `/Users/mac/Developer/1Panel`, `/Users/mac/Developer/jumpserver`, `/Users/mac/Developer/openclaw`, `/Users/mac/Developer/komari`, `/Users/mac/Developer/pika`, `/Users/mac/Developer/3x-ui`, `/Users/mac/Developer/homepage`
- Default rule: do not patch upstream/reference projects. Integrate them from Flux through links, adapters, APIs, webhook clients, sync jobs, or docs.

## Branch And Worktree Policy

- `dev` is the shared integration branch.
- If another agent is already using `/Users/mac/Developer/flux-panel-yoga`, or the worktree is dirty, do not switch branches in place.
- Use a separate git worktree for parallel work:

```bash
git worktree add ../flux-panel-yoga-codex-<topic> -b codex/<topic> origin/dev
```

- If the task belongs to Claude, use `claude/<topic>` instead of `codex/<topic>`.
- One feature, one branch, one worktree.
- Before merge, rebase or merge from `origin/dev`, then run the relevant verification commands.

## Merge-Friendly Rules

- Avoid broad renames or directory reshuffles while parallel work is active.
- Keep database changes additive and backward compatible.
- Do not silently rewrite or remove fields already used by the frontend.
- Prefer adding new provider-specific files over expanding shared hotspot files when possible.

Current conflict hotspots:

- `springboot-backend/src/main/java/com/admin/service/impl/MonitorServiceImpl.java`
- `springboot-backend/src/main/java/com/admin/service/impl/AssetHostServiceImpl.java`
- `springboot-backend/src/main/java/com/admin/config/DatabaseInitService.java`
- `vite-frontend/src/pages/assets.tsx`
- `vite-frontend/src/pages/xui.tsx`

If a change touches one of these hotspots, keep the diff narrowly scoped and avoid mixing unrelated refactors.

## Current Architecture Source Of Truth

- `asset_host` is the primary identity layer for servers.
- `xui_instance` and related snapshot tables are the control-plane registry for x-ui and 3x-ui style panels.
- `monitor_instance`, `monitor_node_snapshot`, and `monitor_metric_latest` are the probe integration layer for Komari and Pika.
- `portal_nav_links` and `asset_host.panel_url` are the external entry layer for 1Panel, JumpServer, OpenClaw, and other tools.
- `forward` keeps Flux-native forwarding data and may reference remote x-ui inbound snapshots.

Keep these layers stable:

1. Asset identity
2. Provider adapter / sync
3. Aggregation for dashboard/detail pages
4. Portal / entry navigation

## Code Structure Direction

The repository already has working integrations, but some orchestration files are too large. New external platform work should move toward adapter isolation.

Preferred backend direction:

- `com.admin.controller`: API endpoints and request validation
- `com.admin.service.impl`: orchestration only
- `com.admin.integration.<provider>`: HTTP clients, payload parsing, provider-specific sync logic
- `com.admin.common.dto`: view and transport DTOs
- `com.admin.entity`: persisted records and snapshots

Preferred frontend direction:

- Keep route pages under `vite-frontend/src/pages`
- Keep raw network contracts in `vite-frontend/src/api`
- Keep provider-specific widgets or cards out of `assets.tsx` when they become reusable

## Provider Mapping Rules

- 1Panel: treat as deployment and host-ops entry first. Store URL and metadata in Flux; do not fork 1Panel for Flux-specific behavior.
- JumpServer: treat as access-control and audit layer. Prefer deep links, SSO, or session launch integration over credential mirroring.
- OpenClaw: treat as AI assistant and automation control plane. Integrate through tasks, webhooks, event feeds, or links; do not couple Flux business logic to OpenClaw internals.
- x-ui and 3x-ui: keep using the existing `xui_instance` family unless protocol/API differences become large enough to justify a new provider family field.
- Komari and Pika: keep using `monitor_instance.type = komari|pika`; do not duplicate the monitor tables per provider.

## Data And Secret Handling

- Credentials stay server-side only.
- Frontend responses must remain masked or boolean-flag based for secret fields.
- Logs must not contain plaintext passwords, tokens, JWTs, TOTP secrets, or provider API keys.
- Do not store SSH root passwords or JumpServer privileged credentials in Flux unless the user explicitly designs a secret-management flow for it.

## Sync Checklist For New Integrations

When adding any new external platform integration, update all relevant layers together:

1. Database bootstrap or migration logic
2. Entity and DTO definitions
3. Controller and service contract
4. Asset detail aggregation and dashboard rollup
5. Portal or deep-link surface
6. README and this file if the architecture boundary changed

## Current Product Direction

Flux is no longer only a forwarding panel. It is evolving into:

- asset registry
- forwarding control plane
- x-ui / 3x-ui registry
- probe aggregation layer
- operations portal

Claude should preserve that direction and avoid turning Flux into a hard fork of every upstream tool in this workspace.
