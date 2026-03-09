package com.admin.common.utils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 轻量级熔断器 — 按 key（如 host:port）隔离，避免宕机节点拖垮主控。
 * <p>
 * 状态机: CLOSED → OPEN → HALF_OPEN → CLOSED
 * <ul>
 *   <li>CLOSED: 正常放行，连续失败 >= failureThreshold 则切换到 OPEN</li>
 *   <li>OPEN:   直接拒绝（抛 CircuitBreakerOpenException），等待 recoveryTimeoutMs 后进入 HALF_OPEN</li>
 *   <li>HALF_OPEN: 放行一次试探请求，成功→CLOSED，失败→OPEN</li>
 * </ul>
 */
public class SimpleCircuitBreaker {

    private static final Logger log = LoggerFactory.getLogger(SimpleCircuitBreaker.class);

    public enum State { CLOSED, OPEN, HALF_OPEN }

    private final int failureThreshold;
    private final long recoveryTimeoutMs;

    /** 每个 key 一个独立的熔断状态 */
    private final ConcurrentHashMap<String, BreakerState> states = new ConcurrentHashMap<>();

    /**
     * @param failureThreshold  连续失败多少次后熔断（建议 3-5）
     * @param recoveryTimeoutMs 熔断后多久尝试恢复（毫秒，建议 30000-60000）
     */
    public SimpleCircuitBreaker(int failureThreshold, long recoveryTimeoutMs) {
        this.failureThreshold = failureThreshold;
        this.recoveryTimeoutMs = recoveryTimeoutMs;
    }

    /**
     * 检查指定 key 的熔断器是否允许请求通过。
     * @return true=允许, false=熔断中
     */
    public boolean allowRequest(String key) {
        BreakerState bs = states.get(key);
        if (bs == null) return true;

        State state = bs.getState(failureThreshold, recoveryTimeoutMs);
        if (state == State.CLOSED || state == State.HALF_OPEN) {
            return true;
        }
        // OPEN 状态，计算剩余秒数供日志使用
        long remainSec = (bs.openedAt.get() + recoveryTimeoutMs - System.currentTimeMillis()) / 1000;
        log.debug("CircuitBreaker OPEN for [{}], remaining {}s", key, Math.max(0, remainSec));
        return false;
    }

    /** 记录一次成功调用，重置熔断状态 */
    public void recordSuccess(String key) {
        BreakerState bs = states.get(key);
        if (bs != null) {
            boolean wasOpen = bs.consecutiveFailures.get() >= failureThreshold;
            bs.consecutiveFailures.set(0);
            bs.openedAt.set(0);
            if (wasOpen) {
                log.info("CircuitBreaker CLOSED for [{}] — recovered", key);
            }
        }
    }

    /** 记录一次失败调用，可能触发熔断 */
    public void recordFailure(String key) {
        BreakerState bs = states.computeIfAbsent(key, k -> new BreakerState());
        int failures = bs.consecutiveFailures.incrementAndGet();
        if (failures >= failureThreshold && bs.openedAt.get() == 0) {
            bs.openedAt.set(System.currentTimeMillis());
            log.warn("CircuitBreaker OPEN for [{}] — {} consecutive failures", key, failures);
        }
    }

    /** 获取指定 key 的当前状态 */
    public State getState(String key) {
        BreakerState bs = states.get(key);
        if (bs == null) return State.CLOSED;
        return bs.getState(failureThreshold, recoveryTimeoutMs);
    }

    /** 手动重置指定 key 的熔断状态（如用户手动测试连接成功） */
    public void reset(String key) {
        states.remove(key);
    }

    /** 获取当前所有熔断中的 key 数量 */
    public long getOpenCount() {
        return states.values().stream()
                .filter(bs -> bs.getState(failureThreshold, recoveryTimeoutMs) == State.OPEN)
                .count();
    }

    // ========== Inner State ==========

    private static class BreakerState {
        final AtomicInteger consecutiveFailures = new AtomicInteger(0);
        final AtomicLong openedAt = new AtomicLong(0); // 进入 OPEN 状态的时间戳

        State getState(int threshold, long recoveryMs) {
            int failures = consecutiveFailures.get();
            long opened = openedAt.get();

            if (failures < threshold) {
                return State.CLOSED;
            }
            if (opened == 0) {
                return State.CLOSED; // 尚未标记 open
            }
            if (System.currentTimeMillis() - opened >= recoveryMs) {
                return State.HALF_OPEN; // 恢复窗口到了，允许试探
            }
            return State.OPEN;
        }
    }

    /**
     * 熔断器开启时抛出此异常，调用方可据此做降级处理。
     */
    public static class CircuitBreakerOpenException extends RuntimeException {
        public CircuitBreakerOpenException(String key) {
            super("Circuit breaker is OPEN for [" + key + "], request rejected");
        }
    }
}
