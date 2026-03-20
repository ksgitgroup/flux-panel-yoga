package com.admin.service;

import com.admin.common.dto.AlertRuleDto;
import com.admin.common.lang.R;
import com.admin.entity.MonitorAlertRule;
import com.baomidou.mybatisplus.extension.service.IService;

public interface AlertService extends IService<MonitorAlertRule> {

    R listRules();

    R createRule(AlertRuleDto dto);

    R updateRule(AlertRuleDto dto);

    R deleteRule(Long id);

    R toggleRule(Long id);

    R listLogs(int page, int size);
    R listLogs(int page, int size, String keyword, String severity, Long ruleId);

    R clearLogs();

    /** Evaluate all enabled rules against current metrics. Called after each sync. */
    void evaluateAlerts();

    // Rule Groups
    R listGroups();
    R createGroup(String name, String description);
    R updateGroup(Long id, String name, String description);
    R deleteGroup(Long id);
    R batchUpdateGroupRules(java.util.Map<String, Object> body);

    R recentLogs(int size, String severity);
}
