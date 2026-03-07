package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.PortalLinkSaveDto;
import com.admin.common.lang.R;
import com.admin.service.PortalLinkService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/portal")
public class PortalLinkController extends BaseController {

    @Autowired
    private PortalLinkService portalLinkService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list() {
        return portalLinkService.getPortalLinks();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/save")
    public R save(@Validated @RequestBody PortalLinkSaveDto dto) {
        return portalLinkService.savePortalLinks(dto);
    }
}
