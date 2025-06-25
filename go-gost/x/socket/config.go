package socket

import (
	"bytes"
	"os"

	"github.com/go-gost/core/observer/stats"
	"github.com/go-gost/x/config"
	"github.com/go-gost/x/registry"
	"github.com/go-gost/x/service"
)

func saveConfig() {

	file := "gost.json"

	f, err := os.Create(file)
	if err != nil {
		return
	}
	defer f.Close()

	if err := config.Global().Write(f, "json"); err != nil {

		return
	}

	return
}

type serviceStatus interface {
	Status() *service.Status
}

type getConfigResponse struct {
	Config *config.Config
}

func getConfig() ([]byte, error) {

	config.OnUpdate(func(c *config.Config) error {
		for _, svc := range c.Services {
			if svc == nil {
				continue
			}
			s := registry.ServiceRegistry().Get(svc.Name)
			ss, ok := s.(serviceStatus)
			if ok && ss != nil {
				status := ss.Status()
				svc.Status = &config.ServiceStatus{
					CreateTime: status.CreateTime().Unix(),
					State:      string(status.State()),
				}
				if st := status.Stats(); st != nil {
					svc.Status.Stats = &config.ServiceStats{
						TotalConns:   st.Get(stats.KindTotalConns),
						CurrentConns: st.Get(stats.KindCurrentConns),
						TotalErrs:    st.Get(stats.KindTotalErrs),
						InputBytes:   st.Get(stats.KindInputBytes),
						OutputBytes:  st.Get(stats.KindOutputBytes),
					}
				}
				for _, ev := range status.Events() {
					if !ev.Time.IsZero() {
						svc.Status.Events = append(svc.Status.Events, config.ServiceEvent{
							Time: ev.Time.Unix(),
							Msg:  ev.Message,
						})
					}
				}
			}
		}
		return nil
	})

	var resp getConfigResponse
	resp.Config = config.Global()

	buf := &bytes.Buffer{}

	resp.Config.Write(buf, "json")
	return buf.Bytes(), nil
}
