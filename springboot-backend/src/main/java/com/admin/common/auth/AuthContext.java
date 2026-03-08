package com.admin.common.auth;

import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;

public final class AuthContext {

    private static final String REQUEST_ATTR_AUTH_PRINCIPAL = "flux.auth.principal";

    private AuthContext() {
    }

    public static void setCurrentPrincipal(HttpServletRequest request, AuthPrincipal principal) {
        if (request != null) {
            request.setAttribute(REQUEST_ATTR_AUTH_PRINCIPAL, principal);
        }
    }

    public static AuthPrincipal getCurrentPrincipal() {
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return null;
        }
        Object principal = attributes.getRequest().getAttribute(REQUEST_ATTR_AUTH_PRINCIPAL);
        return principal instanceof AuthPrincipal ? (AuthPrincipal) principal : null;
    }
}
