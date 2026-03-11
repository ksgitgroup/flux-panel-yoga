package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.*;
import com.admin.mapper.TrafficAnomalyMapper;
import com.admin.mapper.TrafficHourlyStatMapper;
import com.admin.service.ForwardService;
import com.admin.service.TrafficAnalysisService;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Slf4j
@Service
public class TrafficAnalysisServiceImpl implements TrafficAnalysisService {

    @Resource
    private TrafficHourlyStatMapper trafficHourlyStatMapper;
    @Resource
    private TrafficAnomalyMapper trafficAnomalyMapper;
    @Resource
    private ForwardService forwardService;
    @Resource
    private UserService userService;

    private static final DateTimeFormatter HOUR_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd-HH").withZone(ZoneId.systemDefault());

    /** Stores last-seen flow values for delta calculation: key = "forward_{id}" or "user_{id}" */
    private final ConcurrentHashMap<String, long[]> lastFlowSnapshot = new ConcurrentHashMap<>();

    @Override
    public R getOverview() {
        long now = System.currentTimeMillis();
        long last24h = now - 86400000L;

        List<TrafficHourlyStat> stats24 = trafficHourlyStatMapper.selectList(
                new LambdaQueryWrapper<TrafficHourlyStat>()
                        .eq(TrafficHourlyStat::getStatus, 0)
                        .ge(TrafficHourlyStat::getCreatedTime, last24h));

        long totalUpload24 = stats24.stream().mapToLong(s -> s.getUploadBytes() != null ? s.getUploadBytes() : 0).sum();
        long totalDownload24 = stats24.stream().mapToLong(s -> s.getDownloadBytes() != null ? s.getDownloadBytes() : 0).sum();
        long peakRate24 = stats24.stream().mapToLong(s -> s.getPeakRateBps() != null ? s.getPeakRateBps() : 0).max().orElse(0);

        long anomalyCount = trafficAnomalyMapper.selectCount(
                new LambdaQueryWrapper<TrafficAnomaly>()
                        .eq(TrafficAnomaly::getStatus, 0)
                        .eq(TrafficAnomaly::getAcknowledged, 0));

        Map<String, Object> overview = new HashMap<>();
        overview.put("totalUpload24h", totalUpload24);
        overview.put("totalDownload24h", totalDownload24);
        overview.put("peakRate24h", peakRate24);
        overview.put("unacknowledgedAnomalies", anomalyCount);
        return R.ok(overview);
    }

    @Override
    public R getTrend(String dimensionType, Long dimensionId, String range) {
        long now = System.currentTimeMillis();
        long from = resolveRange(now, range);

        LambdaQueryWrapper<TrafficHourlyStat> wrapper = new LambdaQueryWrapper<TrafficHourlyStat>()
                .eq(TrafficHourlyStat::getStatus, 0)
                .ge(TrafficHourlyStat::getCreatedTime, from);

        if (StringUtils.hasText(dimensionType)) {
            wrapper.eq(TrafficHourlyStat::getDimensionType, dimensionType);
        }
        if (dimensionId != null) {
            wrapper.eq(TrafficHourlyStat::getDimensionId, dimensionId);
        }
        wrapper.orderByAsc(TrafficHourlyStat::getHourKey);

        return R.ok(trafficHourlyStatMapper.selectList(wrapper));
    }

    @Override
    public R getTopUsers(String range, int limit) {
        if (limit < 1 || limit > 50) limit = 10;
        long now = System.currentTimeMillis();
        long from = resolveRange(now, range);

        List<TrafficHourlyStat> stats = trafficHourlyStatMapper.selectList(
                new LambdaQueryWrapper<TrafficHourlyStat>()
                        .eq(TrafficHourlyStat::getStatus, 0)
                        .eq(TrafficHourlyStat::getDimensionType, "user")
                        .ge(TrafficHourlyStat::getCreatedTime, from));

        return R.ok(aggregateTop(stats, limit));
    }

    @Override
    public R getTopForwards(String range, int limit) {
        if (limit < 1 || limit > 50) limit = 10;
        long now = System.currentTimeMillis();
        long from = resolveRange(now, range);

        List<TrafficHourlyStat> stats = trafficHourlyStatMapper.selectList(
                new LambdaQueryWrapper<TrafficHourlyStat>()
                        .eq(TrafficHourlyStat::getStatus, 0)
                        .eq(TrafficHourlyStat::getDimensionType, "forward")
                        .ge(TrafficHourlyStat::getCreatedTime, from));

        return R.ok(aggregateTop(stats, limit));
    }

