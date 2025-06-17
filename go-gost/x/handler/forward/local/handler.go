package local

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"net"
	"time"

	"github.com/go-gost/core/chain"
	"github.com/go-gost/core/handler"
	"github.com/go-gost/core/hop"
	md "github.com/go-gost/core/metadata"
	"github.com/go-gost/core/observer/stats"
	"github.com/go-gost/core/recorder"
	ctxvalue "github.com/go-gost/x/ctx"
	xnet "github.com/go-gost/x/internal/net"
	"github.com/go-gost/x/internal/util/forwarder"
	"github.com/go-gost/x/internal/util/sniffing"
	tls_util "github.com/go-gost/x/internal/util/tls"
	rate_limiter "github.com/go-gost/x/limiter/rate"
	xstats "github.com/go-gost/x/observer/stats"
	stats_wrapper "github.com/go-gost/x/observer/stats/wrapper"
	xrecorder "github.com/go-gost/x/recorder"
	"github.com/go-gost/x/registry"
)

func init() {
	registry.HandlerRegistry().Register("tcp", NewHandler)
	registry.HandlerRegistry().Register("udp", NewHandler)
	registry.HandlerRegistry().Register("forward", NewHandler)
}

// TrafficRecorder 流量记录器接口
type TrafficRecorder interface {
	RecordTraffic(ctx context.Context, service string, upload, download int64) error
}

type forwardHandler struct {
	hop             hop.Hop
	md              metadata
	options         handler.Options
	recorder        recorder.RecorderObject
	certPool        tls_util.CertPool
	trafficRecorder TrafficRecorder
}

func NewHandler(opts ...handler.Option) handler.Handler {
	options := handler.Options{}
	for _, opt := range opts {
		opt(&options)
	}

	return &forwardHandler{
		options: options,
	}
}

func (h *forwardHandler) Init(md md.Metadata) (err error) {
	if err = h.parseMetadata(md); err != nil {
		return
	}

	for _, ro := range h.options.Recorders {
		if ro.Record == xrecorder.RecorderServiceHandler {
			h.recorder = ro
			break
		}
	}

	if h.md.certificate != nil && h.md.privateKey != nil {
		h.certPool = tls_util.NewMemoryCertPool()
	}

	// 获取全局流量记录器
	h.trafficRecorder = GetGlobalTrafficRecorder()

	return
}

// Forward implements handler.Forwarder.
func (h *forwardHandler) Forward(hop hop.Hop) {
	h.hop = hop
}

