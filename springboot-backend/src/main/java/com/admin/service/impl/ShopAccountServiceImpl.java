package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.IpPool;
import com.admin.entity.ShopAccount;
import com.admin.mapper.IpPoolMapper;
import com.admin.mapper.ShopAccountMapper;
import com.admin.service.ShopAccountService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.util.*;

@Slf4j
@Service
public class ShopAccountServiceImpl implements ShopAccountService {

    @Resource
    private ShopAccountMapper shopAccountMapper;
    @Resource
    private IpPoolMapper ipPoolMapper;
    @Resource
    private IpPoolServiceImpl ipPoolService;

    @Override
    public R list(int page, int size, String keyword, String platform, String accountStatus, String browserType) {
        LambdaQueryWrapper<ShopAccount> q = new LambdaQueryWrapper<ShopAccount>()
                .eq(ShopAccount::getStatus, 0);
        if (StringUtils.hasText(keyword)) {
            q.and(w -> w.like(ShopAccount::getName, keyword)
                    .or().like(ShopAccount::getLoginAccount, keyword)
                    .or().like(ShopAccount::getShopExternalId, keyword)
                    .or().like(ShopAccount::getRemark, keyword)
                    .or().like(ShopAccount::getOperator, keyword)
                    .or().like(ShopAccount::getTeam, keyword));
        }
        if (StringUtils.hasText(platform)) q.eq(ShopAccount::getPlatform, platform);
        if (StringUtils.hasText(accountStatus)) q.eq(ShopAccount::getAccountStatus, accountStatus);
        if (StringUtils.hasText(browserType)) q.eq(ShopAccount::getBrowserType, browserType);
        q.orderByDesc(ShopAccount::getCreatedTime);
        Page<ShopAccount> result = shopAccountMapper.selectPage(new Page<>(page, size), q);

        // 为每条记录附加 IP 信息
        List<Map<String, Object>> enriched = new ArrayList<>();
        for (ShopAccount shop : result.getRecords()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("shop", shop);
            if (shop.getIpPoolId() != null) {
                IpPool ip = ipPoolMapper.selectById(shop.getIpPoolId());
                if (ip != null && ip.getStatus() == 0) {
                    m.put("ipName", ip.getName());
                    m.put("exitIp", ip.getExitIp());
                    m.put("exitPort", ip.getExitPort());
                    m.put("protocol", ip.getProtocol());
                    m.put("countryCode", ip.getCountryCode());
                    m.put("healthStatus", ip.getHealthStatus());
                }
            }
            enriched.add(m);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("records", enriched);
        data.put("total", result.getTotal());
        data.put("page", page);
        data.put("size", size);
        return R.ok(data);
    }

    @Override
    public R create(ShopAccount entity) {
        entity.setCreatedTime(System.currentTimeMillis());
        entity.setUpdatedTime(System.currentTimeMillis());
        entity.setStatus(0);
        if (entity.getAccountStatus() == null) entity.setAccountStatus("active");
        shopAccountMapper.insert(entity);
        log.info("[ShopAccount] Created: {} ({})", entity.getName(), entity.getPlatform());
        return R.ok(entity);
    }

    @Override
    public R update(ShopAccount entity) {
        if (entity.getId() == null) return R.err("缺少 ID");
        ShopAccount existing = shopAccountMapper.selectById(entity.getId());
        if (existing == null || existing.getStatus() != 0) return R.err("店铺不存在");
        entity.setUpdatedTime(System.currentTimeMillis());
        shopAccountMapper.updateById(entity);
        return R.ok();
    }

    @Override
    public R delete(Long id) {
        ShopAccount entity = shopAccountMapper.selectById(id);
        if (entity == null) return R.err("不存在");
        // 解绑 IP
        if (entity.getIpPoolId() != null) {
            IpPool ip = ipPoolMapper.selectById(entity.getIpPoolId());
            if (ip != null) {
                ip.setBoundShopId(null);
                ip.setUpdatedTime(System.currentTimeMillis());
                ipPoolMapper.updateById(ip);
            }
        }
        entity.setStatus(-1);
        entity.setUpdatedTime(System.currentTimeMillis());
        shopAccountMapper.updateById(entity);
        return R.ok();
    }

    @Override
    public R detail(Long id) {
        ShopAccount shop = shopAccountMapper.selectById(id);
        if (shop == null || shop.getStatus() != 0) return R.err("不存在");

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("shop", shop);
        if (shop.getIpPoolId() != null) {
            IpPool ip = ipPoolMapper.selectById(shop.getIpPoolId());
            if (ip != null) data.put("ip", ip);
        }
        return R.ok(data);
    }

    @Override
    public R bindIp(Long shopId, Long ipPoolId) {
        return ipPoolService.bindToShop(ipPoolId, shopId);
    }

    @Override
    public R unbindIp(Long shopId) {
        ShopAccount shop = shopAccountMapper.selectById(shopId);
        if (shop == null) return R.err("不存在");
        if (shop.getIpPoolId() == null) return R.err("未绑定 IP");
        return ipPoolService.unbind(shop.getIpPoolId());
    }

    @Override
    public R exportBrowserProfile(Long shopId) {
        ShopAccount shop = shopAccountMapper.selectById(shopId);
        if (shop == null || shop.getStatus() != 0) return R.err("不存在");
        if (shop.getIpPoolId() == null) return R.err("该店铺未绑定 IP，请先绑定");

        R proxyConfig = ipPoolService.exportProxyConfig(shop.getIpPoolId(),
                shop.getBrowserType() != null ? shop.getBrowserType() : "generic");
        if (proxyConfig.getCode() != 0) return proxyConfig;

        // 更新导出时间
        shop.setLastProxyExportAt(System.currentTimeMillis());
        shop.setUpdatedTime(System.currentTimeMillis());
        shopAccountMapper.updateById(shop);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("shopName", shop.getName());
        result.put("platform", shop.getPlatform());
        result.put("browserType", shop.getBrowserType());
        result.put("browserProfileId", shop.getBrowserProfileId());
        result.put("proxyConfig", proxyConfig.getData());
        return R.ok(result);
    }

    @Override
    public R stats() {
        List<ShopAccount> all = shopAccountMapper.selectList(
                new LambdaQueryWrapper<ShopAccount>().eq(ShopAccount::getStatus, 0));
        int total = all.size();
        int bound = 0, unbound = 0, active = 0, suspended = 0;
        Map<String, Integer> byPlatform = new LinkedHashMap<>();
        Map<String, Integer> byTeam = new LinkedHashMap<>();
        for (ShopAccount s : all) {
            if (s.getIpPoolId() != null) bound++; else unbound++;
            if ("active".equals(s.getAccountStatus())) active++;
            else if ("suspended".equals(s.getAccountStatus()) || "banned".equals(s.getAccountStatus())) suspended++;
            String p = s.getPlatform() != null ? s.getPlatform() : "未知";
            byPlatform.merge(p, 1, Integer::sum);
            String t = s.getTeam() != null ? s.getTeam() : "未分配";
            byTeam.merge(t, 1, Integer::sum);
        }
        return R.ok(Map.of(
                "total", total, "bound", bound, "unbound", unbound,
                "active", active, "suspended", suspended,
                "byPlatform", byPlatform, "byTeam", byTeam
        ));
    }
}
