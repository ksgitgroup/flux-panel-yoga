package traffic

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	psnet "github.com/shirou/gopsutil/v3/net"
)

// SystemInfo 系统信息结构体
type SystemInfo struct {
	Uptime           uint64  `json:"uptime"`            // 开机时间	（秒）
	BytesReceived    uint64  `json:"bytes_received"`    // 接收字节数
	BytesTransmitted uint64  `json:"bytes_transmitted"` // 发送字节数
	CPUUsage         float64 `json:"cpu_usage"`         // CPU使用率（百分比）
	MemoryUsage      float64 `json:"memory_usage"`      // 内存使用率（百分比）
}

// NetworkStats 网络统计信息
type NetworkStats struct {
	BytesReceived    uint64 `json:"bytes_received"`    // 接收字节数
	BytesTransmitted uint64 `json:"bytes_transmitted"` // 发送字节数
}

// CPUInfo CPU信息
type CPUInfo struct {
	Usage float64 `json:"usage"` // CPU使用率（百分比）
}

// MemoryInfo 内存信息
type MemoryInfo struct {
	Usage float64 `json:"usage"` // 内存使用率（百分比）
}

type WebSocketReporter struct {
	url           string
	conn          *websocket.Conn
	reconnectTime time.Duration
	pingInterval  time.Duration
	ctx           context.Context
	cancel        context.CancelFunc
	connected     bool
}

// NewWebSocketReporter 创建一个新的WebSocket报告器
func NewWebSocketReporter(serverURL string) *WebSocketReporter {
	ctx, cancel := context.WithCancel(context.Background())
	return &WebSocketReporter{
		url:           serverURL,
		reconnectTime: 5 * time.Second, // 重连间隔
		pingInterval:  2 * time.Second, // 发送间隔改为2秒
		ctx:           ctx,
		cancel:        cancel,
		connected:     false,
	}
}

// Start 启动WebSocket报告器
func (w *WebSocketReporter) Start() {
	go w.run()
}

// Stop 停止WebSocket报告器
func (w *WebSocketReporter) Stop() {
	w.cancel()
	if w.conn != nil {
		w.conn.Close()
	}

}

// run 主运行循环
func (w *WebSocketReporter) run() {
	for {
		select {
		case <-w.ctx.Done():
			return
		default:
			if err := w.connect(); err != nil {
				fmt.Printf("❌ WebSocket连接失败: %v，%v后重试\n", err, w.reconnectTime)
				select {
				case <-time.After(w.reconnectTime):
					continue
				case <-w.ctx.Done():
					return
				}
			}

			// 连接成功，开始发送消息
			w.handleConnection()
		}
	}
}

// connect 建立WebSocket连接
func (w *WebSocketReporter) connect() error {
	u, err := url.Parse(w.url)
	if err != nil {
		return fmt.Errorf("解析URL失败: %v", err)
	}

	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second

	conn, _, err := dialer.Dial(u.String(), nil)
	if err != nil {
		return fmt.Errorf("连接WebSocket失败: %v", err)
	}

	w.conn = conn
	w.connected = true

	// 设置关闭处理器来检测连接状态
	w.conn.SetCloseHandler(func(code int, text string) error {
		w.connected = false
		return nil
	})

	return nil
}

// handleConnection 处理WebSocket连接
func (w *WebSocketReporter) handleConnection() {
	defer func() {
		if w.conn != nil {
			w.conn.Close()
			w.conn = nil
		}
		w.connected = false
	}()

	// 主发送循环
	ticker := time.NewTicker(w.pingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-w.ctx.Done():
			return
		case <-ticker.C:
			// 检查连接状态
			if !w.connected {
				return
			}

			// 获取系统信息并发送
			sysInfo := w.collectSystemInfo()
			if err := w.sendSystemInfo(sysInfo); err != nil {
				fmt.Printf("❌ 发送系统信息失败: %v，准备重连\n", err)
				return
			}
		}
	}
}

// collectSystemInfo 收集系统信息
func (w *WebSocketReporter) collectSystemInfo() SystemInfo {
	networkStats := getNetworkStats()
	cpuInfo := getCPUInfo()
	memoryInfo := getMemoryInfo()

	return SystemInfo{
		Uptime:           getUptime(),
		BytesReceived:    networkStats.BytesReceived,
		BytesTransmitted: networkStats.BytesTransmitted,
		CPUUsage:         cpuInfo.Usage,
		MemoryUsage:      memoryInfo.Usage,
	}
}

// sendSystemInfo 发送系统信息
func (w *WebSocketReporter) sendSystemInfo(sysInfo SystemInfo) error {
	if w.conn == nil || !w.connected {
		return fmt.Errorf("连接未建立")
	}

	// 转换为JSON
	jsonData, err := json.Marshal(sysInfo)
	if err != nil {
		return fmt.Errorf("序列化系统信息失败: %v", err)
	}

	// 设置写入超时
	w.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))

	if err := w.conn.WriteMessage(websocket.TextMessage, jsonData); err != nil {
		w.connected = false // 标记连接已断开
		return fmt.Errorf("写入消息失败: %v", err)
	}

	return nil
}

