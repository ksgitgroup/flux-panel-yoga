package com.admin.service.impl;

import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

@Component
public class IamPermissionResolver {

    private static final Set<String> READ_ACTIONS = new HashSet<>(Arrays.asList(
            "list", "detail", "dashboard", "records", "permissions", "status", "unbound-nodes",
            "xui-targets", "tunnels", "terminal-access", "geolocate", "rules", "logs",
            "overview", "trend", "top-users", "top-forwards", "peak-hours", "protocol-distribution",
            "anomalies", "stats", "summary", "history", "runtime-status", "latest-batch",
            "node-provider-detail", "komari-ping-task-detail", "protocol-directory", "data",
            "latest-by-asset", "latency-matrix", "unread", "config", "members", "options", "me"
    ));

    private static final Set<String> CREATE_ACTIONS = new HashSet<>(Arrays.asList(
            "create", "copy", "provision", "provision-dual", "save", "install", "add"
    ));

    private static final Set<String> DELETE_ACTIONS = new HashSet<>(Arrays.asList(
            "delete", "force-delete", "clear", "delete-node", "remove"
    ));

    public String resolveRequiredPermission(String requestUri) {
        if (requestUri == null || requestUri.isBlank()) {
            return null;
        }

        String path = requestUri.split("\\?")[0];
        String action = path.substring(path.lastIndexOf('/') + 1);

        if (path.startsWith("/api/v1/asset/")) {
            return resolveAction("asset", action);
        }
        if (path.startsWith("/api/v1/xui/")) {
            if ("sync".equals(action)) {
                return "xui.sync";
            }
            return resolveAction("xui", action);
        }
        if (path.startsWith("/api/v1/monitor/")) {
            return resolveAction("monitor", action);
        }
        if (path.startsWith("/api/v1/onepanel/")) {
            return resolveAction("onepanel", action);
        }
        if (path.startsWith("/api/v1/node/")) {
            return resolveAction("node", action);
        }
        if (path.startsWith("/api/v1/tunnel/")) {
            return resolveAction("tunnel", action);
        }
        if (path.startsWith("/api/v1/user/")) {
            return resolveAction("biz_user", action);
        }
        if (path.startsWith("/api/v1/alert/")) {
            return resolveAction("alert", action);
        }
        if (path.startsWith("/api/v1/speed-limit/")) {
            return resolveAction("speed_limit", action);
        }
        if (path.startsWith("/api/v1/portal/")) {
            return resolveAction("portal", action);
        }
        if (path.startsWith("/api/v1/config/")) {
            return resolveAction("site_config", action);
        }
        if (path.startsWith("/api/v1/iam/user/")) {
            return resolveAction("iam_user", action);
        }
        if (path.startsWith("/api/v1/iam/role/")) {
            return resolveAction("iam_role", action);
        }
        if (path.startsWith("/api/v1/forward/")) {
            return resolveAction("forward", action);
        }
        if (path.startsWith("/api/v1/protocol/")) {
            return resolveAction("protocol", action);
        }
        if (path.startsWith("/api/v1/tag/")) {
            return resolveAction("tag", action);
        }
        if (path.startsWith("/api/v1/audit/")) {
            return resolveAction("audit", action);
        }
        if (path.startsWith("/api/v1/notification/")) {
            return resolveAction("notification", action);
        }
        if (path.startsWith("/api/v1/topology/")) {
            return resolveAction("topology", action);
        }
        if (path.startsWith("/api/v1/backup/")) {
            return resolveAction("backup", action);
        }
        if (path.startsWith("/api/v1/ip-quality/")) {
            return resolveAction("ip_quality", action);
        }
        if (path.startsWith("/api/v1/traffic-analysis/")) {
            return resolveAction("traffic_analysis", action);
        }
        return null;
    }

    private String resolveAction(String module, String action) {
        if (READ_ACTIONS.contains(action)) {
            return module + ".read";
        }
        if (CREATE_ACTIONS.contains(action)) {
            return module + ".create";
        }
        if (DELETE_ACTIONS.contains(action)) {
            return module + ".delete";
        }
        // Default: update (includes update, batch-update, pause, resume, toggle, assign-*, rotate-token, etc.)
        return module + ".update";
    }
}
