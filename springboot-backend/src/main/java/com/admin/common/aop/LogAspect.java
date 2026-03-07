package com.admin.common.aop;


import cn.hutool.core.util.ArrayUtil;
import com.admin.common.utils.JwtUtil;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.admin.common.utils.HttpContextUtils;
import com.admin.common.utils.IpUtils;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.*;
import org.aspectj.lang.reflect.CodeSignature;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

@Component
@Aspect
@Slf4j
public class LogAspect {

    private static final String REDACTED = "******";
    private static final Set<String> SENSITIVE_FIELD_NAMES = new HashSet<>(Arrays.asList(
            "password",
            "pwd",
            "loginpassword",
            "loginsecret",
            "currentpassword",
            "newpassword",
            "confirmpassword",
            "token",
            "authorization",
            "accesstoken",
            "refreshtoken",
            "secret",
            "secrettoken",
            "twofactorsecret",
            "twofactorcode",
            "onetimecode",
            "twofactorchallengetoken",
            "captchahid",
            "captchaid",
            "challengetoken",
            "encryptedpassword",
            "encryptedloginsecret",
            "otpauthuri",
            "traffictoken",
            "trafficcallbackpath",
            "sourcetoken",
            "cookie",
            "session"
    ));

    @Pointcut("@annotation(com.admin.common.aop.LogAnnotation)")
    public void pt() {

    }

    /**
     * 返回后通知（@AfterReturning）：在某连接点（joinpoint）
     * 正常完成后执行的通知：例如，一个方法没有抛出任何异常，正常返回
     * 方法执行完毕之后
     * 注意在这里不能使用ProceedingJoinPoint
     * 不然会报错ProceedingJoinPoint is only supported for around advice
     * crmAspect()指向需要控制的方法
     * returning  注解返回值
     *
     * @param joinPoint
     * @param returnValue 返回值
     * @throws Exception
     */
    @AfterReturning(value = "pt()", returning = "returnValue")
    public void log(JoinPoint joinPoint, Object returnValue) throws Throwable {
        // 获取请求信息
        HttpServletRequest request = HttpContextUtils.getHttpServletRequest();
        
        // 获取请求方法类型（POST/GET等）
        String requestMethod = request.getMethod();
        
        // 获取用户ID
        String authorization = request.getHeader("Authorization") + "";
        Object user_id = "未登录"; // 请求用户的id
        if (!authorization.equals("null")) {
            user_id = JwtUtil.getUserIdFromToken(authorization);
        }
        
        // 获取请求IP
        String ipAddr = IpUtils.getIpAddr(request);
        
        // 获取方法签名信息
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        
        // 获取控制器方法名
        String className = joinPoint.getTarget().getClass().getName();
        String methodName = signature.getName();
        String controllerMethod = className + "." + methodName;
        

        // 获取请求参数
        String requestParams = getRequestParams(joinPoint);
        
        // 获取返回参数
        String responseParams = serializeForLog(returnValue);
        
        // 合并为一条完整的日志信息
        String logMessage = String.format(
            "【请求日志】用户ID:[%s], IP地址:[%s], 请求方式:[%s], 控制器方法:[%s], 请求参数:[%s], 返回参数:[%s]", user_id, ipAddr, requestMethod, controllerMethod, requestParams, responseParams
        );
        
        // 打印单条完整日志
        log.info(logMessage);
    }


