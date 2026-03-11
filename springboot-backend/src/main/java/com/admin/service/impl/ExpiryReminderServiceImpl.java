package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.AssetHost;
import com.admin.entity.ExpiryReminderConfig;
import com.admin.mapper.AssetHostMapper;
import com.admin.mapper.ExpiryReminderConfigMapper;
import com.admin.service.ExpiryReminderService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.util.*;

@Slf4j
@Service
public class ExpiryReminderServiceImpl extends ServiceImpl<ExpiryReminderConfigMapper, ExpiryReminderConfig> implements ExpiryReminderService {

    @Resource
    private AssetHostMapper assetHostMapper;

    @Override
    public R getConfig() {
        List<ExpiryReminderConfig> configs = this.list();
        if (configs.isEmpty()) {
            ExpiryReminderConfig defaultConfig = new ExpiryReminderConfig();
            defaultConfig.setEnabled(0);
            defaultConfig.setRemindDaysBefore("30,14,7,3,1");
            defaultConfig.setNotifyChannel("log");
            defaultConfig.setCreatedTime(System.currentTimeMillis());
            defaultConfig.setUpdatedTime(System.currentTimeMillis());
            defaultConfig.setStatus(0);
            this.save(defaultConfig);
            return R.ok(defaultConfig);
        }
        return R.ok(configs.get(0));
    }

    @Override
    public R updateConfig(ExpiryReminderConfig config) {
        if (config.getId() == null) {
            return R.err("配置ID不能为空");
        }
        config.setUpdatedTime(System.currentTimeMillis());
        this.updateById(config);
        return R.ok();
    }

    @Override
    public R checkAndNotify() {
        List<ExpiryReminderConfig> configs = this.list();
        if (configs.isEmpty()) {
            log.info("[ExpiryCheck] No config found, skipping");
            return R.ok("no config");
        }
        ExpiryReminderConfig config = configs.get(0);
        if (config.getEnabled() == null || config.getEnabled() != 1) {
            log.info("[ExpiryCheck] Reminder disabled, skipping");
            return R.ok("disabled");
        }

        // Parse remind days
        String remindDaysStr = config.getRemindDaysBefore();
        if (!StringUtils.hasText(remindDaysStr)) {
            remindDaysStr = "30,14,7,3,1";
        }
        Set<Integer> remindDays = new HashSet<>();
        for (String s : remindDaysStr.split(",")) {
            try {
                remindDays.add(Integer.parseInt(s.trim()));
            } catch (NumberFormatException ignored) {
            }
        }

        // Query active assets with expireDate (exclude -1 which means never expire)
        List<AssetHost> assets = assetHostMapper.selectList(
                new LambdaQueryWrapper<AssetHost>()
                        .isNotNull(AssetHost::getExpireDate)
                        .ne(AssetHost::getExpireDate, -1L)
                        .eq(AssetHost::getStatus, 0));

        long now = System.currentTimeMillis();
        int notified = 0;
        List<Map<String, Object>> results = new ArrayList<>();

        for (AssetHost asset : assets) {
            long daysRemaining = (asset.getExpireDate() - now) / 86400000L;
            boolean shouldNotify = false;

            if (daysRemaining < 0) {
                // Already expired
                shouldNotify = true;
            } else {
                for (int day : remindDays) {
                    if (daysRemaining <= day) {
                        shouldNotify = true;
                        break;
                    }
                }
            }

            if (shouldNotify) {
                String msg;
                if (daysRemaining < 0) {
                    msg = String.format("[到期提醒] 资产 %s (%s) 已过期 %d 天",
                            asset.getName(), asset.getPrimaryIp(), Math.abs(daysRemaining));
                } else {
                    msg = String.format("[到期提醒] 资产 %s (%s) 将在 %d 天后到期",
                            asset.getName(), asset.getPrimaryIp(), daysRemaining);
                }
                log.warn(msg);

                Map<String, Object> item = new HashMap<>();
                item.put("assetId", asset.getId());
                item.put("name", asset.getName());
                item.put("primaryIp", asset.getPrimaryIp());
                item.put("expireDate", asset.getExpireDate());
                item.put("daysRemaining", daysRemaining);
                item.put("message", msg);
                results.add(item);
                notified++;
            }
        }

        // Update lastCheckAt
        config.setLastCheckAt(now);
        config.setUpdatedTime(now);
        this.updateById(config);

        log.info("[ExpiryCheck] Checked {} assets, {} need attention", assets.size(), notified);

        Map<String, Object> summary = new HashMap<>();
        summary.put("checkedCount", assets.size());
        summary.put("notifiedCount", notified);
        summary.put("details", results);
        return R.ok(summary);
    }
}