    @Override
    public R getPeakHours(String range) {
        long now = System.currentTimeMillis();
        long from = resolveRange(now, range);

        List<TrafficHourlyStat> stats = trafficHourlyStatMapper.selectList(
                new LambdaQueryWrapper<TrafficHourlyStat>()
                        .eq(TrafficHourlyStat::getStatus, 0)
                        .ge(TrafficHourlyStat::getCreatedTime, from));

        Map<Integer, Long> hourlyTotals = new TreeMap<>();
        for (TrafficHourlyStat s : stats) {
            if (s.getHourKey() == null || s.getHourKey().length() < 2) continue;
            try {
                int hour = Integer.parseInt(s.getHourKey().substring(s.getHourKey().length() - 2));
                hourlyTotals.merge(hour, s.getTotalBytes() != null ? s.getTotalBytes() : 0, Long::sum);
            } catch (Exception ignored) {}
        }

        List<Map<String, Object>> result = hourlyTotals.entrySet().stream()
                .map(e -> Map.<String, Object>of("hour", e.getKey(), "totalBytes", e.getValue()))
                .collect(Collectors.toList());
        return R.ok(result);
    }

    @Override
    public R getProtocolDistribution(String range) {
        long now = System.currentTimeMillis();
        long from = resolveRange(now, range);

        List<TrafficHourlyStat> stats = trafficHourlyStatMapper.selectList(
                new LambdaQueryWrapper<TrafficHourlyStat>()
                        .eq(TrafficHourlyStat::getStatus, 0)
                        .eq(TrafficHourlyStat::getDimensionType, "protocol")
                        .ge(TrafficHourlyStat::getCreatedTime, from));

        Map<String, Long> protocolTotals = stats.stream()
                .filter(s -> s.getDimensionName() != null)
                .collect(Collectors.groupingBy(TrafficHourlyStat::getDimensionName,
                        Collectors.summingLong(s -> s.getTotalBytes() != null ? s.getTotalBytes() : 0)));

        List<Map<String, Object>> result = protocolTotals.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(e -> Map.<String, Object>of("protocol", e.getKey(), "totalBytes", e.getValue()))
                .collect(Collectors.toList());
        return R.ok(result);
    }

    @Override
    public R listAnomalies(int page, int size, Integer acknowledged) {
        if (page < 1) page = 1;
        if (size < 1 || size > 100) size = 20;

        LambdaQueryWrapper<TrafficAnomaly> wrapper = new LambdaQueryWrapper<TrafficAnomaly>()
                .eq(TrafficAnomaly::getStatus, 0);
        if (acknowledged != null) {
            wrapper.eq(TrafficAnomaly::getAcknowledged, acknowledged);
        }
        wrapper.orderByDesc(TrafficAnomaly::getCreatedTime);

        Page<TrafficAnomaly> p = trafficAnomalyMapper.selectPage(new Page<>(page, size), wrapper);
        return R.ok(Map.of("records", p.getRecords(), "total", p.getTotal(), "page", p.getCurrent(), "size", p.getSize()));
    }

    @Override
    public R acknowledgeAnomaly(Long id) {
        if (id == null) return R.err("异常ID不能为空");
        TrafficAnomaly anomaly = trafficAnomalyMapper.selectById(id);
        if (anomaly == null) return R.err("异常记录不存在");
        anomaly.setAcknowledged(1);
        anomaly.setUpdatedTime(System.currentTimeMillis());
        trafficAnomalyMapper.updateById(anomaly);
        return R.ok();
    }

