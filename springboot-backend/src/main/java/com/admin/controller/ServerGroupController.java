package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.entity.ServerGroup;
import com.admin.service.ServerGroupService;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.Map;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/topology")
public class ServerGroupController extends BaseController {

    @Resource
    private ServerGroupService serverGroupService;

    @RequireRole
    @PostMapping("/group/list")
    public R listGroups() {
        return serverGroupService.listGroups();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/group/create")
    public R createGroup(@RequestBody ServerGroup group) {
        return serverGroupService.createGroup(group);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/group/update")
    public R updateGroup(@RequestBody ServerGroup group) {
        return serverGroupService.updateGroup(group);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/group/delete")
    public R deleteGroup(@RequestBody Map<String, Long> body) {
        return serverGroupService.deleteGroup(body.get("id"));
    }

    @RequireRole
    @PostMapping("/group/members")
    public R getMembers(@RequestBody Map<String, Long> body) {
        return serverGroupService.getMembers(body.get("groupId"));
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/group/member/add")
    public R addMember(@RequestBody Map<String, Object> body) {
        Long groupId = body.get("groupId") != null ? ((Number) body.get("groupId")).longValue() : null;
        Long assetId = body.get("assetId") != null ? ((Number) body.get("assetId")).longValue() : null;
        String roleInGroup = (String) body.get("roleInGroup");
        return serverGroupService.addMember(groupId, assetId, roleInGroup);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/group/member/remove")
    public R removeMember(@RequestBody Map<String, Long> body) {
        return serverGroupService.removeMember(body.get("id"));
    }

    @RequireRole
    @PostMapping("/data")
    public R getTopologyData() {
        return serverGroupService.getTopologyData();
    }

    @RequireRole
    @PostMapping("/group/dashboard")
    public R getGroupDashboard(@RequestBody Map<String, Long> body) {
        return serverGroupService.getGroupDashboard(body.get("groupId"));
    }
}
