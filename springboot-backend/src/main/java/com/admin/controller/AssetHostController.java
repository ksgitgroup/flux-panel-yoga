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
import org.springframework.web.client.RestTemplate;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/asset")
public class AssetHostController extends BaseController {

    @Autowired
    private AssetHostService assetHostService;

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
    @PostMapping("/batch-update")
    public R batchUpdate(@RequestBody java.util.Map<String, Object> params) {
        return assetHostService.batchUpdateField(params);
    }

    @RequireRole
    @PostMapping("/geolocate")
    public R geolocate(@RequestBody java.util.Map<String, String> params) {
        String ip = params.get("ip");
        if (ip == null || ip.isBlank()) return R.err("IP 不能为空");
        try {
            RestTemplate rest = new RestTemplate();
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
}
