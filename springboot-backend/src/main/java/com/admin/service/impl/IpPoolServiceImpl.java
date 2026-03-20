package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.IpPool;
import com.admin.entity.ShopAccount;
import com.admin.mapper.IpPoolMapper;
import com.admin.mapper.ShopAccountMapper;
import com.admin.service.IpPoolService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.util.*;

@Slf4j
@Service
public class IpPoolServiceImpl implements IpPoolService {

    @Resource
    private IpPoolMapper ipPoolMapper;
    @Resource
    private ShopAccountMapper shopAccountMapper;

    @Override
    public R list(int page, int size, String keyword, String ipType, String healthStatus, String countryCode) {
        LambdaQueryWrapper<IpPool> q = new LambdaQueryWrapper<IpPool>()
                .eq(IpPool::getStatus, 0);
        if (StringUtils.hasText(keyword)) {
            q.and(w -> w.like(IpPool::getName, keyword)
                    .or().like(IpPool::getExitIp, keyword)
                    .or().like(IpPool::getRemark, keyword)
                    .or().like(IpPool::getRegion, keyword));
        }
        if (StringUtils.hasText(ipType)) q.eq(IpPool::getIpType, ipType);
        if (StringUtils.hasText(healthStatus)) q.eq(IpPool::getHealthStatus, healthStatus);
        if (StringUtils.hasText(countryCode)) q.eq(IpPool::getCountryCode, countryCode);
        q.orderByDesc(IpPool::getCreatedTime);
        Page<IpPool> result = ipPoolMapper.selectPage(new Page<>(page, size), q);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("records", result.getRecords());
        data.put("total", result.getTotal());
        data.put("page", page);
        data.put("size", size);
        return R.ok(data);
    }

    @Override
    public R create(IpPool entity) {
        entity.setCreatedTime(System.currentTimeMillis());
        entity.setUpdatedTime(System.currentTimeMillis());
        entity.setStatus(0);
        if (entity.getHealthStatus() == null) entity.setHealthStatus("healthy");
        if (entity.getHealthScore() == null) entity.setHealthScore(100);
        if (entity.getRiskScore() == null) entity.setRiskScore(0);
        if (entity.getBlacklisted() == null) entity.setBlacklisted(0);
        ipPoolMapper.insert(entity);
        log.info("[IpPool] Created: {} ({})", entity.getName(), entity.getExitIp());
        return R.ok(entity);
    }

    @Override
    public R update(IpPool entity) {
        if (entity.getId() == null) return R.err("缺少 ID");
        IpPool existing = ipPoolMapper.selectById(entity.getId());
        if (existing == null || existing.getStatus() != 0) return R.err("IP 池条目不存在");
        entity.setUpdatedTime(System.currentTimeMillis());
        ipPoolMapper.updateById(entity);
        return R.ok();
    }

    @Override
    public R delete(Long id) {
        IpPool entity = ipPoolMapper.selectById(id);
        if (entity == null) return R.err("不存在");
        // 如果有绑定的店铺，先解绑
        if (entity.getBoundShopId() != null) {
            ShopAccount shop = shopAccountMapper.selectById(entity.getBoundShopId());
            if (shop != null) {
                shop.setIpPoolId(null);
                shop.setUpdatedTime(System.currentTimeMillis());
                shopAccountMapper.updateById(shop);
            }
        }
        entity.setStatus(-1);
        entity.setUpdatedTime(System.currentTimeMillis());
        ipPoolMapper.updateById(entity);
        return R.ok();
    }

