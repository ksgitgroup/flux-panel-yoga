package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-gost/x/traffic"
)

// 全局变量存储HTTP地址
var httpReportURL string

// TrafficReportItem 流量报告项（压缩格式）
type TrafficReportItem struct {
	N string `json:"n"` // 服务名（name缩写）
	T string `json:"t"` // 连接类型：conn, cc（type缩写）
	U int64  `json:"u"` // 上行流量（up缩写）
	D int64  `json:"d"` // 下行流量（down缩写）
}

// SetHTTPReportURL 设置HTTP报告地址
func SetHTTPReportURL(addr string, secret string) {
	httpReportURL = "http://" + addr + "/flow/upload?secret=" + secret
}

// StartTrafficReporter 启动流量报告任务
func StartTrafficReporter(trafficMgr traffic.Manager) {
	// 检查是否设置了HTTP地址
	if httpReportURL == "" {
		fmt.Println("❌ HTTP报告地址未设置，无法启动流量报告任务")
		return
	}

	ticker := time.NewTicker(5 * time.Second)

	go func() {
		defer ticker.Stop()

		for range ticker.C {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)

			// 先获取流量统计（不清零）
			stats, err := trafficMgr.GetAllServicesStats(ctx)
			if err != nil {
				fmt.Printf("获取流量统计失败: %v\n", err)
				cancel()
				continue
			}

			if len(stats) == 0 {
				cancel()
				continue
			}

			// 构建报告数据为数组格式，分别处理不同类型的流量
			var reportItems []TrafficReportItem
			totalServices := 0
			totalTraffic := int64(0)

			// 解析服务和类型，分组处理
			serviceGroups := make(map[string]map[string]map[string]int64) // service -> type -> direction -> bytes

			for serviceKey, serviceStats := range stats {
				upload := serviceStats["upload"]
				download := serviceStats["download"]

				// 解析服务名和类型 (format: service:type)
				var serviceName, serviceType string
				parts := strings.Split(serviceKey, ":")
				if len(parts) >= 2 {
					serviceName = parts[0]
					serviceType = parts[1]
				} else {
					serviceName = serviceKey
					serviceType = "unknown"
				}

				if serviceGroups[serviceName] == nil {
					serviceGroups[serviceName] = make(map[string]map[string]int64)
				}
				if serviceGroups[serviceName][serviceType] == nil {
					serviceGroups[serviceName][serviceType] = make(map[string]int64)
				}

				serviceGroups[serviceName][serviceType]["upload"] = upload
				serviceGroups[serviceName][serviceType]["download"] = download

				totalTraffic += upload + download
			}

			// 为每个服务的每种类型创建报告项
			for serviceName, types := range serviceGroups {
				for serviceType, trafficData := range types {
					// 过滤掉total类型，只保留conn和cc
					if serviceType == "total" {
						continue
					}

					upload := trafficData["upload"]
					download := trafficData["download"]

					// 只有当有流量时才报告
					if upload > 0 || download > 0 {
						reportItems = append(reportItems, TrafficReportItem{
							N: serviceName,
							T: serviceType,
							U: upload,
							D: download,
						})
						totalServices++
					}
				}
			}

			// 只有当有流量数据时才发送
			if len(reportItems) > 0 && totalTraffic > 0 {
				// 发送到HTTP接口
				success, err := sendTrafficReport(ctx, reportItems)
				if err != nil {
					fmt.Printf("发送流量报告失败: %v\n", err)
				} else if success {
					// 只有收到"ok"响应才清零流量
					err = trafficMgr.ClearAllTrafficStats(ctx)
					if err != nil {
						fmt.Printf("清零流量统计失败: %v\n", err)
					} else {
						fmt.Printf("✅ 流量报告已发送并清零: %d个记录, 总流量: %d bytes\n",
							totalServices, totalTraffic)
					}
				} else {
					fmt.Printf("⚠️  服务器未确认(非ok响应)，保留流量数据: %d个记录, 总流量: %d bytes\n",
						totalServices, totalTraffic)
				}
			}

			cancel()
		}
	}()

	fmt.Printf("🚀 流量报告任务已启动 (5秒间隔)，目标地址: %s\n", httpReportURL)
}

// sendTrafficReport 发送流量报告到HTTP接口
func sendTrafficReport(ctx context.Context, reportItems []TrafficReportItem) (bool, error) {
	jsonData, err := json.Marshal(reportItems)
	if err != nil {
		return false, fmt.Errorf("序列化报告数据失败: %v", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", httpReportURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return false, fmt.Errorf("创建HTTP请求失败: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "GOST-Traffic-Reporter/1.0")

	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return false, fmt.Errorf("发送HTTP请求失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("HTTP响应错误: %d %s", resp.StatusCode, resp.Status)
	}

	// 读取响应内容
	var responseBytes bytes.Buffer
	_, err = responseBytes.ReadFrom(resp.Body)
	if err != nil {
		return false, fmt.Errorf("读取响应内容失败: %v", err)
	}

	responseText := strings.TrimSpace(responseBytes.String())

	// 检查响应是否为"ok"
	if responseText == "ok" {
		return true, nil
	} else {
		return false, fmt.Errorf("服务器响应: %s (期望: ok)", responseText)
	}
}
