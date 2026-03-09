package com.admin.mapper;

import com.admin.entity.DiagnosisRecord;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 诊断历史记录 Mapper
 */
@Mapper
public interface DiagnosisRecordMapper extends BaseMapper<DiagnosisRecord> {

    /**
     * 每个 target_type+target_id 取最新一条记录（SQL 层面完成分组，避免全表加载到内存）
     */
    @Select("SELECT d.* FROM diagnosis_record d " +
            "INNER JOIN (SELECT target_type, target_id, MAX(created_time) AS max_ct " +
            "            FROM diagnosis_record GROUP BY target_type, target_id) latest " +
            "ON d.target_type = latest.target_type AND d.target_id = latest.target_id AND d.created_time = latest.max_ct")
    List<DiagnosisRecord> selectLatestPerTarget();

    /**
     * 获取最近一条诊断记录的时间
     */
    @Select("SELECT * FROM diagnosis_record ORDER BY created_time DESC LIMIT 1")
    DiagnosisRecord selectMostRecent();
}
