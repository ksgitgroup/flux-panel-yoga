package com.admin.service;

import com.admin.common.lang.R;

import java.util.List;

public interface IpQualityService {

    R checkSingleIp(String ip, Long assetId);

    R batchCheck(List<Long> assetIds);

    R listRecords(int page, int size, String ip, String overallStatus);

    R getLatestByAsset();

    R getLatencyMatrix();
}
