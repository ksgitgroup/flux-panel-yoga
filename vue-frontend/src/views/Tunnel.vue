<template>
  <div class="tunnel-container">
    <div class="header-bar">
      <h2 class="page-title">
        <i class="el-icon-connection"></i>
        隧道管理
      </h2>
      <el-button 
        type="primary" 
        icon="el-icon-plus" 
        @click="handleAdd"
        size="small"
      >
        新增隧道
      </el-button>
    </div>

    <!-- 隧道卡片展示 -->
    <div class="cards-container" v-loading="loading">
      <div class="cards-grid">
        <div 
          v-for="tunnel in tunnelList" 
          :key="tunnel.id" 
          class="tunnel-card"
          :class="{ 
            'disabled': tunnel.status === 0
          }"
        >
          <!-- 隧道头部 -->
          <div class="tunnel-header">
            <div class="tunnel-info">
              <h3 class="tunnel-name">{{ tunnel.name }}</h3>
              <div class="tunnel-badges">
                <el-tag v-if="tunnel.type === 1" type="primary" size="mini">端口转发</el-tag>
                <el-tag v-else type="warning" size="mini">隧道转发</el-tag>
                <el-tag v-if="tunnel.type === 2 && tunnel.protocol" 
                        :type="tunnel.protocol === 'tls' ? 'success' : tunnel.protocol === 'mtls' ? 'danger' : 'info'" 
                        size="mini">
                  {{ tunnel.protocol.toUpperCase() }}
                </el-tag>
                <el-tag v-if="tunnel.flow === 1" type="success" size="mini">单向计算</el-tag>
                <el-tag v-else type="info" size="mini">双向计算</el-tag>
                <el-tag v-if="tunnel.trafficRatio && tunnel.trafficRatio !== 1.0" type="warning" size="mini">
                  {{ tunnel.trafficRatio }}x倍率
                </el-tag>
              </div>
            </div>

            <div class="tunnel-actions">
              <el-button 
                size="small" 
                type="primary" 
                icon="el-icon-edit"
                @click="handleEdit(tunnel)"
                class="action-btn edit-btn"
              >
                编辑
              </el-button>
              <el-button 
                size="small" 
                type="warning" 
                icon="el-icon-view"
                @click="handleDiagnose(tunnel)"
                class="action-btn diagnose-btn"
              >
                诊断
              </el-button>
              <el-button 
                size="small" 
                type="danger" 
                icon="el-icon-delete"
                @click="handleDelete(tunnel)"
                class="action-btn delete-btn"
              >
                删除
              </el-button>
            </div>
          </div>

          <!-- 紧凑流程图 -->
          <div class="tunnel-flow">
            <div class="flow-section">
              <div class="flow-step">
                <div class="step-content">
                  <div class="step-title">入口</div>
                  <div class="step-details">
                    <span class="detail-text" :title="getFullIpList(tunnel.inIp)">{{ getDisplayIp(tunnel.inIp) }}</span>
                  </div>
                </div>
              </div>
              
              <i class="el-icon-right flow-arrow"></i>
              
              <div class="flow-step">
                <div class="step-content">
                  <div class="step-title">出口</div>
                  <div class="step-details">
                    <span class="detail-text" :title="getFullIpList(tunnel.outIp)">{{ getDisplayIp(tunnel.outIp) }}</span>
                  </div>
                </div>
              </div>
              
              <i class="el-icon-right flow-arrow"></i>
              
              <div class="flow-step">
                <div class="step-content">
                  <div class="step-title">目标</div>
                  <div class="step-details">
                    <span class="detail-text">目标服务</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 创建时间 -->
          <div class="tunnel-meta">
            <i class="el-icon-time"></i>
            <span>{{ tunnel.createdTime | dateFormat }}</span>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!loading && tunnelList.length === 0" class="empty-state">
        <i class="el-icon-connection"></i>
        <p>暂无隧道数据</p>
      </div>
    </div>

    <!-- 新增/编辑隧道对话框 -->
    <el-dialog 
      :title="dialogTitle" 
      :visible.sync="dialogVisible" 
      width="600px"
      @close="resetForm"
    >
      <el-form 
        :model="tunnelForm" 
        :rules="rules" 
        ref="tunnelForm" 
        label-width="100px"
      >
        <el-form-item label="隧道名称" prop="name">
          <el-input 
            v-model="tunnelForm.name" 
            placeholder="请输入隧道名称"
            clearable
          ></el-input>
        </el-form-item>

        <el-form-item label="隧道类型" prop="type">
          <el-select 
            v-model="tunnelForm.type" 
            placeholder="请选择隧道类型"
            style="width: 100%"
            @change="handleTypeChange"
            :disabled="isEdit"
          >
            <el-option :value="1" label="端口转发"></el-option>
            <el-option :value="2" label="隧道转发"></el-option>
          </el-select>
        
        </el-form-item>

        <el-form-item label="流量计算" prop="flow">
          <el-select 
            v-model="tunnelForm.flow" 
            placeholder="请选择流量计算方式"
            style="width: 100%"
          >
            <el-option :value="1" label="单向计算（仅上传）"></el-option>
            <el-option :value="2" label="双向计算（上传+下载）"></el-option>
          </el-select>
          <div class="form-hint">
            单向：仅计算上传流量；双向：计算上传和下载的总流量
          </div>
        </el-form-item>

        <el-form-item label="流量倍率" prop="trafficRatio">
          <el-input-number
            v-model="tunnelForm.trafficRatio"
            :min="0.0"
            :max="100.0"
            :step="0.1"
            :precision="1"
            placeholder="请输入流量倍率"
            style="width: 100%;"
          ></el-input-number>
          <div class="form-hint">
            流量计费倍率，设置为2.0表示按实际流量的2倍计费，范围：0.0-100.0
          </div>
        </el-form-item>

        <el-divider content-position="left">入口配置</el-divider>

        <el-form-item label="入口节点" prop="inNodeId">
          <el-select 
            v-model="tunnelForm.inNodeId" 
            placeholder="请选择入口节点"
            style="width: 100%"
            @change="handleNodeChange"
            :disabled="isEdit"
          >
            <el-option 
              v-for="node in onlineNodes" 
              :key="node.id" 
              :label="`${node.name} (${node.status === 1 ? '在线' : '离线'})`" 
              :value="node.id"
              :disabled="false"
            >
              <span style="float: left">{{ node.name }}</span>
              <span style="float: right; font-size: 13px"
                    :style="{ color: node.status === 1 ? '#67c23a' : '#f56c6c' }">
                {{ node.status === 1 ? '在线' : '离线' }}
              </span>
            </el-option>
          </el-select>
      
        </el-form-item>
        <el-form-item label="起始端口" prop="inPortSta">
          <el-input-number
              v-model="tunnelForm.inPortSta"
              :min="1"
              :max="65535"
              placeholder="起始端口"
              style="width: 100%"
          ></el-input-number>
        </el-form-item>
        <el-form-item label="结束端口" prop="inPortEnd">
          <el-input-number
              v-model="tunnelForm.inPortEnd"
              :min="1"
              :max="65535"
              placeholder="结束端口"
              style="width: 100%"
          ></el-input-number>
        </el-form-item>

        <el-form-item label="监听地址" prop="tcpListenAddr">
          <el-input 
            v-model="tunnelForm.tcpListenAddr" 
            placeholder="请输入TCP监听地址"
            clearable
          >
            <template slot="prepend">TCP</template>
          </el-input>
      
        </el-form-item>

        <el-form-item label="监听地址" prop="udpListenAddr">
          <el-input 
            v-model="tunnelForm.udpListenAddr" 
            placeholder="请输入UDP监听地址"
            clearable
          >
            <template slot="prepend">UDP</template>
          </el-input>
          <div class="form-hint">
            部分专线需要指定才能转发udp
          </div>
        </el-form-item>

        <!-- 只有隧道转发(type=2)时才显示出口配置 -->
        <template v-if="tunnelForm.type === 2">
          <el-divider content-position="left">出口配置</el-divider>

          <el-form-item label="协议类型" prop="protocol">
            <el-select 
              v-model="tunnelForm.protocol" 
              placeholder="请选择协议类型"
              style="width: 100%"
              :disabled="isEdit"
            >
              <el-option value="tls" label="TLS"></el-option>
              <el-option value="tcp" label="TCP"></el-option>
              <el-option value="mtls" label="mTLS"></el-option>
            </el-select>
            <div class="form-hint">
              数据过墙推荐选择TLS协议
            </div>
          </el-form-item>

          <el-form-item label="出口节点" prop="outNodeId">
            <el-select 
              v-model="tunnelForm.outNodeId" 
              placeholder="请选择出口节点"
              style="width: 100%"
              @change="handleNodeChange"
              :disabled="isEdit"
            >
              <el-option 
                v-for="node in onlineNodes" 
                :key="node.id" 
                :label="`${node.name} (${node.status === 1 ? '在线' : '离线'})`" 
                :value="node.id"
                :disabled="tunnelForm.inNodeId && node.id === tunnelForm.inNodeId"
              >
                <span style="float: left">{{ node.name }}</span>
                <span style="float: right; font-size: 13px"
                      :style="{ color: node.status === 1 ? '#67c23a' : '#f56c6c' }">
                  {{ node.status === 1 ? '在线' : '离线' }}
                  {{ tunnelForm.inNodeId && node.id === tunnelForm.inNodeId ? ' (已选为入口)' : '' }}
                </span>
              </el-option>
            </el-select>

          </el-form-item>
          <el-form-item label="起始端口" prop="outIpSta">
            <el-input-number
                v-model="tunnelForm.outIpSta"
                :min="1"
                :max="65535"
                placeholder="起始端口"
                style="width: 100%"
            ></el-input-number>
          </el-form-item>
          <el-form-item label="结束端口" prop="outIpEnd">
            <el-input-number
                v-model="tunnelForm.outIpEnd"
                :min="1"
                :max="65535"
                placeholder="结束端口"
                style="width: 100%"
            ></el-input-number>
          </el-form-item>
        </template>

        <el-alert
          v-if="tunnelForm.type === 1"
          title="端口转发模式：出口配置将自动使用入口配置"
          type="info"
          :closable="false"
          show-icon
          style="margin-top: 20px;">
        </el-alert>
      </el-form>
      
      <span slot="footer" class="dialog-footer">
        <el-button 
          @click="dialogVisible = false"
          class="dialog-btn cancel-btn"
        >
          取 消
        </el-button>
        <el-button 
          type="primary" 
          @click="handleSubmit"
          :loading="submitLoading"
          class="dialog-btn submit-btn"
        >
          {{ submitLoading ? (isEdit ? '更新中...' : '创建中...') : (isEdit ? '更 新' : '创 建') }}
        </el-button>
      </span>
    </el-dialog>

    <!-- 诊断结果对话框 -->
    <el-dialog 
      title="隧道诊断结果" 
      :visible.sync="diagnosisDialogVisible" 
      width="700px"
      @close="resetDiagnosisDialog"
    >
      <div v-loading="diagnosisLoading" class="diagnosis-container">
        <!-- 诊断信息头部 -->
        <div class="diagnosis-header" v-if="diagnosisResult">
          <h3 class="diagnosis-title">{{ diagnosisResult.tunnelName }}</h3>
          <div class="diagnosis-meta">
            <el-tag :type="diagnosisResult.tunnelType === '端口转发' ? 'primary' : 'warning'" size="small">
              {{ diagnosisResult.tunnelType }}
            </el-tag>
            <span class="diagnosis-time">
              {{ formatTimestamp(diagnosisResult.timestamp) }}
            </span>
          </div>
        </div>

        <!-- 诊断结果列表 -->
        <div class="diagnosis-results" v-if="diagnosisResult && diagnosisResult.results">
          <div 
            v-for="(result, index) in diagnosisResult.results" 
            :key="index"
            class="diagnosis-item"
            :class="{ 'success': result.success, 'failed': !result.success }"
          >
            <div class="diagnosis-item-header">
              <div class="diagnosis-description">
                <i :class="result.success ? 'el-icon-success' : 'el-icon-error'"></i>
                {{ result.description }}
              </div>
              <div class="diagnosis-status">
                <el-tag :type="result.success ? 'success' : 'danger'" size="mini">
                  {{ result.success ? '成功' : '失败' }}
                </el-tag>
              </div>
            </div>
            
            <div class="diagnosis-details">
              <div class="detail-row">
                <span class="detail-label">节点：</span>
                <span class="detail-value">{{ result.nodeName }} (ID: {{ result.nodeId }})</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">目标：</span>
                <span class="detail-value">{{ result.targetIp }}</span>
              </div>
              <div class="detail-row" v-if="result.success">
                <span class="detail-label">平均延迟：</span>
                <span class="detail-value">{{ result.averageTime.toFixed(2) }}ms</span>
              </div>
              <div class="detail-row" v-if="result.success">
                <span class="detail-label">丢包率：</span>
                <span class="detail-value">{{ result.packetLoss.toFixed(1) }}%</span>
              </div>
              <div class="detail-row" v-if="!result.success">
                <span class="detail-label">错误信息：</span>
                <span class="detail-value error-msg">{{ result.message }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="!diagnosisLoading && !diagnosisResult" class="diagnosis-empty">
          <i class="el-icon-warning-outline"></i>
          <p>暂无诊断数据</p>
        </div>
      </div>
      
      <span slot="footer" class="dialog-footer">
        <el-button @click="diagnosisDialogVisible = false">关 闭</el-button>
        <el-button 
          type="primary" 
          @click="handleDiagnose(currentDiagnosisTunnel)"
          :loading="diagnosisLoading"
        >
          重新诊断
        </el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { createTunnel, updateTunnel, deleteTunnel, getTunnelList, getNodeList, diagnoseTunnel } from "@/api";

export default {
  name: "Tunnel",
  data() {
    return {
      tunnelList: [],
      nodeList: [],
      loading: false,
      dialogVisible: false,
      dialogTitle: '新增隧道',
      submitLoading: false,
      isEdit: false,
      tunnelForm: {
        id: null,
        name: '',
        inNodeId: null,
        inPortSta: 1,
        inPortEnd: 65535,
        outNodeId: null,
        outIpSta: 1,
        outIpEnd: 65535,
        type: 1,
        flow: 1,  // 默认单向计算
        status: 1,  // 默认启用
        protocol: 'tls',
        tcpListenAddr: '0.0.0.0',  // TCP监听地址
        udpListenAddr: '0.0.0.0',   // UDP监听地址
        trafficRatio: 1.0  // 默认流量倍率1.0
      },
      rules: {
        name: [
          { required: true, message: '请输入隧道名称', trigger: 'blur' },
          { min: 2, message: '隧道名称长度至少2位', trigger: 'blur' },
          { max: 50, message: '隧道名称长度不能超过50位', trigger: 'blur' }
        ],
        inNodeId: [
          { required: true, message: '请选择入口节点', trigger: 'change' }
        ],
        inPortSta: [
          { required: true, message: '请输入起始端口', trigger: 'blur' }
        ],
        inPortEnd: [
          { required: true, message: '请输入结束端口', trigger: 'blur' }
        ],
        type: [
          { required: true, message: '请选择隧道类型', trigger: 'change' }
        ],
        flow: [
          { required: true, message: '请选择流量计算类型', trigger: 'change' }
        ],
        trafficRatio: [
          { required: true, message: '请输入流量倍率', trigger: 'blur' },
          { type: 'number', min: 0.0, max: 100.0, message: '流量倍率必须在0.0-100.0之间', trigger: 'blur' }
        ],
        // 隧道转发时的出口验证规则
        outNodeId: [
          { required: false, message: '请选择出口节点', trigger: 'change' }
        ],
        outIpSta: [
          { required: false, message: '请输入起始端口', trigger: 'blur' }
        ],
        outIpEnd: [
          { required: false, message: '请输入结束端口', trigger: 'blur' }
        ],
        protocol: [
          { required: false, message: '请选择协议类型', trigger: 'change' }
        ],
        tcpListenAddr: [
          { required: true, message: '请输入TCP监听地址', trigger: 'blur' },
          { 
            validator: (rule, value, callback) => {
              if (value) {
                // 验证IP地址格式（包括0.0.0.0）
                const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
                if (ipRegex.test(value)) {
                  callback();
                } else {
                  callback(new Error('请输入有效的IP地址'));
                }
              } else {
                callback();
              }
            }, 
            trigger: 'blur' 
          }
        ],
        udpListenAddr: [
          { required: true, message: '请输入UDP监听地址', trigger: 'blur' },
          { 
            validator: (rule, value, callback) => {
              if (value) {
                // 验证IP地址格式（包括0.0.0.0）
                const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
                if (ipRegex.test(value)) {
                  callback();
                } else {
                  callback(new Error('请输入有效的IP地址'));
                }
              } else {
                callback();
              }
            }, 
            trigger: 'blur' 
          }
        ]
      },
      diagnosisDialogVisible: false,
      diagnosisLoading: false,
      diagnosisResult: null,
      currentDiagnosisTunnel: null
    };
  },

  filters: {
    dateFormat(timestamp) {
      if (!timestamp) return '-';
      const date = new Date(timestamp);
      return date.toLocaleString('zh-CN');
    }
  },

  computed: {
    // 可用节点列表（显示所有节点，但在选择器中标识状态）
    onlineNodes() {
      return this.nodeList || [];
    }
  },

  mounted() {
    this.loadTunnels();
  },

  methods: {
    // 加载节点列表
    loadNodes() {
      getNodeList().then(res => {
        if (res.code === 0) {
          this.nodeList = res.data || [];
        } else {
          this.$message.error(res.msg || '加载节点列表失败');
        }
      }).catch(error => {
        this.$message.error('加载节点列表失败');
      });
    },

    // 节点选择改变时的处理
    handleNodeChange() {
      // 可以在这里添加一些节点选择后的逻辑
      // 例如：更新相关配置或验证
    },

    // 加载隧道列表
    loadTunnels() {
      this.loading = true;

      getTunnelList().then(res => {
        this.loading = false;
        if (res.code === 0) {
          this.tunnelList = res.data || [];
        } else {
          this.$message.error(res.msg || '加载隧道列表失败');
        }
      }).catch(error => {
        this.loading = false;
        this.$message.error('网络错误，请重试');
      });
    },

    // 新增隧道
    handleAdd() {
      this.dialogVisible = true;
      this.isEdit = false;
      this.dialogTitle = '新增隧道';
      this.resetForm();
      this.loadNodes(); // 打开对话框时加载节点列表
    },

    // 编辑隧道 - 只能修改名称、流量计费、流量倍率、端口范围、监听地址
    handleEdit(tunnel) {
      this.isEdit = true;
      this.dialogTitle = '编辑隧道';
      this.dialogVisible = true;
      
      // 填充表单数据（只允许修改特定字段）
      this.tunnelForm = {
        id: tunnel.id,
        name: tunnel.name,
        flow: tunnel.flow,
        trafficRatio: tunnel.trafficRatio || 1.0,
        inPortSta: tunnel.inPortSta,
        inPortEnd: tunnel.inPortEnd,
        outIpSta: tunnel.outIpSta,
        outIpEnd: tunnel.outIpEnd,
        tcpListenAddr: tunnel.tcpListenAddr || '0.0.0.0',
        udpListenAddr: tunnel.udpListenAddr || '0.0.0.0',
        // 以下字段不允许修改，但需要保留原值用于显示和提交
        type: tunnel.type,
        inNodeId: tunnel.inNodeId,
        outNodeId: tunnel.outNodeId,
        protocol: tunnel.protocol,
        status: tunnel.status
      };
      
      this.loadNodes(); // 打开对话框时加载节点列表
    },

    // 删除隧道
    handleDelete(tunnel) {
      this.$confirm(`确定要删除隧道 "${tunnel.name}" 吗？`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        deleteTunnel(tunnel.id).then(res => {
          if (res.code === 0) {
            this.$message.success('删除成功');
            this.loadTunnels();
          } else {
            this.$message.error(res.msg || '删除失败');
          }
        });
      }).catch(() => {
        // 用户取消删除
      });
    },

    // 状态切换功能已移除 - 隧道创建后不能修改状态

    // 隧道类型改变时的处理
    handleTypeChange(value) {
      if (value === 2) {
        // 隧道转发时，出口字段变为必填
        this.rules.outNodeId[0].required = true;
        this.rules.outIpSta[0].required = true;
        this.rules.outIpEnd[0].required = true;
        this.rules.protocol[0].required = true;
      } else {
        // 端口转发时，出口字段不必填
        this.rules.outNodeId[0].required = false;
        this.rules.outIpSta[0].required = false;
        this.rules.outIpEnd[0].required = false;
        this.rules.protocol[0].required = false;
        
        // 清空出口字段
        this.tunnelForm.outNodeId = null;
        this.tunnelForm.outIpSta = null;
        this.tunnelForm.outIpEnd = null;
        this.tunnelForm.protocol = 'tls'; // 重置为默认值
      }
    },

    // 提交表单
    handleSubmit() {
      this.$refs.tunnelForm.validate(valid => {
        if (valid) {
          // 端口范围验证
          if (this.tunnelForm.inPortSta > this.tunnelForm.inPortEnd) {
            this.$message.error('入口起始端口不能大于结束端口');
            return;
          }

          // 隧道转发时验证入口和出口节点不能相同
          if (this.tunnelForm.type === 2 && 
              this.tunnelForm.inNodeId === this.tunnelForm.outNodeId) {
            this.$message.error('隧道转发模式下，入口和出口不能是同一个节点');
            return;
          }

          if (this.tunnelForm.type === 2 && 
              this.tunnelForm.outIpSta && this.tunnelForm.outIpEnd &&
              this.tunnelForm.outIpSta > this.tunnelForm.outIpEnd) {
            this.$message.error('出口起始端口不能大于结束端口');
            return;
          }

          this.submitLoading = true;
          
          const data = { ...this.tunnelForm };
          
          if (this.isEdit) {
            // 编辑模式 - 只更新允许修改的字段
            const updateData = {
              id: data.id,
              name: data.name,
              flow: data.flow,
              trafficRatio: data.trafficRatio,
              inPortSta: data.inPortSta,
              inPortEnd: data.inPortEnd,
              outIpSta: data.outIpSta,
              outIpEnd: data.outIpEnd,
              tcpListenAddr: data.tcpListenAddr,
              udpListenAddr: data.udpListenAddr
            };
            
            updateTunnel(updateData).then(res => {
              this.submitLoading = false;
              if (res.code === 0) {
                this.$message.success('更新成功');
                this.dialogVisible = false;
                this.loadTunnels();
              } else {
                this.$message.error(res.msg || '更新失败');
              }
            }).catch(() => {
              this.submitLoading = false;
              this.$message.error('网络错误，请重试');
            });
          } else {
            // 创建模式
            createTunnel(data).then(res => {
              this.submitLoading = false;
              if (res.code === 0) {
                this.$message.success('创建成功');
                this.dialogVisible = false;
                this.loadTunnels();
              } else {
                this.$message.error(res.msg || '创建失败');
              }
            }).catch(() => {
              this.submitLoading = false;
              this.$message.error('网络错误，请重试');
            });
          }
        }
      });
    },

    // 重置表单
    resetForm() {
      this.isEdit = false;
      this.dialogTitle = '新增隧道';
      this.tunnelForm = {
        id: null,
        name: '',
        inNodeId: null,
        inPortSta: 1,
        inPortEnd: 65535,
        outNodeId: null,
        outIpSta: 1,
        outIpEnd: 65535,
        type: 1,
        flow: 1,  // 默认单向计算
        status: 1,  // 默认启用
        protocol: 'tls',
        tcpListenAddr: '0.0.0.0',  // TCP监听地址
        udpListenAddr: '0.0.0.0',   // UDP监听地址
        trafficRatio: 1.0  // 默认流量倍率1.0
      };
      if (this.$refs.tunnelForm) {
        this.$refs.tunnelForm.clearValidate();
      }
    },

    // 获取显示的IP（优化多IP显示）
    getDisplayIp(ipString) {
      if (!ipString) return '-';
      
      const ips = ipString.split(',').map(ip => ip.trim()).filter(ip => ip);
      
      if (ips.length === 0) return '-';
      if (ips.length === 1) return ips[0];
      
      // 多个IP时显示第一个 + 数量提示
      return `${ips[0]} 等${ips.length}个入口IP`;
    },

    // 获取完整的IP列表（用于title显示）
    getFullIpList(ipString) {
      if (!ipString) return '无IP配置';
      
      const ips = ipString.split(',').map(ip => ip.trim()).filter(ip => ip);
      
      if (ips.length === 0) return '无IP配置';
      if (ips.length === 1) return ips[0];
      
      // 多个IP时在title中显示所有IP
      return `入口IP列表 (${ips.length}个):\n${ips.join('\n')}`;
    },

    // 新增诊断功能
    handleDiagnose(tunnel) {
      this.currentDiagnosisTunnel = tunnel;
      this.diagnosisDialogVisible = true;
      this.diagnosisLoading = true;
      this.diagnosisResult = null;

      // 调用诊断API
      diagnoseTunnel(tunnel.id).then(res => {
        this.diagnosisLoading = false;
        if (res.code === 0) {
          this.diagnosisResult = res.data;
        } else {
          this.$message.error(res.msg || '诊断失败');
          this.diagnosisResult = {
            tunnelName: tunnel.name,
            tunnelType: tunnel.type === 1 ? '端口转发' : '隧道转发',
            timestamp: Date.now(),
            results: [{
              success: false,
              description: '诊断失败',
              nodeName: '-',
              nodeId: '-',
              targetIp: '-',
              message: res.msg || '诊断过程中发生错误'
            }]
          };
        }
      }).catch(error => {
        this.diagnosisLoading = false;
        this.$message.error('网络错误，请重试');
        this.diagnosisResult = {
          tunnelName: tunnel.name,
          tunnelType: tunnel.type === 1 ? '端口转发' : '隧道转发',
          timestamp: Date.now(),
          results: [{
            success: false,
            description: '网络错误',
            nodeName: '-',
            nodeId: '-',
            targetIp: '-',
            message: '无法连接到服务器'
          }]
        };
      });
    },

    // 重置诊断对话框
    resetDiagnosisDialog() {
      this.diagnosisDialogVisible = false;
      this.diagnosisResult = null;
      this.currentDiagnosisTunnel = null;
    },

    // 格式化时间戳
    formatTimestamp(timestamp) {
      if (!timestamp) return '-';
      const date = new Date(timestamp);
      return date.toLocaleString('zh-CN');
    }
  }
};
</script>

