<template>
  <div class="node-container">
    <el-button
          type="primary" 
          icon="el-icon-plus" 
          @click="handleAdd"
          class="add-btn"
        >
          新增节点
        </el-button>

    <!-- 节点卡片展示 -->
    <div class="cards-container" v-loading="loading" style="margin-top: 10px;">
      <div class="cards-grid">
        <div 
          v-for="node in nodeList" 
          :key="node.id" 
          class="node-card"
          :class="{ 'online': node.connectionStatus === 'online', 'offline': node.connectionStatus !== 'online' }"
        >
          <!-- 节点状态指示器 -->
          <div class="status-indicator">
            <div 
              class="status-dot"
              :class="{ 'online': node.connectionStatus === 'online', 'offline': node.connectionStatus !== 'online' }"
            ></div>
            <span class="status-text">
              {{ node.connectionStatus === 'online' ? '在线' : '离线' }}
            </span>
          </div>

          <!-- 节点信息 -->
          <div class="node-info">
            <div class="node-header">
              <h3 class="node-name">{{ node.name }}</h3>
            </div>

            <!-- 系统监控信息 -->
            <div class="system-stats">
              <!-- CPU和内存使用率图表 -->
              <div class="charts-container" :class="{ 'offline-charts': node.connectionStatus !== 'online' }">
                <div class="chart-item">
                  <div class="chart-title">CPU使用率</div>
                  <div class="chart-wrapper">
                    <v-chart 
                      :option="getCpuChartOption(node.connectionStatus === 'online' ? (node.systemInfo?.cpuUsage || 0) : 0, node.connectionStatus !== 'online')"
                      :style="chartStyle"
                    />
                  </div>
                </div>
                
                <div class="chart-item">
                  <div class="chart-title">内存使用率</div>
                  <div class="chart-wrapper">
                    <v-chart 
                      :option="getMemoryChartOption(node.connectionStatus === 'online' ? (node.systemInfo?.memoryUsage || 0) : 0, node.connectionStatus !== 'online')"
                      :style="chartStyle"
                    />
                  </div>
                </div>
              </div>

              <!-- 流量信息 -->
              <div class="traffic-stats" :class="{ 'offline-stats': node.connectionStatus !== 'online' }">
                <div class="stat-item">
                  <div class="stat-header">
                    <i class="el-icon-upload2"></i>
                    <span>上传流量</span>
                  </div>
                  <div class="stat-content">
                    <span class="traffic-value">
                      {{ node.connectionStatus === 'online' ? formatBytes(node.systemInfo?.uploadTraffic || 0) : '-' }}
                    </span>
                  </div>
                </div>

                <div class="stat-item">
                  <div class="stat-header">
                    <i class="el-icon-download"></i>
                    <span>下载流量</span>
                  </div>
                  <div class="stat-content">
                    <span class="traffic-value">
                      {{ node.connectionStatus === 'online' ? formatBytes(node.systemInfo?.downloadTraffic || 0) : '-' }}
                    </span>
                  </div>
                </div>

                <div class="stat-item">
                  <div class="stat-header">
                    <i class="el-icon-s-grid"></i>
                    <span>实时网速</span>
                  </div>
                  <div class="stat-content">
                    <div v-if="node.connectionStatus === 'online'" class="speed-info">
                      <div class="speed-item">
                        <span class="speed-label">↑</span>
                        <span class="speed-value">{{ formatSpeed(node.systemInfo?.uploadSpeed || 0) }}</span>
                      </div>
                      <div class="speed-item">
                        <span class="speed-label">↓</span>
                        <span class="speed-value">{{ formatSpeed(node.systemInfo?.downloadSpeed || 0) }}</span>
                      </div>
                    </div>
                    <span v-else class="traffic-value total">-</span>
                  </div>
                </div>

                <div class="stat-item">
                  <div class="stat-header">
                    <i class="el-icon-position"></i>
                    <span>主机IP</span>
                  </div>
                  <div class="stat-content">
                    <el-tooltip 
                      :content="node.connectionStatus === 'online' ? (node.ip || '-') : '-'"
                      placement="top"
                      :disabled="!node.ip || node.ip === '-'"
                    >
                      <span class="ip-value">
                        {{ node.connectionStatus === 'online' ? (node.ip || '-') : '-' }}
                      </span>
                    </el-tooltip>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="node-actions">
            <el-button
              size="small" 
              type="success" 
              icon="el-icon-copy-document"
              @click="handleCopyInstallCommand(node)"
              :loading="node.copyLoading"
            >
              复制安装命令
            </el-button>

            <el-button
              size="small" 
              type="primary" 
              icon="el-icon-edit"
              @click="handleEdit(node)"
            >
              编辑
            </el-button>

            <el-button
              size="small" 
              type="danger" 
              icon="el-icon-delete"
              @click="handleDelete(node)"
            >
              删除
            </el-button>

          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!loading && nodeList.length === 0" class="empty-state">
        <i class="el-icon-box"></i>
        <p>暂无节点数据</p>
        <el-button type="primary" @click="handleAdd">创建第一个节点</el-button>
      </div>
    </div>

    <el-dialog
      :title="dialogTitle"
      :visible.sync="dialogVisible" 
      width="500px"
      @close="resetForm"
    >
      <el-form 
        :model="nodeForm" 
        :rules="rules" 
        ref="nodeForm" 
        label-width="80px"
      >
        <el-form-item label="节点名称" prop="name">
          <el-input 
            v-model="nodeForm.name" 
            placeholder="请输入节点名称"
            clearable
          ></el-input>
        </el-form-item>
        
        <el-form-item v-if="!isEdit" label="控制端口" prop="port">
          <el-input 
            v-model.number="nodeForm.port" 
            placeholder="请输入控制端口"
            type="number"
            min="1"
            max="65535"
            clearable
          ></el-input>
        </el-form-item>
        
        <el-form-item v-if="isEdit" label="节点IP" prop="ip">
          <el-input 
            v-model="nodeForm.ip" 
            placeholder="请输入节点IP地址或域名，如: 192.168.1.1、2001:db8::1 或 example.com"
            clearable
          ></el-input>
        </el-form-item>
        
        <el-alert
          v-if="!isEdit"
          title="系统将自动为新节点生成UUID密钥"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 20px;">
        </el-alert>

      </el-form>
      
      <span slot="footer" class="dialog-footer">
        <el-button @click="dialogVisible = false">取 消</el-button>
        <el-button 
          type="primary" 
          @click="handleSubmit"
          :loading="submitLoading"
        >
          {{ submitLoading ? '提交中...' : '确 定' }}
        </el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {createNode, updateNode, deleteNode, getNodeList, getNodeInstallCommand} from "@/api";
