package com.admin.service;

import com.admin.common.lang.R;
import com.admin.entity.NotifyPolicy;
import com.baomidou.mybatisplus.extension.service.IService;

public interface NotifyPolicyService extends IService<NotifyPolicy> {

    R listPolicies();

    R createPolicy(NotifyPolicy policy);

    R updatePolicy(NotifyPolicy policy);

    R deletePolicy(Long id);
}