<style scoped>
.tunnel-container {
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

/* 卡片容器 */
.cards-container {
  min-height: 200px;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
  align-items: start;
}

/* 隧道卡片 */
.tunnel-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 6px 0 rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
  border-left: 3px solid #409eff;
  position: relative;
  min-height: 160px;
  display: flex;
  flex-direction: column;
}

.tunnel-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 12px 0 rgba(0, 0, 0, 0.15);
}

/* 禁用状态样式 */
.tunnel-card.disabled {
  opacity: 0.6;
  background: #f5f7fa !important;
  border-left-color: #c0c4cc !important;
}

.tunnel-card.disabled .tunnel-name {
  color: #909399 !important;
}

.tunnel-card.disabled .detail-text {
  color: #c0c4cc !important;
}

.tunnel-card.disabled .step-title {
  color: #c0c4cc !important;
}

/* 隧道头部 */
.tunnel-header {
  margin-bottom: 16px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tunnel-info {
  flex: 1;
  min-width: 0;
}

.tunnel-name {
  font-size: 17px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px 0;
  line-height: 1.3;
}

.tunnel-badges {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.tunnel-badges .el-tag {
  font-size: 11px;
  padding: 3px 8px;
  height: auto;
  line-height: 1.3;
}

/* 紧凑流程图 */
.tunnel-flow {
  margin-bottom: 16px;
  background: #fafbfc;
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #e4e7ed;
}

.flow-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 100%;
  overflow: hidden;
}

.flow-step {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  justify-content: center;
}

.flow-step:nth-child(1),
.flow-step:nth-child(3) {
  flex: 2;
}

.flow-step:nth-child(5) {
  flex: 1;
}

.step-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}

