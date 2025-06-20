<template>
  <div class="tunnel-container">
    <el-button 
          type="primary" 
          icon="el-icon-plus" 
          @click="handleAdd"
          class="add-btn"
          size="medium"
        >
          新增隧道
        </el-button>

    <!-- 隧道卡片展示 -->
    <div class="cards-container" v-loading="loading" style="margin-top: 20px;">
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
                type="danger" 
                icon="el-icon-delete"
                @click="handleDelete(tunnel)"
                class="action-btn delete-btn"
              >
                删除
              </el-button>
            </div>
          </div>

          <!-- 流程图 -->
          <div class="tunnel-flow">
            <!-- 客户端 -->
            <div class="flow-item client">
              <div class="flow-icon">
                <i class="el-icon-monitor"></i>
              </div>
              <div class="flow-content">
                <div class="flow-label">客户端</div>
              </div>
            </div>

            <!-- 箭头 -->
            <div class="flow-arrow">
              <i class="el-icon-right"></i>
            </div>

            <!-- 入口 -->
            <div class="flow-item entrance">
              <div class="flow-icon">
                <i class="el-icon-upload"></i>
              </div>
              <div class="flow-content">
                <div class="flow-label">入口</div>
                <div class="flow-detail">
                  <div class="detail-item">
                    <span class="label">IP:</span>
                    <span class="value" :title="tunnel.inIp">{{ tunnel.inIp }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="label">端口:</span>
                    <span class="value">{{ tunnel.inPortSta === tunnel.inPortEnd ? tunnel.inPortSta : `${tunnel.inPortSta}-${tunnel.inPortEnd}` }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 箭头 -->
            <div class="flow-arrow">
              <i class="el-icon-right"></i>
            </div>

            <!-- 出口 -->
            <div class="flow-item exit">
              <div class="flow-icon">
                <i class="el-icon-download"></i>
              </div>
              <div class="flow-content">
                <div class="flow-label" >出口</div>
                <div class="flow-detail">
                  
                  <div class="detail-item">
                    <span class="label">IP:</span>
                    <span class="value" :title="tunnel.outIp">{{ tunnel.outIp }}</span>
                  </div>

                  <div class="detail-item">
                    <span class="label">端口:</span>
                    <span class="value">{{ tunnel.outIpSta === tunnel.outIpEnd ? tunnel.outIpSta : `${tunnel.outIpSta}-${tunnel.outIpEnd}` }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 箭头 -->
            <div class="flow-arrow">
              <i class="el-icon-right"></i>
            </div>

            <!-- 目标 -->
            <div class="flow-item target">
              <div class="flow-icon">
                <i class="el-icon-position"></i>
              </div>
              <div class="flow-content">
                <div class="flow-label">目标</div>
                <div class="flow-detail">
                  <div class="detail-item">
                    <span class="label">目标服务</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 创建时间 -->
          <div class="tunnel-meta">
            <div class="meta-item">
              <i class="el-icon-time"></i>
              <span>{{ tunnel.createdTime | dateFormat }}</span>
            </div>
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
          </div>
</template>

<script>
import { createTunnel, updateTunnel, deleteTunnel, getTunnelList, getNodeList } from "@/api";

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
        protocol: 'tls'
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
        ]
      }
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

    // 编辑隧道 - 只能修改名称、流量计费、端口范围
    handleEdit(tunnel) {
      this.isEdit = true;
      this.dialogTitle = '编辑隧道';
      this.dialogVisible = true;
      
      // 填充表单数据（只允许修改特定字段）
      this.tunnelForm = {
        id: tunnel.id,
        name: tunnel.name,
        flow: tunnel.flow,
        inPortSta: tunnel.inPortSta,
        inPortEnd: tunnel.inPortEnd,
        outIpSta: tunnel.outIpSta,
        outIpEnd: tunnel.outIpEnd,
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
              inPortSta: data.inPortSta,
              inPortEnd: data.inPortEnd,
              outIpSta: data.outIpSta,
              outIpEnd: data.outIpEnd
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
        protocol: 'tls'
      };
      if (this.$refs.tunnelForm) {
        this.$refs.tunnelForm.clearValidate();
      }
    }
  }
};
</script>