    @Override
    public R healthCheck(Long id) {
        IpPool entity = ipPoolMapper.selectById(id);
        if (entity == null || entity.getStatus() != 0) return R.err("IP 池条目不存在");

        // 基础连通性检测（TCP connect test）
        String ip = entity.getExitIp();
        int port = entity.getExitPort() != null ? entity.getExitPort() : 1080;
        boolean reachable = false;
        long latency = -1;
        try {
            long start = System.currentTimeMillis();
            java.net.Socket socket = new java.net.Socket();
            socket.connect(new java.net.InetSocketAddress(ip, port), 5000);
            latency = System.currentTimeMillis() - start;
            socket.close();
            reachable = true;
        } catch (Exception e) {
            log.warn("[IpPool] Health check failed for {}:{} — {}", ip, port, e.getMessage());
        }

        entity.setLastHealthCheckAt(System.currentTimeMillis());
        if (reachable) {
            entity.setHealthStatus("healthy");
            entity.setHealthScore(latency < 200 ? 100 : latency < 500 ? 80 : latency < 1000 ? 60 : 40);
        } else {
            entity.setHealthStatus("down");
            entity.setHealthScore(0);
        }
        entity.setUpdatedTime(System.currentTimeMillis());
        ipPoolMapper.updateById(entity);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reachable", reachable);
        result.put("latency", latency);
        result.put("healthStatus", entity.getHealthStatus());
        result.put("healthScore", entity.getHealthScore());
        return R.ok(result);
    }

    @Override
    public R batchHealthCheck() {
        List<IpPool> all = ipPoolMapper.selectList(
                new LambdaQueryWrapper<IpPool>().eq(IpPool::getStatus, 0));
        int checked = 0, healthy = 0, down = 0;
        for (IpPool ip : all) {
            try {
                healthCheck(ip.getId());
                IpPool updated = ipPoolMapper.selectById(ip.getId());
                if ("healthy".equals(updated.getHealthStatus())) healthy++;
                else down++;
                checked++;
            } catch (Exception e) {
                log.warn("[IpPool] Batch health check error for {}: {}", ip.getName(), e.getMessage());
            }
        }
        return R.ok(Map.of("checked", checked, "healthy", healthy, "down", down));
    }

    @Override
    public R bindToShop(Long ipPoolId, Long shopId) {
        IpPool ip = ipPoolMapper.selectById(ipPoolId);
        if (ip == null || ip.getStatus() != 0) return R.err("IP 不存在");
        ShopAccount shop = shopAccountMapper.selectById(shopId);
        if (shop == null || shop.getStatus() != 0) return R.err("店铺不存在");

        // 如果 IP 已绑定其他店铺，先解绑
        if (ip.getBoundShopId() != null && !ip.getBoundShopId().equals(shopId)) {
            ShopAccount oldShop = shopAccountMapper.selectById(ip.getBoundShopId());
            if (oldShop != null) {
                oldShop.setIpPoolId(null);
                oldShop.setUpdatedTime(System.currentTimeMillis());
                shopAccountMapper.updateById(oldShop);
            }
        }
        // 如果店铺已绑定其他 IP，先解绑
        if (shop.getIpPoolId() != null && !shop.getIpPoolId().equals(ipPoolId)) {
            IpPool oldIp = ipPoolMapper.selectById(shop.getIpPoolId());
            if (oldIp != null) {
                oldIp.setBoundShopId(null);
                oldIp.setUpdatedTime(System.currentTimeMillis());
                ipPoolMapper.updateById(oldIp);
            }
        }

        ip.setBoundShopId(shopId);
        ip.setUpdatedTime(System.currentTimeMillis());
        ipPoolMapper.updateById(ip);

        shop.setIpPoolId(ipPoolId);
        shop.setUpdatedTime(System.currentTimeMillis());
        shopAccountMapper.updateById(shop);

        log.info("[IpPool] Bound IP {} ({}) to shop {} ({})", ip.getName(), ip.getExitIp(), shop.getName(), shop.getPlatform());
        return R.ok();
    }

