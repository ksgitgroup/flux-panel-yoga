package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.AssetHostDto;
import com.admin.common.dto.AssetHostIdDto;
import com.admin.common.dto.AssetHostUpdateDto;
import com.admin.common.lang.R;
import com.admin.service.AssetHostService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import com.admin.common.utils.IpQualityClient;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/asset")
public class AssetHostController extends BaseController {

    @Autowired
    private AssetHostService assetHostService;

    @Autowired
    private IpQualityClient ipQualityClient;

    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list() {
        return assetHostService.getAllAssets();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/detail")
    public R detail(@Validated @RequestBody AssetHostIdDto dto) {
        return assetHostService.getAssetDetail(dto.getId());
    }

    /**
     * 获取服务器初始化安装脚本（3X-UI / 1Panel / 基础工具 / 开发环境 / 清理）
     */
    @RequireRole
    @PostMapping("/init-scripts")
    public R initScripts(@RequestBody Map<String, Object> params) {
        String osPlatform = (String) params.getOrDefault("osPlatform", "linux");
        List<Map<String, Object>> scripts = new ArrayList<>();

        if ("linux".equals(osPlatform)) {
            scripts.add(buildScript("3xui", "3X-UI 面板",
                    "apt update && apt install -y curl && bash <(curl -Ls https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh)",
                    "安装 3X-UI 代理面板，支持 V2Ray/Xray 多协议管理"));
            scripts.add(buildScript("1panel", "1Panel 面板",
                    "bash -c \"$(curl -sSL https://resource.fit2cloud.com/1panel/package/v2/quick_start.sh)\"",
                    "安装 1Panel 服务器运维面板，支持 Docker/网站/数据库管理"));
            scripts.add(buildScript("base_tools", "基础工具",
                    "apt update && apt install -y dnsutils iperf3 jq tmux",
                    "轻量级瑞士军刀组件：DNS 诊断/带宽测试/JSON 处理/终端复用（<20MB）"));
            scripts.add(buildScript("dev_env", "开发环境",
                    "apt update && apt install -y python3-pip python3-venv build-essential git unzip zip tree && curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs",
                    "Node.js 22 + Python3 + GCC 编译工具链 + Git"));
            scripts.add(buildScript("cleanup", "安装后清理",
                    "apt autoremove -y && apt clean && rm -rf /tmp/* /var/tmp/* /var/lib/apt/lists/* && journalctl --vacuum-time=1s && truncate -s 0 /var/log/syslog /var/log/auth.log",
                    "清理安装缓存、日志、临时文件，回收磁盘空间"));
        }

        return R.ok(scripts);
    }

    private Map<String, Object> buildScript(String key, String label, String command, String description) {
        Map<String, Object> script = new LinkedHashMap<>();
        script.put("key", key);
        script.put("label", label);
        script.put("command", command);
        script.put("description", description);
        return script;
    }

    /**
     * IP 质量检测：查询 IP 的 ISP/ASN/地区/风险（代理/数据中心/移动网络）
     */
    @RequireRole
    @PostMapping("/ip-quality")
    public R ipQuality(@RequestBody Map<String, Object> params) {
        String ip = (String) params.get("ip");
        if (ip == null || ip.isBlank()) return R.err("IP 不能为空");
        IpQualityClient.IpQualityResult result = ipQualityClient.check(ip.trim());
        if (result == null) return R.err("IP 检测失败（可能请求过于频繁，ip-api.com 限 45 次/分钟）");
        return R.ok(result);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/create")
    public R create(@Validated @RequestBody AssetHostDto dto) {
        return assetHostService.createAsset(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R update(@Validated @RequestBody AssetHostUpdateDto dto) {
        return assetHostService.updateAsset(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@Validated @RequestBody AssetHostIdDto dto) {
        return assetHostService.deleteAsset(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/archive")
    public R archive(@Validated @RequestBody AssetHostIdDto dto) {
        return assetHostService.archiveAsset(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/restore")
    public R restore(@Validated @RequestBody AssetHostIdDto dto) {
        return assetHostService.restoreAsset(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/archived-list")
    public R archivedList() {
        return assetHostService.getArchivedAssets();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/batch-update")
    public R batchUpdate(@RequestBody java.util.Map<String, Object> params) {
        return assetHostService.batchUpdateField(params);
    }

    @RequireRole
    @PostMapping("/geolocate")
    public R geolocate(@RequestBody java.util.Map<String, String> params) {
        String ip = params.get("ip");
        if (ip == null || ip.isBlank()) return R.err("IP 不能为空");
        if (!ip.matches("^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$")) {
            return R.err("IP 格式不正确");
        }
        try {
            org.springframework.http.client.SimpleClientHttpRequestFactory factory =
                    new org.springframework.http.client.SimpleClientHttpRequestFactory();
            factory.setConnectTimeout(5000);
            factory.setReadTimeout(5000);
            RestTemplate rest = new RestTemplate(factory);
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> result = rest.getForObject(
                    "http://ip-api.com/json/" + ip + "?fields=status,country,countryCode,regionName,city,isp&lang=zh-CN",
                    java.util.Map.class);
            if (result != null && "success".equals(result.get("status"))) {
                return R.ok(result);
            }
            return R.err("IP 查询失败");
        } catch (Exception e) {
            return R.err("IP 查询异常: " + e.getMessage());
        }
    }

    /** 获取资产各维度的可选值（用于告警规则范围选择器） */
    @RequireRole
    @PostMapping("/scope-options")
    public R scopeOptions() {
        return assetHostService.getScopeOptions();
    }
}