.step-icon.entrance {
  color: #409eff;
  background: rgba(64, 158, 255, 0.1);
}

.step-icon.exit {
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.1);
}

.step-icon.target {
  color: #67c23a;
  background: rgba(103, 194, 58, 0.1);
}

.step-content {
  min-width: 0;
  flex: 1;
  text-align: center;
}

.step-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 4px;
  line-height: 1.2;
}

.step-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
}

.detail-text {
  font-size: 12px;
  color: #303133;
  font-family: monospace;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: help;
  text-align: center;
  width: 100%;
}

.detail-text:hover {
  color: #409eff;
}

.flow-arrow {
  color: #c0c4cc;
  font-size: 12px;
  flex-shrink: 0;
  margin: 0 2px;
}

/* 隧道元信息 */
.tunnel-meta {
  display: flex;
  align-items: center;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid #ebeef5;
  font-size: 12px;
  color: #909399;
}

.tunnel-meta i {
  margin-right: 6px;
  font-size: 13px;
}

/* 操作按钮容器 */
.tunnel-actions {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  flex-shrink: 0;
}

/* 操作按钮样式 */
.action-btn {
  border-radius: 4px;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
  padding: 6px 12px;
  font-size: 12px;
}

.edit-btn {
  background: #409eff;
  border-color: #409eff;
}

