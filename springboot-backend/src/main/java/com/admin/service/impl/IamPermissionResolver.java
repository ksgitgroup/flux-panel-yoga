package com.admin.service.impl;

import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

@Component
public class IamPermissionResolver {

    private static final Set<String> READ_ACTIONS = new HashSet<>(Arrays.asList(
            "list", "detail", "dashboard", "records", "permissions", "status", "unbound-nodes",
            "xui-targets", "tunnels", "terminal-access", "geolocate", "rules", "logs"
    ));

    public String resolveRequiredPermission(String requestUri) {
        if (requestUri == null || requestUri.isBlank()) {
            return null;
        }

        String path = requestUri.split("\\?")[0];
        String action = path.substring(path.lastIndexOf('/') + 1);

        if (path.startsWith("/api/v1/asset/")) {
            return isReadAction(action) ? "asset.read" : "asset.write";
        }
        if (path.startsWith("/api/v1/xui/")) {
            if ("sync".equals(action)) {
                return "xui.sync";
            }
            return isReadAction(action) ? "xui.read" : "xui.write";
        }
        if (path.startsWith("/api/v1/monitor/")) {
            return isReadAction(action) ? "monitor.read" : "monitor.write";
        }
        if (path.startsWith("/api/v1/node/")) {
            return "list".equals(action) ? "node.read" : "node.write";
        }
        if (path.startsWith("/api/v1/tunnel/")) {
            return isReadAction(action) ? "tunnel.read" : "tunnel.write";
        }
        if (path.startsWith("/api/v1/user/")) {
            return isReadAction(action) ? "biz_user.read" : "biz_user.write";
        }
        if (path.startsWith("/api/v1/alert/")) {
            return ("rules".equals(action) || "logs".equals(action)) ? "alert.read" : "alert.write";
        }
        if (path.startsWith("/api/v1/speed-limit/")) {
            return isReadAction(action) ? "speed_limit.read" : "speed_limit.write";
        }
        if (path.startsWith("/api/v1/portal/")) {
            return "list".equals(action) ? "portal.read" : "portal.write";
        }
        if (path.startsWith("/api/v1/config/")) {
            return "list".equals(action) ? "site_config.read" : "site_config.write";
        }
        if (path.startsWith("/api/v1/iam/user/")) {
            return isReadAction(action) ? "iam_user.read" : "iam_user.write";
        }
        if (path.startsWith("/api/v1/iam/role/")) {
            return isReadAction(action) ? "iam_role.read" : "iam_role.write";
        }
        return null;
    }

    private boolean isReadAction(String action) {
        return READ_ACTIONS.contains(action);
    }
}
