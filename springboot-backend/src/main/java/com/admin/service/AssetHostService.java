package com.admin.service;

import com.admin.common.dto.AssetHostDto;
import com.admin.common.dto.AssetHostUpdateDto;
import com.admin.entity.AssetHost;
import com.admin.common.lang.R;
import com.baomidou.mybatisplus.extension.service.IService;

public interface AssetHostService extends IService<AssetHost> {

    R getAllAssets();

    R getAssetDetail(Long id);

    R createAsset(AssetHostDto dto);

    R updateAsset(AssetHostUpdateDto dto);

    R deleteAsset(Long id);
}
