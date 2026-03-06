package com.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 诊断历史记录实体
 */
@Data
@TableName("diagnosis_record")
public class DiagnosisRecord {

    @TableId(type = IdType.AUTO)
    private Integer id;

    /** forward 或 tunnel */
    private String targetType;

    /** 转发/隧道 ID */
    private Integer targetId;

    /** 名称快照 */
    private String targetName;

    /** 整体是否成功 */
    private Boolean overallSuccess;

    /** JSON格式的详细诊断结果 */
    private String resultsJson;

    /** 平均延迟 (ms) */
    private Double averageTime;

    /** 丢包率 (%) */
    private Double packetLoss;

    /** 诊断时间戳 */
    private Long createdTime;
}
