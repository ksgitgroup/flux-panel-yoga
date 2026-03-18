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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import javax.sql.DataSource;
import java.sql.*;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

    @Autowired
    private DataSource dataSource;

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
        long now = System.currentTimeMillis();
        record.setName("数据库备份 - " + new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date(now)));
        record.setType("database");
        record.setTriggerType("manual");
        record.setCreatedTime(now);
        record.setUpdatedTime(now);
        record.setStatus(0);

        try (Connection conn = dataSource.getConnection()) {
            DatabaseMetaData meta = conn.getMetaData();
            String catalog = conn.getCatalog();
            Map<String, Object> backup = new LinkedHashMap<>();
            backup.put("database", catalog);
            backup.put("timestamp", now);
            backup.put("server", meta.getDatabaseProductName() + " " + meta.getDatabaseProductVersion());

            // Export each table: row count + structure summary
            List<Map<String, Object>> tables = new ArrayList<>();
            try (ResultSet rs = meta.getTables(catalog, null, "%", new String[]{"TABLE"})) {
                while (rs.next()) {
                    String tableName = rs.getString("TABLE_NAME");
                    Map<String, Object> tableInfo = new LinkedHashMap<>();
                    tableInfo.put("name", tableName);

                    // Row count
                    try (Statement stmt = conn.createStatement();
                         ResultSet countRs = stmt.executeQuery("SELECT COUNT(*) FROM `" + tableName.replace("`", "``") + "`")) {
                        tableInfo.put("rows", countRs.next() ? countRs.getLong(1) : 0);
                    }

                    // Column info
                    List<String> columns = new ArrayList<>();
                    try (ResultSet colRs = meta.getColumns(catalog, null, tableName, "%")) {
                        while (colRs.next()) {
                            columns.add(colRs.getString("COLUMN_NAME") + " " + colRs.getString("TYPE_NAME"));
                        }
                    }
                    tableInfo.put("columns", columns);

                    // CREATE TABLE statement
                    try (Statement stmt = conn.createStatement();
                         ResultSet showRs = stmt.executeQuery("SHOW CREATE TABLE `" + tableName.replace("`", "``") + "`")) {
                        if (showRs.next()) {
                            tableInfo.put("createSql", showRs.getString(2));
                        }
                    } catch (Exception ignored) {
                        // Non-MySQL databases won't support SHOW CREATE TABLE
                    }

                    tables.add(tableInfo);
                }
            }
            backup.put("tables", tables);
            backup.put("tableCount", tables.size());
            long totalRows = tables.stream().mapToLong(t -> ((Number) t.getOrDefault("rows", 0L)).longValue()).sum();
            backup.put("totalRows", totalRows);

            record.setBackupData(JSON.toJSONString(backup));
            record.setBackupStatus("success");
        } catch (Exception e) {
            log.error("[Backup] Database backup failed", e);
            record.setBackupData("{\"error\":\"数据库备份失败，请查看系统日志\"}");
            record.setBackupStatus("failed");
        }

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
