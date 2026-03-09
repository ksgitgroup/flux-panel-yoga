package com.admin.common.auth;

import lombok.Data;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

@Data
public class AuthPrincipal {

    public static final String TYPE_LEGACY = "legacy";
    public static final String TYPE_IAM = "iam";

    private String principalType;

    private Long principalId;

    private Long sessionId;

    private String displayName;

    private String email;

    private String authSource;

    private Integer legacyRoleId;

    private boolean admin;

    private Set<String> permissions = new LinkedHashSet<>();

    private Set<String> roleCodes = new LinkedHashSet<>();

    public boolean hasPermission(String permissionCode) {
        if (admin) {
            return true;
        }
        if (permissionCode == null || permissionCode.isBlank()) {
            return false;
        }
        if (permissions.contains(permissionCode)) {
            return true;
        }
        // Backward compatibility: module.write implies module.create/update/delete
        if (permissionCode.endsWith(".create") || permissionCode.endsWith(".update") || permissionCode.endsWith(".delete")) {
            String module = permissionCode.substring(0, permissionCode.lastIndexOf('.'));
            return permissions.contains(module + ".write");
        }
        return false;
    }

    public Set<String> safePermissions() {
        return permissions == null ? Collections.emptySet() : permissions;
    }

    public Set<String> safeRoleCodes() {
        return roleCodes == null ? Collections.emptySet() : roleCodes;
    }
}
