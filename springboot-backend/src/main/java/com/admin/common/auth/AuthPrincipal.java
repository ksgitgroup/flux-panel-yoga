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

    /** 资产范围: ALL=可看全部资产, SELECTED=只看指定资产 */
    private String assetScope = "ALL";

    /** 当 assetScope=SELECTED 时，可访问的资产ID集合（聚合自所有角色） */
    private Set<Long> accessibleAssetIds = new LinkedHashSet<>();

    /**
     * 检查当前用户是否可以访问指定资产
     */
    public boolean canAccessAsset(Long assetId) {
        if (admin || "ALL".equals(assetScope)) {
            return true;
        }
        return assetId != null && accessibleAssetIds.contains(assetId);
    }

    /**
     * 获取可访问资产ID集合，null 表示不限制（全部可见）
     */
    public Set<Long> getEffectiveAssetIds() {
        if (admin || "ALL".equals(assetScope)) {
            return null; // null = no restriction
        }
        return accessibleAssetIds == null ? Collections.emptySet() : accessibleAssetIds;
    }

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
