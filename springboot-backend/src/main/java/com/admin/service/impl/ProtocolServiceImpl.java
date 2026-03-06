package com.admin.service.impl;

import com.admin.entity.Protocol;
import com.admin.mapper.ProtocolMapper;
import com.admin.service.ProtocolService;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

@Service
public class ProtocolServiceImpl extends ServiceImpl<ProtocolMapper, Protocol> implements ProtocolService {
}
