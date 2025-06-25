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
    <div class="cards-container" v-loading="loading" style="margin-top: 20px;">
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
                    <span>服务器IP</span>
                  </div>
                  <div class="stat-content">
                    <div v-if="node.connectionStatus === 'online' && node.serverIp" class="ip-display">
                      <el-tag
                        :type="getIpTagType(node.serverIp)"
                        size="mini"
                        class="ip-display-tag"
                      >
                        {{ node.serverIp }}
                      </el-tag>
                    </div>
                    <span v-else class="ip-value">-</span>
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
        
        <el-form-item label="服务器IP" prop="serverIp">
          <el-input 
            v-model="nodeForm.serverIp" 
            placeholder="请输入服务器IP地址，如: 192.168.1.100 或 2001:db8::1 或 example.com"
            clearable
          ></el-input>
        </el-form-item>
        
        <el-form-item label="入口IP" prop="ipList">
          <div class="ip-input-container">
            <!-- IP输入区域 -->
            <div class="ip-input-section">
              <el-input
                v-model="newIpInput"
                placeholder="输入IP地址或域名，按Enter添加"
                clearable
                @keyup.enter.native="addIp"
                size="medium"
                class="ip-input"
                :disabled="nodeForm.ipList.length >= 10"
              >
                <template slot="append">
                  <el-button 
                    @click="addIp" 
                    icon="el-icon-plus" 
                    size="medium"
                    :disabled="nodeForm.ipList.length >= 10 || !newIpInput.trim()"
                    type="primary"
                  >
                    添加
                  </el-button>
                </template>
              </el-input>
              
              <!-- 添加提示 -->
              <div class="ip-input-tips">
                <div class="tip-item">
                  <i class="el-icon-info"></i>
                  <span>支持IPv4、IPv6地址和域名格式</span>
                </div>
                <div class="tip-item count-tip">
                  <i class="el-icon-document"></i>
                  <span>已添加 {{ nodeForm.ipList.length }} / 10 个IP</span>
                </div>
              </div>
            </div>
            
            <!-- 已添加的IP列表 -->
            <div class="ip-list-section" v-if="nodeForm.ipList.length > 0">
              <div class="ip-list-header">
                <span class="list-title">
                  <i class="el-icon-collection-tag"></i>
                  已配置的入口IP
                </span>
                <el-button 
                  size="mini" 
                  type="text" 
                  @click="clearAllIps"
                  class="clear-all-btn"
                >
                  <i class="el-icon-delete"></i>
                  清空全部
                </el-button>
              </div>
              
              <div class="ip-tags-grid">
                <div 
                  v-for="(ip, index) in nodeForm.ipList"
                  :key="index"
                  class="ip-tag-item"
                >
                  <el-tag
                    :type="getIpTagType(ip)"
                    size="medium"
                    closable
                    @close="removeIp(index)"
                    class="ip-tag"
                  >
                    <i :class="getIpIcon(ip)" class="ip-icon"></i>
                    {{ ip }}
                  </el-tag>
                </div>
              </div>
            </div>
            
            <!-- 空状态提示 -->
            <div class="ip-empty-state" v-else>
              <i class="el-icon-plus"></i>
              <p>请添加至少一个入口IP地址</p>
              <div class="example-ips">
                <span class="example-label">示例：</span>
                <el-tag size="mini" @click="fillExample('192.168.1.100')" class="example-tag">192.168.1.100</el-tag>
                <el-tag size="mini" @click="fillExample('example.com')" class="example-tag">example.com</el-tag>
              </div>
            </div>
          </div>
        </el-form-item>
   
        <el-alert
          title="服务器ip是用于隧道转发时，入口服务器将数据转发到此服务器"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 20px;">
        </el-alert>
        <el-alert
          title="系统将自动为节点生成UUID密钥"
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
        ipList: [],
        serverIp: ''
      },
      newIpInput: '',
      rules: {
        name: [
          { required: true, message: '请输入节点名称', trigger: 'blur' },
          { min: 2, message: '节点名称长度至少2位', trigger: 'blur' },
          { max: 50, message: '节点名称长度不能超过50位', trigger: 'blur' }
        ],
        ipList: [
          { 
            validator: (rule, value, callback) => {
              if (!value || value.length === 0) {
                callback(new Error('请至少添加一个入口IP地址'));
              } else {
                callback();
              }
            }, 
            trigger: 'change' 
          }
        ],
        serverIp: [
          { required: true, message: '请输入服务器IP地址', trigger: 'blur' },
          { 
            validator: (rule, value, callback) => {
              if (!value || !value.trim()) {
                callback(new Error('请输入服务器IP地址'));
              } else if (!this.validateSingleIp(value.trim())) {
                callback(new Error('请输入有效的IPv4、IPv6地址或域名'));
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
        ipList: node.ip ? (typeof node.ip === 'string' ? node.ip.split(',').filter(ip => ip.trim()) : []) : [],
        serverIp: node.serverIp || ''
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
          const submitData = {
            ...this.nodeForm,
            ip: this.nodeForm.ipList.join(',') // 将IP数组转换为逗号分隔的字符串
          };
          delete submitData.ipList; // 移除ipList字段
          const data = this.isEdit ? submitData : { 
            name: this.nodeForm.name, 
            ip: this.nodeForm.ipList.join(','),
            serverIp: this.nodeForm.serverIp
          };
          
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
                  existingNode.ip = this.nodeForm.ipList.join(','); // 正确设置IP字段
                  existingNode.serverIp = this.nodeForm.serverIp; // 更新服务器IP
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
        ipList: [],
        serverIp: ''
      };
      this.newIpInput = '';
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
    },
    
    // 获取节点IP列表
    getNodeIpList(ipString) {
      if (!ipString) return [];
      return ipString.split(',').map(ip => ip.trim()).filter(ip => ip);
    },

    // 验证IP地址格式
    validateIp(ip) {
      if (!ip || !ip.trim()) {
        return false;
      }
      
      const trimmedIp = ip.trim();
      
      // IPv4格式验证
      const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      
      // IPv6格式验证（支持各种压缩格式）
      const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
      
      // 检查是否为IPv4
      if (ipv4Regex.test(trimmedIp)) {
        return true;
      }
      
      // 检查是否为IPv6
      if (ipv6Regex.test(trimmedIp)) {
        return true;
      }
      
      // 检查是否为特殊域名
      if (trimmedIp === 'localhost') {
        return true;
      }
      
      // 验证域名格式（更严格的域名验证）
      // 1. 纯数字不是有效域名
      if (/^\d+$/.test(trimmedIp)) {
        return false;
      }
      
      // 2. 域名必须包含字母，且符合域名格式
      const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)+$/;
      const singleLabelDomain = /^[a-zA-Z][a-zA-Z0-9\-]{0,62}$/; // 单标签域名，必须以字母开头
      
      // 检查是否为有效域名（包含点号的多标签域名或单标签域名）
      const isDomain = domainRegex.test(trimmedIp) || singleLabelDomain.test(trimmedIp);
      
      if (isDomain) {
        return true;
      }
      
      return false;
    },
    
    // 添加IP地址
    addIp() {
      if (!this.newIpInput || !this.newIpInput.trim()) return;
      
      const ip = this.newIpInput.trim();
      
      // 检查数量限制
      if (this.nodeForm.ipList.length >= 10) {
        this.$message({
          message: '最多只能添加10个IP地址',
          type: 'warning',
          duration: 3000,
          showClose: true
        });
        return;
      }
      
      // 验证IP格式
      if (!this.validateIp(ip)) {
        this.$message({
          message: '请输入有效的IP地址或域名（支持IPv4、IPv6和域名格式）',
          type: 'error',
          duration: 3000,
          showClose: true
        });
        return;
      }
      
      // 检查是否已存在
      if (this.nodeForm.ipList.includes(ip)) {
        this.$message({
          message: '该IP地址已存在',
          type: 'warning',
          duration: 3000,
          showClose: true
        });
        return;
      }
      
      // 添加到列表
      this.nodeForm.ipList.push(ip);
      this.newIpInput = '';
      
      // 触发表单验证
      this.$nextTick(() => {
        if (this.$refs.nodeForm) {
          this.$refs.nodeForm.validateField('ipList');
        }
      });
      
    },
    
    // 移除IP地址
    removeIp(index) {
      const removedIp = this.nodeForm.ipList[index];
      this.nodeForm.ipList.splice(index, 1);
      
      // 触发表单验证
      this.$nextTick(() => {
        if (this.$refs.nodeForm) {
          this.$refs.nodeForm.validateField('ipList');
        }
      });
      
    
    },
    
    // 清空所有IP地址
    clearAllIps() {
      this.$confirm('确定要清空所有IP地址吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        const count = this.nodeForm.ipList.length;
        this.nodeForm.ipList = [];
        
        // 触发表单验证
        this.$nextTick(() => {
          if (this.$refs.nodeForm) {
            this.$refs.nodeForm.validateField('ipList');
          }
        });
        
        this.$message({
          message: `已清空 ${count} 个IP地址`,
          type: 'success',
          duration: 2000
        });
      }).catch(() => {
        // 用户取消
      });
    },
    
    // 填充示例IP
    fillExample(exampleIp) {
      if (this.nodeForm.ipList.includes(exampleIp)) {
        this.$message({
          message: '该示例IP已存在',
          type: 'warning',
          duration: 2000
        });
        return;
      }
      
      if (this.nodeForm.ipList.length >= 10) {
        this.$message({
          message: '最多只能添加10个IP地址',
          type: 'warning',
          duration: 2000
        });
        return;
      }
      
      this.newIpInput = exampleIp;
      // 自动聚焦到输入框
      this.$nextTick(() => {
        const input = this.$el.querySelector('.ip-input input');
        if (input) {
          input.focus();
        }
      });
    },
    
    // 获取IP类型图标
    getIpIcon(ip) {
      // IPv4格式验证
      const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      
      // IPv6格式验证
      const ipv6Regex = /^((([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4}|:))|(([0-9a-fA-F]{1,4}:){6}(:[0-9a-fA-F]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-fA-F]{1,4}:){5}(((:[0-9a-fA-F]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-fA-F]{1,4}:){4}(((:[0-9a-fA-F]{1,4}){1,3})|((:[0-9a-fA-F]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){3}(((:[0-9a-fA-F]{1,4}){1,4})|((:[0-9a-fA-F]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){2}(((:[0-9a-fA-F]{1,4}){1,5})|((:[0-9a-fA-F]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){1}(((:[0-9a-fA-F]{1,4}){1,6})|((:[0-9a-fA-F]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-fA-F]{1,4}){1,7})|((:[0-9a-fA-F]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/;
      
      if (ipv4Regex.test(ip)) {
        return 'el-icon-monitor'; // IPv4
      } else if (ipv6Regex.test(ip)) {
        return 'el-icon-cpu'; // IPv6
      } else {
        return 'el-icon-link'; // 域名
      }
    },
    
    // 验证单个IP地址（用于服务器IP验证）
    validateSingleIp(ip) {
      if (!ip || !ip.trim()) {
        return false;
      }
      
      const trimmedIp = ip.trim();
      
      // IPv4格式验证
      const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      
      // IPv6格式验证
      const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
      
      // 检查是否为IPv4
      if (ipv4Regex.test(trimmedIp)) {
        return true;
      }
      
      // 检查是否为IPv6
      if (ipv6Regex.test(trimmedIp)) {
        return true;
      }
      
      // 检查是否为特殊域名
      if (trimmedIp === 'localhost') {
        return true;
      }
      
      // 验证域名格式（更严格的域名验证）
      // 1. 纯数字不是有效域名
      if (/^\d+$/.test(trimmedIp)) {
        return false;
      }
      
      // 2. 域名必须包含字母，且符合域名格式
      const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)+$/;
      const singleLabelDomain = /^[a-zA-Z][a-zA-Z0-9\-]{0,62}$/; // 单标签域名，必须以字母开头
      
      // 检查是否为有效域名（包含点号的多标签域名或单标签域名）
      const isDomain = domainRegex.test(trimmedIp) || singleLabelDomain.test(trimmedIp);
      
      if (isDomain) {
        return true;
      }
      
      return false;
    },

    // 获取IP标签类型（根据IP类型设置不同颜色）
    getIpTagType(ip) {
      // IPv4格式验证
      const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      
      // IPv6格式验证
      const ipv6Regex = /^((([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4}|:))|(([0-9a-fA-F]{1,4}:){6}(:[0-9a-fA-F]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-fA-F]{1,4}:){5}(((:[0-9a-fA-F]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-fA-F]{1,4}:){4}(((:[0-9a-fA-F]{1,4}){1,3})|((:[0-9a-fA-F]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){3}(((:[0-9a-fA-F]{1,4}){1,4})|((:[0-9a-fA-F]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){2}(((:[0-9a-fA-F]{1,4}){1,5})|((:[0-9a-fA-F]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){1}(((:[0-9a-fA-F]{1,4}){1,6})|((:[0-9a-fA-F]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-fA-F]{1,4}){1,7})|((:[0-9a-fA-F]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/;
      
      if (ipv4Regex.test(ip)) {
        return 'primary'; // IPv4 - 蓝色
      } else if (ipv6Regex.test(ip)) {
        return 'success'; // IPv6 - 绿色
      } else {
        return 'warning'; // 域名 - 橙色
      }
    }
  }
};
</script>

<style scoped>
.node-container {
  padding: 20px;
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

.ip-display {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  max-width: 100%;
  overflow: hidden;
}

.ip-display-tag {
  font-family: monospace;
  font-size: 10px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ip-count-tag {
  font-size: 10px;
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
    padding: 20px;
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
    padding: 10px;
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

/* IP输入组件样式 */
.ip-input-container {
  width: 100%;
}

/* IP输入区域 */
.ip-input-section {
  margin-bottom: 16px;
}

.ip-input {
  width: 100%;
  margin-bottom: 8px;
}

.ip-input-tips {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #909399;
  margin-top: 6px;
}

.tip-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tip-item i {
  font-size: 14px;
}

.count-tip {
  color: #606266;
  font-weight: 500;
}

/* IP列表区域 */
.ip-list-section {
  background: #fafbfc;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}

.ip-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e4e7ed;
}

.list-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 6px;
}

.list-title i {
  color: #409eff;
}

.clear-all-btn {
  color: #f56c6c;
  padding: 4px 8px;
}

.clear-all-btn:hover {
  color: #f02d2d;
  background: rgba(245, 108, 108, 0.1);
}

.ip-tags-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.ip-tag-item {
  display: flex;
  align-items: center;
}

.ip-tag {
  font-family: monospace;
  font-size: 12px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
  padding: 6px 12px;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.ip-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.ip-icon {
  font-size: 14px;
  margin-right: 4px;
}

/* 空状态样式 */
.ip-empty-state {
  text-align: center;
  padding: 40px 20px;
  background: #fafbfc;
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  color: #999;
}

.ip-empty-state i {
  font-size: 48px;
  margin-bottom: 12px;
  color: #d9d9d9;
}

.ip-empty-state p {
  font-size: 14px;
  margin-bottom: 16px;
  color: #666;
}

.example-ips {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.example-label {
  font-size: 12px;
  color: #909399;
  margin-right: 4px;
}

.example-tag {
  cursor: pointer;
  transition: all 0.3s ease;
  font-family: monospace;
}

.example-tag:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 响应式样式 */
@media (max-width: 768px) {
  .ip-input-tips {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  
  .ip-list-section {
    padding: 12px;
  }
  
  .ip-list-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .clear-all-btn {
    align-self: flex-end;
  }
  
  .ip-tags-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  
  .ip-tag {
    font-size: 11px;
    padding: 5px 10px;
  }
  
  .ip-empty-state {
    padding: 30px 15px;
  }
  
  .ip-empty-state i {
    font-size: 36px;
  }
  
  .example-ips {
    flex-direction: column;
    gap: 6px;
  }
  
  .example-label {
    margin-right: 0;
    margin-bottom: 4px;
  }
}

@media (max-width: 480px) {
  .ip-input-section {
    margin-bottom: 12px;
  }
  
  .ip-list-section {
    padding: 10px;
  }
  
  .ip-tags-grid {
    gap: 4px;
  }
  
  .ip-tag {
    font-size: 10px;
    padding: 4px 8px;
  }
  
  .ip-empty-state {
    padding: 20px 10px;
  }
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