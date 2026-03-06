package com.admin.service.impl;

import com.admin.entity.Tag;
import com.admin.mapper.TagMapper;
import com.admin.service.TagService;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

@Service
public class TagServiceImpl extends ServiceImpl<TagMapper, Tag> implements TagService {
}
