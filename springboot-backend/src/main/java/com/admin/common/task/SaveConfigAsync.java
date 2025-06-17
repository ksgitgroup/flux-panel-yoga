package com.admin.common.task;


import com.admin.common.dto.GostDto;
import com.admin.common.utils.GostUtil;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class SaveConfigAsync {


    @Async
    public void run(String addr, String secret){
        try {
            GostUtil.SaveConfig(addr, secret);
        }catch (Exception e){
            e.printStackTrace();
        }
    }

}
