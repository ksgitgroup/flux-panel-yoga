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
}
