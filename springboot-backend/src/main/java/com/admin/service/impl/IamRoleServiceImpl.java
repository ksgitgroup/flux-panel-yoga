package com.admin.service.impl;

import com.admin.common.dto.*;
import com.admin.common.lang.R;
import com.admin.entity.*;
import com.admin.mapper.*;
import com.admin.service.IamRoleService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class IamRoleServiceImpl extends ServiceImpl<IamRoleMapper, IamRole> implements IamRoleService {

    private static final String DEFAULT_ROLE_SCOPE = "custom";
    private static final String ASSET_SCOPE_ALL = "ALL";
    private static final String ASSET_SCOPE_SELECTED = "SELECTED";

    @Resource
    private IamRoleMapper iamRoleMapper;

    @Resource
    private IamPermissionMapper iamPermissionMapper;

    @Resource
    private IamRolePermissionMapper iamRolePermissionMapper;

    @Resource
    private IamUserRoleMapper iamUserRoleMapper;

    @Resource
    private IamRoleAssetMapper iamRoleAssetMapper;

    @Override
    public R getAllRoles() {
        List<IamRole> roles = this.list(new LambdaQueryWrapper<IamRole>()
                .eq(IamRole::getStatus, 0)
                .orderByDesc(IamRole::getBuiltin)
                .orderByAsc(IamRole::getSortOrder, IamRole::getId));
        if (roles.isEmpty()) {
            return R.ok(Collections.emptyList());
        }

        List<Long> roleIds = roles.stream().map(IamRole::getId).collect(Collectors.toList());
        Map<Long, Integer> permissionCountMap = iamRolePermissionMapper.selectList(new LambdaQueryWrapper<IamRolePermission>()
                        .in(IamRolePermission::getRoleId, roleIds)
                        .eq(IamRolePermission::getStatus, 0))
                .stream()
                .collect(Collectors.groupingBy(IamRolePermission::getRoleId, Collectors.summingInt(item -> 1)));
        Map<Long, Integer> userCountMap = iamUserRoleMapper.selectList(new LambdaQueryWrapper<IamUserRole>()
                        .in(IamUserRole::getRoleId, roleIds)
                        .eq(IamUserRole::getStatus, 0))
                .stream()
                .collect(Collectors.groupingBy(IamUserRole::getRoleId, Collectors.summingInt(item -> 1)));
        Map<Long, Integer> assetCountMap = iamRoleAssetMapper.selectList(new LambdaQueryWrapper<IamRoleAsset>()
                        .in(IamRoleAsset::getRoleId, roleIds)
                        .eq(IamRoleAsset::getStatus, 0))
                .stream()
                .collect(Collectors.groupingBy(IamRoleAsset::getRoleId, Collectors.summingInt(item -> 1)));

        List<IamRoleViewDto> result = roles.stream()
                .map(role -> toRoleView(role,
                        userCountMap.getOrDefault(role.getId(), 0),
                        permissionCountMap.getOrDefault(role.getId(), 0),
                        assetCountMap.getOrDefault(role.getId(), 0)))
                .collect(Collectors.toList());
        return R.ok(result);
    }

    @Override
    public R getRoleDetail(Long id) {
        IamRole role = getRequiredRole(id);
        List<IamRolePermission> mappings = iamRolePermissionMapper.selectList(new LambdaQueryWrapper<IamRolePermission>()
                .eq(IamRolePermission::getRoleId, id)
                .eq(IamRolePermission::getStatus, 0));
        List<Long> permissionIds = mappings.stream()
                .map(IamRolePermission::getPermissionId)
                .distinct()
                .collect(Collectors.toList());

        List<IamPermission> permissions = permissionIds.isEmpty()
                ? Collections.emptyList()
                : iamPermissionMapper.selectBatchIds(permissionIds);

        // Load asset bindings
        List<Long> assetIds = iamRoleAssetMapper.selectList(new LambdaQueryWrapper<IamRoleAsset>()
                        .eq(IamRoleAsset::getRoleId, id)
                        .eq(IamRoleAsset::getStatus, 0))
                .stream()
                .map(IamRoleAsset::getAssetId)
                .distinct()
                .collect(Collectors.toList());

        IamRoleDetailDto detail = new IamRoleDetailDto();
        detail.setRole(toRoleView(role, getUserCount(id), permissionIds.size(), assetIds.size()));
        detail.setPermissionIds(permissionIds);
        detail.setPermissions(permissions.stream()
                .filter(item -> item.getStatus() != null && item.getStatus() == 0)
                .sorted(Comparator.comparing(IamPermission::getModuleKey, Comparator.nullsLast(String::compareTo))
                        .thenComparing(IamPermission::getSortOrder, Comparator.nullsLast(Integer::compareTo))
                        .thenComparing(IamPermission::getCode, Comparator.nullsLast(String::compareTo)))
                .map(this::toPermissionView)
                .collect(Collectors.toList()));
        detail.setAssetIds(assetIds);

        // Load assigned user IDs
        List<Long> userIds = iamUserRoleMapper.selectList(new LambdaQueryWrapper<IamUserRole>()
                        .eq(IamUserRole::getRoleId, id)
                        .eq(IamUserRole::getStatus, 0))
                .stream()
                .map(IamUserRole::getUserId)
                .distinct()
                .collect(Collectors.toList());
        detail.setUserIds(userIds);
        return R.ok(detail);
    }

    @Override
    public R createRole(IamRoleDto dto) {
        String code = normalizeCode(dto.getCode());
        if (!StringUtils.hasText(code)) {
            return R.err("角色编码不能为空");
        }
        if (existsRoleCode(code, null)) {
            return R.err("角色编码已存在");
        }

        long now = System.currentTimeMillis();
        IamRole role = new IamRole();
        role.setCode(code);
        role.setName(dto.getName().trim());
        role.setDescription(trimToNull(dto.getDescription()));
        role.setRoleScope(normalizeScope(dto.getRoleScope()));
        role.setBuiltin(0);
        role.setSortOrder(dto.getSortOrder() == null ? 100 : dto.getSortOrder());
        role.setEnabled(normalizeEnabled(dto.getEnabled()));
        role.setAssetScope(normalizeAssetScope(dto.getAssetScope()));
        role.setCreatedTime(now);
        role.setUpdatedTime(now);
        role.setStatus(0);
        this.save(role);

        replaceRolePermissions(role.getId(), dto.getPermissionIds());
        replaceRoleAssets(role.getId(), dto.getAssetScope(), dto.getAssetIds());
        return getRoleDetail(role.getId());
    }

    @Override
    public R updateRole(IamRoleUpdateDto dto) {
        IamRole role = getRequiredRole(dto.getId());
        if ("OWNER".equals(role.getCode())) {
            return R.err("超级管理员角色不允许修改");
        }
        String code = normalizeCode(dto.getCode());
        if (!StringUtils.hasText(code)) {
            return R.err("角色编码不能为空");
        }
        if (existsRoleCode(code, dto.getId())) {
            return R.err("角色编码已存在");
        }
        if (Objects.equals(role.getBuiltin(), 1) && !Objects.equals(role.getCode(), code)) {
            return R.err("系统内置角色不允许修改编码");
        }

        role.setCode(code);
        role.setName(dto.getName().trim());
        role.setDescription(trimToNull(dto.getDescription()));
        role.setRoleScope(normalizeScope(dto.getRoleScope()));
        role.setSortOrder(dto.getSortOrder() == null ? role.getSortOrder() : dto.getSortOrder());
        role.setEnabled(normalizeEnabled(dto.getEnabled()));
        role.setAssetScope(normalizeAssetScope(dto.getAssetScope()));
        role.setUpdatedTime(System.currentTimeMillis());
        this.updateById(role);

        if (dto.getPermissionIds() != null) {
            replaceRolePermissions(role.getId(), dto.getPermissionIds());
        }
        replaceRoleAssets(role.getId(), dto.getAssetScope(), dto.getAssetIds());
        return getRoleDetail(role.getId());
    }

    @Override
    public R deleteRole(Long id) {
        IamRole role = getRequiredRole(id);
        if (Objects.equals(role.getBuiltin(), 1)) {
            return R.err("系统内置角色不允许删除");
        }
        if (getUserCount(id) > 0) {
            return R.err("该角色仍有关联用户，无法删除");
        }
        iamRolePermissionMapper.delete(new LambdaQueryWrapper<IamRolePermission>().eq(IamRolePermission::getRoleId, id));
        iamRoleAssetMapper.delete(new LambdaQueryWrapper<IamRoleAsset>().eq(IamRoleAsset::getRoleId, id));
        this.removeById(id);
        return R.ok();
    }

    @Override
    public R getAllPermissions() {
        List<IamPermissionViewDto> permissions = iamPermissionMapper.selectList(new LambdaQueryWrapper<IamPermission>()
                        .eq(IamPermission::getStatus, 0)
                        .orderByAsc(IamPermission::getModuleKey, IamPermission::getSortOrder, IamPermission::getId))
                .stream()
                .map(this::toPermissionView)
                .collect(Collectors.toList());
        return R.ok(permissions);
    }

    @Override
    public R assignPermissions(IamRolePermissionAssignDto dto) {
        getRequiredRole(dto.getRoleId());
        replaceRolePermissions(dto.getRoleId(), dto.getPermissionIds());
        return getRoleDetail(dto.getRoleId());
    }

    private void replaceRolePermissions(Long roleId, List<Long> permissionIds) {
        iamRolePermissionMapper.delete(new LambdaQueryWrapper<IamRolePermission>().eq(IamRolePermission::getRoleId, roleId));
        if (permissionIds == null || permissionIds.isEmpty()) {
            return;
        }

        List<Long> distinctIds = permissionIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        if (distinctIds.isEmpty()) {
            return;
        }

        List<IamPermission> permissions = iamPermissionMapper.selectList(new LambdaQueryWrapper<IamPermission>()
                .in(IamPermission::getId, distinctIds)
                .eq(IamPermission::getStatus, 0));
        Set<Long> validIds = permissions.stream().map(IamPermission::getId).collect(Collectors.toSet());
        if (validIds.size() != distinctIds.size()) {
            throw new IllegalStateException("包含无效的权限ID");
        }

        long now = System.currentTimeMillis();
        for (Long permissionId : distinctIds) {
            IamRolePermission mapping = new IamRolePermission();
            mapping.setRoleId(roleId);
            mapping.setPermissionId(permissionId);
            mapping.setCreatedTime(now);
            mapping.setUpdatedTime(now);
            mapping.setStatus(0);
            iamRolePermissionMapper.insert(mapping);
        }
    }

    private void replaceRoleAssets(Long roleId, String assetScope, List<Long> assetIds) {
        // Clear existing asset bindings
        iamRoleAssetMapper.delete(new LambdaQueryWrapper<IamRoleAsset>().eq(IamRoleAsset::getRoleId, roleId));

        // Only insert bindings when scope is SELECTED
        if (!ASSET_SCOPE_SELECTED.equalsIgnoreCase(assetScope) || assetIds == null || assetIds.isEmpty()) {
            return;
        }

        List<Long> distinctIds = assetIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        if (distinctIds.isEmpty()) {
            return;
        }

        long now = System.currentTimeMillis();
        for (Long assetId : distinctIds) {
            IamRoleAsset binding = new IamRoleAsset();
            binding.setRoleId(roleId);
            binding.setAssetId(assetId);
            binding.setCreatedTime(now);
            binding.setUpdatedTime(now);
            binding.setStatus(0);
            iamRoleAssetMapper.insert(binding);
        }
    }

    private IamRole getRequiredRole(Long id) {
        IamRole role = this.getById(id);
        if (role == null || (role.getStatus() != null && role.getStatus() != 0)) {
            throw new IllegalStateException("角色不存在");
        }
        return role;
    }

    private boolean existsRoleCode(String code, Long excludeId) {
        LambdaQueryWrapper<IamRole> query = new LambdaQueryWrapper<IamRole>()
                .eq(IamRole::getCode, code)
                .eq(IamRole::getStatus, 0);
        if (excludeId != null) {
            query.ne(IamRole::getId, excludeId);
        }
        return iamRoleMapper.selectCount(query) > 0;
    }

    private int getUserCount(Long roleId) {
        Integer count = iamUserRoleMapper.selectCount(new LambdaQueryWrapper<IamUserRole>()
                .eq(IamUserRole::getRoleId, roleId)
                .eq(IamUserRole::getStatus, 0));
        return count == null ? 0 : count;
    }

    private IamRoleViewDto toRoleView(IamRole role, int userCount, int permissionCount, int assetCount) {
        IamRoleViewDto dto = new IamRoleViewDto();
        BeanUtils.copyProperties(role, dto);
        dto.setUserCount(userCount);
        dto.setPermissionCount(permissionCount);
        dto.setAssetCount(assetCount);
        return dto;
    }

    private IamPermissionViewDto toPermissionView(IamPermission permission) {
        IamPermissionViewDto dto = new IamPermissionViewDto();
        BeanUtils.copyProperties(permission, dto);
        return dto;
    }

    private String normalizeCode(String code) {
        return trimToNull(code) == null ? null : code.trim().toUpperCase(Locale.ROOT);
    }

    private String normalizeScope(String roleScope) {
        return StringUtils.hasText(roleScope) ? roleScope.trim().toLowerCase(Locale.ROOT) : DEFAULT_ROLE_SCOPE;
    }

    private String normalizeAssetScope(String assetScope) {
        if (ASSET_SCOPE_SELECTED.equalsIgnoreCase(assetScope)) {
            return ASSET_SCOPE_SELECTED;
        }
        return ASSET_SCOPE_ALL;
    }

    private Integer normalizeEnabled(Integer enabled) {
        return enabled == null || enabled == 1 ? 1 : 0;
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }
}
