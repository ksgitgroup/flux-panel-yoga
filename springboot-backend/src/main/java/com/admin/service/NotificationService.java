package com.admin.service;

import com.admin.common.lang.R;
import com.admin.entity.Notification;
import com.baomidou.mybatisplus.extension.service.IService;

public interface NotificationService extends IService<Notification> {

    R send(String title, String content, String type, String severity, String sourceModule, Long sourceId);

    /** 带告警上下文的发送（精细路由用） */
    R send(String title, String content, String type, String severity, String sourceModule, Long sourceId, String category, String tags);

    R listForCurrentUser(int page, int size, Integer readStatus, String type);

    R unreadCount();

    R markRead(Long id);

    R markAllRead();

    R snooze(Long id, int days);

    R activeCritical();
}
