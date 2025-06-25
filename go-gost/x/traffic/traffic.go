package traffic

import (
	"context"
	"sync"
)

// Manager 流量管理器接口
type Manager interface {
	RecordTraffic(ctx context.Context, service string, upload, download int64) error
	GetAllServicesStats(ctx context.Context) (map[string]map[string]int64, error)
	ClearAllTrafficStats(ctx context.Context) error
	SubtractTrafficStats(ctx context.Context, stats map[string]map[string]int64) error
	Close() error
	TestConnection(ctx context.Context) error
}

var (
	globalManager Manager
	once          sync.Once
)

// GetGlobalManager 获取全局流量管理器实例
func GetGlobalManager() Manager {
	once.Do(func() {
		globalManager = NewMemoryManager()
	})
	return globalManager
}

// SetGlobalManager 设置全局流量管理器（用于测试）
func SetGlobalManager(m Manager) {
	globalManager = m
}
