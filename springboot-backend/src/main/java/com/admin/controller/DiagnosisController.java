package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.lang.R;
import com.admin.common.utils.WeChatWorkUtil;
import com.admin.entity.ViteConfig;
import com.admin.mapper.ViteConfigMapper;
import com.admin.service.DiagnosisService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
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

    @Autowired
    private ViteConfigMapper viteConfigMapper;

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

    /**
     * 测试企业微信 Webhook 推送
     * 发送一条测试消息验证配置是否正确
     */
    @PostMapping("/test-webhook")
    public R testWebhook() {
        try {
            QueryWrapper<ViteConfig> qw = new QueryWrapper<ViteConfig>().eq("name", "wechat_webhook_url");
            ViteConfig cfg = viteConfigMapper.selectOne(qw);
            if (cfg == null || cfg.getValue() == null || cfg.getValue().trim().isEmpty()) {
                return R.err("请先配置企业微信机器人 Webhook 地址");
            }
            String time = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            String content = "# ✅ flux-panel 连接测试\n\n"
                    + "> 测试时间：" + time + "\n\n"
                    + "恭喜！企业微信告警通知配置成功，此消息为测试推送。";
            WeChatWorkUtil.sendMarkdown(cfg.getValue(), content);
            return R.ok("测试消息已发送，请检查企业微信群");
        } catch (Exception e) {
            return R.err("发送失败: " + e.getMessage());
        }
    }
}
