package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.IamDingtalkLoginDto;
import com.admin.common.lang.R;
import com.admin.service.IamAuthService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/iam/auth")
public class IamAuthController extends BaseController {

    @Resource
    private IamAuthService iamAuthService;

    @PostMapping("/options")
    public R options() {
        return iamAuthService.getAuthOptions();
    }

    @PostMapping("/dingtalk/authorize-url")
    public R dingtalkAuthorizeUrl(@RequestBody(required = false) Map<String, Object> body) {
        String channel = body == null || body.get("channel") == null ? null : body.get("channel").toString();
        return iamAuthService.getDingtalkAuthorizeUrl(channel);
    }

    @LogAnnotation
    @PostMapping("/dingtalk/login")
    public R dingtalkLogin(@Validated @RequestBody IamDingtalkLoginDto dto, HttpServletRequest request) {
        return iamAuthService.loginWithDingtalkCode(dto, request);
    }

    @PostMapping("/me")
    public R me() {
        return iamAuthService.getCurrentProfile();
    }

    @LogAnnotation
    @PostMapping("/logout")
    public R logout() {
        return iamAuthService.logoutCurrentSession();
    }
}
