package com.admin.common.dto;

import lombok.Data;

@Data
public class KomariPingRecordViewDto {

    private Long time;

    private Integer value;

    private Boolean loss;
}