<style scoped>
.tunnel-container {
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
  grid-template-columns: repeat(auto-fit, minmax(600px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
  align-items: start;
}

/* 隧道卡片 */
.tunnel-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  border-left: 4px solid #409eff;
  position: relative;
  height: auto;
  min-height: 320px;
  display: flex;
  flex-direction: column;
}

.tunnel-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px 0 rgba(0, 0, 0, 0.15);
}

/* 禁用状态样式 */
.tunnel-card.disabled {
  opacity: 0.6;
  background: #f5f7fa !important;
  border-left-color: #c0c4cc !important;
}

.tunnel-card.disabled .flow-icon {
  background: #c0c4cc !important;
}

.tunnel-card.disabled .tunnel-name {
  color: #909399 !important;
}

.tunnel-card.disabled .detail-item .value {
  color: #c0c4cc !important;
}

.tunnel-card.disabled .flow-label {
  color: #c0c4cc !important;
}

.tunnel-card.disabled::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(192, 196, 204, 0.1);
  pointer-events: none;
  border-radius: 12px;
}

/* 隧道头部 */
.tunnel-header {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tunnel-name {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin: 0;
  flex: 1;
}

.tunnel-badges {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* 流程图 */
.tunnel-flow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  overflow-x: auto;
}

.flow-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 100px;
  flex-shrink: 0;
}

.flow-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  font-size: 18px;
  color: white;
}

.client .flow-icon {
  background: #909399;
}

.entrance .flow-icon {
  background: #409eff;
}

.exit .flow-icon {
  background: #f56c6c;
}

.target .flow-icon {
  background: #67c23a;
}

.flow-label {
  font-size: 14px;
  font-weight: 500;
  color: #606266;
  margin-bottom: 8px;
  text-align: center;
}

.flow-detail {
  text-align: center;
}

.detail-item {
  font-size: 12px;
  color: #909399;
  margin-bottom: 2px;
}

.detail-item .label {
  font-weight: 500;
}

.detail-item .value {
  color: #303133;
  font-family: monospace;
}

.flow-arrow {
  color: #c0c4cc;
  font-size: 16px;
  margin: 0 10px;
}

/* 隧道元信息 */
.tunnel-meta {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  font-size: 12px;
  color: #909399;
}

.meta-item {
  display: flex;
  align-items: center;
  margin-right: 20px;
}

.meta-item i {
  margin-right: 5px;
}

/* 隧道信息容器 */
.tunnel-info {
  flex: 1;
  margin-right: 15px;
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
  border-radius: 6px;
  font-weight: 500;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.edit-btn {
  background: #409eff;
  border-color: #409eff;
}

.edit-btn:hover {
  background: #66b1ff;
  border-color: #66b1ff;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
}

.delete-btn {
  background: #f56c6c;
  border-color: #f56c6c;
}

.delete-btn:hover {
  background: #f78989;
  border-color: #f78989;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(245, 108, 108, 0.3);
}

/* 新增按钮样式 */
.add-btn {
  border-radius: 8px;
  padding: 12px 24px;
  font-weight: 600;
  font-size: 14px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 12px rgba(64, 158, 255, 0.3);
}

.add-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.4);
}

/* 对话框按钮样式 */
.dialog-footer {
  padding-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.dialog-btn {
  padding: 10px 20px;
  border-radius: 6px;
  font-weight: 500;
  min-width: 80px;
  transition: all 0.3s ease;
}

.cancel-btn {
  background: #f5f7fa;
  border-color: #dcdfe6;
  color: #606266;
}

.cancel-btn:hover {
  background: #ecf5ff;
  border-color: #b3d8ff;
  color: #409eff;
}

.submit-btn {
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
}

.submit-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.4);
}

/* 表单提示 */
.form-hint {
  color: #909399;
  font-size: 12px;
  margin-top: 5px;
  line-height: 1.4;
}

