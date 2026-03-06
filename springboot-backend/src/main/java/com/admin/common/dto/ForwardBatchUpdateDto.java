package com.admin.common.dto;

import lombok.Data;
import java.util.List;
import javax.validation.constraints.NotEmpty;

@Data
public class ForwardBatchUpdateDto {
    @NotEmpty(message = "ID列表不能为空")
    private List<Long> ids;
    
    private Integer protocolId;
    
    private String tagIds;
}
