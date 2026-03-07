package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.XuiInstanceDto;
import com.admin.common.dto.XuiInstanceIdDto;
import com.admin.common.dto.XuiInstanceUpdateDto;
import com.admin.common.lang.R;
import com.admin.service.XuiService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/xui")
public class XuiController extends BaseController {

    @Autowired
    private XuiService xuiService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list() {
        return xuiService.getAllInstances();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/detail")
    public R detail(@Validated @RequestBody XuiInstanceIdDto dto) {
        return xuiService.getInstanceDetail(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/create")
    public R create(@Validated @RequestBody XuiInstanceDto dto) {
        return xuiService.createInstance(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R update(@Validated @RequestBody XuiInstanceUpdateDto dto) {
        return xuiService.updateInstance(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@Validated @RequestBody XuiInstanceIdDto dto) {
        return xuiService.deleteInstance(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/test")
    public R test(@Validated @RequestBody XuiInstanceIdDto dto) {
        return xuiService.testInstance(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/sync")
    public R sync(@Validated @RequestBody XuiInstanceIdDto dto) {
        return xuiService.syncInstance(dto);
    }

    @PostMapping("/traffic/{token}")
    public R traffic(@PathVariable("token") String token,
                     @RequestBody(required = false) String requestBody,
                     HttpServletRequest request) {
        return xuiService.receiveTraffic(token, requestBody, request.getRemoteAddr());
    }
}
