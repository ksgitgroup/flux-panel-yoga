package com.admin.common.aop;

import com.admin.common.annotation.RequireRole;
import com.admin.common.auth.AuthContext;
import com.admin.common.auth.AuthPrincipal;
import com.admin.common.lang.R;
import com.admin.service.impl.IamPermissionResolver;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;

/**
 * 权限控制切面
 * 处理 @RequireRole 注解，检查管理员权限（role_id = 0）
 * 注意：JWT拦截器已经验证了token的有效性，这里只需要检查权限
 */
@Aspect
@Component
public class RoleAspect {

    private final IamPermissionResolver iamPermissionResolver;

    public RoleAspect(IamPermissionResolver iamPermissionResolver) {
        this.iamPermissionResolver = iamPermissionResolver;
    }

    @Around("@annotation(requireRole)")
    public Object checkRole(ProceedingJoinPoint joinPoint, RequireRole requireRole) throws Throwable {
        // 获取当前请求
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return R.err(500, "无法获取请求信息");
        }
        
        HttpServletRequest request = attributes.getRequest();
        AuthPrincipal principal = AuthContext.getCurrentPrincipal();
        if (principal == null) {
            return R.err(401, "无法获取用户权限信息");
        }

        if (principal.isAdmin()) {
            return joinPoint.proceed();
        }

        String permissionCode = iamPermissionResolver.resolveRequiredPermission(request.getRequestURI());
        if (permissionCode == null || !principal.hasPermission(permissionCode)) {
            return R.err(403, "权限不足，缺少权限：" + (permissionCode == null ? "unknown" : permissionCode));
        }

        return joinPoint.proceed();
    }
}
