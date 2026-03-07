package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.annotation.RequireRole;
import com.admin.common.dto.ForwardDto;
import com.admin.common.dto.ForwardUpdateDto;
import com.admin.common.dto.ForwardBatchUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.Forward;
import com.admin.service.ForwardService;
import com.admin.service.XuiService;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * <p>
 *  前端控制器
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
@RestController
@CrossOrigin
@RequestMapping("/api/v1/forward")
public class ForwardController extends BaseController {

    @Autowired
    private ForwardService forwardService;

    @Autowired
    private XuiService xuiService;

    @LogAnnotation
    @PostMapping("/create")
    public R create(@Validated @RequestBody ForwardDto forwardDto) {
        return forwardService.createForward(forwardDto);
    }

    @LogAnnotation
    @PostMapping("/list")
    public R readAll() {
        return forwardService.getAllForwards();
    }

    @LogAnnotation
    @PostMapping("/update")
    public R update(@Validated @RequestBody ForwardUpdateDto forwardUpdateDto) {
        return forwardService.updateForward(forwardUpdateDto);
    }

    @LogAnnotation
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return forwardService.deleteForward(id);
    }

    @LogAnnotation
    @PostMapping("/force-delete")
    public R forceDelete(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return forwardService.forceDeleteForward(id);
    }

    @LogAnnotation
    @PostMapping("/pause")
    public R pause(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return forwardService.pauseForward(id);
    }

    @LogAnnotation
    @PostMapping("/resume")
    public R resume(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        return forwardService.resumeForward(id);
    }

    /**
     * 转发诊断功能
     * @param params 包含forwardId的参数
     * @return 诊断结果
     */
    @LogAnnotation
    @PostMapping("/diagnose")
    public R diagnoseForward(@RequestBody Map<String, Object> params) {
        Long forwardId = Long.valueOf(params.get("forwardId").toString());
        return forwardService.diagnoseForward(forwardId);
    }

    /**
     * 更新转发排序
     * @param params 包含forwards数组的参数，每个元素包含id和inx
     * @return 更新结果
     */
    @LogAnnotation
    @PostMapping("/update-order")
    public R updateForwardOrder(@RequestBody Map<String, Object> params) {
        return forwardService.updateForwardOrder(params);
    }

    /**
     * 复制转发
     * @param params 包含id的参数（要复制的转发ID）
     * @return 创建结果
     */
    @LogAnnotation
    @PostMapping("/copy")
    public R copyForward(@RequestBody Map<String, Object> params) {
        Long id = Long.valueOf(params.get("id").toString());
        Forward forward = forwardService.getById(id);
        if (forward == null) {
            return R.err("转发不存在");
        }
        ForwardDto dto = new ForwardDto();
        BeanUtils.copyProperties(forward, dto);
        dto.setName(forward.getName() + " - 副本");
        return forwardService.createForward(dto);
    }

    @LogAnnotation
    @PostMapping("/batch-update")
    public R batchUpdate(@Validated @RequestBody ForwardBatchUpdateDto batchDto) {
        return forwardService.batchUpdateForward(batchDto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/xui-targets")
    public R xuiTargets() {
        return xuiService.getForwardTargets();
    }

}
