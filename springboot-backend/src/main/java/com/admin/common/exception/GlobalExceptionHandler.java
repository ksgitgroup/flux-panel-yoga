package com.admin.common.exception;

import com.admin.common.lang.R;
import lombok.extern.slf4j.Slf4j;
import org.apache.catalina.connector.ClientAbortException;
import org.springframework.validation.BindingResult;
import org.springframework.validation.ObjectError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    //

    // 实体校验异常捕获
    //@ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(value = MethodArgumentNotValidException.class)
    public R MethodArgumentNotValidException(MethodArgumentNotValidException e) {
        BindingResult result = e.getBindingResult();
        ObjectError objectError = result.getAllErrors().stream().findFirst().orElse(null);
        String message = objectError != null ? objectError.getDefaultMessage() : "请求参数校验失败";
        log.info("实体校验异常：----------------{}", message);
        return R.err(500, message);
    }

    // 未授权异常捕获
    @ExceptionHandler(value = UnauthorizedException.class)
    public R handleUnauthorizedException(UnauthorizedException e) {
        log.info("未授权异常：----------------{}", e.getMessage());
        return R.err(401, e.getMessage());
    }

    @ExceptionHandler(value = IllegalArgumentException.class)
    public R handleIllegalArgument(IllegalArgumentException e) {
        log.warn("参数异常: {}", e.getMessage());
        return R.err(400, e.getMessage());
    }

    @ExceptionHandler(value = ClientAbortException.class)
    public R handleClientAbort(ClientAbortException e) {
        // 客户端断开连接，无需返回
        return null;
    }

    @ExceptionHandler(value = Exception.class)
    public R handleException(Exception e) {
        log.error("未处理异常", e);
        return R.err(-2, "服务器内部错误，请联系管理员");
    }

}