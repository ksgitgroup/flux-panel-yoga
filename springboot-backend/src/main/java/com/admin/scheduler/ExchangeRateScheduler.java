package com.admin.scheduler;

import com.admin.service.ViteConfigService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Fetches exchange rates daily from open.er-api.com and stores in vite_config.
 * Config key: exchange_rates → JSON {"CNY":1,"USD":7.24,"EUR":7.88,...} (1 foreign = ? CNY)
 * Config key: exchange_rates_updated → timestamp of last successful fetch
 */
@Slf4j
@Component
public class ExchangeRateScheduler {

    @Resource
    private ViteConfigService viteConfigService;

    private static final String API_URL = "https://open.er-api.com/v6/latest/CNY";

    private static final String[] TARGET_CURRENCIES = {
            "USD", "EUR", "GBP", "JPY", "HKD", "TWD", "KRW", "RUB",
            "CAD", "AUD", "SGD", "MYR", "THB", "INR", "TRY", "BRL"
    };

    /** Run daily at 06:00 UTC (14:00 CST) */
    @Scheduled(cron = "0 0 6 * * ?")
    public void dailyFetch() {
        fetchAndStore();
    }

    /** Run once 2 minutes after startup to populate initial data */
    @Scheduled(initialDelay = 120_000, fixedDelay = Long.MAX_VALUE)
    public void initialFetch() {
        fetchAndStore();
    }

    private void fetchAndStore() {
        log.info("[ExchangeRate] Fetching rates from open.er-api.com...");
        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .build();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(API_URL))
                    .timeout(Duration.ofSeconds(15))
                    .GET()
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                log.warn("[ExchangeRate] API returned status {}", response.statusCode());
                return;
            }

            ObjectMapper om = new ObjectMapper();
            JsonNode root = om.readTree(response.body());
            if (!"success".equals(root.path("result").asText())) {
                log.warn("[ExchangeRate] API result: {}", root.path("result").asText());
                return;
            }

            // API returns: 1 CNY = X foreign. We need inverse: 1 foreign = 1/X CNY.
            JsonNode apiRates = root.path("rates");
            Map<String, Object> ratesToCNY = new LinkedHashMap<>();
            ratesToCNY.put("CNY", 1.0);
            for (String cur : TARGET_CURRENCIES) {
                double rate = apiRates.path(cur).asDouble(0);
                if (rate > 0) {
                    ratesToCNY.put(cur, Math.round((1.0 / rate) * 10000.0) / 10000.0);
                }
            }

            String json = om.writeValueAsString(ratesToCNY);
            viteConfigService.updateConfig("exchange_rates", json);
            viteConfigService.updateConfig("exchange_rates_updated", String.valueOf(System.currentTimeMillis()));
            log.info("[ExchangeRate] Updated {} currencies", ratesToCNY.size());

        } catch (Exception e) {
            log.error("[ExchangeRate] Failed: {}", e.getMessage());
        }
    }
}
