package traffic

import (
	"context"
	"sync"
	"sync/atomic"
)

// MemoryManager 内存流量管理器
type MemoryManager struct {
	mu    sync.RWMutex
	stats map[string]*trafficStats
}

// trafficStats 流量统计
type trafficStats struct {
	upload   atomic.Int64
	download atomic.Int64
}

// NewMemoryManager 创建内存流量管理器
func NewMemoryManager() *MemoryManager {
	return &MemoryManager{
		stats: make(map[string]*trafficStats),
	}
}

// RecordTraffic 记录流量
func (m *MemoryManager) RecordTraffic(ctx context.Context, service string, upload, download int64) error {
	m.mu.RLock()
	stats, exists := m.stats[service]
	m.mu.RUnlock()

	if !exists {
		m.mu.Lock()
		stats, exists = m.stats[service]
		if !exists {
			stats = &trafficStats{}
			m.stats[service] = stats
		}
		m.mu.Unlock()
	}

	if upload > 0 {
		stats.upload.Add(upload)
	}
	if download > 0 {
		stats.download.Add(download)
	}

	return nil
}

// GetAllServicesStats 获取所有服务的流量统计
func (m *MemoryManager) GetAllServicesStats(ctx context.Context) (map[string]map[string]int64, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[string]map[string]int64)
	for service, stats := range m.stats {
		result[service] = map[string]int64{
			"upload":   stats.upload.Load(),
			"download": stats.download.Load(),
		}
	}

	return result, nil
}

// ClearAllTrafficStats 清零所有流量统计
func (m *MemoryManager) ClearAllTrafficStats(ctx context.Context) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, stats := range m.stats {
		stats.upload.Store(0)
		stats.download.Store(0)
	}

	return nil
}

// Close 关闭管理器（内存管理器无需特殊清理）
func (m *MemoryManager) Close() error {
	return nil
}

// TestConnection 测试连接（内存管理器总是返回成功）
func (m *MemoryManager) TestConnection(ctx context.Context) error {
	return nil
}
