<template>
  <div class="node-container">
    <div class="header-bar">
      <h2 class="page-title">
        <i class="el-icon-cpu"></i>
        节点管理
      </h2>
      <el-button
        type="primary" 
        size="small"
        icon="el-icon-plus" 
        @click="handleAdd"
      >
        新增节点
      </el-button>
    </div>

    <!-- 节点卡片网格 -->
    <div class="node-grid" v-loading="loading">
      <div 
        v-for="node in nodeList" 
        :key="node.id" 
        class="node-card"
        :class="{ 'online': node.connectionStatus === 'online', 'offline': node.connectionStatus !== 'online' }"
      >
        <!-- 节点头部 -->
        <div class="node-header">
          <div class="node-title">
            <div 
              class="status-dot"
              :class="{ 'online': node.connectionStatus === 'online', 'offline': node.connectionStatus !== 'online' }"
            ></div>
            <span class="node-name">{{ node.name }}</span>
          </div>
          
          <div class="server-info" v-if="node.serverIp">
            <i class="el-icon-position"></i>
            <span>{{ node.serverIp }}</span>
          </div>
          
          <div class="version-info">
            <i class="el-icon-document"></i>
            <span>版本: {{ node.version || '未知' }}</span>
          </div>
        </div>

        <!-- 监控指标网格 -->
        <div class="metrics-grid">
          <!-- CPU -->
          <div class="metric-item">
            <div class="metric-header">
              <span class="metric-label">CPU</span>
              <span class="metric-value">
                {{ node.connectionStatus === 'online' ? (node.systemInfo?.cpuUsage || 0).toFixed(2) + '%' : '-' }}
              </span>
            </div>
            <div class="metric-progress">
              <div 
                class="progress-fill" 
                :class="{ 'offline': node.connectionStatus !== 'online' }"
                :style="{ 
                  width: node.connectionStatus === 'online' ? (node.systemInfo?.cpuUsage || 0) + '%' : '0%',
                  backgroundColor: getProgressColor(node.connectionStatus === 'online' ? (node.systemInfo?.cpuUsage || 0) : 0, node.connectionStatus !== 'online')
                }"
              ></div>
            </div>
          </div>

          <!-- 内存 -->
          <div class="metric-item">
            <div class="metric-header">
              <span class="metric-label">内存</span>
              <span class="metric-value">
                {{ node.connectionStatus === 'online' ? (node.systemInfo?.memoryUsage || 0).toFixed(2) + '%' : '-' }}
              </span>
            </div>
            <div class="metric-progress">
              <div 
                class="progress-fill" 
                :class="{ 'offline': node.connectionStatus !== 'online' }"
                :style="{ 
                  width: node.connectionStatus === 'online' ? (node.systemInfo?.memoryUsage || 0) + '%' : '0%',
                  backgroundColor: getProgressColor(node.connectionStatus === 'online' ? (node.systemInfo?.memoryUsage || 0) : 0, node.connectionStatus !== 'online')
                }"
              ></div>
            </div>
          </div>

          <!-- 上传 -->
          <div class="metric-item">
            <div class="metric-header">
              <span class="metric-label">上传</span>
              <span class="metric-value">
                {{ node.connectionStatus === 'online' ? formatSpeed(node.systemInfo?.uploadSpeed || 0) : '-' }}
              </span>
            </div>
            <div class="metric-footer">
              {{ node.connectionStatus === 'online' ? formatBytes(node.systemInfo?.uploadTraffic || 0) : '-' }}
            </div>
          </div>

          <!-- 下载 -->
          <div class="metric-item">
            <div class="metric-header">
              <span class="metric-label">下载</span>
              <span class="metric-value">
                {{ node.connectionStatus === 'online' ? formatSpeed(node.systemInfo?.downloadSpeed || 0) : '-' }}
              </span>
            </div>
            <div class="metric-footer">
              {{ node.connectionStatus === 'online' ? formatBytes(node.systemInfo?.downloadTraffic || 0) : '-' }}
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="card-actions">
          <el-button
            size="mini"
            type="success"
            icon="el-icon-copy-document"
            @click="handleCopyInstallCommand(node)"
            :loading="node.copyLoading"
            plain
          >
            复制
          </el-button>

          <el-button
            size="mini"
            type="primary"
            icon="el-icon-edit"
            @click="handleEdit(node)"
            plain
          >
            编辑
          </el-button>

          <el-button
            size="mini"
            type="danger"
            icon="el-icon-delete"
            @click="handleDelete(node)"
            plain
          >
            删除
          </el-button>
        </div>
      </div>

      <!-- 空状态 -->
      <EmptyState 
        v-if="!loading && nodeList.length === 0" 
        description="暂无节点数据"
      />
    </div>

    <!-- 对话框保持不变 -->
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
        
        <el-form-item label="入口IP" prop="ipString">
          <el-input 
            v-model="nodeForm.ipString" 
            type="textarea"
            :rows="4"
            placeholder="一行一个IP地址或域名"
            clearable
          >
          </el-input>
          <div class="form-hint">
            格式: IPv4、IPv6地址或域名<br>
            支持多个IP，每行一个地址，例如：<br>
            192.168.1.100<br>
            2001:db8::1<br>
            example.com
          </div>
        </el-form-item>

        <el-divider content-position="left">端口配置</el-divider>

        <el-form-item label="起始端口" prop="portSta">
          <el-input-number
            v-model="nodeForm.portSta"
            :min="1"
            :max="65535"
            placeholder="起始端口"
            style="width: 100%"
            @change="handlePortStartChange"
          ></el-input-number>
        </el-form-item>

        <el-form-item label="结束端口" prop="portEnd">
          <el-input-number
            v-model="nodeForm.portEnd"
            :min="1"
            :max="65535"
            placeholder="结束端口"
            style="width: 100%"
            @change="handlePortEndChange"
          ></el-input-number>
        </el-form-item>
   
        <el-alert
          title="服务器ip是用于隧道转发时，入口服务器将数据转发到此服务器"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 20px;">
        </el-alert>
        <el-alert
          title="入口ip是用于展示在转发卡片中的地址，可以支持多个，比如有些专线是三线入口，这里可以填三个ip，或者手搓的BGP域名。不知道怎么填就填服务器ip"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 20px;">
        </el-alert>
        <el-alert
          title="端口范围设定该节点可使用的端口区间，用于隧道和转发时的端口分配"
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
import EmptyState from "@/components/EmptyState.vue";
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
    VChart,
    EmptyState
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
        ipString: '',
        serverIp: '',
        portSta: 1000,
        portEnd: 65535
      },
      rules: {
        name: [
          { required: true, message: '请输入节点名称', trigger: 'blur' },
          { min: 2, message: '节点名称长度至少2位', trigger: 'blur' },
          { max: 50, message: '节点名称长度不能超过50位', trigger: 'blur' }
        ],
        ipString: [
          { required: true, message: '请输入入口IP地址', trigger: 'blur' },
          { 
            validator: (rule, value, callback) => {
              if (value) {
                // 按行分割IP地址
                const ips = value.split('\n').map(ip => ip.trim()).filter(ip => ip);
                
                if (ips.length === 0) {
                  callback(new Error('请输入至少一个有效IP地址'));
                  return;
                }
                
                // 验证每个IP地址
                for (let i = 0; i < ips.length; i++) {
                  const ip = ips[i];
                  if (!this.validateIp(ip)) {
                    callback(new Error(`第${i + 1}行IP地址格式错误: ${ip}\n请使用正确格式，如: 192.168.1.100 或 2001:db8::1 或 example.com`));
                    return;
                  }
                }
                
                callback();
              } else {
                callback();
              }
            }, 
            trigger: 'blur' 
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
        ],
        portSta: [
          { required: true, message: '请输入起始端口', trigger: 'blur' },
          { type: 'number', min: 1, max: 65535, message: '端口范围必须在1-65535之间', trigger: 'blur' }
        ],
        portEnd: [
          { required: true, message: '请输入结束端口', trigger: 'blur' },
          { type: 'number', min: 1, max: 65535, message: '端口范围必须在1-65535之间', trigger: 'blur' },
          { 
            validator: (rule, value, callback) => {
              if (value && this.nodeForm.portSta && value < this.nodeForm.portSta) {
                callback(new Error('结束端口不能小于起始端口'));
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
        ipString: node.ip ? (typeof node.ip === 'string' ? node.ip.split(',').map(ip => ip.trim()).join('\n') : '') : '',
        serverIp: node.serverIp || '',
        portSta: node.portSta,
        portEnd: node.portEnd
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
          const ipString = this.nodeForm.ipString
            .split('\n')
            .map(ip => ip.trim())
            .filter(ip => ip)
            .join(',');
            
          const submitData = {
            ...this.nodeForm,
            ip: ipString // 将多行IP字符串转换为逗号分隔的字符串
          };
          delete submitData.ipString; // 移除ipString字段
          const data = this.isEdit ? submitData : { 
            name: this.nodeForm.name, 
            ip: ipString,
            serverIp: this.nodeForm.serverIp,
            portSta: this.nodeForm.portSta,
            portEnd: this.nodeForm.portEnd
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
                  existingNode.ip = ipString; // 正确设置IP字段
                  existingNode.serverIp = this.nodeForm.serverIp; // 更新服务器IP
                  existingNode.portSta = this.nodeForm.portSta; // 更新起始端口
                  existingNode.portEnd = this.nodeForm.portEnd; // 更新结束端口
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
        ipString: '',
        serverIp: '',
        portSta: 1000,
        portEnd: 65535
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

    // 获取进度条颜色
    getProgressColor(value, offline = false) {
      if (offline) {
        return '#d4d4d4';
      }
      
      if (value <= 50) {
        return '#67c23a'; // 绿色 - 正常
      } else if (value <= 80) {
        return '#e6a23c'; // 橙色 - 警告
      } else {
        return '#f56c6c'; // 红色 - 危险
      }
    },
    
    // 端口起始值变化处理
    handlePortStartChange() {
      this.$nextTick(() => {
        if (this.$refs.nodeForm) {
          this.$refs.nodeForm.validateField('portEnd');
        }
      });
    },

    // 端口结束值变化处理
    handlePortEndChange() {
      this.$nextTick(() => {
        if (this.$refs.nodeForm) {
          this.$refs.nodeForm.validateField('portEnd');
        }
      });
    },


  }
};
</script>

<style scoped>
.node-container {
  padding: 15px;
}

/* 页面头部 */
.header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  background: white;
  padding: 12px 20px;
  border-radius: 6px;
  box-shadow: 0 1px 4px 0 rgba(0, 0, 0, 0.1);
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin: 0;
  display: flex;
  align-items: center;
}

.page-title i {
  margin-right: 6px;
  color: #409eff;
}

/* 节点网格 */
.node-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  min-height: 200px;
}

/* 节点卡片 */
.node-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  border-top: 4px solid #ddd;
}

.node-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.15);
}

