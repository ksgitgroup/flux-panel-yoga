package com.admin.service;

import com.admin.common.auth.AuthPrincipal;
import com.admin.common.dto.IamDingtalkLoginDto;
import com.admin.common.lang.R;

import javax.servlet.http.HttpServletRequest;

public interface IamAuthService {

    R getAuthOptions();

    R getDingtalkAuthorizeUrl(String channel);

    R loginWithDingtalkCode(IamDingtalkLoginDto dto, HttpServletRequest request);

    R getCurrentProfile();

    R logoutCurrentSession();

    AuthPrincipal authenticate(String token, String remoteIp, String userAgent);

    R testDingtalkConfig();
}
