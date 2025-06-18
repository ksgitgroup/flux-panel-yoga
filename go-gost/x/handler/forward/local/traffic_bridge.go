package local

import (
	"sync"

	"github.com/go-gost/core/observer/stats"
)

// RealtimeTrafficManager 实时流量管理器接口（简化版）
type RealtimeTrafficManager interface {
	RegisterConnection(id, service string, stats stats.Stats)
	UnregisterConnection(id string)
	GetActiveConnectionsCount() int
}

var (
	globalTrafficRecorder        TrafficRecorder
	globalRealtimeTrafficManager RealtimeTrafficManager
	trafficMutex                 sync.RWMutex
)

// SetGlobalTrafficRecorder 设置全局流量记录器
func SetGlobalTrafficRecorder(recorder TrafficRecorder) {
	trafficMutex.Lock()
	defer trafficMutex.Unlock()
	globalTrafficRecorder = recorder
}

// GetGlobalTrafficRecorder 获取全局流量记录器
func GetGlobalTrafficRecorder() TrafficRecorder {
	trafficMutex.RLock()
	defer trafficMutex.RUnlock()
	return globalTrafficRecorder
}

// SetGlobalRealtimeTrafficManager 设置全局实时流量管理器
func SetGlobalRealtimeTrafficManager(manager RealtimeTrafficManager) {
	trafficMutex.Lock()
	defer trafficMutex.Unlock()
	globalRealtimeTrafficManager = manager
}

// GetGlobalRealtimeTrafficManager 获取全局实时流量管理器
func GetGlobalRealtimeTrafficManager() RealtimeTrafficManager {
	trafficMutex.RLock()
	defer trafficMutex.RUnlock()
	return globalRealtimeTrafficManager
}