.node-card.online {
  border-top-color: #67c23a;
}

.node-card.offline {
  border-top-color: #f56c6c;
}

/* 节点头部 */
.node-header {
  margin-bottom: 16px;
}

.node-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse 2s infinite;
  flex-shrink: 0;
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

.node-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.server-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #909399;
}

.server-info i {
  color: #409eff;
  font-size: 12px;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.version-info i {
  color: #67c23a;
  font-size: 12px;
}

/* 指标网格 */
.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.metric-item {
  background: #fafbfc;
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #e4e7ed;
}

.metric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.metric-label {
  font-size: 12px;
  color: #606266;
  font-weight: 500;
}

.metric-value {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  font-family: monospace;
}

.metric-progress {
  width: 100%;
  height: 4px;
  background-color: #e4e7ed;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: all 0.3s ease;
  min-width: 2px;
}

.progress-fill.offline {
  background-color: #d4d4d4 !important;
}

.metric-footer {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
  font-family: monospace;
}

/* 卡片操作 */
.card-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  border-top: 1px solid #ebeef5;
  padding-top: 12px;
}

/* 空状态使用统一组件，样式已内置 */

/* 响应式设计 */
@media (max-width: 768px) {
  .node-container {
    padding: 10px;
  }

  .header-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 10px 15px;
    margin-bottom: 10px;
  }

  .page-title {
    font-size: 16px;
    text-align: center;
  }

  .node-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .node-card {
    padding: 12px;
  }

  .node-header {
    margin-bottom: 12px;
  }

  .node-name {
    font-size: 14px;
  }

  .metrics-grid {
    gap: 8px;
    margin-bottom: 12px;
  }

  .metric-item {
    padding: 8px;
  }

  .card-actions {
    flex-wrap: wrap;
    gap: 6px;
    padding-top: 10px;
  }

  .card-actions .el-button {
    flex: 1;
    min-width: 80px;
  }
}



@media (max-width: 480px) {
  .node-container {
    padding: 8px;
  }

  .header-bar {
    padding: 8px 12px;
    margin-bottom: 8px;
  }

  .page-title {
    font-size: 14px;
  }

  .node-grid {
    gap: 8px;
  }

  .node-card {
    padding: 10px;
  }

  .node-header {
    margin-bottom: 10px;
  }

  .node-name {
    font-size: 13px;
  }

  .server-info {
    font-size: 11px;
  }

  .version-info {
    font-size: 11px;
  }

  .metrics-grid {
    gap: 6px;
    margin-bottom: 10px;
  }

  .metric-item {
    padding: 6px;
  }

  .metric-label {
    font-size: 11px;
  }

  .metric-value {
    font-size: 12px;
  }

  .metric-footer {
    font-size: 10px;
  }

  .card-actions {
    gap: 4px;
    padding-top: 8px;
  }

  .card-actions .el-button {
    font-size: 11px;
    padding: 4px 8px;
    min-width: 60px;
  }

  .empty-state {
    padding: 30px 15px;
  }

  .empty-state i {
    font-size: 36px;
  }

  .empty-state p {
    font-size: 12px;
  }
}



/* 表单提示样式 */
.form-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
  line-height: 1.4;
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