    /**
     * 抛出异常后通知（@AfterThrowing）：方法抛出异常退出时执行的通知
     * 注意在这里不能使用ProceedingJoinPoint
     * 不然会报错ProceedingJoinPoint is only supported for around advice
     * throwing注解为错误信息
     *
     * @param joinPoint
     * @param ex
     */
    @AfterThrowing(value = "pt()", throwing = "ex")
    public void recordLog(JoinPoint joinPoint, Exception ex) {
        try {
            // 获取请求信息
            HttpServletRequest request = HttpContextUtils.getHttpServletRequest();
            
            // 获取请求方法类型（POST/GET等）
            String requestMethod = request.getMethod();
            
            // 获取用户ID
            String authorization = request.getHeader("Authorization") + "";
            Object user_id = "未登录"; // 请求用户的id
            if (!authorization.equals("null")) {
                user_id = JwtUtil.getUserIdFromToken(authorization);
            }
            
            // 获取请求IP
            String ipAddr = IpUtils.getIpAddr(request);
            
            // 获取方法签名信息
            MethodSignature signature = (MethodSignature) joinPoint.getSignature();
            Method method = signature.getMethod();
            
            // 获取控制器方法名
            String className = joinPoint.getTarget().getClass().getName();
            String methodName = signature.getName();
            String controllerMethod = className + "." + methodName;
            

            
            // 获取请求参数
            String requestParams = getRequestParams(joinPoint);
            
            // 获取异常信息
            String exceptionMsg = ex != null ? ex.getMessage() : "未知异常";
            
            // 合并为一条完整的异常日志信息
            String errorMessage = String.format(
                "【异常日志】用户ID:[%s], IP地址:[%s], 请求方式:[%s], 控制器方法:[%s], 请求参数:[%s], 异常信息:[%s]", user_id, ipAddr, requestMethod, controllerMethod, requestParams, exceptionMsg
            );
            
            // 打印单条完整异常日志
            log.info(errorMessage, ex);
        } catch (Exception e) {
            log.info("记录异常日志时出错: {}", e.getMessage());
        }
    }
    
    /**
     * 获取请求参数
     */
    private String getRequestParams(JoinPoint joinPoint) {
        try {
            Object[] args = joinPoint.getArgs();
            if (args.length == 0) {
                return "无参数";
            }
            if (args[0] != null && args[0].toString().contains("SecurityContextHolderAwareRequestWrapper")) {
                return serializeForLog(new ArrayList<>(Arrays.asList(ArrayUtil.remove(args, 0))));
            }
            if (args.length == 1) {
                return serializeForLog(args[0]);
            }
            Map<String, Object> map = new HashMap<>();
            String[] names = ((CodeSignature) joinPoint.getSignature()).getParameterNames();
            if (names != null) {
                for (int i = 0; i < names.length; i++) {
                    map.put(names[i], args[i]);
                }
            }
            return serializeForLog(map);
        } catch (Exception e) {
            return "获取参数失败: " + e.getMessage();
        }
    }

    private String serializeForLog(Object value) {
        if (value == null) {
            return "无返回值";
        }
        try {
            if (value instanceof String) {
                String stringValue = (String) value;
                if (stringValue.startsWith("{") && stringValue.endsWith("}")) {
                    return JSON.toJSONString(sanitizeJsonValue(JSON.parse(stringValue), null));
                }
                return stringValue;
            }
            return JSON.toJSONString(sanitizeJsonValue(JSON.toJSON(value), null));
        } catch (Exception e) {
            return String.valueOf(value);
        }
    }

    private Object sanitizeJsonValue(Object value, String fieldName) {
        if (fieldName != null && isSensitiveField(fieldName)) {
            return REDACTED;
        }
        if (value instanceof JSONObject) {
            JSONObject jsonObject = (JSONObject) value;
            for (Map.Entry<String, Object> entry : jsonObject.entrySet()) {
                entry.setValue(sanitizeJsonValue(entry.getValue(), entry.getKey()));
            }
            return jsonObject;
        }
        if (value instanceof JSONArray) {
            JSONArray jsonArray = (JSONArray) value;
            for (int i = 0; i < jsonArray.size(); i++) {
                jsonArray.set(i, sanitizeJsonValue(jsonArray.get(i), fieldName));
            }
            return jsonArray;
        }
        return value;
    }

    private boolean isSensitiveField(String fieldName) {
        return SENSITIVE_FIELD_NAMES.contains(fieldName.replace("_", "").toLowerCase());
    }
}
