package com.admin.controller;

import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.entity.Tag;
import com.admin.service.TagService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/tag")
public class TagController extends BaseController {

    @Autowired
    private TagService tagService;

    @LogAnnotation
    @PostMapping("/list")
    public R list() {
        return R.ok(tagService.list(new LambdaQueryWrapper<Tag>().orderByAsc(Tag::getId)));
    }

    @LogAnnotation
    @PostMapping("/create")
    public R create(@RequestBody Tag tag) {
        tag.setCreatedTime(System.currentTimeMillis());
        if (tag.getColor() == null || tag.getColor().isEmpty()) {
            tag.setColor("primary");
        }
        tagService.save(tag);
        return R.ok();
    }

    @LogAnnotation
    @PostMapping("/update")
    public R update(@RequestBody Tag tag) {
        tagService.updateById(tag);
        return R.ok();
    }

    @LogAnnotation
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Object> params) {
        Integer id = requireInt(params, "id");
        tagService.removeById(id);
        return R.ok();
    }
}
