package com.admin.common.task;


import com.admin.entity.StatisticsFlow;
import com.admin.entity.User;
import com.admin.service.StatisticsFlowService;
import com.admin.service.UserService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.PostConstruct;
import javax.annotation.Resource;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

@Slf4j
@Configuration
@EnableScheduling
public class StatisticsFlowAsync {

    @Resource
    UserService userService;

    @Resource
    StatisticsFlowService statisticsFlowService;

    @PostConstruct
    public void init() {
        // 项目启动时，如果当前小时还没有记录，则跑一次统计，防止仪表盘24h图表完全空白
        try {
            LocalDateTime currentHour = LocalDateTime.now().withMinute(0).withSecond(0).withNano(0);
            String hourString = currentHour.format(DateTimeFormatter.ofPattern("HH:mm"));
            
            long count = statisticsFlowService.count(
                    new LambdaQueryWrapper<StatisticsFlow>()
                            .eq(StatisticsFlow::getTime, hourString)
                            .gt(StatisticsFlow::getCreatedTime, System.currentTimeMillis() - 3600000)
            );
            
            if (count == 0) {
                log.info("[流量统计] 启动初始化：当前小时暂无记录，执行首次采样...");
                statistics_flow();
            }
        } catch (Exception e) {
            log.error("[流量统计] 初始化失败", e);
        }
    }

    @Scheduled(cron = "0 0 * * * ?")

    public void statistics_flow() {
        LocalDateTime currentHour = LocalDateTime.now().withMinute(0).withSecond(0).withNano(0);
        String hourString = currentHour.format(DateTimeFormatter.ofPattern("HH:mm"));
        long time = new Date().getTime();

        // 删除48小时前的数据
        long nowMs = new Date().getTime();
        long cutoffMs = nowMs - 48L * 60 * 60 * 1000;
        statisticsFlowService.remove(
                new LambdaQueryWrapper<StatisticsFlow>()
                        .lt(StatisticsFlow::getCreatedTime, cutoffMs)
        );





        List<User> list = userService.list();
        List<StatisticsFlow> statisticsFlowList = new ArrayList<>();

        for (User user : list) {
            long currentFlow = user.getInFlow() + user.getOutFlow();

            // 从数据库获取上一次记录
            StatisticsFlow lastFlowRecord = statisticsFlowService.getOne(
                    new LambdaQueryWrapper<StatisticsFlow>()
                            .eq(StatisticsFlow::getUserId, user.getId()) 
                            .orderByDesc(StatisticsFlow::getId)         
                            .last("LIMIT 1")                     
            );

            long currentTotalFlow = currentFlow;
            long incrementFlow = currentTotalFlow;
            
            if (lastFlowRecord != null) {
                long lastTotalFlow = lastFlowRecord.getTotalFlow();
                incrementFlow = currentTotalFlow - lastTotalFlow;
                
                if (incrementFlow < 0) {
                    incrementFlow = currentTotalFlow; 
                }
            }

            StatisticsFlow statisticsFlow = new StatisticsFlow();
            statisticsFlow.setUserId(user.getId());
            statisticsFlow.setFlow(incrementFlow);        
            statisticsFlow.setTotalFlow(currentTotalFlow); 
            statisticsFlow.setTime(hourString);
            statisticsFlow.setCreatedTime(time);

            statisticsFlowList.add(statisticsFlow);
        }

        statisticsFlowService.saveBatch(statisticsFlowList);
    }

}
