package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.entity.NotifyChannel;
import com.admin.entity.NotifyPolicy;
import com.admin.service.NotificationService;
import com.admin.service.NotifyChannelService;
import com.admin.service.NotifyPolicyService;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.Map;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/notification")
public class NotificationController extends BaseController {

    @Resource
    private NotificationService notificationService;
    @Resource
    private NotifyChannelService notifyChannelService;
    @Resource
    private NotifyPolicyService notifyPolicyService;

    // ==================== Notification ====================

    @RequireRole
    @PostMapping("/list")
    public R list(@RequestBody(required = false) Map<String, Object> body) {
        int page = 1;
        int size = 20;
        Integer readStatus = null;
        String type = null;
        String severity = null;
        if (body != null) {
            if (body.get("page") != null) page = ((Number) body.get("page")).intValue();
            if (body.get("size") != null) size = ((Number) body.get("size")).intValue();
            if (body.get("readStatus") != null) readStatus = ((Number) body.get("readStatus")).intValue();
            if (body.get("type") != null) type = (String) body.get("type");
            if (body.get("severity") != null) severity = (String) body.get("severity");
        }
        return notificationService.listForCurrentUser(page, size, readStatus, type, severity);
    }

    @RequireRole
    @PostMapping("/unread")
    public R unread() {
        return notificationService.unreadCount();
    }

    @RequireRole
    @PostMapping("/read")
    public R markRead(@RequestBody Map<String, Long> body) {
        return notificationService.markRead(body.get("id"));
    }

    @RequireRole
    @PostMapping("/read-all")
    public R markAllRead() {
        return notificationService.markAllRead();
    }

    @RequireRole
    @PostMapping("/snooze")
    public R snooze(@RequestBody Map<String, Object> body) {
        Long id = body.get("id") != null ? ((Number) body.get("id")).longValue() : null;
        int days = body.get("days") != null ? ((Number) body.get("days")).intValue() : 0;
        return notificationService.snooze(id, days);
    }

    @RequireRole
    @PostMapping("/active-critical")
    public R activeCritical() {
        return notificationService.activeCritical();
    }

    // ==================== Channel ====================

    @RequireRole
    @PostMapping("/channel/list")
    public R channelList() {
        return notifyChannelService.listChannels();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/channel/create")
    public R channelCreate(@RequestBody NotifyChannel channel) {
        return notifyChannelService.createChannel(channel);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/channel/update")
    public R channelUpdate(@RequestBody NotifyChannel channel) {
        return notifyChannelService.updateChannel(channel);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/channel/delete")
    public R channelDelete(@RequestBody Map<String, Long> body) {
        return notifyChannelService.deleteChannel(body.get("id"));
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/channel/test")
    public R channelTest(@RequestBody Map<String, Long> body) {
        return notifyChannelService.testChannel(body.get("id"));
    }

    // ==================== Policy ====================

    @RequireRole
    @PostMapping("/policy/list")
    public R policyList() {
        return notifyPolicyService.listPolicies();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/policy/create")
    public R policyCreate(@RequestBody NotifyPolicy policy) {
        return notifyPolicyService.createPolicy(policy);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/policy/update")
    public R policyUpdate(@RequestBody NotifyPolicy policy) {
        return notifyPolicyService.updatePolicy(policy);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/policy/delete")
    public R policyDelete(@RequestBody Map<String, Long> body) {
        return notifyPolicyService.deletePolicy(body.get("id"));
    }
}