func (h *forwardHandler) Handle(ctx context.Context, conn net.Conn, opts ...handler.HandleOption) (err error) {
	defer conn.Close()

	start := time.Now()

	ro := &xrecorder.HandlerRecorderObject{
		Service:    h.options.Service,
		RemoteAddr: conn.RemoteAddr().String(),
		LocalAddr:  conn.LocalAddr().String(),
		Network:    "tcp",
		Time:       start,
		SID:        string(ctxvalue.SidFromContext(ctx)),
	}

	ro.ClientIP = conn.RemoteAddr().String()
	if clientAddr := ctxvalue.ClientAddrFromContext(ctx); clientAddr != "" {
		ro.ClientIP = string(clientAddr)
	} else {
		ctx = ctxvalue.ContextWithClientAddr(ctx, ctxvalue.ClientAddr(conn.RemoteAddr().String()))
	}

	if h, _, _ := net.SplitHostPort(ro.ClientIP); h != "" {
		ro.ClientIP = h
	}

	log := h.options.Logger.WithFields(map[string]any{
		"remote": conn.RemoteAddr().String(),
		"local":  conn.LocalAddr().String(),
		"sid":    ro.SID,
		"client": ro.ClientIP,
	})

	network := "tcp"
	if _, ok := conn.(net.PacketConn); ok {
		network = "udp"
	}
	ro.Network = network

	connStats := xstats.Stats{}
	ccStats := xstats.Stats{}
	conn = stats_wrapper.WrapConn(conn, &connStats)

	defer func() {
		if err != nil {
			ro.Err = err.Error()
		}
		ro.Duration = time.Since(start)

		if h.trafficRecorder != nil {
			connOutputBytes := connStats.Get(stats.KindOutputBytes)
			connInputBytes := connStats.Get(stats.KindInputBytes)
			ccOutputBytes := ccStats.Get(stats.KindOutputBytes)
			ccInputBytes := ccStats.Get(stats.KindInputBytes)

			h.trafficRecorder.RecordTraffic(ctx, ro.Service+":conn", int64(connOutputBytes), int64(connInputBytes))
			h.trafficRecorder.RecordTraffic(ctx, ro.Service+":cc", int64(ccOutputBytes), int64(ccInputBytes))
		}
	}()

	if !h.checkRateLimit(conn.RemoteAddr()) {
		return rate_limiter.ErrRateLimit
	}

	var proto string
	if network == "tcp" && h.md.sniffing {
		if h.md.sniffingTimeout > 0 {
			conn.SetReadDeadline(time.Now().Add(h.md.sniffingTimeout))
		}

		br := bufio.NewReader(conn)
		proto, _ = sniffing.Sniff(ctx, br)
		ro.Proto = proto

		if h.md.sniffingTimeout > 0 {
			conn.SetReadDeadline(time.Time{})
		}

		dial := func(ctx context.Context, network, address string) (net.Conn, error) {
			var buf bytes.Buffer
			cc, err := h.options.Router.Dial(ctxvalue.ContextWithBuffer(ctx, &buf), "tcp", address)
			ro.Route = buf.String()

			cc = stats_wrapper.WrapConn(cc, &ccStats)

			return cc, err
		}
		sniffer := &forwarder.Sniffer{
			Websocket:           h.md.sniffingWebsocket,
			WebsocketSampleRate: h.md.sniffingWebsocketSampleRate,
			Recorder:            h.recorder.Recorder,
			RecorderOptions:     h.recorder.Options,
			Certificate:         h.md.certificate,
			PrivateKey:          h.md.privateKey,
			NegotiatedProtocol:  h.md.alpn,
			CertPool:            h.certPool,
			MitmBypass:          h.md.mitmBypass,
			ReadTimeout:         h.md.readTimeout,
		}

		conn = xnet.NewReadWriteConn(br, conn, conn)
		switch proto {
		case sniffing.ProtoHTTP:
			return sniffer.HandleHTTP(ctx, conn,
				forwarder.WithDial(dial),
				forwarder.WithHop(h.hop),
				forwarder.WithBypass(h.options.Bypass),
				forwarder.WithHTTPKeepalive(h.md.httpKeepalive),
				forwarder.WithRecorderObject(ro),
				forwarder.WithLog(log),
			)
		case sniffing.ProtoTLS:
			return sniffer.HandleTLS(ctx, conn,
				forwarder.WithDial(dial),
				forwarder.WithHop(h.hop),
				forwarder.WithBypass(h.options.Bypass),
				forwarder.WithRecorderObject(ro),
				forwarder.WithLog(log),
			)
		}
	}

	target := &chain.Node{}
	if h.hop != nil {
		target = h.hop.Select(ctx, hop.ProtocolSelectOption(proto))
	}
	if target == nil {
		err := errors.New("node not available")
		return err
	}

	addr := target.Addr
	if opts := target.Options(); opts != nil {
		switch opts.Network {
		case "unix":
			network = opts.Network
		default:
			if _, _, err := net.SplitHostPort(addr); err != nil {
				addr += ":0"
			}
		}
	}

	ro.Network = network
	ro.Host = addr

	var buf bytes.Buffer
	cc, err := h.options.Router.Dial(ctxvalue.ContextWithBuffer(ctx, &buf), network, addr)
	ro.Route = buf.String()
	if err != nil {
		if marker := target.Marker(); marker != nil {
			marker.Mark()
		}
		return err
	}
	if marker := target.Marker(); marker != nil {
		marker.Reset()
	}

	cc = stats_wrapper.WrapConn(cc, &ccStats)

	defer cc.Close()

	xnet.Transport(conn, cc)

	return nil
}

func (h *forwardHandler) checkRateLimit(addr net.Addr) bool {
	if h.options.RateLimiter == nil {
		return true
	}
	host, _, _ := net.SplitHostPort(addr.String())
	if limiter := h.options.RateLimiter.Limiter(host); limiter != nil {
		return limiter.Allow(1)
	}

	return true
}
