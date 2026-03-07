package com.admin.service.impl;

import com.admin.common.dto.PortalLinkDto;
import com.admin.common.dto.PortalLinkSaveDto;
import com.admin.common.lang.R;
import com.admin.entity.ViteConfig;
import com.admin.mapper.ViteConfigMapper;
import com.admin.service.PortalLinkService;
import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
public class PortalLinkServiceImpl implements PortalLinkService {

    private static final String CONFIG_KEY = "portal_nav_links";
    private static final String DEFAULT_GROUP_NAME = "常用入口";
    private static final String TARGET_NEW_TAB = "new_tab";
    private static final String TARGET_SAME_TAB = "same_tab";

    @Resource
    private ViteConfigMapper viteConfigMapper;

    @Override
    public R getPortalLinks() {
        return R.ok(loadPortalLinks());
    }

    @Override
    public R savePortalLinks(PortalLinkSaveDto dto) {
        List<PortalLinkDto> normalizedItems = normalizeLinks(dto == null ? null : dto.getItems(), true);
        savePortalLinksConfig(normalizedItems);
        return R.ok(normalizedItems);
    }

    private List<PortalLinkDto> loadPortalLinks() {
        ViteConfig config = viteConfigMapper.selectOne(new QueryWrapper<ViteConfig>()
                .eq("name", CONFIG_KEY)
                .last("LIMIT 1"));
        if (config == null || !StringUtils.hasText(config.getValue())) {
            return new ArrayList<>();
        }
        try {
            List<PortalLinkDto> items = JSON.parseArray(config.getValue(), PortalLinkDto.class);
            return normalizeLinks(items, false);
        } catch (Exception e) {
            log.warn("[PortalLinks] 解析导航配置失败，将返回空列表: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    private void savePortalLinksConfig(List<PortalLinkDto> items) {
        String json = JSON.toJSONString(items);
        ViteConfig existing = viteConfigMapper.selectOne(new QueryWrapper<ViteConfig>()
                .eq("name", CONFIG_KEY)
                .last("LIMIT 1"));
        long now = System.currentTimeMillis();
        if (existing == null) {
            ViteConfig config = new ViteConfig();
            config.setName(CONFIG_KEY);
            config.setValue(json);
            config.setTime(now);
            viteConfigMapper.insert(config);
            return;
        }
        existing.setValue(json);
        existing.setTime(now);
        viteConfigMapper.updateById(existing);
    }

    private List<PortalLinkDto> normalizeLinks(List<PortalLinkDto> items, boolean strictMode) {
        List<PortalLinkDto> sourceItems = items == null ? new ArrayList<>() : items;
        List<PortalLinkDto> normalizedItems = new ArrayList<>();
        Set<String> seenIds = new HashSet<>();
        for (int i = 0; i < sourceItems.size(); i++) {
            PortalLinkDto item = sourceItems.get(i);
            if (item == null) {
                continue;
            }
            try {
                PortalLinkDto normalized = normalizeItem(item, i, seenIds);
                normalizedItems.add(normalized);
            } catch (Exception e) {
                if (strictMode) {
                    throw e;
                }
                log.warn("[PortalLinks] 跳过损坏的导航入口配置: {}", e.getMessage());
            }
        }
        return normalizedItems;
    }

    private PortalLinkDto normalizeItem(PortalLinkDto item, int index, Set<String> seenIds) {
        String title = requireText(item.getTitle(), "导航名称不能为空");
        String href = normalizeHref(item.getHref());

        PortalLinkDto normalized = new PortalLinkDto();
        normalized.setId(normalizeUniqueId(item.getId(), seenIds));
        normalized.setGroupName(limitLength(defaultIfBlank(item.getGroupName(), DEFAULT_GROUP_NAME), 40, "分组名称过长"));
        normalized.setTitle(limitLength(title, 80, "导航名称不能超过 80 个字符"));
        normalized.setHref(limitLength(href, 500, "链接地址过长"));
        normalized.setDescription(limitLength(trimToNull(item.getDescription()), 160, "描述不能超过 160 个字符"));
        normalized.setAbbr(normalizeAbbr(item.getAbbr(), normalized.getTitle()));
        normalized.setEnvironment(limitLength(trimToNull(item.getEnvironment()), 32, "环境标记不能超过 32 个字符"));
        normalized.setTarget(normalizeTarget(item.getTarget()));
        normalized.setSortOrder(item.getSortOrder() == null ? (index + 1) * 10 : Math.max(item.getSortOrder(), 0));
        normalized.setEnabled(item.getEnabled() == null || item.getEnabled());
        return normalized;
    }

    private String normalizeHref(String href) {
        String value = requireText(href, "链接地址不能为空");
        String lowerValue = value.toLowerCase(Locale.ROOT);
        if (value.startsWith("/")) {
            return value;
        }
        if (lowerValue.startsWith("http://") || lowerValue.startsWith("https://")) {
            return value;
        }
        throw new IllegalStateException("链接地址仅支持 http/https 或站内相对路径");
    }

    private String normalizeUniqueId(String rawId, Set<String> seenIds) {
        String candidate = trimToNull(rawId);
        if (candidate != null) {
            candidate = candidate.replaceAll("[^A-Za-z0-9_-]", "");
        }
        if (!StringUtils.hasText(candidate)) {
            candidate = UUID.randomUUID().toString().replace("-", "");
        }
        while (seenIds.contains(candidate)) {
            candidate = candidate + "_" + (seenIds.size() + 1);
        }
        seenIds.add(candidate);
        return candidate;
    }

    private String normalizeAbbr(String abbr, String title) {
        String value = trimToNull(abbr);
        if (!StringUtils.hasText(value)) {
            String compactTitle = title.replaceAll("\\s+", "");
            value = compactTitle.length() <= 2 ? compactTitle : compactTitle.substring(0, 2);
        }
        return limitLength(value.toUpperCase(Locale.ROOT), 4, "导航缩写不能超过 4 个字符");
    }

    private String normalizeTarget(String target) {
        String value = trimToNull(target);
        if (!StringUtils.hasText(value)) {
            return TARGET_NEW_TAB;
        }
        String normalized = value.toLowerCase(Locale.ROOT);
        if (TARGET_SAME_TAB.equals(normalized)) {
            return TARGET_SAME_TAB;
        }
        return TARGET_NEW_TAB;
    }

    private String defaultIfBlank(String value, String defaultValue) {
        String trimmed = trimToNull(value);
        return trimmed == null ? defaultValue : trimmed;
    }

    private String requireText(String value, String message) {
        String trimmed = trimToNull(value);
        if (!StringUtils.hasText(trimmed)) {
            throw new IllegalStateException(message);
        }
        return trimmed;
    }

    private String limitLength(String value, int maxLength, String message) {
        if (!StringUtils.hasText(value)) {
            return value;
        }
        if (value.length() > maxLength) {
            throw new IllegalStateException(message);
        }
        return value;
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }
}
