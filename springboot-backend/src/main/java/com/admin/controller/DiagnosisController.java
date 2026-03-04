package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.lang.R;
import com.admin.service.DiagnosisService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 诊断相关接口
 */
@RestController
@CrossOrigin
@RequestMapping("/api/v1/diagnosis")
public class DiagnosisController extends BaseController {

    @Autowired
    private DiagnosisService diagnosisService;

    /**
     * 获取最新诊断状态快照（看板首页数据）
     */
    @PostMapping("/summary")
    public R summary() {
        return diagnosisService.getLatestSummary();
    }

    /**
     * 获取某个隧道或转发的诊断历史
     * 参数: targetType (tunnel/forward), targetId, limit(可选,默认20)
     */
    @PostMapping("/history")
    public R history(@RequestBody Map<String, Object> params) {
        String targetType = (String) params.get("targetType");
        Integer targetId = Integer.valueOf(params.get("targetId").toString());
        int limit = params.containsKey("limit") ? Integer.parseInt(params.get("limit").toString()) : 20;
        return diagnosisService.getDiagnosisHistory(targetType, targetId, limit);
    }

    /**
     * 手动触发全量诊断（异步执行）
     * 仅管理员可用
     */
    @PostMapping("/run-now")
    public R runNow() {
        return diagnosisService.triggerNow();
    }
}
