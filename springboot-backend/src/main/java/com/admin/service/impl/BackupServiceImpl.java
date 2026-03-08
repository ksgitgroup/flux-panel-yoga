package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.*;
import com.admin.mapper.BackupRecordMapper;
import com.admin.mapper.BackupScheduleMapper;
import com.admin.mapper.NodeMapper;
import com.admin.mapper.XuiInstanceMapper;
import com.admin.service.BackupService;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;

@Slf4j
@Service
public class BackupServiceImpl extends ServiceImpl<BackupRecordMapper, BackupRecord> implements BackupService {

    @Resource
    private BackupRecordMapper backupRecordMapper;

    @Resource
    private BackupScheduleMapper backupScheduleMapper;

    @Resource
    private NodeMapper nodeMapper;

    @Resource
    private XuiInstanceMapper xuiInstanceMapper;

    @Override
    public R listRecords(String type, int page, int size) {
        Page<BackupRecord> pageParam = new Page<>(page, size);
        QueryWrapper<BackupRecord> qw = new QueryWrapper<>();
        qw.eq("status", 0);
        if (type != null && !type.isEmpty()) {
            qw.eq("type", type);
        }
        qw.orderByDesc("created_time");
        return R.ok(backupRecordMapper.selectPage(pageParam, qw));
    }

    @Override
    public R exportGostConfig(Long nodeId) {
        Node node = nodeMapper.selectById(nodeId);
        if (node == null) {
            return R.err("节点不存在");
        }

        JSONObject configJson = new JSONObject();
        configJson.put("nodeId", node.getId());
        configJson.put("name", node.getName());
        configJson.put("ip", node.getIp());
        configJson.put("serverIp", node.getServerIp());
        configJson.put("version", node.getVersion());
        configJson.put("portSta", node.getPortSta());
        configJson.put("portEnd", node.getPortEnd());

        BackupRecord record = new BackupRecord();
        record.setName("GOST配置导出 - " + node.getName());
        record.setType("gost_config");
        record.setSourceId(nodeId);
        record.setSourceName(node.getName());
        record.setBackupData(configJson.toJSONString());
        record.setTriggerType("manual");
        record.setBackupStatus("success");
        record.setCreatedTime(System.currentTimeMillis());
        record.setUpdatedTime(System.currentTimeMillis());
        record.setStatus(0);
        backupRecordMapper.insert(record);

        return R.ok(record);
    }

    @Override
    public R exportXuiConfig(Long instanceId) {
        XuiInstance instance = xuiInstanceMapper.selectById(instanceId);
        if (instance == null) {
            return R.err("XUI实例不存在");
        }

        JSONObject configJson = new JSONObject();
        configJson.put("instanceId", instance.getId());
        configJson.put("name", instance.getName());
        configJson.put("provider", instance.getProvider());
        configJson.put("baseUrl", instance.getBaseUrl());
        configJson.put("webBasePath", instance.getWebBasePath());
        configJson.put("assetId", instance.getAssetId());
        configJson.put("managementMode", instance.getManagementMode());
        configJson.put("syncEnabled", instance.getSyncEnabled());
        configJson.put("syncIntervalMinutes", instance.getSyncIntervalMinutes());
        configJson.put("remark", instance.getRemark());

        BackupRecord record = new BackupRecord();
        record.setName("XUI配置导出 - " + instance.getName());
        record.setType("xui_config");
        record.setSourceId(instanceId);
        record.setSourceName(instance.getName());
        record.setBackupData(configJson.toJSONString());
        record.setTriggerType("manual");
        record.setBackupStatus("success");
        record.setCreatedTime(System.currentTimeMillis());
        record.setUpdatedTime(System.currentTimeMillis());
        record.setStatus(0);
        backupRecordMapper.insert(record);

        return R.ok(record);
    }

    @Override
    public R backupDatabase() {
        BackupRecord record = new BackupRecord();
        record.setName("数据库备份 - " + System.currentTimeMillis());
        record.setType("database");
        record.setBackupData("{\"note\":\"Manual database backup placeholder\"}");
        record.setTriggerType("manual");
        record.setBackupStatus("success");
        record.setCreatedTime(System.currentTimeMillis());
        record.setUpdatedTime(System.currentTimeMillis());
        record.setStatus(0);
        backupRecordMapper.insert(record);

        return R.ok(record);
    }

    @Override
    public R deleteRecord(Long id) {
        BackupRecord record = backupRecordMapper.selectById(id);
        if (record == null) {
            return R.err("备份记录不存在");
        }
        record.setStatus(1);
        record.setUpdatedTime(System.currentTimeMillis());
        backupRecordMapper.updateById(record);
        return R.ok();
    }

    @Override
    public R listSchedules() {
        QueryWrapper<BackupSchedule> qw = new QueryWrapper<>();
        qw.eq("status", 0);
        qw.orderByDesc("created_time");
        return R.ok(backupScheduleMapper.selectList(qw));
    }

    @Override
    public R createSchedule(BackupSchedule schedule) {
        schedule.setCreatedTime(System.currentTimeMillis());
        schedule.setUpdatedTime(System.currentTimeMillis());
        schedule.setStatus(0);
        if (schedule.getEnabled() == null) {
            schedule.setEnabled(1);
        }
        backupScheduleMapper.insert(schedule);
        return R.ok(schedule);
    }

    @Override
    public R updateSchedule(BackupSchedule schedule) {
        if (schedule.getId() == null) {
            return R.err("计划ID不能为空");
        }
        schedule.setUpdatedTime(System.currentTimeMillis());
        backupScheduleMapper.updateById(schedule);
        return R.ok(schedule);
    }

    @Override
    public R deleteSchedule(Long id) {
        BackupSchedule schedule = backupScheduleMapper.selectById(id);
        if (schedule == null) {
            return R.err("备份计划不存在");
        }
        schedule.setStatus(1);
        schedule.setUpdatedTime(System.currentTimeMillis());
        backupScheduleMapper.updateById(schedule);
        return R.ok();
    }
}
