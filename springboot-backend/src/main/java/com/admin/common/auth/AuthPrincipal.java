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
        return permissions.contains(permissionCode);
    }

    public Set<String> safePermissions() {
        return permissions == null ? Collections.emptySet() : permissions;
    }

    public Set<String> safeRoleCodes() {
        return roleCodes == null ? Collections.emptySet() : roleCodes;
    }
}
