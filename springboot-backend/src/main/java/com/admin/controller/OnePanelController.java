package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.OnePanelExporterReportDto;
import com.admin.common.dto.OnePanelInstanceDto;
import com.admin.common.dto.OnePanelInstanceIdDto;
import com.admin.common.dto.OnePanelInstanceUpdateDto;
import com.admin.common.lang.R;
import com.admin.service.OnePanelService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.Set;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/onepanel")
public class OnePanelController extends BaseController {

    @Autowired
    private OnePanelService onePanelService;

    private static final Set<String> ALLOWED_FILES = Set.of(
            "flux-1panel-sync.sh",
            "flux-1panel-sync.service",
            "flux-1panel-sync.timer"
    );

    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list() {
        return onePanelService.getAllInstances();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/detail")
    public R detail(@Validated @RequestBody OnePanelInstanceIdDto dto) {
        return onePanelService.getInstanceDetail(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/create")
    public R create(@Validated @RequestBody OnePanelInstanceDto dto) {
        return onePanelService.createInstance(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R update(@Validated @RequestBody OnePanelInstanceUpdateDto dto) {
        return onePanelService.updateInstance(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@Validated @RequestBody OnePanelInstanceIdDto dto) {
        return onePanelService.deleteInstance(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/rotate-token")
    public R rotateToken(@Validated @RequestBody OnePanelInstanceIdDto dto) {
        return onePanelService.rotateToken(dto);
    }

    @PostMapping("/report")
    public R report(@RequestHeader(value = "X-Flux-Instance-Key", required = false) String instanceKey,
                    @RequestHeader(value = "X-Flux-Node-Token", required = false) String nodeToken,
                    @RequestBody(required = false) OnePanelExporterReportDto dto,
                    HttpServletRequest request) {
        return onePanelService.receiveReport(instanceKey, nodeToken, dto, request.getRemoteAddr());
    }

    /**
     * Public endpoint to download exporter scripts (no auth required).
     * Only whitelisted filenames are served from classpath:/onepanel-exporter/.
     */
    @GetMapping("/exporter/{filename}")
    public ResponseEntity<Resource> downloadExporterFile(@PathVariable String filename) {
        if (!ALLOWED_FILES.contains(filename)) {
            return ResponseEntity.notFound().build();
        }
        Resource resource = new ClassPathResource("onepanel-exporter/" + filename);
        if (!resource.exists()) {
            return ResponseEntity.notFound().build();
        }
        String contentType = filename.endsWith(".sh") ? "application/x-sh" : "text/plain";
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(resource);
    }
}