.edit-btn:hover {
  background: #66b1ff;
  border-color: #66b1ff;
}

.delete-btn {
  background: #f56c6c;
  border-color: #f56c6c;
}

.delete-btn:hover {
  background: #f78989;
  border-color: #f78989;
}

.diagnose-btn {
  background: #e6a23c;
  border-color: #e6a23c;
}

.diagnose-btn:hover {
  background: #ebb563;
  border-color: #ebb563;
}

/* 表单提示 */
.form-hint {
  color: #909399;
  font-size: 12px;
  margin-top: 5px;
  line-height: 1.4;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #909399;
}

.empty-state i {
  font-size: 48px;
  margin-bottom: 15px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 14px;
  margin-bottom: 15px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .tunnel-container {
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

  .cards-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  
  .tunnel-card {
    padding: 12px;
    min-height: auto;
  }
  
  .tunnel-header {
    margin-bottom: 10px;
    flex-direction: row;
    align-items: flex-start;
    gap: 8px;
  }
  
  .tunnel-name {
    font-size: 15px;
    margin: 0 0 6px 0;
  }
  
  .tunnel-badges {
    justify-content: flex-start;
    gap: 4px;
  }
  
  .tunnel-badges .el-tag {
    font-size: 11px;
    padding: 3px 7px;
  }
  
  .tunnel-actions {
    justify-content: flex-start;
    gap: 6px;
  }
  
  /* 保持统一样式 */
  
  .tunnel-meta {
    padding-top: 6px;
    font-size: 11px;
  }
  
  .tunnel-meta i {
    margin-right: 4px;
    font-size: 12px;
  }
}

@media (max-width: 480px) {
  .tunnel-container {
    padding: 8px;
  }
  
  .header-bar {
    padding: 8px 12px;
    margin-bottom: 8px;
  }
  
  .page-title {
    font-size: 15px;
  }
  
  .cards-grid {
    gap: 8px;
  }
  
  .tunnel-card {
    padding: 10px;
  }
  
  .tunnel-header {
    margin-bottom: 8px;
    flex-direction: row;
    align-items: flex-start;
    gap: 6px;
  }
  
  .tunnel-name {
    font-size: 14px;
    margin: 0 0 4px 0;
  }
  
  .tunnel-badges .el-tag {
    font-size: 10px;
    padding: 2px 5px;
  }
  
  /* 移动端流程图优化 */
  .tunnel-flow {
    padding: 8px;
    margin-bottom: 8px;
  }
  
  .flow-section {
    min-width: auto;
    gap: 4px;
  }
  
  .flow-step {
    min-width: 60px;
    flex: 1;
  }
  
  .flow-step:nth-child(1),
  .flow-step:nth-child(3) {
    flex: 2;
  }
  
  .flow-step:nth-child(5) {
    flex: 1;
  }
  
  .step-title {
    font-size: 11px;
    margin-bottom: 2px;
  }
  
  .step-details {
    gap: 1px;
  }
  
  .detail-text {
    font-size: 10px;
    max-width: 80px;
    line-height: 1.2;
  }
  
  .flow-arrow {
    font-size: 11px;
    margin: 0 2px;
  }
  
  /* 移动端按钮优化 */
  .tunnel-actions {
    gap: 4px;
    flex-wrap: nowrap;
    flex-shrink: 0;
  }
  
  .action-btn {
    padding: 5px 7px;
    font-size: 10px;
    white-space: nowrap;
    min-width: 42px;
  }
  
  .tunnel-meta {
    padding-top: 4px;
    font-size: 10px;
  }
  
  .empty-state {
    padding: 20px 10px;
  }
  
  .empty-state i {
    font-size: 32px;
    margin-bottom: 10px;
  }
  
  .empty-state p {
    font-size: 13px;
    margin-bottom: 10px;
  }
}

.diagnosis-container {
  padding: 20px;
}

.diagnosis-header {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.diagnosis-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.diagnosis-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.diagnosis-time {
  font-size: 12px;
  color: #909399;
}

.diagnosis-results {
  margin-bottom: 20px;
}

.diagnosis-item {
  margin-bottom: 10px;
  padding: 10px;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 1px 6px 0 rgba(0, 0, 0, 0.1);
}

.diagnosis-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.diagnosis-description {
  display: flex;
  align-items: center;
  gap: 10px;
}

.diagnosis-description i {
  font-size: 18px;
  color: #606266;
}

.diagnosis-status {
  display: flex;
  align-items: center;
}

.diagnosis-details {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-label {
  font-size: 12px;
  font-weight: 600;
  color: #606266;
}

.detail-value {
  font-size: 12px;
  color: #909399;
}

.diagnosis-empty {
  text-align: center;
  padding: 40px 20px;
  color: #909399;
}

.diagnosis-empty i {
  font-size: 48px;
  margin-bottom: 15px;
  opacity: 0.5;
}

.diagnosis-empty p {
  font-size: 14px;
  margin-bottom: 15px;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-btn {
  border-radius: 4px;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
  padding: 6px 12px;
  font-size: 12px;
}

.cancel-btn {
  background: #f56c6c;
  border-color: #f56c6c;
}

.cancel-btn:hover {
  background: #f78989;
  border-color: #f78989;
}

.submit-btn {
  background: #409eff;
  border-color: #409eff;
}

.submit-btn:hover {
  background: #66b1ff;
  border-color: #66b1ff;
}
</style>