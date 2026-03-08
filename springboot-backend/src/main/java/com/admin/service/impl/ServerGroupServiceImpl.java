package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.*;
import com.admin.mapper.*;
import com.admin.service.ServerGroupService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class ServerGroupServiceImpl extends ServiceImpl<ServerGroupMapper, ServerGroup> implements ServerGroupService {

    @Resource
    private ServerGroupMapper serverGroupMapper;

    @Resource
    private ServerGroupMemberMapper serverGroupMemberMapper;

    @Resource
    private AssetHostMapper assetHostMapper;

    @Resource
    private ForwardMapper forwardMapper;

    @Resource
    private TunnelMapper tunnelMapper;

    @Resource
    private NodeMapper nodeMapper;

    @Override
    public R listGroups() {
        QueryWrapper<ServerGroup> qw = new QueryWrapper<>();
        qw.eq("status", 0);
        qw.orderByAsc("sort_order");
        return R.ok(serverGroupMapper.selectList(qw));
    }

    @Override
    public R createGroup(ServerGroup group) {
        group.setCreatedTime(System.currentTimeMillis());
        group.setUpdatedTime(System.currentTimeMillis());
        group.setStatus(0);
        serverGroupMapper.insert(group);
        return R.ok(group);
    }

    @Override
    public R updateGroup(ServerGroup group) {
        if (group.getId() == null) {
            return R.err("分组ID不能为空");
        }
        group.setUpdatedTime(System.currentTimeMillis());
        serverGroupMapper.updateById(group);
        return R.ok(group);
    }

    @Override
    public R deleteGroup(Long id) {
        ServerGroup group = serverGroupMapper.selectById(id);
        if (group == null) {
            return R.err("分组不存在");
        }
        // Soft-delete group
        group.setStatus(1);
        group.setUpdatedTime(System.currentTimeMillis());
        serverGroupMapper.updateById(group);

        // Soft-delete all members in this group
        QueryWrapper<ServerGroupMember> mqw = new QueryWrapper<>();
        mqw.eq("group_id", id).eq("status", 0);
        List<ServerGroupMember> members = serverGroupMemberMapper.selectList(mqw);
        for (ServerGroupMember m : members) {
            m.setStatus(1);
            m.setUpdatedTime(System.currentTimeMillis());
            serverGroupMemberMapper.updateById(m);
        }
        return R.ok();
    }

    @Override
    public R getMembers(Long groupId) {
        QueryWrapper<ServerGroupMember> qw = new QueryWrapper<>();
        qw.eq("group_id", groupId).eq("status", 0);
        qw.orderByAsc("sort_order");
        List<ServerGroupMember> members = serverGroupMemberMapper.selectList(qw);

        // Enrich with asset info
        List<Map<String, Object>> result = new ArrayList<>();
        for (ServerGroupMember member : members) {
            Map<String, Object> item = new HashMap<>();
            item.put("id", member.getId());
            item.put("groupId", member.getGroupId());
            item.put("assetId", member.getAssetId());
            item.put("roleInGroup", member.getRoleInGroup());
            item.put("sortOrder", member.getSortOrder());

            if (member.getAssetId() != null) {
                AssetHost asset = assetHostMapper.selectById(member.getAssetId());
                if (asset != null) {
                    item.put("assetName", asset.getName());
                    item.put("primaryIp", asset.getPrimaryIp());
                    item.put("region", asset.getRegion());
                    item.put("role", asset.getRole());
                    item.put("provider", asset.getProvider());
                }
            }
            result.add(item);
        }
        return R.ok(result);
    }

    @Override
    public R addMember(Long groupId, Long assetId, String roleInGroup) {
        // Check if already a member
        QueryWrapper<ServerGroupMember> checkQw = new QueryWrapper<>();
        checkQw.eq("group_id", groupId).eq("asset_id", assetId).eq("status", 0);
        if (serverGroupMemberMapper.selectCount(checkQw) > 0) {
            return R.err("该资产已在此分组中");
        }

        ServerGroupMember member = new ServerGroupMember();
        member.setGroupId(groupId);
        member.setAssetId(assetId);
        member.setRoleInGroup(roleInGroup);
        member.setCreatedTime(System.currentTimeMillis());
        member.setUpdatedTime(System.currentTimeMillis());
        member.setStatus(0);
        serverGroupMemberMapper.insert(member);
        return R.ok(member);
    }

    @Override
    public R removeMember(Long id) {
        ServerGroupMember member = serverGroupMemberMapper.selectById(id);
        if (member == null) {
            return R.err("成员不存在");
        }
        member.setStatus(1);
        member.setUpdatedTime(System.currentTimeMillis());
        serverGroupMemberMapper.updateById(member);
        return R.ok();
    }

    @Override
    public R getTopologyData() {
        // Query all active forwards
        QueryWrapper<Forward> fqw = new QueryWrapper<>();
        fqw.eq("status", 0);
        List<Forward> forwards = forwardMapper.selectList(fqw);

        Map<String, Map<String, Object>> nodeMap = new LinkedHashMap<>();
        List<Map<String, Object>> edges = new ArrayList<>();

        for (Forward fwd : forwards) {
            if (fwd.getTunnelId() == null) {
                continue;
            }
            Tunnel tunnel = tunnelMapper.selectById(fwd.getTunnelId());
            if (tunnel == null) {
                continue;
            }

            // Process inNode (entry)
            Node inNode = tunnel.getInNodeId() != null ? nodeMapper.selectById(tunnel.getInNodeId()) : null;
            Node outNode = tunnel.getOutNodeId() != null ? nodeMapper.selectById(tunnel.getOutNodeId()) : null;

            String inNodeKey = buildNodeKey(inNode, "entry");
            String outNodeKey = buildNodeKey(outNode, "relay");

            if (inNode != null) {
                addTopoNode(nodeMap, inNodeKey, inNode, "entry");
            }
            if (outNode != null) {
                addTopoNode(nodeMap, outNodeKey, outNode, "relay");
            }

            // Landing point from remoteAddr
            String landingKey = null;
            if (fwd.getRemoteAddr() != null && !fwd.getRemoteAddr().isEmpty()) {
                String landingIp = extractIpFromAddr(fwd.getRemoteAddr());
                landingKey = "landing_" + landingIp;
                if (!nodeMap.containsKey(landingKey)) {
                    Map<String, Object> landingNode = new HashMap<>();
                    landingNode.put("id", landingKey);
                    landingNode.put("name", landingIp);
                    landingNode.put("ip", landingIp);
                    landingNode.put("type", "landing");
                    nodeMap.put(landingKey, landingNode);
                }
            }

            // Build edges: entry -> relay/exit
            if (inNodeKey != null && outNodeKey != null) {
                Map<String, Object> edge = new HashMap<>();
                edge.put("from", inNodeKey);
                edge.put("to", outNodeKey);
                edge.put("label", fwd.getName());
                edge.put("forwardId", fwd.getId());
                edge.put("forwardName", fwd.getName());
                edges.add(edge);
            }

            // Edge: relay/exit -> landing
            if (outNodeKey != null && landingKey != null) {
                Map<String, Object> edge = new HashMap<>();
                edge.put("from", outNodeKey);
                edge.put("to", landingKey);
                edge.put("label", fwd.getRemoteAddr());
                edge.put("forwardId", fwd.getId());
                edge.put("forwardName", fwd.getName());
                edges.add(edge);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("nodes", new ArrayList<>(nodeMap.values()));
        result.put("edges", edges);
        return R.ok(result);
    }

    @Override
    public R getGroupDashboard(Long groupId) {
        ServerGroup group = serverGroupMapper.selectById(groupId);
        if (group == null) {
            return R.err("分组不存在");
        }

        QueryWrapper<ServerGroupMember> mqw = new QueryWrapper<>();
        mqw.eq("group_id", groupId).eq("status", 0);
        List<ServerGroupMember> members = serverGroupMemberMapper.selectList(mqw);

        int totalCount = members.size();
        int onlineCount = 0;
        int offlineCount = 0;
        double totalCost = 0;
        List<Map<String, Object>> assetSummaries = new ArrayList<>();

        for (ServerGroupMember member : members) {
            if (member.getAssetId() == null) continue;
            AssetHost asset = assetHostMapper.selectById(member.getAssetId());
            if (asset == null) continue;

            // Count by asset status
            if (asset.getStatus() != null && asset.getStatus() == 0) {
                onlineCount++;
            } else {
                offlineCount++;
            }

            // Sum costs
            if (asset.getMonthlyCost() != null) {
                try {
                    totalCost += Double.parseDouble(asset.getMonthlyCost());
                } catch (NumberFormatException ignored) {
                }
            }

            Map<String, Object> summary = new HashMap<>();
            summary.put("assetId", asset.getId());
            summary.put("name", asset.getName());
            summary.put("primaryIp", asset.getPrimaryIp());
            summary.put("region", asset.getRegion());
            summary.put("role", asset.getRole());
            summary.put("monthlyCost", asset.getMonthlyCost());
            summary.put("roleInGroup", member.getRoleInGroup());
            assetSummaries.add(summary);
        }

        Map<String, Object> dashboard = new HashMap<>();
        dashboard.put("group", group);
        dashboard.put("totalCount", totalCount);
        dashboard.put("onlineCount", onlineCount);
        dashboard.put("offlineCount", offlineCount);
        dashboard.put("totalMonthlyCost", totalCost);
        dashboard.put("members", assetSummaries);
        return R.ok(dashboard);
    }

    // --- private helpers ---

    private String buildNodeKey(Node node, String defaultType) {
        if (node == null) return null;
        // Deduplicate by assetId if available
        if (node.getAssetId() != null) {
            return "asset_" + node.getAssetId();
        }
        return "node_" + node.getId();
    }

    private void addTopoNode(Map<String, Map<String, Object>> nodeMap, String key, Node node, String type) {
        if (key == null || nodeMap.containsKey(key)) return;

        Map<String, Object> topoNode = new HashMap<>();
        topoNode.put("id", key);
        topoNode.put("name", node.getName());
        topoNode.put("ip", node.getIp() != null ? node.getIp() : node.getServerIp());
        topoNode.put("type", type);

        if (node.getAssetId() != null) {
            AssetHost asset = assetHostMapper.selectById(node.getAssetId());
            if (asset != null) {
                topoNode.put("region", asset.getRegion());
                topoNode.put("role", asset.getRole());
            }
        }
        nodeMap.put(key, topoNode);
    }

    private String extractIpFromAddr(String addr) {
        // remoteAddr may be "ip:port" or just "ip"
        if (addr.contains(":")) {
            return addr.substring(0, addr.lastIndexOf(':'));
        }
        return addr;
    }
}