// getHostIP 获取主机IP地址（IPv4优先策略：公网v4 → 公网v6 → 内网v4 → 内网v6）
func getHostIP() string {
	// 先尝试获取IPv4地址
	ipv4 := getLocalIPv4()
	if ipv4 != "unknown" && !isPrivateIP(ipv4) {
		return ipv4
	}

	// 尝试获取IPv6地址
	ipv6 := getLocalIPv6()
	if ipv6 != "unknown" && !isPrivateIP(ipv6) {
		return ipv6
	}

	// IPv4公网IP查询服务
	ipv4Services := []string{
		"https://ipv4.icanhazip.com",
		"https://api.ipify.org",
		"https://checkip.amazonaws.com",
		"https://myip.biturl.top",
	}

	// IPv6公网IP查询服务
	ipv6Services := []string{
		"https://ipv6.icanhazip.com",
		"https://v6.ident.me",
		"https://ipv6.myip.biturl.top",
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	// 优先尝试获取IPv4公网地址
	for _, service := range ipv4Services {
		if ip := getIPFromService(client, service); ip != "" && net.ParseIP(ip).To4() != nil {
			return strings.TrimSpace(ip)
		}
	}

	// IPv4公网IP获取失败，尝试获取IPv6公网地址
	if ipv6 != "unknown" {
		for _, service := range ipv6Services {
			if ip := getIPFromService(client, service); ip != "" && net.ParseIP(ip).To4() == nil {
				return strings.TrimSpace(ip)
			}
		}
	}

	// 如果所有公网IP服务都失败，按优先级返回本地IP：IPv4 → IPv6
	if ipv4 != "unknown" {
		return ipv4
	}
	if ipv6 != "unknown" {
		return ipv6
	}

	return "unknown"
}

// getIPFromService 从指定服务获取IP地址
func getIPFromService(client *http.Client, serviceURL string) string {
	resp, err := client.Get(serviceURL)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ""
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return ""
	}

	ip := strings.TrimSpace(string(body))
	// 简单验证是否为有效的IP地址
	if net.ParseIP(ip) != nil {
		return ip
	}

	return ""
}

// getLocalIP 获取本地接口IP地址（作为备用方案，保持向后兼容）
func getLocalIP() string {
	return getLocalIPv4()
}

// getLocalIPv4 获取本地IPv4接口地址
func getLocalIPv4() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "unknown"
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

// getLocalIPv6 获取本地IPv6接口地址
func getLocalIPv6() string {
	// 使用Google的IPv6 DNS服务器
	conn, err := net.Dial("udp", "[2001:4860:4860::8888]:80")
	if err != nil {
		return "unknown"
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

// isPrivateIP 判断IP地址是否为内网地址
func isPrivateIP(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}

	// 检查IPv4私有地址范围
	if ip.To4() != nil {
		// 10.0.0.0/8
		if ip[12] == 10 {
			return true
		}
		// 172.16.0.0/12
		if ip[12] == 172 && ip[13] >= 16 && ip[13] <= 31 {
			return true
		}
		// 192.168.0.0/16
		if ip[12] == 192 && ip[13] == 168 {
			return true
		}
		// 127.0.0.0/8 (回环地址)
		if ip[12] == 127 {
			return true
		}
	}

	// 检查IPv6私有地址
	if ip.To4() == nil {
		// ::1 (回环地址)
		if ip.IsLoopback() {
			return true
		}
		// fc00::/7 (唯一本地地址 Unique Local Addresses)
		if len(ip) >= 2 && (ip[0]&0xfe) == 0xfc {
			return true
		}
		// fe80::/10 (链路本地地址 Link Local)
		if len(ip) >= 2 && ip[0] == 0xfe && (ip[1]&0xc0) == 0x80 {
			return true
		}
		// ::ffff:0:0/96 (IPv4映射地址)
		if len(ip) >= 12 && ip[10] == 0xff && ip[11] == 0xff {
			// 检查映射的IPv4地址是否为私有地址
			ipv4 := net.IPv4(ip[12], ip[13], ip[14], ip[15])
			return isPrivateIP(ipv4.String())
		}
		// ::/128 (未指定地址)
		if ip.IsUnspecified() {
			return true
		}
	}

	return false
}

// getUptime 获取系统开机时间（秒）
func getUptime() uint64 {
	uptime, err := host.Uptime()
	if err != nil {
		return 0
	}
	return uptime
}

// getNetworkStats 获取网络统计信息
func getNetworkStats() NetworkStats {
	var stats NetworkStats

	ioCounters, err := psnet.IOCounters(true)
	if err != nil {
		fmt.Printf("获取网络统计失败: %v\n", err)
		return stats
	}

	// 汇总所有非回环接口的流量
	for _, io := range ioCounters {
		// 跳过回环接口
		if io.Name == "lo" || strings.HasPrefix(io.Name, "lo") {
			continue
		}

		stats.BytesReceived += io.BytesRecv
		stats.BytesTransmitted += io.BytesSent
	}

	return stats
}

// getCPUInfo 获取CPU信息
func getCPUInfo() CPUInfo {
	var cpuInfo CPUInfo

	// 获取CPU使用率
	percentages, err := cpu.Percent(time.Second, false)
	if err == nil && len(percentages) > 0 {
		cpuInfo.Usage = percentages[0]
	}

	return cpuInfo
}

// getMemoryInfo 获取内存信息
func getMemoryInfo() MemoryInfo {
	var memInfo MemoryInfo

	vmStat, err := mem.VirtualMemory()
	if err != nil {
		return memInfo
	}

	memInfo.Usage = vmStat.UsedPercent

	return memInfo
}

// StartWebSocketReporterWithConfig 使用配置启动WebSocket报告器
func StartWebSocketReporterWithConfig(Addr string, Secret string) *WebSocketReporter {
	// 获取本机IP地址
	localIP := getHostIP()

	// 构建包含本机IP的WebSocket URL
	var fullURL = "ws://" + Addr + "/system-info?type=1&secret=" + Secret + "&client_ip=" + localIP

	fmt.Printf("🔗 WebSocket连接URL: %s\n", fullURL)

	reporter := NewWebSocketReporter(fullURL)
	reporter.Start()
	return reporter
}
