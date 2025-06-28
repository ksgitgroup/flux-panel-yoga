package port

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"runtime"
	"strconv"
	"strings"
)

// ForceClosePortConnections 强制断开指定端口的所有连接
func ForceClosePortConnections(addr string) error {
	if addr == "" {
		return nil
	}

	// 解析地址和端口
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		// 如果解析失败，可能是因为没有端口，或者格式不对
		return fmt.Errorf("failed to parse address %s: %v", addr, err)
	}

	port, err := strconv.Atoi(portStr)
	if err != nil {
		return fmt.Errorf("invalid port %s: %v", portStr, err)
	}

	switch runtime.GOOS {
	case "linux":
		return forceClosePortConnectionsLinux(host, port)
	default:
		// 对于非Linux系统，静默忽略
		return nil
	}
}

// forceClosePortConnectionsLinux 在Linux上通过/proc/net/tcp*读取连接并关闭
func forceClosePortConnectionsLinux(host string, port int) error {
	// 关闭IPv4连接
	if err := closeConnectionsFromProcNet("/proc/net/tcp", port); err != nil {
		fmt.Printf("Warning: failed to close IPv4 connections on port %d: %v\n", port, err)
	}

	// 关闭IPv6连接
	if err := closeConnectionsFromProcNet("/proc/net/tcp6", port); err != nil {
		fmt.Printf("Warning: failed to close IPv6 connections on port %d: %v\n", port, err)
	}

	return nil
}

// closeConnectionsFromProcNet 从/proc/net/tcp*文件读取连接信息并关闭连接
func closeConnectionsFromProcNet(procFile string, targetPort int) error {
	file, err := os.Open(procFile)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	// 跳过第一行(header)
	scanner.Scan()

	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 10 {
			continue
		}

		// local_address字段格式: IP:PORT (hex)
		localAddr := fields[1]
		parts := strings.Split(localAddr, ":")
		if len(parts) != 2 {
			continue
		}

		// 解析端口(十六进制)
		portHex := parts[1]
		port, err := strconv.ParseInt(portHex, 16, 32)
		if err != nil {
			continue
		}

		// 检查是否是目标端口
		if int(port) == targetPort {
			// 获取远程地址信息
			remoteAddr := fields[2]
			state := fields[3]

			// 只关闭已建立的连接，跳过监听状态
			if state == "0A" { // LISTEN状态
				continue
			}

			// 尝试通过socket操作关闭连接
			if err := closeConnectionByAddresses(localAddr, remoteAddr); err != nil {
				fmt.Printf("Warning: failed to close connection %s->%s: %v\n", localAddr, remoteAddr, err)
			}
		}
	}

	return scanner.Err()
}

// closeConnectionByAddresses 通过地址信息关闭连接
func closeConnectionByAddresses(localAddr, remoteAddr string) error {
	// 解析本地地址
	localParts := strings.Split(localAddr, ":")
	if len(localParts) != 2 {
		return fmt.Errorf("invalid local address format")
	}

	// 解析远程地址
	remoteParts := strings.Split(remoteAddr, ":")
	if len(remoteParts) != 2 {
		return fmt.Errorf("invalid remote address format")
	}

	// 转换十六进制IP和端口
	localIP, err := hexToIP(localParts[0])
	if err != nil {
		return err
	}

	localPort, err := strconv.ParseInt(localParts[1], 16, 32)
	if err != nil {
		return err
	}

	remoteIP, err := hexToIP(remoteParts[0])
	if err != nil {
		return err
	}

	remotePort, err := strconv.ParseInt(remoteParts[1], 16, 32)
	if err != nil {
		return err
	}

	// 创建连接并立即关闭来触发RST
	localAddr4 := fmt.Sprintf("%s:%d", localIP, localPort)
	remoteAddr4 := fmt.Sprintf("%s:%d", remoteIP, remotePort)

	return sendRSTToConnection(localAddr4, remoteAddr4)
}

// hexToIP 将十六进制IP地址转换为可读格式
func hexToIP(hexIP string) (string, error) {
	if len(hexIP) == 8 { // IPv4
		ip := make([]byte, 4)
		for i := 0; i < 4; i++ {
			val, err := strconv.ParseUint(hexIP[i*2:(i+1)*2], 16, 8)
			if err != nil {
				return "", err
			}
			ip[3-i] = byte(val) // 小端序
		}
		return fmt.Sprintf("%d.%d.%d.%d", ip[0], ip[1], ip[2], ip[3]), nil
	}
	// 对于IPv6，处理更复杂，这里简化处理
	return "", fmt.Errorf("IPv6 not implemented yet")
}

// sendRSTToConnection 向指定连接发送RST包
func sendRSTToConnection(localAddr, remoteAddr string) error {
	// 尝试创建一个到远程地址的连接，然后立即使用SO_LINGER=0关闭
	// 这会发送RST包而不是正常的FIN包
	conn, err := net.Dial("tcp", remoteAddr)
	if err != nil {
		// 如果无法连接，说明连接可能已经不存在了
		return nil
	}

	// 获取底层的TCP连接
	tcpConn, ok := conn.(*net.TCPConn)
	if !ok {
		conn.Close()
		return fmt.Errorf("not a TCP connection")
	}

	// 设置SO_LINGER为0，这样关闭时会发送RST而不是FIN
	if err := tcpConn.SetLinger(0); err != nil {
		tcpConn.Close()
		return err
	}

	// 关闭连接，这会发送RST包
	return tcpConn.Close()
}
