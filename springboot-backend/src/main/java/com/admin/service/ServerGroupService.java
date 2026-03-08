package com.admin.service;

import com.admin.common.lang.R;
import com.admin.entity.ServerGroup;
import com.baomidou.mybatisplus.extension.service.IService;

public interface ServerGroupService extends IService<ServerGroup> {

    R listGroups();

    R createGroup(ServerGroup group);

    R updateGroup(ServerGroup group);

    R deleteGroup(Long id);

    R getMembers(Long groupId);

    R addMember(Long groupId, Long assetId, String roleInGroup);

    R removeMember(Long id);

    R getTopologyData();

    R getGroupDashboard(Long groupId);
}