import { copyWithMessage, copyWithFallback } from "@/utils/clipboard";
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { GaugeChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';

// 注册必要的组件
use([
  CanvasRenderer,
  GaugeChart,
  TooltipComponent
]);

export default {
  name: "Node",
  components: {
    VChart
  },
  data() {
    return {
      nodeList: [],
      loading: false,
      dialogVisible: false,
      dialogTitle: '',
      isEdit: false,
      submitLoading: false,
      nodeForm: {
        id: null,
        name: '',
        ip: '',
        port: null
      },
      rules: {
        name: [
          { required: true, message: '请输入节点名称', trigger: 'blur' },
          { min: 2, message: '节点名称长度至少2位', trigger: 'blur' },
          { max: 50, message: '节点名称长度不能超过50位', trigger: 'blur' }
        ],
        port: [
          { required: true, message: '请输入控制端口', trigger: 'blur' },
          { type: 'number', message: '控制端口必须为数字', trigger: 'blur' },
          { 
            validator: (rule, value, callback) => {
              if (value && (value < 1 || value > 65535)) {
                callback(new Error('端口号必须在1-65535之间'));
              } else {
                callback();
              }
            }, 
            trigger: 'blur' 
          }
        ],
        ip: [
          { required: true, message: '请输入节点IP地址', trigger: 'blur' },
          { 
            validator: (rule, value, callback) => {
              if (value) {
                // IPv4格式验证
                const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
                
                // IPv6格式验证（完整版，支持各种压缩格式，不需要方括号）
                const ipv6Regex = /^((([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4}|:))|(([0-9a-fA-F]{1,4}:){6}(:[0-9a-fA-F]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-fA-F]{1,4}:){5}(((:[0-9a-fA-F]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-fA-F]{1,4}:){4}(((:[0-9a-fA-F]{1,4}){1,3})|((:[0-9a-fA-F]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){3}(((:[0-9a-fA-F]{1,4}){1,4})|((:[0-9a-fA-F]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){2}(((:[0-9a-fA-F]{1,4}){1,5})|((:[0-9a-fA-F]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){1}(((:[0-9a-fA-F]{1,4}){1,6})|((:[0-9a-fA-F]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-fA-F]{1,4}){1,7})|((:[0-9a-fA-F]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/;
                
                // 域名格式验证
                const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
                
                if (ipv4Regex.test(value) || ipv6Regex.test(value) || domainRegex.test(value)) {
                  callback();
                } else {
                  callback(new Error('请输入有效的IP地址或域名（支持IPv4、IPv6和域名格式，如: 192.168.1.1、2001:db8::1 或 example.com）'));
                }
              } else {
                callback();
              }
            }, 
            trigger: 'blur' 
          }
        ]
      },
      websocket: null,
      reconnectTimer: null,
      maxReconnectAttempts: 5,
      reconnectAttempts: 0
    };
  },
  
  computed: {
    // 动态图表样式
    chartStyle() {
      return {
        height: this.isMobile ? '80px' : '120px',
        width: '100%'
      };
    },
    
    // 检查是否为移动端
    isMobile() {
      return window.innerWidth <= 768;
    }
  },
  
  filters: {
    dateFormat(timestamp) {
      if (!timestamp) return '-';
      const date = new Date(timestamp);
      return date.toLocaleString('zh-CN');
    }
  },
  
  mounted() {
    this.loadNodes();
    this.initWebSocket();
    // 监听窗口大小变化
    window.addEventListener('resize', this.handleResize);
  },
  
  // 组件激活时（如果使用keep-alive）
  activated() {
    // 如果WebSocket已断开，重新连接
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      this.initWebSocket();
    }
  },
  
  // 组件停用时（如果使用keep-alive）
  deactivated() {
    this.closeWebSocket();
  },
  
  // 组件销毁前
  beforeDestroy() {
    this.closeWebSocket();
    // 移除窗口大小变化监听
    window.removeEventListener('resize', this.handleResize);
  },
  
  // 路由离开守卫
  beforeRouteLeave(to, from, next) {
    this.closeWebSocket();
    next();
  },
  
  methods: {
    // 加载节点列表
    loadNodes() {
      this.loading = true;

      getNodeList().then(res => {
        this.loading = false;
        if (res.code === 0) {
          this.nodeList = res.data.map(node => ({
            ...node,
            // 使用接口返回的status作为初始连接状态
            // status: 1-在线, 0-离线
            connectionStatus: node.status === 1 ? 'online' : 'offline',
            systemInfo: null, // 初始化系统信息为空，等待WebSocket数据
            copyLoading: false // 初始化复制加载状态
          }));
        } else {
          this.$message.error(res.msg || '加载节点列表失败');
        }
      }).catch(error => {
        this.loading = false;
        this.$message.error('网络错误，请重试');
      });
    },
    
    // 新增节点
    handleAdd() {
      this.dialogTitle = '新增节点';
      this.isEdit = false;
      this.dialogVisible = true;
      this.resetForm();
    },
    
    // 编辑节点
    handleEdit(node) {
      this.dialogTitle = '编辑节点';
      this.isEdit = true;
      this.nodeForm = {
        id: node.id,
        name: node.name,
        ip: node.ip,
        port: node.port
      };
      this.dialogVisible = true;
    },
    
    // 删除节点
    handleDelete(node) {
      this.$confirm(`确定要删除节点 "${node.name}" 吗？`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        deleteNode(node.id).then(res => {
          if (res.code === 0) {
            this.$message.success('删除成功');
            // 从当前列表中移除节点，不重新加载
            const index = this.nodeList.findIndex(n => n.id === node.id);
            if (index !== -1) {
              this.nodeList.splice(index, 1);
            }
          } else {
            this.$message.error(res.msg || '删除失败');
          }
        });
      }).catch(() => {
        // 用户取消删除
      });
    },

    // 复制安装命令
    handleCopyInstallCommand(node) {
      // 设置加载状态
      this.$set(node, 'copyLoading', true);
      
      getNodeInstallCommand(node.id).then(res => {
        this.$set(node, 'copyLoading', false);
        
        if (res.code === 0 && res.data) {
          // 对于异步获取的内容，使用带降级方案的复制方法
          // 这样在Safari中如果自动复制失败，会显示手动复制对话框
          copyWithFallback(res.data, '安装命令', this);
        } else {
          this.$message.error(res.msg || '获取安装命令失败');
        }
      }).catch(error => {
        this.$set(node, 'copyLoading', false);
        this.$message.error('网络错误，请重试');
      });
    },

    
    // 提交表单
    handleSubmit() {
      this.$refs.nodeForm.validate(valid => {
        if (valid) {
          this.submitLoading = true;
          
          const apiCall = this.isEdit ? updateNode : createNode;
          const data = this.isEdit ? this.nodeForm : { name: this.nodeForm.name, port: this.nodeForm.port };
          
          apiCall(data).then(res => {
            this.submitLoading = false;
            if (res.code === 0) {
              this.$message.success(this.isEdit ? '更新成功' : '创建成功');
              this.dialogVisible = false;
              
              if (this.isEdit) {
                // 更新操作：只更新当前节点的名称和IP，保持连接状态
                const existingNode = this.nodeList.find(n => n.id === this.nodeForm.id);
                if (existingNode) {
                  existingNode.name = this.nodeForm.name;
                  existingNode.ip = this.nodeForm.ip;
                  existingNode.updatedTime = Date.now(); // 更新时间戳
                }
              } else {
                // 创建操作：重新获取节点列表但保持现有连接状态
                this.loadNodesWithStatePreservation();
              }
            } else {
              this.$message.error(res.msg || (this.isEdit ? '更新失败' : '创建失败'));
            }
          }).catch(() => {
            this.submitLoading = false;
            this.$message.error('网络错误，请重试');
          });
        }
      });
    },
    
    // 加载节点列表但保持现有连接状态
    loadNodesWithStatePreservation() {
      getNodeList().then(res => {
        if (res.code === 0) {
          // 保存当前的连接状态和系统信息
          const currentStates = {};
          this.nodeList.forEach(node => {
            currentStates[node.id] = {
              connectionStatus: node.connectionStatus,
              systemInfo: node.systemInfo
            };
          });
          
          // 更新节点列表，但保持已连接节点的状态
          this.nodeList = res.data.map(node => ({
            ...node,
            // 优先使用已有的连接状态，对于新节点使用接口返回的status
            // status: 1-在线, 0-离线
            connectionStatus: currentStates[node.id]?.connectionStatus || 
                            (node.status === 1 ? 'online' : 'offline'),
            systemInfo: currentStates[node.id]?.systemInfo || null,
            copyLoading: false // 初始化复制加载状态
          }));
        } else {
          this.$message.error(res.msg || '加载节点列表失败');
        }
      }).catch(error => {
        this.$message.error('网络错误，请重试');
      });
    },
    
    // 重置表单
    resetForm() {
      this.nodeForm = {
        id: null,
        name: '',
        ip: '',
        port: null
      };
      if (this.$refs.nodeForm) {
        this.$refs.nodeForm.clearValidate();
      }
    },
    
    // 初始化WebSocket连接
    initWebSocket() {
      // 如果已经存在连接且状态正常，则不重复创建
      if (this.websocket && 
          (this.websocket.readyState === WebSocket.OPEN || 
           this.websocket.readyState === WebSocket.CONNECTING)) {
        return;
      }
      
      // 先关闭现有连接（如果有的话）
      if (this.websocket) {
        this.closeWebSocket();
      }
      
      const wsUrl = `${process.env.VUE_APP_API_BASE}/system-info?type=0&secret=` + localStorage.getItem('token');
      
      try {
        this.websocket = new WebSocket(wsUrl);
        
        this.websocket.onopen = () => {
          this.reconnectAttempts = 0;
        };
        
        this.websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
          } catch (error) {
            // 解析失败时不输出错误信息
          }
        };
        
        this.websocket.onerror = (error) => {
        };
        
        this.websocket.onclose = (event) => {
          this.websocket = null;
          // 只有在组件还存在时才尝试重连
          if (!this._isDestroyed && !this._inactive) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        this.attemptReconnect();
      }
    },
    
    // 处理WebSocket消息
    handleWebSocketMessage(data) {
      const { id, type, data: messageData } = data;
      
      if (type === 'status') {
        // WebSocket状态更新会覆盖初始的接口状态
        // 这里的状态是实时的连接状态，比接口返回的status更准确
        const node = this.nodeList.find(n => n.id == id);
        if (node) {
          node.connectionStatus = messageData === 1 ? 'online' : 'offline';
          if (messageData === 0) {
            node.systemInfo = null;
          }
        }
      } else if (type === 'info') {
        // 系统监控信息同步，只有在线的节点才会发送这类数据
        const node = this.nodeList.find(n => n.id == id);
        if (node) {
          node.connectionStatus = 'online'; // 收到info说明节点在线
          
          try {
            // data是字符串化的JSON，需要解析
            let systemInfo;
            if (typeof messageData === 'string') {
              systemInfo = JSON.parse(messageData);
            } else {
              systemInfo = messageData;
            }
            
            const currentUpload = parseInt(systemInfo.bytes_transmitted) || 0;
            const currentDownload = parseInt(systemInfo.bytes_received) || 0;
            const currentUptime = parseInt(systemInfo.uptime) || 0;
            
            // 计算网速（如果有历史数据）
            let uploadSpeed = 0;
            let downloadSpeed = 0;
            
            if (node.systemInfo && node.systemInfo.uptime) {
              const timeDiff = currentUptime - node.systemInfo.uptime; // 服务器运行时间差（秒）
              
              // 确保时间差为正数且合理（避免服务器重启导致uptime重置）
              if (timeDiff > 0 && timeDiff <= 10) {
                const lastUpload = node.systemInfo.uploadTraffic || 0;
                const lastDownload = node.systemInfo.downloadTraffic || 0;
                
                const uploadDiff = currentUpload - lastUpload;
                const downloadDiff = currentDownload - lastDownload;
                
                // 检测流量是否重置（当前值小于历史值，可能是服务器重启）
                const uploadReset = currentUpload < lastUpload;
                const downloadReset = currentDownload < lastDownload;
                
                // 只有在流量正常增长的情况下才计算速度
                if (!uploadReset && uploadDiff >= 0) {
                  uploadSpeed = uploadDiff / timeDiff;
                }
                
                if (!downloadReset && downloadDiff >= 0) {
                  downloadSpeed = downloadDiff / timeDiff;
                }
              }
            }
            
            node.systemInfo = {
              cpuUsage: parseFloat(systemInfo.cpu_usage) || 0,
              memoryUsage: parseFloat(systemInfo.memory_usage) || 0,
              uploadTraffic: currentUpload,
              downloadTraffic: currentDownload,
              uploadSpeed: uploadSpeed,
              downloadSpeed: downloadSpeed,
              uptime: currentUptime
            };
            
          } catch (error) {
            // 解析失败时不输出错误信息
          }
        }
      }
    },
    
    // 尝试重新连接
    attemptReconnect() {
      // 检查组件是否还存在，如果已销毁则不重连
      if (this._isDestroyed || this._inactive) {
        return;
      }
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        
        this.reconnectTimer = setTimeout(() => {
          // 再次检查组件状态
          if (!this._isDestroyed && !this._inactive) {
            this.initWebSocket();
          }
        }, 3000 * this.reconnectAttempts);
      }
    },
    
    // 关闭WebSocket连接
    closeWebSocket() {
      // 清理重连定时器
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      
      // 重置重连次数
      this.reconnectAttempts = 0;
      
      // 关闭WebSocket连接
      if (this.websocket) {
        // 移除事件监听器，避免触发onclose事件导致重连
        this.websocket.onopen = null;
        this.websocket.onmessage = null;
        this.websocket.onerror = null;
        this.websocket.onclose = null;
        
        // 如果连接还在开启状态，则关闭它
        if (this.websocket.readyState === WebSocket.OPEN || 
            this.websocket.readyState === WebSocket.CONNECTING) {
          this.websocket.close();
        }
        
        this.websocket = null;
      }
      
      // 重置所有节点的连接状态为离线
      this.nodeList.forEach(node => {
        node.connectionStatus = 'offline';
        node.systemInfo = null;
      });
    },
    
    // 获取CPU图表配置
    getCpuChartOption(cpuUsage, offline = false) {
      const colors = offline ? 
        [[1, '#d4d4d4']] : 
        [
          [0.5, '#67c23a'],
          [0.8, '#e6a23c'],
          [1, '#f56c6c']
        ];
      
      return {
        series: [{
          type: 'gauge',
          radius: '85%',
          center: ['50%', '55%'],
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: 100,
          splitNumber: 5,
          axisLine: {
            lineStyle: {
              width: 8,
              color: colors
            }
          },
          pointer: {
            width: 3,
            length: '45%',
            itemStyle: {
              color: offline ? '#909399' : '#409eff'
            }
          },
          axisTick: {
            show: false
          },
          splitLine: {
            show: false
          },
          axisLabel: {
            show: false
          },
          detail: {
            formatter: offline ? '-' : '{value}%',
            fontSize: 18,
            fontWeight: 'bold',
            color: offline ? '#909399' : '#303133',
            offsetCenter: [0, '25%']
          },
          title: {
            show: false
          },
          data: [{
            value: offline ? 0 : cpuUsage.toFixed(1)
          }]
        }]
      };
    },
    
    // 获取内存图表配置
    getMemoryChartOption(memoryUsage, offline = false) {
      const colors = offline ? 
        [[1, '#d4d4d4']] : 
        [
          [0.5, '#67c23a'],
          [0.8, '#e6a23c'],
          [1, '#f56c6c']
        ];
      
      return {
        series: [{
          type: 'gauge',
          radius: '85%',
          center: ['50%', '55%'],
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: 100,
          splitNumber: 5,
          axisLine: {
            lineStyle: {
              width: 8,
              color: colors
            }
          },
          pointer: {
            width: 3,
            length: '45%',
            itemStyle: {
              color: offline ? '#909399' : '#409eff'
            }
          },
          axisTick: {
            show: false
          },
          splitLine: {
            show: false
          },
          axisLabel: {
            show: false
          },
          detail: {
            formatter: offline ? '-' : '{value}%',
            fontSize: 18,
            fontWeight: 'bold',
            color: offline ? '#909399' : '#303133',
            offsetCenter: [0, '25%']
          },
          title: {
            show: false
          },
          data: [{
            value: offline ? 0 : memoryUsage.toFixed(1)
          }]
        }]
      };
    },
    
    // 格式化字节数
    formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    // 格式化速度
    formatSpeed(bytesPerSecond) {
      if (bytesPerSecond === 0) return '0 B/s';
      
      const k = 1024;
      const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
      const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
      
      return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    // 处理窗口大小变化
    handleResize() {
      // 触发计算属性重新计算
      this.$forceUpdate();
    }
  }
};
</script>

<style scoped>
.node-container {
  padding: 5px;
  background-color: #f5f7fa;
  min-height: calc(100vh - 60px);
}

/* 页面头部 */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  background: white;
  padding: 20px 30px;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  margin: 0;
  display: flex;
  align-items: center;
}

.page-title i {
  margin-right: 8px;
  color: #409eff;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 卡片容器 */
.cards-container {
  min-height: 400px;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

/* 节点卡片 */
.node-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  border-left: 4px solid #ddd;
}

.node-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px 0 rgba(0, 0, 0, 0.15);
}

.node-card.online {
  border-left-color: #67c23a;
}

.node-card.offline {
  border-left-color: #f56c6c;
}

/* 状态指示器 */
.status-indicator {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
  animation: pulse 2s infinite;
}

.status-dot.online {
  background-color: #67c23a;
}

.status-dot.offline {
  background-color: #f56c6c;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.status-text {
  font-size: 12px;
  font-weight: 500;
  color: #909399;
}

/* 节点信息 */
.node-info {
  margin-bottom: 20px;
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.node-name {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

/* 图表容器 */
.charts-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  margin-bottom: 20px;
}

.charts-container.offline-charts {
  opacity: 0.6;
}

.charts-container.offline-charts .chart-title {
  color: #909399;
}

.chart-item {
  text-align: center;
}

.chart-title {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
  margin-bottom: 8px;
}

.chart-wrapper {
  background: #fafafa;
  border-radius: 8px;
  padding: 10px;
}

.charts-container.offline-charts .chart-wrapper {
  background: #f5f5f5;
}

/* 流量统计 */
.traffic-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 10px;
  width: 100%;
}

.traffic-stats.offline-stats {
  opacity: 0.6;
}

.traffic-stats.offline-stats .stat-header {
  color: #909399;
}

.traffic-stats.offline-stats .stat-header i {
  color: #c0c4cc;
}

.traffic-stats.offline-stats .traffic-value,
.traffic-stats.offline-stats .ip-value {
  color: #909399;
}

.traffic-stats.offline-stats .stat-item {
  background: #f5f5f5;
}

.stat-item {
  background: #fafafa;
  border-radius: 6px;
  padding: 10px;
  width: 100%;
  box-sizing: border-box;
  min-height: 60px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0; /* 防止内容撑开容器 */
  overflow: hidden; /* 防止内容溢出 */
}

.stat-header {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
  color: #606266;
  font-weight: 500;
}

.stat-header i {
  margin-right: 6px;
  color: #409eff;
  width: 14px;
}

.stat-content {
  text-align: center;
}

.traffic-value {
  font-size: 13px;
  font-weight: 600;
  color: #409eff;
  font-family: monospace;
}

.traffic-value.total {
  color: #67c23a;
  font-size: 14px;
}

.speed-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.speed-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  flex: 1;
}

.speed-label {
  font-size: 12px;
  font-weight: bold;
  color: #909399;
  width: 12px;
}

.speed-value {
  font-size: 11px;
  font-weight: 600;
  color: #409eff;
  font-family: monospace;
}

.ip-value {
  font-size: 12px;
  font-weight: 600;
  color: #303133;
  font-family: monospace;
  display: block;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #909399;
}

.empty-state i {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 16px;
  margin-bottom: 20px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .node-container {
    padding: 5px;
  }
  
  .cards-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  
  .charts-container {
    grid-template-columns: 1fr;
    gap: 8px;
    margin-bottom: 12px;
  }
  
  .traffic-stats {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  
  .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 15px 20px;
    margin-bottom: 15px;
  }
  
  .header-actions {
    justify-content: center;
  }
  
  .node-card {
    padding: 12px;
  }
  
  .node-header {
    margin-bottom: 10px;
  }
  
  .node-name {
    font-size: 16px;
  }
  
  .status-indicator {
    margin-bottom: 10px;
  }
  
  .chart-wrapper {
    padding: 6px;
  }
  
  .chart-title {
    font-size: 12px;
    margin-bottom: 4px;
  }
  
  .stat-item {
    padding: 6px;
    min-height: 45px;
  }
  
  .stat-header {
    font-size: 11px;
    margin-bottom: 4px;
  }
  
  .traffic-value {
    font-size: 12px;
  }
  
  .speed-value {
    font-size: 10px;
  }
  
  .ip-value {
    font-size: 11px;
  }
  
  .node-actions {
    padding-top: 10px;
    gap: 6px;
  }
}

/* 节点操作 */
.node-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  border-top: 1px solid #ebeef5;
  padding-top: 15px;
}

@media (max-width: 480px) {
  .node-container {
    padding: 3px;
  }
  
  .cards-grid {
    gap: 8px;
  }
  
  .node-card {
    padding: 10px;
  }
  
  .charts-container {
    gap: 6px;
    margin-bottom: 10px;
  }
  
  .traffic-stats {
    gap: 4px;
  }
  
  .stat-item {
    padding: 5px;
    min-height: 40px;
  }
  
  .chart-wrapper {
    padding: 4px;
  }
  
  .node-actions {
    justify-content: center;
    flex-direction: column;
    gap: 5px;
  }
  
  .node-actions .el-button {
    font-size: 11px;
    padding: 5px 10px;
    width: 100%;
    margin: 0;
  }
  
  .add-btn {
    font-size: 12px;
    padding: 8px 15px;
  }
  
  .page-header {
    padding: 10px 15px;
    margin-bottom: 10px;
  }
  
  .page-title {
    font-size: 20px;
  }
}

/* 管理员信息面板 */
.admin-info-panel {
  margin-top: 15px;
  padding: 12px;
  background: linear-gradient(135deg, #f8f9fa, #e9ecef);
  border-radius: 8px;
  border-left: 3px solid #007bff;
}

.admin-title {
  font-size: 14px;
  font-weight: 600;
  color: #007bff;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
}

.admin-title:before {
  content: '👑';
  margin-right: 6px;
}

.admin-details {
  display: grid;
  gap: 6px;
}

.admin-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px dotted #dee2e6;
}

.admin-item:last-child {
  border-bottom: none;
}

.admin-item .label {
  font-size: 12px;
  color: #6c757d;
  font-weight: 500;
}

.admin-item .value {
  font-size: 12px;
  color: #495057;
  font-family: monospace;
  background: rgba(255, 255, 255, 0.6);
  padding: 2px 6px;
  border-radius: 4px;
}

/* 管理员状态信息 */
.admin-info {
  font-size: 11px;
  color: #007bff;
  font-weight: 500;
}

/* 复制对话框样式 */
::v-deep .copy-dialog .el-message-box__content {
  word-break: break-all;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

::v-deep .copy-dialog .el-message-box__message p {
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 12px;
  background: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  margin: 10px 0;
  user-select: text;
  -webkit-user-select: text;
}
</style>