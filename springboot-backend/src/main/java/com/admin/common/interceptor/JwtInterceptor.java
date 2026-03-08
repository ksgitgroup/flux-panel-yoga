package com.admin.common.interceptor;


import com.admin.common.auth.AuthContext;
import com.admin.common.auth.AuthPrincipal;
import com.admin.common.exception.UnauthorizedException;
import com.admin.service.IamAuthService;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;


/**
 * JWT拦截器，验证用户是否登录
 */
public class JwtInterceptor implements HandlerInterceptor {

    private final IamAuthService iamAuthService;

    public JwtInterceptor(IamAuthService iamAuthService) {
        this.iamAuthService = iamAuthService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String token = request.getHeader("Authorization");

        if (!StringUtils.hasText(token)) {
            throw new UnauthorizedException("未登录或token已过期");
        }

        AuthPrincipal principal = iamAuthService.authenticate(token, request.getRemoteAddr(), request.getHeader("User-Agent"));
        if (principal == null) {
            throw new UnauthorizedException("无效的token或token已过期");
        }
        AuthContext.setCurrentPrincipal(request, principal);
        return true;
    }
}
