package local

import (
	"sync"
)

var (
	globalTrafficRecorder TrafficRecorder
	trafficMutex          sync.RWMutex
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
