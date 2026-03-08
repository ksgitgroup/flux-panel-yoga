package com.admin.service;

import com.admin.common.lang.R;
import com.admin.entity.NotifyChannel;
import com.baomidou.mybatisplus.extension.service.IService;

public interface NotifyChannelService extends IService<NotifyChannel> {

    R listChannels();

    R createChannel(NotifyChannel channel);

    R updateChannel(NotifyChannel channel);

    R deleteChannel(Long id);

    R testChannel(Long id);
}
