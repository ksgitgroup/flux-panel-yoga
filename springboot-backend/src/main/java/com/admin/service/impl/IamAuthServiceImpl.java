package com.admin.service.impl;

import com.admin.common.auth.AuthContext;
import com.admin.common.auth.AuthPrincipal;
import com.admin.common.dto.IamDingtalkLoginDto;
import com.admin.common.lang.R;
import com.admin.common.utils.JwtUtil;
import com.admin.entity.*;
import com.admin.mapper.*;
import com.admin.service.IamAuthService;
import com.admin.service.RuntimeConfigService;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class IamAuthServiceImpl implements IamAuthService {

    private static final Logger log = LoggerFactory.getLogger(IamAuthServiceImpl.class);
    private static final String AUTH_SOURCE_DINGTALK = "dingtalk";
    private static final String AUTH_SOURCE_LOCAL = "local";
    private static final long SESSION_TOUCH_INTERVAL_MILLIS = 60 * 1000L;
    private static final String DINGTALK_AUTHORIZE_ENDPOINT = "https://login.dingtalk.com/oauth2/auth";
    private static final String DINGTALK_USER_ACCESS_TOKEN_ENDPOINT = "https://api.dingtalk.com/v1.0/oauth2/userAccessToken";
    private static final String DINGTALK_CURRENT_USER_ENDPOINT = "https://api.dingtalk.com/v1.0/contact/users/me";
    private static final Set<String> READ_ACTIONS = new HashSet<>(Arrays.asList(
            "list", "detail", "dashboard", "records", "permissions", "status", "unbound-nodes",
            "xui-targets", "tunnels", "terminal-access", "geolocate"
    ));

    @org.springframework.beans.factory.annotation.Value("${iam-session-expire-hours:12}")
    private long iamSessionExpireHours;

    @Resource
    private RuntimeConfigService runtimeConfigService;

    @Resource
    private RestTemplate restTemplate;

    @Resource
    private IamUserMapper iamUserMapper;

    @Resource
    private IamRoleMapper iamRoleMapper;

    @Resource
    private IamPermissionMapper iamPermissionMapper;

    @Resource
    private IamUserRoleMapper iamUserRoleMapper;

    @Resource
    private IamRolePermissionMapper iamRolePermissionMapper;

    @Resource
    private IamSessionMapper iamSessionMapper;

    @Resource
    private IamLoginAuditMapper iamLoginAuditMapper;

    @Resource
    private IamRoleAssetMapper iamRoleAssetMapper;

    @Resource
    private IamUserAssetMapper iamUserAssetMapper;

    @Resource
    private PanelTokenService panelTokenService;

    @Override
    public R getAuthOptions() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("authMode", getConfigValue("iam_auth_mode", "hybrid"));
        data.put("localAdminEnabled", isConfigEnabled("iam_local_admin_enabled", true));
        boolean dingtalkEnabled = isConfigEnabled("dingtalk_oauth_enabled", false);
        data.put("dingtalkOauthEnabled", dingtalkEnabled);
        data.put("dingtalkConfigured", isDingtalkConfigured());
        data.put("dingtalkClientIdConfigured", StringUtils.hasText(getConfigValue("dingtalk_client_id", "")));
        return R.ok(data);
    }

    @Override
    public R getDingtalkAuthorizeUrl(String channel) {
        if (!isConfigEnabled("dingtalk_oauth_enabled", false)) {
            return R.err("钉钉登录未启用");
        }
        if (!isDingtalkConfigured()) {
            return R.err("钉钉登录配置不完整");
        }

        String clientId = getConfigValue("dingtalk_client_id", "");
        String redirectUri = getConfigValue("dingtalk_redirect_uri", "");
        String normalizedChannel = normalizeChannel(channel);
        String state = panelTokenService.generateStateToken(normalizedChannel);
        String authorizeUrl = DINGTALK_AUTHORIZE_ENDPOINT
                + "?redirect_uri=" + urlEncode(redirectUri)
                + "&response_type=code"
                + "&client_id=" + urlEncode(clientId)
                + "&scope=openid"
                + "&prompt=consent"
                + "&state=" + urlEncode(state);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("authorizeUrl", authorizeUrl);
        data.put("state", state);
        data.put("redirectUri", redirectUri);
        data.put("channel", normalizedChannel);
        return R.ok(data);
    }

    @Override
    public R loginWithDingtalkCode(IamDingtalkLoginDto dto, HttpServletRequest request) {
        if (!isConfigEnabled("dingtalk_oauth_enabled", false)) {
            return R.err("钉钉登录未启用");
        }
        if (!isDingtalkConfigured()) {
            return R.err("钉钉登录配置不完整");
        }

        Map<String, Object> statePayload = panelTokenService.validateStateToken(dto.getState().trim());
        if (statePayload == null) {
            return R.err("钉钉登录状态已失效，请重试");
        }

        String loginChannel = String.valueOf(statePayload.getOrDefault("channel", "web"));
        JSONObject userAccessToken = exchangeUserAccessToken(dto.getAuthCode().trim());
        String accessToken = extractFirstNonBlank(userAccessToken, "accessToken", "access_token");
        if (!StringUtils.hasText(accessToken)) {
            writeLoginAudit(null, AUTH_SOURCE_DINGTALK, loginChannel, null, null, null,
                    getRemoteIp(request), getUserAgent(request), 0, "token_exchange_failed", "钉钉 access token 获取失败");
            return R.err("钉钉 access token 获取失败");
        }

        JSONObject profile = fetchCurrentUserProfile(accessToken);
        String email = normalizeEmail(extractFirstNonBlank(profile, "email", "orgEmail", "org_email"));
        String unionId = trimToNull(extractFirstNonBlank(profile, "unionId", "union_id"));
        String displayName = trimToNull(extractFirstNonBlank(profile, "nick", "name", "displayName", "display_name"));
        String mobile = trimToNull(extractFirstNonBlank(profile, "mobile"));
        String dingtalkUserId = trimToNull(extractFirstNonBlank(profile, "userId", "userid", "staffId", "openId", "open_id"));
        String jobTitle = trimToNull(extractFirstNonBlank(profile, "title", "jobTitle", "job_title"));
        String departmentPath = trimToNull(extractFirstNonBlank(profile, "deptName", "departmentName", "department_path"));

        if (!StringUtils.hasText(email)) {
            writeLoginAudit(null, AUTH_SOURCE_DINGTALK, loginChannel, displayName, null, unionId,
                    getRemoteIp(request), getUserAgent(request), 0, "missing_email", "钉钉用户未返回企业邮箱");
            return R.err("钉钉用户缺少企业邮箱，无法登录");
        }
        if (!isEmailDomainAllowed(email)) {
            writeLoginAudit(null, AUTH_SOURCE_DINGTALK, loginChannel, displayName, email, unionId,
                    getRemoteIp(request), getUserAgent(request), 0, "email_domain_rejected", "企业邮箱域名不在允许范围内");
            return R.err("企业邮箱域名不在允许范围内");
        }

        IamUser user = resolveIamUser(email, unionId);
        if (user == null) {
            // Auto-provision: create IAM user on first DingTalk login (enabled=0, pending admin approval)
            user = autoProvisionDingtalkUser(email, displayName, unionId, dingtalkUserId, mobile, jobTitle, departmentPath);
            writeLoginAudit(user.getId(), AUTH_SOURCE_DINGTALK, loginChannel, displayName, email, unionId,
                    getRemoteIp(request), getUserAgent(request), 0, "auto_provisioned", "首次钉钉登录，账号已自动创建待审批");
            return R.err(1001, "账号已自动创建，等待管理员审批后即可登录");
        }
        if (!AUTH_SOURCE_DINGTALK.equalsIgnoreCase(user.getAuthSource())) {
            writeLoginAudit(user.getId(), AUTH_SOURCE_DINGTALK, loginChannel, displayName, email, unionId,
                    getRemoteIp(request), getUserAgent(request), 0, "auth_source_mismatch", "该用户未配置为钉钉认证");
            return R.err("该组织用户未配置为钉钉认证");
        }
        if (!Objects.equals(user.getEnabled(), 1)) {
            writeLoginAudit(user.getId(), AUTH_SOURCE_DINGTALK, loginChannel, displayName, email, unionId,
                    getRemoteIp(request), getUserAgent(request), 0, "user_pending", "账号待审批");
            return R.err(1001, "账号待管理员审批，请联系管理员启用您的账号");
        }
        if (!Objects.equals(user.getOrgActive(), 1)) {
            writeLoginAudit(user.getId(), AUTH_SOURCE_DINGTALK, loginChannel, displayName, email, unionId,
                    getRemoteIp(request), getUserAgent(request), 0, "org_inactive", "组织用户已被标记为离组或停用");
            return R.err("组织用户已离组或被停用，无法登录");
        }

        long now = System.currentTimeMillis();
        user.setDisplayName(StringUtils.hasText(displayName) ? displayName : user.getDisplayName());
        user.setEmail(email);
        user.setMobile(StringUtils.hasText(mobile) ? mobile : user.getMobile());
        user.setJobTitle(StringUtils.hasText(jobTitle) ? jobTitle : user.getJobTitle());
        user.setDingtalkUnionId(unionId);
        if (StringUtils.hasText(dingtalkUserId)) {
            user.setDingtalkUserId(dingtalkUserId);
        }
        if (StringUtils.hasText(departmentPath)) {
            user.setDepartmentPath(departmentPath);
        }
        user.setOrgActive(1);
        user.setLastOrgSyncAt(now);
        user.setLastLoginAt(now);
        user.setUpdatedTime(now);
        iamUserMapper.updateById(user);

        AuthPrincipal principal = loadIamPrincipal(user, null);
        if (principal == null || principal.safeRoleCodes().isEmpty()) {
            writeLoginAudit(user.getId(), AUTH_SOURCE_DINGTALK, loginChannel, displayName, email, unionId,
                    getRemoteIp(request), getUserAgent(request), 0, "missing_roles", "组织用户未分配有效角色");
            return R.err("组织用户未分配有效角色，无法登录");
        }

        IamSession session = new IamSession();
        session.setUserId(user.getId());
        session.setAuthSource(AUTH_SOURCE_DINGTALK);
        session.setLoginChannel(loginChannel);
        session.setDisplayName(user.getDisplayName());
        session.setEmail(user.getEmail());
        session.setIpAddress(getRemoteIp(request));
        session.setUserAgent(getUserAgent(request));
        session.setExpiresAt(now + iamSessionExpireHours * 60 * 60 * 1000);
        session.setLastSeenAt(now);
        session.setCreatedTime(now);
        session.setUpdatedTime(now);
        session.setStatus(0);
        iamSessionMapper.insert(session);

        principal.setSessionId(session.getId());
        String token = panelTokenService.generateIamToken(principal, session.getExpiresAt());

        writeLoginAudit(user.getId(), AUTH_SOURCE_DINGTALK, loginChannel, user.getDisplayName(), user.getEmail(), unionId,
                session.getIpAddress(), session.getUserAgent(), 1, "ok", "登录成功");
        return R.ok(buildLoginResponse(principal, token, session.getExpiresAt(), user));
    }

    @Override
    public R getCurrentProfile() {
        AuthPrincipal principal = AuthContext.getCurrentPrincipal();
        if (principal == null) {
            return R.err(401, "未登录");
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("principalType", principal.getPrincipalType());
        data.put("principalId", principal.getPrincipalId());
        data.put("sessionId", principal.getSessionId());
        data.put("displayName", principal.getDisplayName());
        data.put("email", principal.getEmail());
        data.put("authSource", principal.getAuthSource());
        data.put("admin", principal.isAdmin());
        data.put("permissions", principal.safePermissions());
        data.put("roleCodes", principal.safeRoleCodes());
        data.put("assetScope", principal.getAssetScope());
        Set<Long> effectiveAssetIds = principal.getEffectiveAssetIds();
        data.put("accessibleAssetIds", effectiveAssetIds); // null = no restriction
        return R.ok(data);
    }

    @Override
    public R logoutCurrentSession() {
        AuthPrincipal principal = AuthContext.getCurrentPrincipal();
        if (principal == null) {
            return R.ok();
        }
        if (AuthPrincipal.TYPE_IAM.equals(principal.getPrincipalType()) && principal.getSessionId() != null) {
            revokeSession(principal.getSessionId(), "logout");
        }
        return R.ok();
    }

    @Override
    public AuthPrincipal authenticate(String token, String remoteIp, String userAgent) {
        Map<String, Object> payload = panelTokenService.peekPayload(token);
        if (payload != null && PanelTokenService.TOKEN_TYPE_IAM.equals(payload.get("token_type"))) {
            return authenticateIamToken(token, payload, remoteIp, userAgent);
        }

        if (!JwtUtil.validateToken(token)) {
            return null;
        }

        AuthPrincipal principal = new AuthPrincipal();
        principal.setPrincipalType(AuthPrincipal.TYPE_LEGACY);
        principal.setPrincipalId(JwtUtil.getUserIdFromToken(token));
        principal.setDisplayName(JwtUtil.getNameFromToken());
        principal.setLegacyRoleId(JwtUtil.getRoleIdFromToken(token));
        boolean isOwner = Objects.equals(principal.getLegacyRoleId(), 0);
        principal.setAdmin(isOwner);
        if (isOwner) {
            principal.getPermissions().add("*");
            principal.getRoleCodes().add("OWNER");
        }
        return principal;
    }

    private AuthPrincipal authenticateIamToken(String token, Map<String, Object> ignoredPayload, String remoteIp, String userAgent) {
        Map<String, Object> payload = panelTokenService.validateIamToken(token);
        if (payload == null) {
            return null;
        }

        Long sessionId = toLong(payload.get("sid"));
        Long userId = toLong(payload.get("sub"));
        if (sessionId == null || userId == null) {
            return null;
        }

        IamSession session = iamSessionMapper.selectById(sessionId);
        if (session == null || (session.getStatus() != null && session.getStatus() != 0) || session.getRevokedAt() != null) {
            return null;
        }
        if (session.getExpiresAt() == null || session.getExpiresAt() <= System.currentTimeMillis()) {
            revokeSession(sessionId, "expired");
            return null;
        }
        if (!Objects.equals(session.getUserId(), userId)) {
            return null;
        }

        IamUser user = iamUserMapper.selectById(userId);
        if (user == null || !Objects.equals(user.getStatus(), 0) || !Objects.equals(user.getEnabled(), 1)) {
            revokeSession(sessionId, "user_invalid");
            return null;
        }
        if (AUTH_SOURCE_DINGTALK.equalsIgnoreCase(user.getAuthSource()) && !Objects.equals(user.getOrgActive(), 1)) {
            revokeSession(sessionId, "org_inactive");
            return null;
        }

        AuthPrincipal principal = loadIamPrincipal(user, sessionId);
        if (principal == null || principal.safeRoleCodes().isEmpty()) {
            revokeSession(sessionId, "missing_roles");
            return null;
        }

        long now = System.currentTimeMillis();
        if (session.getLastSeenAt() == null || now - session.getLastSeenAt() >= SESSION_TOUCH_INTERVAL_MILLIS) {
            session.setLastSeenAt(now);
            session.setUpdatedTime(now);
            if (StringUtils.hasText(remoteIp)) {
                session.setIpAddress(remoteIp);
            }
            if (StringUtils.hasText(userAgent)) {
                session.setUserAgent(userAgent);
            }
            iamSessionMapper.updateById(session);
        }

        return principal;
    }

    private AuthPrincipal loadIamPrincipal(IamUser user, Long sessionId) {
        List<IamUserRole> userRoles = iamUserRoleMapper.selectList(new LambdaQueryWrapper<IamUserRole>()
                .eq(IamUserRole::getUserId, user.getId())
                .eq(IamUserRole::getStatus, 0));
        if (userRoles.isEmpty()) {
            return null;
        }

        Set<Long> roleIds = userRoles.stream()
                .map(IamUserRole::getRoleId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        List<IamRole> roles = iamRoleMapper.selectList(new LambdaQueryWrapper<IamRole>()
                .in(IamRole::getId, roleIds)
                .eq(IamRole::getStatus, 0)
                .eq(IamRole::getEnabled, 1));
        if (roles.isEmpty()) {
            return null;
        }

        Set<Long> activeRoleIds = roles.stream().map(IamRole::getId).collect(Collectors.toCollection(LinkedHashSet::new));
        List<IamRolePermission> rolePermissions = iamRolePermissionMapper.selectList(new LambdaQueryWrapper<IamRolePermission>()
                .in(IamRolePermission::getRoleId, activeRoleIds)
                .eq(IamRolePermission::getStatus, 0));
        Set<Long> permissionIds = rolePermissions.stream()
                .map(IamRolePermission::getPermissionId)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        List<IamPermission> permissions = permissionIds.isEmpty()
                ? Collections.emptyList()
                : iamPermissionMapper.selectList(new LambdaQueryWrapper<IamPermission>()
                .in(IamPermission::getId, permissionIds)
                .eq(IamPermission::getStatus, 0)
                .eq(IamPermission::getEnabled, 1));

        AuthPrincipal principal = new AuthPrincipal();
        principal.setPrincipalType(AuthPrincipal.TYPE_IAM);
        principal.setPrincipalId(user.getId());
        principal.setSessionId(sessionId);
        principal.setDisplayName(user.getDisplayName());
        principal.setEmail(user.getEmail());
        principal.setAuthSource(user.getAuthSource());
        Set<String> roleCodes = roles.stream()
                .map(IamRole::getCode)
                .filter(StringUtils::hasText)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        principal.setRoleCodes(roleCodes);
        // OWNER 角色 = 超级管理员，拥有全部权限
        boolean isOwner = roleCodes.contains("OWNER");
        principal.setAdmin(isOwner);
        principal.setLegacyRoleId(isOwner ? 0 : 1);
        Set<String> permCodes = permissions.stream()
                .map(IamPermission::getCode)
                .filter(StringUtils::hasText)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (isOwner) {
            permCodes.add("*");
        }
        principal.setPermissions(permCodes);

        // Load asset scope: user-level overrides role-level
        if (!principal.isAdmin()) {
            String userAssetScope = user.getAssetScope();
            if (StringUtils.hasText(userAssetScope)) {
                // User has explicit asset scope → use it directly, ignore role-level
                principal.setAssetScope(userAssetScope);
                if ("SELECTED".equalsIgnoreCase(userAssetScope)) {
                    List<IamUserAsset> userAssets = iamUserAssetMapper.selectList(new LambdaQueryWrapper<IamUserAsset>()
                            .eq(IamUserAsset::getUserId, user.getId())
                            .eq(IamUserAsset::getStatus, 0));
                    principal.setAccessibleAssetIds(userAssets.stream()
                            .map(IamUserAsset::getAssetId)
                            .collect(Collectors.toCollection(LinkedHashSet::new)));
                } else if ("NONE".equalsIgnoreCase(userAssetScope)) {
                    principal.setAccessibleAssetIds(Collections.emptySet());
                }
                // ALL → no restriction (accessibleAssetIds stays null)
            } else {
                // Fall back to role-level merge: union of all role assets
                // Non-admin roles default to NONE unless explicitly configured
                boolean hasAllScope = roles.stream()
                        .anyMatch(r -> "ALL".equalsIgnoreCase(r.getAssetScope()));
                if (hasAllScope) {
                    principal.setAssetScope("ALL");
                } else {
                    principal.setAssetScope("SELECTED");
                    List<IamRoleAsset> roleAssets = iamRoleAssetMapper.selectList(new LambdaQueryWrapper<IamRoleAsset>()
                            .in(IamRoleAsset::getRoleId, activeRoleIds)
                            .eq(IamRoleAsset::getStatus, 0));
                    principal.setAccessibleAssetIds(roleAssets.stream()
                            .map(IamRoleAsset::getAssetId)
                            .collect(Collectors.toCollection(LinkedHashSet::new)));
                }
            }
        }
        return principal;
    }

    private JSONObject exchangeUserAccessToken(String authCode) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        JSONObject payload = new JSONObject();
        payload.put("clientId", getConfigValue("dingtalk_client_id", ""));
        payload.put("clientSecret", getConfigValue("dingtalk_client_secret", ""));
        payload.put("code", authCode);
        payload.put("grantType", "authorization_code");
        try {
            ResponseEntity<String> response = restTemplate.postForEntity(
                    DINGTALK_USER_ACCESS_TOKEN_ENDPOINT,
                    new HttpEntity<>(payload.toJSONString(), headers),
                    String.class
            );
            log.debug("DingTalk token exchange response: {}", response.getBody());
            return parseJsonObject(response.getBody());
        } catch (RestClientException e) {
            log.error("DingTalk token exchange failed: {}", e.getMessage());
            return new JSONObject();
        }
    }

    private JSONObject fetchCurrentUserProfile(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("x-acs-dingtalk-access-token", accessToken);
        headers.setAccept(Collections.singletonList(MediaType.APPLICATION_JSON));
        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    DINGTALK_CURRENT_USER_ENDPOINT,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    String.class
            );
            log.debug("DingTalk user profile response: {}", response.getBody());
            return parseJsonObject(response.getBody());
        } catch (RestClientException e) {
            log.error("DingTalk user profile fetch failed: {}", e.getMessage());
            return new JSONObject();
        }
    }

    private Map<String, Object> buildLoginResponse(AuthPrincipal principal, String token, Long expiresAt, IamUser iamUser) {
        boolean twoFactorEnabled = iamUser != null
                && Objects.equals(iamUser.getTwoFactorEnabled(), 1)
                && StringUtils.hasText(iamUser.getTwoFactorSecret());
        // 2FA enforcement: check system config
        boolean twoFactorRequired = isTwoFactorRequiredForIam(principal);
        boolean requireTwoFactorSetup = twoFactorRequired && !twoFactorEnabled;

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("token", token);
        data.put("role_id", principal.getLegacyRoleId() == null ? 1 : principal.getLegacyRoleId());
        data.put("name", principal.getDisplayName());
        data.put("requirePasswordChange", false);
        data.put("requireTwoFactorSetup", requireTwoFactorSetup);
        data.put("twoFactorRequired", twoFactorRequired);
        data.put("twoFactorEnabled", twoFactorEnabled);
        data.put("principalType", principal.getPrincipalType());
        data.put("authSource", principal.getAuthSource());
        data.put("admin", principal.isAdmin());
        data.put("permissions", principal.safePermissions());
        data.put("roleCodes", principal.safeRoleCodes());
        data.put("email", principal.getEmail());
        data.put("sessionExpiresAt", expiresAt);
        return data;
    }

    private boolean isTwoFactorRequiredForIam(AuthPrincipal principal) {
        String scope = getConfigValue("two_factor_enforcement_scope", "disabled").toLowerCase();
        if ("all".equals(scope)) return true;
        if ("admin".equals(scope)) return principal != null && principal.isAdmin();
        return false;
    }

    private IamUser resolveIamUser(String email, String unionId) {
        IamUser byEmail = iamUserMapper.selectOne(new LambdaQueryWrapper<IamUser>()
                .eq(IamUser::getEmail, email)
                .eq(IamUser::getStatus, 0)
                .last("limit 1"));
        if (byEmail != null) {
            if (StringUtils.hasText(unionId) && StringUtils.hasText(byEmail.getDingtalkUnionId())
                    && !unionId.equals(byEmail.getDingtalkUnionId())) {
                return null;
            }
            return byEmail;
        }
        if (!StringUtils.hasText(unionId)) {
            return null;
        }
        return iamUserMapper.selectOne(new LambdaQueryWrapper<IamUser>()
                .eq(IamUser::getDingtalkUnionId, unionId)
                .eq(IamUser::getStatus, 0)
                .last("limit 1"));
    }

    /**
     * 钉钉首次登录自动创建 IAM 用户（enabled=0，待管理员审批）
     */
    private IamUser autoProvisionDingtalkUser(String email, String displayName, String unionId,
                                               String dingtalkUserId, String mobile, String jobTitle, String departmentPath) {
        long now = System.currentTimeMillis();
        IamUser user = new IamUser();
        user.setEmail(email.trim().toLowerCase(Locale.ROOT));
        user.setDisplayName(StringUtils.hasText(displayName) ? displayName.trim() : email.split("@")[0]);
        user.setAuthSource(AUTH_SOURCE_DINGTALK);
        user.setDingtalkUnionId(trimToNull(unionId));
        user.setDingtalkUserId(trimToNull(dingtalkUserId));
        user.setMobile(trimToNull(mobile));
        user.setJobTitle(trimToNull(jobTitle));
        user.setDepartmentPath(trimToNull(departmentPath));
        user.setOrgActive(1);
        user.setEnabled(0); // 待审批
        user.setLastOrgSyncAt(now);
        user.setCreatedTime(now);
        user.setUpdatedTime(now);
        user.setStatus(0);
        user.setRemark("钉钉首次登录自动创建，待管理员审批");
        iamUserMapper.insert(user);
        return user;
    }

    private void revokeSession(Long sessionId, String reason) {
        if (sessionId == null) {
            return;
        }
        IamSession session = iamSessionMapper.selectById(sessionId);
        if (session == null || session.getRevokedAt() != null) {
            return;
        }
        long now = System.currentTimeMillis();
        session.setRevokedAt(now);
        session.setRevokeReason(reason);
        session.setUpdatedTime(now);
        iamSessionMapper.updateById(session);
    }

    private void writeLoginAudit(Long userId,
                                 String authSource,
                                 String loginChannel,
                                 String principalName,
                                 String principalEmail,
                                 String unionId,
                                 String remoteIp,
                                 String userAgent,
                                 Integer success,
                                 String resultCode,
                                 String resultMessage) {
        long now = System.currentTimeMillis();
        IamLoginAudit audit = new IamLoginAudit();
        audit.setUserId(userId);
        audit.setAuthSource(authSource);
        audit.setLoginChannel(loginChannel);
        audit.setPrincipalName(trimToNull(principalName));
        audit.setPrincipalEmail(normalizeEmail(principalEmail));
        audit.setDingtalkUnionId(trimToNull(unionId));
        audit.setRemoteIp(trimToNull(remoteIp));
        audit.setUserAgent(trimToNull(userAgent));
        audit.setSuccess(success == null || success == 0 ? 0 : 1);
        audit.setResultCode(trimToNull(resultCode));
        audit.setResultMessage(trimToNull(resultMessage));
        audit.setCreatedTime(now);
        audit.setUpdatedTime(now);
        audit.setStatus(0);
        iamLoginAuditMapper.insert(audit);
    }

    @Override
    public R testDingtalkConfig() {
        Map<String, Object> result = new LinkedHashMap<>();
        List<String> errors = new ArrayList<>();

        // Step 1: Check required configs
        String clientId = getConfigValue("dingtalk_client_id", "");
        String clientSecret = getConfigValue("dingtalk_client_secret", "");
        String redirectUri = getConfigValue("dingtalk_redirect_uri", "");

        result.put("clientIdConfigured", StringUtils.hasText(clientId));
        result.put("clientSecretConfigured", StringUtils.hasText(clientSecret));
        result.put("redirectUriConfigured", StringUtils.hasText(redirectUri));

        if (!StringUtils.hasText(clientId)) errors.add("Client ID (AppKey) 未配置");
        if (!StringUtils.hasText(clientSecret)) errors.add("Client Secret (AppSecret) 未配置");
        if (!StringUtils.hasText(redirectUri)) errors.add("Redirect URI 未配置");

        if (!errors.isEmpty()) {
            result.put("success", false);
            result.put("errors", errors);
            result.put("message", "配置不完整：" + String.join("、", errors));
            return R.ok(result);
        }

        // Step 2: Try to get server access token from DingTalk (validates appkey/appsecret)
        try {
            String tokenUrl = "https://oapi.dingtalk.com/gettoken?appkey="
                    + urlEncode(clientId) + "&appsecret=" + urlEncode(clientSecret);
            ResponseEntity<String> response = restTemplate.getForEntity(tokenUrl, String.class);
            JSONObject body = parseJsonObject(response.getBody());
            int errcode = body.getIntValue("errcode", -1);

            if (errcode == 0) {
                result.put("success", true);
                result.put("message", "钉钉配置验证通过！AppKey/AppSecret 有效");
            } else {
                String errmsg = body.getString("errmsg");
                result.put("success", false);
                if (errcode == 40089 || errcode == 40014) {
                    errors.add("AppKey 无效：" + errmsg);
                } else if (errcode == 40015) {
                    errors.add("AppSecret 无效：" + errmsg);
                } else {
                    errors.add("钉钉返回错误 " + errcode + "：" + errmsg);
                }
                result.put("errors", errors);
                result.put("message", String.join("、", errors));
            }
        } catch (Exception e) {
            result.put("success", false);
            errors.add("连接钉钉 API 失败：" + e.getMessage());
            result.put("errors", errors);
            result.put("message", "网络错误：" + e.getMessage());
        }

        return R.ok(result);
    }

    private boolean isDingtalkConfigured() {
        return StringUtils.hasText(getConfigValue("dingtalk_client_id", ""))
                && StringUtils.hasText(getConfigValue("dingtalk_client_secret", ""))
                && StringUtils.hasText(getConfigValue("dingtalk_redirect_uri", ""));
    }

    private boolean isConfigEnabled(String key, boolean defaultValue) {
        String value = getConfigValue(key, String.valueOf(defaultValue));
        return "1".equals(value) || "true".equalsIgnoreCase(value) || "yes".equalsIgnoreCase(value);
    }

    private String getConfigValue(String key, String defaultValue) {
        return runtimeConfigService.getValue(key, defaultValue);
    }

    private boolean isEmailDomainAllowed(String email) {
        String requiredDomain = trimToNull(getConfigValue("dingtalk_required_email_domain", ""));
        if (!StringUtils.hasText(requiredDomain)) {
            return true;
        }
        return email.toLowerCase(Locale.ROOT).endsWith("@" + requiredDomain.toLowerCase(Locale.ROOT));
    }

    private JSONObject parseJsonObject(String body) {
        if (!StringUtils.hasText(body)) {
            return new JSONObject();
        }
        return JSONObject.parseObject(body);
    }

    private String extractFirstNonBlank(JSONObject source, String... keys) {
        if (source == null || keys == null) {
            return null;
        }
        for (String key : keys) {
            Object value = source.get(key);
            if (value != null) {
                String text = value.toString().trim();
                if (!text.isEmpty()) {
                    return text;
                }
            }
        }
        return null;
    }

    private String normalizeEmail(String value) {
        String trimmed = trimToNull(value);
        return trimmed == null ? null : trimmed.toLowerCase(Locale.ROOT);
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private String normalizeChannel(String channel) {
        if (!StringUtils.hasText(channel)) {
            return "web";
        }
        String value = channel.trim().toLowerCase(Locale.ROOT);
        return Arrays.asList("web", "h5", "dingtalk").contains(value) ? value : "web";
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String getRemoteIp(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(forwardedFor)) {
            return forwardedFor.split(",")[0].trim();
        }
        return trimToNull(request.getRemoteAddr());
    }

    private String getUserAgent(HttpServletRequest request) {
        return request == null ? null : trimToNull(request.getHeader("User-Agent"));
    }

    private Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(value.toString());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }
}
