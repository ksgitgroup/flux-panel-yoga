package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.AssetHost;
import com.admin.entity.IpCheckRecord;
import com.admin.entity.LatencyMatrix;
import com.admin.mapper.AssetHostMapper;
import com.admin.mapper.IpCheckRecordMapper;
import com.admin.mapper.LatencyMatrixMapper;
import com.admin.service.IpQualityService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class IpQualityServiceImpl implements IpQualityService {

    @Resource
    private IpCheckRecordMapper ipCheckRecordMapper;
    @Resource
    private LatencyMatrixMapper latencyMatrixMapper;
    @Resource
    private AssetHostMapper assetHostMapper;

    @Override
    public R checkSingleIp(String ip, Long assetId) {
        if (!StringUtils.hasText(ip)) return R.err("IP不能为空");

        String assetName = null;
        if (assetId != null) {
            AssetHost asset = assetHostMapper.selectById(assetId);
            if (asset != null) assetName = asset.getName();
        }

        int blacklistScore = 0;
        String overallStatus = "clean";

        IpCheckRecord record = new IpCheckRecord();
        record.setIp(ip);
        record.setAssetId(assetId);
        record.setAssetName(assetName);
        record.setCheckType("manual");
        record.setBlacklistResult("none");
        record.setBlacklistScore(blacklistScore);
        record.setGeoInfo("{}");
        record.setPortCheck("{}");
        record.setOverallStatus(overallStatus);
        record.setCreatedTime(System.currentTimeMillis());
        record.setUpdatedTime(System.currentTimeMillis());
        record.setStatus(0);
        ipCheckRecordMapper.insert(record);

        return R.ok(record);
    }

    @Override
    public R batchCheck(List<Long> assetIds) {
        if (assetIds == null || assetIds.isEmpty()) return R.err("资产列表不能为空");

        List<IpCheckRecord> results = new ArrayList<>();
        for (Long assetId : assetIds) {
            AssetHost asset = assetHostMapper.selectById(assetId);
            if (asset == null || !StringUtils.hasText(asset.getPrimaryIp())) continue;
            R r = checkSingleIp(asset.getPrimaryIp(), assetId);
            if (r.getCode() == 0 && r.getData() != null) {
                results.add((IpCheckRecord) r.getData());
            }
        }
        return R.ok(results);
    }

    @Override
    public R listRecords(int page, int size, String ip, String overallStatus) {
        if (page < 1) page = 1;
        if (size < 1 || size > 100) size = 20;

        LambdaQueryWrapper<IpCheckRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(IpCheckRecord::getStatus, 0);
        if (StringUtils.hasText(ip)) {
            wrapper.like(IpCheckRecord::getIp, ip);
        }
        if (StringUtils.hasText(overallStatus)) {
            wrapper.eq(IpCheckRecord::getOverallStatus, overallStatus);
        }
        wrapper.orderByDesc(IpCheckRecord::getCreatedTime);

        Page<IpCheckRecord> p = ipCheckRecordMapper.selectPage(new Page<>(page, size), wrapper);
        return R.ok(Map.of("records", p.getRecords(), "total", p.getTotal(), "page", p.getCurrent(), "size", p.getSize()));
    }

    @Override
    public R getLatestByAsset() {
        List<IpCheckRecord> allRecords = ipCheckRecordMapper.selectList(
                new LambdaQueryWrapper<IpCheckRecord>()
                        .eq(IpCheckRecord::getStatus, 0)
                        .isNotNull(IpCheckRecord::getAssetId)
                        .orderByDesc(IpCheckRecord::getCreatedTime));

        Map<Long, IpCheckRecord> latestByAsset = new LinkedHashMap<>();
        for (IpCheckRecord r : allRecords) {
            latestByAsset.putIfAbsent(r.getAssetId(), r);
        }
        return R.ok(new ArrayList<>(latestByAsset.values()));
    }

    @Override
    public R getLatencyMatrix() {
        List<LatencyMatrix> matrices = latencyMatrixMapper.selectList(
                new LambdaQueryWrapper<LatencyMatrix>()
                        .eq(LatencyMatrix::getStatus, 0)
                        .orderByDesc(LatencyMatrix::getCreatedTime));
        return R.ok(matrices);
    }
}
