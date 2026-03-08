package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.NotifyPolicy;
import com.admin.mapper.NotifyPolicyMapper;
import com.admin.service.NotifyPolicyService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.List;

@Slf4j
@Service
public class NotifyPolicyServiceImpl extends ServiceImpl<NotifyPolicyMapper, NotifyPolicy> implements NotifyPolicyService {

    @Resource
    private NotifyPolicyMapper notifyPolicyMapper;

    @Override
    public R listPolicies() {
        List<NotifyPolicy> policies = notifyPolicyMapper.selectList(
                new LambdaQueryWrapper<NotifyPolicy>()
                        .eq(NotifyPolicy::getStatus, 0)
                        .orderByDesc(NotifyPolicy::getCreatedTime));
        return R.ok(policies);
    }

    @Override
    public R createPolicy(NotifyPolicy policy) {
        long now = System.currentTimeMillis();
        policy.setCreatedTime(now);
        policy.setUpdatedTime(now);
        policy.setStatus(0);
        if (policy.getEnabled() == null) policy.setEnabled(1);
        if (policy.getCooldownMinutes() == null) policy.setCooldownMinutes(5);
        notifyPolicyMapper.insert(policy);
        return R.ok(policy);
    }

    @Override
    public R updatePolicy(NotifyPolicy policy) {
        if (policy.getId() == null) return R.err("策略 ID 不能为空");
        NotifyPolicy existing = notifyPolicyMapper.selectById(policy.getId());
        if (existing == null) return R.err("策略不存在");

        policy.setUpdatedTime(System.currentTimeMillis());
        notifyPolicyMapper.updateById(policy);
        return R.ok(policy);
    }

    @Override
    public R deletePolicy(Long id) {
        if (id == null) return R.err("策略 ID 不能为空");
        NotifyPolicy existing = notifyPolicyMapper.selectById(id);
        if (existing == null) return R.err("策略不存在");
        notifyPolicyMapper.deleteById(id);
        return R.ok("已删除");
    }
}
