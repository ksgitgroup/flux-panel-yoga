package com.admin.service;

import com.admin.common.lang.R;

public interface TrafficAnalysisService {

    R getOverview();

    R getTrend(String dimensionType, Long dimensionId, String range);

    R getTopUsers(String range, int limit);

    R getTopForwards(String range, int limit);

    R getPeakHours(String range);

    R getProtocolDistribution(String range);

    R listAnomalies(int page, int size, Integer acknowledged);

    R acknowledgeAnomaly(Long id);

    void aggregateHourlyStats();
}