    @Override
    public void aggregateHourlyStats() {
        long now = System.currentTimeMillis();
        String hourKey = HOUR_FMT.format(Instant.ofEpochMilli(now));
        log.info("[TrafficAnalysis] Hourly aggregation started for {}", hourKey);

        int count = 0;

        // Aggregate per-forward traffic
        List<Forward> forwards = forwardService.list();
        for (Forward f : forwards) {
            long inFlow = f.getInFlow() != null ? f.getInFlow() : 0;
            long outFlow = f.getOutFlow() != null ? f.getOutFlow() : 0;
            if (inFlow == 0 && outFlow == 0) continue;

            String snapshotKey = "forward_" + f.getId();
            long[] last = lastFlowSnapshot.get(snapshotKey);
            long deltaIn = 0, deltaOut = 0;

            if (last != null) {
                // Calculate delta; handle flow reset (value decreased = reset happened)
                deltaIn = inFlow >= last[0] ? inFlow - last[0] : inFlow;
                deltaOut = outFlow >= last[1] ? outFlow - last[1] : outFlow;
            } else {
                // First run after startup: record snapshot, skip writing (no delta yet)
                lastFlowSnapshot.put(snapshotKey, new long[]{inFlow, outFlow});
                continue;
            }

            lastFlowSnapshot.put(snapshotKey, new long[]{inFlow, outFlow});

            if (deltaIn > 0 || deltaOut > 0) {
                upsertHourlyStat("forward", f.getId().longValue(), f.getName(), hourKey, deltaOut, deltaIn, now);
                count++;
            }
        }

        // Aggregate per-user traffic
        List<User> users = userService.list();
        for (User u : users) {
            long inFlow = u.getInFlow() != null ? u.getInFlow() : 0;
            long outFlow = u.getOutFlow() != null ? u.getOutFlow() : 0;
            if (inFlow == 0 && outFlow == 0) continue;

            String snapshotKey = "user_" + u.getId();
            long[] last = lastFlowSnapshot.get(snapshotKey);
            long deltaIn = 0, deltaOut = 0;

            if (last != null) {
                deltaIn = inFlow >= last[0] ? inFlow - last[0] : inFlow;
                deltaOut = outFlow >= last[1] ? outFlow - last[1] : outFlow;
            } else {
                lastFlowSnapshot.put(snapshotKey, new long[]{inFlow, outFlow});
                continue;
            }

            lastFlowSnapshot.put(snapshotKey, new long[]{inFlow, outFlow});

            if (deltaIn > 0 || deltaOut > 0) {
                upsertHourlyStat("user", u.getId().longValue(), u.getUser(), hourKey, deltaOut, deltaIn, now);
                count++;
            }
        }

        log.info("[TrafficAnalysis] Hourly aggregation done: {} records for {}", count, hourKey);
    }

    /**
     * Insert or update an hourly stat record. If a record for the same dimension+hourKey
     * already exists (e.g. scheduler runs multiple times in the same hour), accumulate.
     */
    private void upsertHourlyStat(String dimType, Long dimId, String dimName,
                                   String hourKey, long uploadBytes, long downloadBytes, long now) {
        TrafficHourlyStat existing = trafficHourlyStatMapper.selectOne(
                new LambdaQueryWrapper<TrafficHourlyStat>()
                        .eq(TrafficHourlyStat::getDimensionType, dimType)
                        .eq(TrafficHourlyStat::getDimensionId, dimId)
                        .eq(TrafficHourlyStat::getHourKey, hourKey)
                        .last("LIMIT 1"));

        if (existing != null) {
            existing.setUploadBytes((existing.getUploadBytes() != null ? existing.getUploadBytes() : 0) + uploadBytes);
            existing.setDownloadBytes((existing.getDownloadBytes() != null ? existing.getDownloadBytes() : 0) + downloadBytes);
            existing.setTotalBytes(existing.getUploadBytes() + existing.getDownloadBytes());
            existing.setUpdatedTime(now);
            trafficHourlyStatMapper.updateById(existing);
        } else {
            TrafficHourlyStat stat = new TrafficHourlyStat();
            stat.setDimensionType(dimType);
            stat.setDimensionId(dimId);
            stat.setDimensionName(dimName);
            stat.setHourKey(hourKey);
            stat.setUploadBytes(uploadBytes);
            stat.setDownloadBytes(downloadBytes);
            stat.setTotalBytes(uploadBytes + downloadBytes);
            stat.setPeakRateBps(0L);
            stat.setCreatedTime(now);
            stat.setUpdatedTime(now);
            stat.setStatus(0);
            trafficHourlyStatMapper.insert(stat);
        }
    }

    private long resolveRange(long now, String range) {
        if (range == null) range = "24h";
        return switch (range) {
            case "1h" -> now - 3600000L;
            case "6h" -> now - 6 * 3600000L;
            case "24h" -> now - 86400000L;
            case "7d" -> now - 7 * 86400000L;
            case "30d" -> now - 30 * 86400000L;
            default -> now - 86400000L;
        };
    }

    private List<Map<String, Object>> aggregateTop(List<TrafficHourlyStat> stats, int limit) {
        Map<Long, Long> totals = stats.stream()
                .filter(s -> s.getDimensionId() != null)
                .collect(Collectors.groupingBy(TrafficHourlyStat::getDimensionId,
                        Collectors.summingLong(s -> s.getTotalBytes() != null ? s.getTotalBytes() : 0)));

        return totals.entrySet().stream()
                .sorted(Map.Entry.<Long, Long>comparingByValue().reversed())
                .limit(limit)
                .map(e -> {
                    Map<String, Object> item = new HashMap<>();
                    item.put("dimensionId", e.getKey());
                    item.put("totalBytes", e.getValue());
                    stats.stream()
                            .filter(s -> e.getKey().equals(s.getDimensionId()) && s.getDimensionName() != null)
                            .findFirst()
                            .ifPresent(s -> item.put("dimensionName", s.getDimensionName()));
                    return item;
                })
                .collect(Collectors.toList());
    }
}
