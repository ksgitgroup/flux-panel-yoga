package com.admin.service;

import com.admin.entity.DiagnosisRecord;
import com.baomidou.mybatisplus.extension.service.IService;
import com.admin.common.lang.R;

import java.util.List;
import java.util.Map;

/**
 * 诊断服务接口
 */
public interface DiagnosisService extends IService<DiagnosisRecord> {

    /** 对所有隧道和转发执行一次全量诊断，持久化结果，若有失败则发送企业微信通知 */
    void runAllDiagnosis();

    /** 查询某个对象的诊断历史 */
    R getDiagnosisHistory(String targetType, Integer targetId, int limit);

    /** 返回所有对象的最新一次诊断状态快照 */
    R getLatestSummary();

    /** 手动触发全量诊断（管理员专用） */
    R triggerNow();

    /** 获取当前诊断运行状态 */
    R getRuntimeStatus();

    /** 批量获取一组转发/隧道的最新诊断记录 */
    R getLatestBatch(String targetType, List<Integer> targetIds);

    /** 获取最近N小时的诊断趋势数据（每小时成功/失败数） */
    R getTrend(int hours);

    /** 保存诊断记录并更新资源状态 (用于手动和自动诊断同步) */
    void saveRecord(String targetType, Integer targetId, String targetName, Object data);
}
