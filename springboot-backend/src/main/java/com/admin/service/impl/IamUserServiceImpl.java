package com.admin.service.impl;

import com.admin.common.dto.*;
import com.admin.common.lang.R;
import com.admin.common.utils.Md5Util;
import com.admin.entity.IamRole;
import com.admin.entity.IamUser;
import com.admin.entity.IamUserRole;
import com.admin.mapper.IamRoleMapper;
import com.admin.mapper.IamUserMapper;
import com.admin.mapper.IamUserRoleMapper;
import com.admin.service.IamUserService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class IamUserServiceImpl extends ServiceImpl<IamUserMapper, IamUser> implements IamUserService {

    private static final String AUTH_SOURCE_LOCAL = "local";
    private static final String AUTH_SOURCE_DINGTALK = "dingtalk";

    @Resource
    private IamUserMapper iamUserMapper;

    @Resource
    private IamRoleMapper iamRoleMapper;

    @Resource
    private IamUserRoleMapper iamUserRoleMapper;

    @Override
    public R getAllUsers() {
        List<IamUser> users = this.list(new LambdaQueryWrapper<IamUser>()
                .eq(IamUser::getStatus, 0)
                .orderByDesc(IamUser::getUpdatedTime, IamUser::getId));
        if (users.isEmpty()) {
            return R.ok(Collections.emptyList());
        }

        Map<Long, List<IamRole>> rolesByUserId = loadRolesByUserIds(users.stream().map(IamUser::getId).collect(Collectors.toList()));
        List<IamUserViewDto> result = users.stream()
                .map(user -> toUserView(user, rolesByUserId.getOrDefault(user.getId(), Collections.emptyList())))
                .collect(Collectors.toList());
        return R.ok(result);
    }

    @Override
    public R getUserDetail(Long id) {
        IamUser user = getRequiredUser(id);
        List<IamRole> roles = loadRolesByUserIds(Collections.singletonList(id)).getOrDefault(id, Collections.emptyList());

        IamUserDetailDto detail = new IamUserDetailDto();
        detail.setUser(toUserView(user, roles));
        detail.setRoles(roles.stream().map(this::toRoleView).collect(Collectors.toList()));
        return R.ok(detail);
    }

    @Override
    public R createUser(IamUserDto dto) {
        String authSource = normalizeAuthSource(dto.getAuthSource());
        R validationResult = validateUserPayload(
                authSource,
                dto.getEmail(),
                dto.getLocalUsername(),
                dto.getPassword(),
                dto.getDingtalkUserId(),
                null
        );
        if (validationResult.getCode() != 0) {
            return validationResult;
        }

        long now = System.currentTimeMillis();
        IamUser user = new IamUser();
        applyUserPayload(user, authSource, dto.getDisplayName(), dto.getEmail(), dto.getLocalUsername(), dto.getPassword(),
                dto.getMobile(), dto.getJobTitle(), dto.getDingtalkUserId(), dto.getDingtalkUnionId(),
                dto.getDepartmentPath(), dto.getOrgActive(), dto.getEnabled(), dto.getRemark());
        user.setCreatedTime(now);
        user.setUpdatedTime(now);
        user.setStatus(0);
        this.save(user);

        replaceUserRoles(user.getId(), dto.getRoleIds());
        return getUserDetail(user.getId());
    }

    @Override
    public R updateUser(IamUserUpdateDto dto) {
        IamUser user = getRequiredUser(dto.getId());
        String authSource = normalizeAuthSource(dto.getAuthSource());
        R validationResult = validateUserPayload(
                authSource,
                dto.getEmail(),
                dto.getLocalUsername(),
                dto.getPassword(),
                dto.getDingtalkUserId(),
                dto.getId()
        );
        if (validationResult.getCode() != 0) {
            return validationResult;
        }

        applyUserPayload(user, authSource, dto.getDisplayName(), dto.getEmail(), dto.getLocalUsername(), dto.getPassword(),
                dto.getMobile(), dto.getJobTitle(), dto.getDingtalkUserId(), dto.getDingtalkUnionId(),
                dto.getDepartmentPath(), dto.getOrgActive(), dto.getEnabled(), dto.getRemark());
        user.setUpdatedTime(System.currentTimeMillis());
        this.updateById(user);

        if (dto.getRoleIds() != null) {
            replaceUserRoles(user.getId(), dto.getRoleIds());
        }
        return getUserDetail(user.getId());
    }

    @Override
    public R deleteUser(Long id) {
        getRequiredUser(id);
        iamUserRoleMapper.delete(new LambdaQueryWrapper<IamUserRole>().eq(IamUserRole::getUserId, id));
        this.removeById(id);
        return R.ok();
    }

    @Override
    public R assignRoles(IamUserRoleAssignDto dto) {
        getRequiredUser(dto.getUserId());
        replaceUserRoles(dto.getUserId(), dto.getRoleIds());
        return getUserDetail(dto.getUserId());
    }

    private void replaceUserRoles(Long userId, List<Long> roleIds) {
        iamUserRoleMapper.delete(new LambdaQueryWrapper<IamUserRole>().eq(IamUserRole::getUserId, userId));
        if (roleIds == null || roleIds.isEmpty()) {
            return;
        }

        List<Long> distinctIds = roleIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        if (distinctIds.isEmpty()) {
            return;
        }

        List<IamRole> roles = iamRoleMapper.selectList(new LambdaQueryWrapper<IamRole>()
                .in(IamRole::getId, distinctIds)
                .eq(IamRole::getStatus, 0));
        Set<Long> validIds = roles.stream().map(IamRole::getId).collect(Collectors.toSet());
        if (validIds.size() != distinctIds.size()) {
            throw new IllegalStateException("包含无效的角色ID");
        }

        long now = System.currentTimeMillis();
        for (Long roleId : distinctIds) {
            IamUserRole mapping = new IamUserRole();
            mapping.setUserId(userId);
            mapping.setRoleId(roleId);
            mapping.setCreatedTime(now);
            mapping.setUpdatedTime(now);
            mapping.setStatus(0);
            iamUserRoleMapper.insert(mapping);
        }
    }

    private Map<Long, List<IamRole>> loadRolesByUserIds(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Collections.emptyMap();
        }

        List<IamUserRole> mappings = iamUserRoleMapper.selectList(new LambdaQueryWrapper<IamUserRole>()
                .in(IamUserRole::getUserId, userIds)
                .eq(IamUserRole::getStatus, 0));
        if (mappings.isEmpty()) {
            return Collections.emptyMap();
        }

        Map<Long, List<IamUserRole>> mappingByUser = mappings.stream()
                .collect(Collectors.groupingBy(IamUserRole::getUserId));
        Set<Long> roleIds = mappings.stream().map(IamUserRole::getRoleId).collect(Collectors.toSet());
        Map<Long, IamRole> roleMap = iamRoleMapper.selectList(new LambdaQueryWrapper<IamRole>()
                        .in(IamRole::getId, roleIds)
                        .eq(IamRole::getStatus, 0))
                .stream()
                .collect(Collectors.toMap(IamRole::getId, role -> role));

        Map<Long, List<IamRole>> result = new HashMap<>();
        for (Map.Entry<Long, List<IamUserRole>> entry : mappingByUser.entrySet()) {
            List<IamRole> roles = entry.getValue().stream()
                    .map(item -> roleMap.get(item.getRoleId()))
                    .filter(Objects::nonNull)
                    .sorted(Comparator.comparing(IamRole::getSortOrder, Comparator.nullsLast(Integer::compareTo))
                            .thenComparing(IamRole::getName, Comparator.nullsLast(String::compareTo)))
                    .collect(Collectors.toList());
            result.put(entry.getKey(), roles);
        }
        return result;
    }

    private R validateUserPayload(String authSource,
                                  String email,
                                  String localUsername,
                                  String password,
                                  String dingtalkUserId,
                                  Long excludeId) {
        if (!AUTH_SOURCE_LOCAL.equals(authSource) && !AUTH_SOURCE_DINGTALK.equals(authSource)) {
            return R.err("认证来源仅支持 local 或 dingtalk");
        }
        if (!StringUtils.hasText(email)) {
            return R.err("企业邮箱不能为空");
        }
        if (emailExists(email, excludeId)) {
            return R.err("企业邮箱已存在");
        }

        if (AUTH_SOURCE_LOCAL.equals(authSource) && !StringUtils.hasText(localUsername)) {
            return R.err("本地认证用户必须填写登录名");
        }
        if (StringUtils.hasText(localUsername) && localUsernameExists(localUsername, excludeId)) {
            return R.err("本地登录名已存在");
        }

        if (AUTH_SOURCE_DINGTALK.equals(authSource) && !StringUtils.hasText(dingtalkUserId)) {
            return R.err("钉钉认证用户必须填写 DingTalk UserId");
        }
        if (StringUtils.hasText(dingtalkUserId) && dingtalkUserIdExists(dingtalkUserId, excludeId)) {
            return R.err("DingTalk UserId 已存在");
        }

        if (AUTH_SOURCE_LOCAL.equals(authSource) && excludeId == null && !StringUtils.hasText(password)) {
            return R.err("本地认证用户必须设置密码");
        }
        return R.ok();
    }

    private void applyUserPayload(IamUser user,
                                  String authSource,
                                  String displayName,
                                  String email,
                                  String localUsername,
                                  String password,
                                  String mobile,
                                  String jobTitle,
                                  String dingtalkUserId,
                                  String dingtalkUnionId,
                                  String departmentPath,
                                  Integer orgActive,
                                  Integer enabled,
                                  String remark) {
        user.setDisplayName(displayName.trim());
        user.setEmail(email.trim().toLowerCase(Locale.ROOT));
        user.setAuthSource(authSource);
        user.setLocalUsername(trimToNull(localUsername));
        if (StringUtils.hasText(password)) {
            user.setEncryptedPassword(Md5Util.md5WithSalt(password.trim()));
        } else if (AUTH_SOURCE_DINGTALK.equals(authSource)) {
            user.setEncryptedPassword(null);
        }
        user.setMobile(trimToNull(mobile));
        user.setJobTitle(trimToNull(jobTitle));
        user.setDingtalkUserId(trimToNull(dingtalkUserId));
        user.setDingtalkUnionId(trimToNull(dingtalkUnionId));
        user.setDepartmentPath(trimToNull(departmentPath));
        user.setOrgActive(orgActive == null || orgActive == 1 ? 1 : 0);
        user.setEnabled(enabled == null || enabled == 1 ? 1 : 0);
        user.setRemark(trimToNull(remark));
    }

    private IamUser getRequiredUser(Long id) {
        IamUser user = this.getById(id);
        if (user == null || (user.getStatus() != null && user.getStatus() != 0)) {
            throw new IllegalStateException("组织用户不存在");
        }
        return user;
    }

    private boolean emailExists(String email, Long excludeId) {
        LambdaQueryWrapper<IamUser> query = new LambdaQueryWrapper<IamUser>()
                .eq(IamUser::getEmail, email.trim().toLowerCase(Locale.ROOT))
                .eq(IamUser::getStatus, 0);
        if (excludeId != null) {
            query.ne(IamUser::getId, excludeId);
        }
        return iamUserMapper.selectCount(query) > 0;
    }

    private boolean localUsernameExists(String localUsername, Long excludeId) {
        LambdaQueryWrapper<IamUser> query = new LambdaQueryWrapper<IamUser>()
                .eq(IamUser::getLocalUsername, localUsername.trim())
                .eq(IamUser::getStatus, 0);
        if (excludeId != null) {
            query.ne(IamUser::getId, excludeId);
        }
        return iamUserMapper.selectCount(query) > 0;
    }

    private boolean dingtalkUserIdExists(String dingtalkUserId, Long excludeId) {
        LambdaQueryWrapper<IamUser> query = new LambdaQueryWrapper<IamUser>()
                .eq(IamUser::getDingtalkUserId, dingtalkUserId.trim())
                .eq(IamUser::getStatus, 0);
        if (excludeId != null) {
            query.ne(IamUser::getId, excludeId);
        }
        return iamUserMapper.selectCount(query) > 0;
    }

    private String normalizeAuthSource(String authSource) {
        return StringUtils.hasText(authSource) ? authSource.trim().toLowerCase(Locale.ROOT) : "";
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private IamUserViewDto toUserView(IamUser user, List<IamRole> roles) {
        IamUserViewDto dto = new IamUserViewDto();
        BeanUtils.copyProperties(user, dto);
        dto.setRoleIds(roles.stream().map(IamRole::getId).collect(Collectors.toList()));
        dto.setRoleNames(roles.stream().map(IamRole::getName).collect(Collectors.toList()));
        return dto;
    }

    private IamRoleViewDto toRoleView(IamRole role) {
        IamRoleViewDto dto = new IamRoleViewDto();
        BeanUtils.copyProperties(role, dto);
        return dto;
    }
}
