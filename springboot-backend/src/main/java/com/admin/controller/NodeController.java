package com.admin.controller;


import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.NodeDto;
import com.admin.common.dto.NodeUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.Forward;
import com.admin.entity.Tunnel;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * <p>
 *  前端控制器
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
@RestController
@CrossOrigin
@RequestMapping("/api/v1/node")
public class NodeController extends BaseController {

    @LogAnnotation
    @RequireRole
    @PostMapping("/create")
    public R create(@Validated @RequestBody NodeDto nodeDto) {
        return nodeService.createNode(nodeDto);
    }


    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list() {
        return nodeService.getAllNodes();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R update(@Validated @RequestBody NodeUpdateDto nodeUpdateDto) {
        return nodeService.updateNode(nodeUpdateDto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Object idObj = params.get("id");
        if (idObj == null) return R.err("ID 不能为空");
        Long id = Long.valueOf(idObj.toString());
        return nodeService.deleteNode(id);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/install")
    public R getInstallCommand(@RequestBody Map<String, Object> params) {
        Object idObj = params.get("id");
        if (idObj == null) return R.err("ID 不能为空");
        Long id = Long.valueOf(idObj.toString());
        return nodeService.getInstallCommand(id);
    }

    /**
     * Get per-node forward traffic summary.
     * Returns a map: nodeId → { forwardCount, totalInFlow, totalOutFlow, forwards: [...] }
     */
    @LogAnnotation
    @RequireRole
    @PostMapping("/traffic-summary")
    public R trafficSummary() {
        // Get all tunnels to map tunnel → inNodeId
        List<Tunnel> tunnels = tunnelService.list();
        Map<Integer, Long> tunnelToNode = new HashMap<>();
        for (Tunnel t : tunnels) {
            if (t.getInNodeId() != null) {
                tunnelToNode.put(t.getId().intValue(), t.getInNodeId());
            }
        }

        // Get all forwards with traffic
        List<Forward> forwards = forwardService.list();
        Map<Long, List<Map<String, Object>>> nodeForwards = new HashMap<>();

        for (Forward f : forwards) {
            if (f.getTunnelId() == null) continue;
            Long nodeId = tunnelToNode.get(f.getTunnelId());
            if (nodeId == null) continue;

            long inFlow = f.getInFlow() != null ? f.getInFlow() : 0;
            long outFlow = f.getOutFlow() != null ? f.getOutFlow() : 0;

            Map<String, Object> fwd = new HashMap<>();
            fwd.put("id", f.getId());
            fwd.put("name", f.getName());
            fwd.put("inFlow", inFlow);
            fwd.put("outFlow", outFlow);
            fwd.put("inPort", f.getInPort());
            fwd.put("remoteAddr", f.getRemoteAddr());

            nodeForwards.computeIfAbsent(nodeId, k -> new ArrayList<>()).add(fwd);
        }

        // Build summary per node
        Map<Long, Map<String, Object>> result = new HashMap<>();
        for (Map.Entry<Long, List<Map<String, Object>>> entry : nodeForwards.entrySet()) {
            List<Map<String, Object>> fwds = entry.getValue();
            long totalIn = fwds.stream().mapToLong(m -> (Long) m.get("inFlow")).sum();
            long totalOut = fwds.stream().mapToLong(m -> (Long) m.get("outFlow")).sum();

            // Sort by total traffic desc
            fwds.sort((a, b) -> Long.compare(
                    (Long) b.get("inFlow") + (Long) b.get("outFlow"),
                    (Long) a.get("inFlow") + (Long) a.get("outFlow")));

            Map<String, Object> summary = new HashMap<>();
            summary.put("forwardCount", fwds.size());
            summary.put("totalInFlow", totalIn);
            summary.put("totalOutFlow", totalOut);
            summary.put("forwards", fwds.size() > 5 ? fwds.subList(0, 5) : fwds); // top 5
            result.put(entry.getKey(), summary);
        }

        return R.ok(result);
    }

}