/* 只读字段提示样式 */
.form-readonly-hint {
  color: #f56c6c;
  font-weight: 500;
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

/* 中等屏幕优化 (768px - 1024px) */
@media (max-width: 1024px) {
  .cards-grid {
    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  }
}

/* 平板优化 (480px - 768px) */
@media (max-width: 768px) {
  .tunnel-container {
    padding: 15px;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: 15px;
    padding: 20px;
    margin-bottom: 20px;
  }
  
  .page-title {
    font-size: 22px;
    text-align: center;
  }
  
  .header-actions {
    justify-content: center;
  }

  .cards-grid {
    grid-template-columns: 1fr;
    gap: 15px;
  }
  
  .tunnel-card {
    padding: 20px;
    min-height: auto;
    border-radius: 10px;
  }
  
  .tunnel-header {
    margin-bottom: 15px;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .tunnel-info {
    margin-right: 0;
    margin-bottom: 10px;
  }
  
  .tunnel-name {
    font-size: 17px;
    margin: 0 0 8px 0;
  }
  
  .tunnel-badges {
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 6px;
  }
  
  .tunnel-actions {
    justify-content: flex-start;
    gap: 8px;
  }
  
  .action-btn {
    flex: 1;
    max-width: 80px;
    padding: 8px 12px;
    font-size: 12px;
  }
  
  /* 平板端流程图优化 */
  .tunnel-flow {
    padding: 18px 15px;
    margin-bottom: 18px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  
  .flow-item {
    min-width: 90px;
    flex-shrink: 0;
  }
  
  .flow-icon {
    width: 36px;
    height: 36px;
    font-size: 16px;
    margin-bottom: 6px;
  }
  
  .flow-label {
    font-size: 13px;
    margin-bottom: 6px;
  }
  
     .detail-item {
     font-size: 11px;
     margin-bottom: 2px;
     line-height: 1.3;
   }
   
   .detail-item .value {
     font-size: 12px;
     display: inline-block;
     max-width: 140px;
     overflow: hidden;
     text-overflow: ellipsis;
     white-space: nowrap;
     vertical-align: top;
   }
  
  .flow-arrow {
    font-size: 14px;
    margin: 0 8px;
  }
  
  .tunnel-meta {
    margin-bottom: 12px;
    font-size: 11px;
    justify-content: center;
  }
}

/* 手机端优化 (最大 480px) */
@media (max-width: 480px) {
  .tunnel-container {
    padding: 10px;
  }
  
  .page-header {
    padding: 15px;
    margin-bottom: 15px;
    border-radius: 6px;
  }
  
  .page-title {
    font-size: 18px;
  }
  
  .header-actions {
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }
  
  .header-actions .el-button {
    width: 100%;
    justify-content: center;
  }
  
  /* 对话框按钮移动端优化 */
  .dialog-footer {
    padding-top: 15px;
    flex-direction: row;
    justify-content: space-between;
    gap: 12px;
  }
  
  .dialog-btn {
    flex: 1;
    padding: 12px 16px;
    font-size: 14px;
    min-width: 0;
  }
  
  /* 表单输入框移动端优化 */
  .el-input-number {
    width: 100% !important;
  }
  
  .el-input-number .el-input__inner {
    padding-left: 50px;
    padding-right: 50px;
    text-align: center;
  }
  
  /* 对话框移动端优化 */
  .el-dialog {
    width: 95% !important;
    margin: 5vh auto !important;
  }
  
  .el-dialog__body {
    padding: 20px 15px;
  }
  
  .el-form-item__label {
    font-size: 14px;
    line-height: 1.4;
  }
  
  .el-form-item {
    margin-bottom: 18px;
  }
  
  .el-input, .el-select {
    font-size: 14px;
  }
  
  .el-button {
    font-size: 14px;
  }
  
  .tunnel-card {
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 10px;
  }
  
  .tunnel-header {
    margin-bottom: 12px;
    gap: 10px;
  }
  
  .tunnel-name {
    font-size: 16px;
  }
  
  .tunnel-badges {
    gap: 4px;
  }
  
  .tunnel-badges .el-tag {
    font-size: 10px;
    padding: 2px 6px;
    height: auto;
    line-height: 1.3;
    border-radius: 3px;
  }
  
  /* 手机端流程图 - 垂直布局 */
  .tunnel-flow {
    padding: 12px 8px;
    margin-bottom: 12px;
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
  }
  
  .flow-item {
    min-width: auto;
    width: 100%;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    padding: 8px 12px;
    background: white;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .flow-icon {
    width: 32px;
    height: 32px;
    font-size: 14px;
    margin-bottom: 0;
    margin-right: 10px;
    flex-shrink: 0;
  }
  
  .flow-content {
    flex: 1;
    text-align: left;
  }
  
     .flow-label {
     font-size: 12px;
     font-weight: 600;
     margin-bottom: 4px;
     color: #303133;
     text-align: left;
   }
  
  .flow-detail {
    text-align: left;
  }
  
     .detail-item {
     display: block;
     font-size: 10px;
     margin-bottom: 3px;
     line-height: 1.4;
   }
   
   .detail-item .label {
     display: inline;
     margin-right: 4px;
     color: #666;
   }
   
   .detail-item .value {
     font-size: 11px;
     font-weight: 500;
     color: #409eff;
     display: inline-block;
     max-width: 120px;
     overflow: hidden;
     text-overflow: ellipsis;
     white-space: nowrap;
     vertical-align: top;
     cursor: help;
     border-bottom: 1px dotted transparent;
     transition: border-color 0.2s;
   }
   
   .detail-item .value:hover {
     border-bottom-color: #409eff;
   }
  
  .flow-arrow {
    display: none; /* 垂直布局时隐藏箭头 */
  }
  
  /* 手机端按钮优化 */
  .tunnel-actions {
    margin-top: 8px;
    gap: 6px;
  }
  
  .action-btn {
    flex: 1;
    max-width: 70px;
    padding: 6px 10px;
    font-size: 11px;
    border-radius: 4px;
  }
  
  .action-btn i {
    margin-right: 2px;
  }
  
  .tunnel-meta {
    margin-bottom: 8px;
    font-size: 10px;
    justify-content: flex-start;
  }
  
  .meta-item {
    margin-right: 15px;
  }
  
  .meta-item i {
    margin-right: 3px;
  }
  
  /* 空状态手机端优化 */
  .empty-state {
    padding: 30px 15px;
  }
  
  .empty-state i {
    font-size: 40px;
    margin-bottom: 12px;
  }
  
  .empty-state p {
    font-size: 14px;
    margin-bottom: 12px;
  }
}

/* 超小屏幕优化 (最大 360px) */
@media (max-width: 360px) {
  .tunnel-container {
    padding: 8px;
  }
  
  .page-header {
    padding: 12px;
  }
  
  /* 超小屏幕对话框优化 */
  .dialog-footer {
    flex-direction: column;
    gap: 8px;
  }
  
  .dialog-btn {
    width: 100%;
    flex: none;
  }
  
  .tunnel-card {
    padding: 12px;
  }
  
  .tunnel-name {
    font-size: 15px;
  }
  
  .tunnel-badges .el-tag {
    font-size: 9px;
    padding: 1px 4px;
  }
  
  .flow-item {
    padding: 6px 10px;
  }
  
  .flow-icon {
    width: 28px;
    height: 28px;
    font-size: 12px;
    margin-right: 8px;
  }
  
  .flow-label {
    font-size: 11px;
    margin-bottom: 2px;
  }
  
     .detail-item {
     font-size: 9px;
     margin-bottom: 2px;
     line-height: 1.3;
   }
   
   .detail-item .value {
     font-size: 10px;
     display: inline-block;
     max-width: 100px;
     overflow: hidden;
     text-overflow: ellipsis;
     white-space: nowrap;
     vertical-align: top;
   }
}

/* 横屏模式优化 */
@media (max-width: 768px) and (orientation: landscape) {
  .tunnel-flow {
    flex-direction: row;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding: 12px;
  }
  
  .flow-item {
    flex-direction: column;
    min-width: 80px;
    width: auto;
    padding: 8px;
    margin-right: 8px;
  }
  
  .flow-icon {
    margin-right: 0;
    margin-bottom: 4px;
  }
  
  .flow-content {
    text-align: center;
  }
  
  .flow-detail {
    text-align: center;
  }
  
  .flow-arrow {
    display: flex;
    margin: 0 4px;
  }
}
</style>