    @Override
    public R unbind(Long ipPoolId) {
        IpPool ip = ipPoolMapper.selectById(ipPoolId);
        if (ip == null) return R.err("不存在");
        if (ip.getBoundShopId() != null) {
            ShopAccount shop = shopAccountMapper.selectById(ip.getBoundShopId());
            if (shop != null) {
                shop.setIpPoolId(null);
                shop.setUpdatedTime(System.currentTimeMillis());
                shopAccountMapper.updateById(shop);
            }
        }
        ip.setBoundShopId(null);
        ip.setUpdatedTime(System.currentTimeMillis());
        ipPoolMapper.updateById(ip);
        return R.ok();
    }

    @Override
    public R exportProxyConfig(Long id, String browserType) {
        IpPool ip = ipPoolMapper.selectById(id);
        if (ip == null || ip.getStatus() != 0) return R.err("不存在");

        Map<String, Object> config = new LinkedHashMap<>();
        String proxyUrl = (ip.getProtocol() != null ? ip.getProtocol() : "socks5") +
                "://" + (StringUtils.hasText(ip.getProxyUser()) ? ip.getProxyUser() + ":" + (ip.getProxyPass() != null ? ip.getProxyPass() : "") + "@" : "") +
                ip.getExitIp() + ":" + (ip.getExitPort() != null ? ip.getExitPort() : 1080);

        if ("ads".equalsIgnoreCase(browserType)) {
            // AdsPower JSON format
            config.put("proxy_type", ip.getProtocol() != null ? ip.getProtocol() : "socks5");
            config.put("proxy_host", ip.getExitIp());
            config.put("proxy_port", ip.getExitPort() != null ? ip.getExitPort() : 1080);
            config.put("proxy_user", ip.getProxyUser() != null ? ip.getProxyUser() : "");
            config.put("proxy_password", ip.getProxyPass() != null ? ip.getProxyPass() : "");
        } else if ("ziniao".equalsIgnoreCase(browserType)) {
            // 紫鸟格式
            config.put("proxyUrl", proxyUrl);
            config.put("proxyType", ip.getProtocol() != null ? ip.getProtocol().toUpperCase() : "SOCKS5");
            config.put("host", ip.getExitIp());
            config.put("port", ip.getExitPort() != null ? ip.getExitPort() : 1080);
            config.put("username", ip.getProxyUser() != null ? ip.getProxyUser() : "");
            config.put("password", ip.getProxyPass() != null ? ip.getProxyPass() : "");
        } else {
            // 通用格式
            config.put("url", proxyUrl);
            config.put("protocol", ip.getProtocol());
            config.put("host", ip.getExitIp());
            config.put("port", ip.getExitPort());
            config.put("username", ip.getProxyUser());
            config.put("password", ip.getProxyPass());
        }
        config.put("name", ip.getName());
        config.put("region", ip.getRegion());
        config.put("countryCode", ip.getCountryCode());
        return R.ok(config);
    }

    @Override
    public R stats() {
        List<IpPool> all = ipPoolMapper.selectList(
                new LambdaQueryWrapper<IpPool>().eq(IpPool::getStatus, 0));
        int total = all.size();
        int bound = 0, idle = 0, healthy = 0, degraded = 0, down = 0;
        Map<String, Integer> byCountry = new LinkedHashMap<>();
        Map<String, Integer> byType = new LinkedHashMap<>();
        for (IpPool ip : all) {
            if (ip.getBoundShopId() != null) bound++; else idle++;
            if ("healthy".equals(ip.getHealthStatus())) healthy++;
            else if ("degraded".equals(ip.getHealthStatus())) degraded++;
            else down++;
            String cc = ip.getCountryCode() != null ? ip.getCountryCode() : "未知";
            byCountry.merge(cc, 1, Integer::sum);
            String t = ip.getIpType() != null ? ip.getIpType() : "未知";
            byType.merge(t, 1, Integer::sum);
        }
        return R.ok(Map.of(
                "total", total, "bound", bound, "idle", idle,
                "healthy", healthy, "degraded", degraded, "down", down,
                "byCountry", byCountry, "byType", byType
        ));
    }
}
