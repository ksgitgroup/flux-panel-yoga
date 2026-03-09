package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.entity.Protocol;
import com.admin.service.ProtocolService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/protocol")
public class ProtocolController extends BaseController {

    @Autowired
    private ProtocolService protocolService;

    @LogAnnotation
    @PostMapping("/list")
    public R list() {
        return R.ok(protocolService.list(new LambdaQueryWrapper<Protocol>().orderByAsc(Protocol::getId)));
    }

    @LogAnnotation
    @PostMapping("/create")
    public R create(@RequestBody Protocol protocol) {
        protocol.setCreatedTime(System.currentTimeMillis());
        protocolService.save(protocol);
        return R.ok();
    }

    @LogAnnotation
    @PostMapping("/update")
    public R update(@RequestBody Protocol protocol) {
        protocolService.updateById(protocol);
        return R.ok();
    }

    @LogAnnotation
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Integer id = requireInt(params, "id");
        protocolService.removeById(id);
        return R.ok();
    }
}
