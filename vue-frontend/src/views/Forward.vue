<template>
  <div class="forward-container">
    <!-- 页面头部 -->
    <div class="header-bar">
      <h2 class="page-title">
        <i class="el-icon-connection"></i>
        转发管理
      </h2>
      <el-button
        type="primary" 
        size="small"
        icon="el-icon-plus" 
        @click="handleAdd"
      >
        新增转发
      </el-button>
    </div>

    <!-- 转发列表 -->
    <div class="table-container">
      <div v-loading="loading" class="cards-container">
        <!-- 空状态 -->
        <div v-if="forwardList.length === 0 && !loading" class="empty-state" style="margin-top: 10px;">
          <el-empty description="暂无转发配置"></el-empty>
        </div>
        
        <div 
          v-for="forward in forwardList" 
          :key="forward.id" 
          class="forward-card"
        >
          <div class="card-header">
            <div class="card-title">
              <i class="el-icon-connection"></i>
              <span class="title-text">{{ forward.name }}</span>
            </div>
            <div class="card-actions">
              <!-- 服务开关 -->
              <el-switch
                v-model="forward.serviceRunning"
                :loading="forward.switchLoading"
                :disabled="forward.status !== 1 && forward.status !== 0"
                active-color="#13ce66"
                inactive-color="#ff4949"
                @change="handleServiceToggle(forward)"
                style="margin-right: 10px;"
              ></el-switch>
              
              <el-button 
                size="mini" 
                type="primary" 
                icon="el-icon-edit"
                @click="handleEdit(forward)"
                circle
              ></el-button>
              <el-button 
                size="mini" 
                type="danger" 
                icon="el-icon-delete"
                @click="handleDelete(forward)"
                :loading="forward.deleteLoading"
                circle
              ></el-button>
            </div>
          </div>
          
          <div class="card-body">
            <div class="info-row inline-on-mobile">
              <div class="info-item">
                <span class="label">隧道名称:</span>
                <span class="value">{{ forward.tunnelName || '未知隧道' }}</span>
              </div>
              <div class="info-item">
                <span class="label">状态:</span>
                <el-tag 
                  :type="getStatusType(forward.status)"
                  size="small"
                >
                  {{ getStatusText(forward.status) }}
                </el-tag>
              </div>
            </div>
            
            <div class="info-row">
              <div class="info-item full-width">
                <div class="address-item">
                  <div class="label-with-copy">
                    <span class="label">入口地址:</span>
                    <el-button 
                      size="mini" 
                      type="text" 
                      icon="el-icon-copy-document"
                      @click="copyToClipboard(getCopyInAddress(forward.inIp, forward.inPort), '入口地址')"
                      class="copy-btn"
                      title="复制入口地址"
                    ></el-button>
                  </div>
                  <div class="address-value">
                    <span 
                      class="value address-text" 
                      @click="showAddressDialog(forward.inIp, forward.inPort, '入口地址')"
                      :class="{ 'clickable': hasMultipleIps(forward.inIp) }"
                    >
                      {{ formatInAddress(forward.inIp, forward.inPort) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="info-row">
              <div class="info-item full-width">
                <div class="address-item">
                  <div class="label-with-copy">
                    <span class="label">目标地址:</span>
                    <el-button 
                      size="mini" 
                      type="text" 
                      icon="el-icon-copy-document"
                      @click="copyToClipboard(forward.remoteAddr, '目标地址')"
                      class="copy-btn"
                      title="复制目标地址"
                    ></el-button>
                  </div>
                  <div class="address-value">
                    <span class="value address-text">
                      {{ forward.remoteAddr }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="info-row inline-on-mobile">
              <div class="info-item full-width">
                <span class="label">创建时间:</span>
                <span class="value">{{ forward.createdTime | dateFormat }}</span>
              </div>
              <div class="info-item full-width" v-admin>
                <span class="label">归属账号:</span>
                <span class="value">{{ forward.userName}}</span>
              </div>
            </div>
            
            <div class="info-row">
              <div class="info-item">
                <span class="label">流量统计:</span>
                <div class="flow-stats-mini">
                  <div class="flow-stat-item">
                    <span class="flow-stat-label">入站:</span>
                    <span class="flow-stat-value in">{{ formatFlow(forward.inFlow || 0) }}</span>
                  </div>
                  <div class="flow-stat-item">
                    <span class="flow-stat-label">出站:</span>
                    <span class="flow-stat-value out">{{ formatFlow(forward.outFlow || 0) }}</span>
                  </div>
                  <div class="flow-stat-item">
                    <span class="flow-stat-label">总计:</span>
                    <span class="flow-stat-value total">{{ formatFlow((forward.inFlow || 0) + (forward.outFlow || 0)) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增/编辑转发对话框 -->
    <el-dialog 
      :title="dialogTitle" 
      :visible.sync="dialogVisible" 
      :width="isMobile ? '90%' : '600px'"
      @close="resetForm"
    >
      <el-form 
        :model="forwardForm" 
        :rules="rules" 
        ref="forwardForm" 
        label-width="100px"
      >
        <el-form-item label="转发名称" prop="name">
          <el-input 
            v-model="forwardForm.name" 
            placeholder="请输入转发名称"
            clearable
          ></el-input>
        </el-form-item>
        
        <el-form-item label="选择隧道" prop="tunnelId">
          <el-select 
            v-model="forwardForm.tunnelId" 
            placeholder="请选择关联的隧道"
            style="width: 100%;"
            @change="handleTunnelChange"
          >
            <el-option
              v-for="tunnel in tunnelList"
              :key="tunnel.id || tunnel.tunnelId"
              :label="getTunnelDisplayName(tunnel)"
              :value="tunnel.id || tunnel.tunnelId"
            ></el-option>
          </el-select>
        </el-form-item>
        
        <el-form-item label="入口端口" prop="inPort">
          <el-input 
            v-model.number="forwardForm.inPort" 
            type="number"
            placeholder="留空自动分配"
            clearable
            :min="1"
            :max="65535"
          >
            <template slot="prepend">端口</template>
          </el-input>
          <div class="form-hint" v-if="selectedTunnel">
            允许范围: {{ selectedTunnel.inPortSta }}-{{ selectedTunnel.inPortEnd }}，留空将自动分配可用端口
          </div>
          <div class="form-hint" v-else>
            请先选择隧道以查看端口范围，留空将自动分配可用端口
          </div>
        </el-form-item>
        
        <el-form-item label="远程地址" prop="remoteAddr">
          <el-input 
            v-model="forwardForm.remoteAddr" 
            placeholder="例如: 192.168.1.100:8080 或 [2001:db8::1]:8080"
            clearable
          >
            <template slot="prepend">目标</template>
          </el-input>
          <div class="form-hint">
            格式: IPv4（IP:端口）、IPv6（[IPv6]:端口）或域名:端口
          </div>
        </el-form-item>
        

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

    <!-- 地址列表弹窗 -->
    <el-dialog 
      :title="addressDialogTitle" 
      :visible.sync="addressDialogVisible" 
      :width="isMobile ? '90%' : '500px'"
      class="address-list-dialog"
    >
      <div class="address-list-container">
        <!-- 头部操作 -->
        <div class="address-list-header">
          <div class="header-info">
            <i class="el-icon-connection"></i>
            <span>点击地址右侧按钮可单独复制</span>
          </div>
          <el-button 
            size="mini" 
            type="primary" 
            icon="el-icon-copy-document"
            @click="copyAllAddresses"
            class="copy-all-btn"
          >
            复制全部
          </el-button>
        </div>

        <!-- 地址列表 -->
        <div class="address-list">
          <div 
            v-for="addressItem in addressList" 
            :key="addressItem.id" 
            class="address-list-item"
          >
            <div class="address-content">
              <div class="ip-info">
                <i class="el-icon-position"></i>
                <span class="ip-text">{{ addressItem.ip }}</span>
              </div>
              <div class="address-text-full">{{ addressItem.address }}</div>
            </div>
            <el-button
              size="mini"
              type="text"
              icon="el-icon-copy-document"
              :loading="addressItem.copying"
              @click="copyAddress(addressItem)"
              class="copy-single-btn"
              title="复制此地址"
            >
              复制
            </el-button>
          </div>
        </div>
      </div>

      <span slot="footer" class="dialog-footer">
        <el-button @click="addressDialogVisible = false">关 闭</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { 
  createForward, 
  getForwardList, 
  updateForward, 
  deleteForward,
  forceDeleteForward,
  userTunnel, 
  getTunnelList,
  pauseForwardService,
  resumeForwardService
} from "@/api";
import { copyWithMessage } from "@/utils/clipboard";

export default {
  name: "Forward",
  data() {
    return {
      loading: false,
      submitLoading: false,
      searchKeyword: '',
      forwardList: [],
      tunnelList: [],
      selectedTunnel: null,
      isMobile: false,
      
      // 对话框状态
      dialogVisible: false,
      dialogTitle: '',
      isEdit: false,
      
      // 地址列表弹窗状态
      addressDialogVisible: false,
      addressDialogTitle: '',
      addressList: [],
      
      // 表单数据
      forwardForm: {
        id: null,
        userId: null,
        name: '',
        tunnelId: null,
        inPort: null,
        remoteAddr: ''
      },
      
      // 表单验证规则
      rules: {
        name: [
          { required: true, message: '请输入转发名称', trigger: 'blur' },
          { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
        ],
        tunnelId: [
          { required: true, message: '请选择关联隧道', trigger: 'change' }
        ],
        inPort: [
          { 
            validator: (rule, value, callback) => {
              if (value !== null && value !== undefined && value !== '') {
                // 检查端口号范围
                if (value < 1 || value > 65535) {
                  callback(new Error('端口号必须在1-65535之间'));
                  return;
                }
                
                // 检查是否在隧道允许范围内
                if (this.selectedTunnel) {
                  if (value < this.selectedTunnel.inPortSta || value > this.selectedTunnel.inPortEnd) {
                    callback(new Error(`端口号必须在${this.selectedTunnel.inPortSta}-${this.selectedTunnel.inPortEnd}范围内`));
                    return;
                  }
                }
              }
              callback();
            }, 
            trigger: 'blur' 
          }
        ],
        remoteAddr: [
          { required: true, message: '请输入远程地址', trigger: 'blur' },
          { 
            validator: (rule, value, callback) => {
              if (value) {
                // IPv4格式：192.168.1.1:8080
                const ipv4Pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?):\d+$/;
                
                // IPv6格式（带方括号）：[2001:db8::1]:8080
                const ipv6BracketPattern = /^\[([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}\]:\d+$/;
                
                // IPv6格式（简化版本，包括::1, ::, ::ffff:192.0.2.1等）
                const ipv6SimplifiedPattern = /^\[(::1|::|::ffff:[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|([0-9a-fA-F]{1,4}:){1,7}:|:([0-9a-fA-F]{1,4}:){1,6}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,6}:([0-9a-fA-F]{1,4}:){1,6}[0-9a-fA-F]{1,4})\]:\d+$/;
                
                // 域名格式：example.com:8080
                const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*:\d+$/;
                
                // 更完整的IPv6正则（支持各种压缩格式）
                const ipv6FullPattern = /^\[((([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4}|:))|(([0-9a-fA-F]{1,4}:){6}(:[0-9a-fA-F]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-fA-F]{1,4}:){5}(((:[0-9a-fA-F]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-fA-F]{1,4}:){4}(((:[0-9a-fA-F]{1,4}){1,3})|((:[0-9a-fA-F]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){3}(((:[0-9a-fA-F]{1,4}){1,4})|((:[0-9a-fA-F]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){2}(((:[0-9a-fA-F]{1,4}){1,5})|((:[0-9a-fA-F]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){1}(((:[0-9a-fA-F]{1,4}){1,6})|((:[0-9a-fA-F]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-fA-F]{1,4}){1,7})|((:[0-9a-fA-F]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))\]:\d+$/;
                
                if (ipv4Pattern.test(value) || ipv6FullPattern.test(value) || domainPattern.test(value)) {
                  callback();
                } else {
                  callback(new Error('请输入正确的地址格式，如: 192.168.1.100:8080 或 [2001:db8::1]:8080 或 example.com:8080'));
                }
              } else {
                callback();
              }
            }, 
            trigger: 'blur' 
          }
        ]
      }
    }
  },
  
  created() {
    this.checkMobile();
    this.loadForwardList();
  },

  mounted() {
    window.addEventListener('resize', this.checkMobile);
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.checkMobile);
  },
  
  methods: {
    // 检查是否为移动端
    checkMobile() {
      this.isMobile = window.innerWidth <= 768;
    },

    // 加载转发列表
    async loadForwardList() {
      try {
        this.loading = true;
        const res = await getForwardList();
        if (res.code === 0) {
          // 直接使用后端返回的状态数据
          this.forwardList = res.data.map(forward => ({
            ...forward,
            serviceRunning: forward.status === 1, // 根据 status 初始化开关状态
            switchLoading: false, // 开关加载状态
            deleteLoading: false // 删除加载状态
          }));
        } else {
          this.$message.error(res.msg || '获取转发列表失败');
        }
      } catch (error) {
        console.error('加载转发列表失败:', error);
        this.$message.error('加载转发列表失败');
      } finally {
        this.loading = false;
      }
    },
    
    // 加载隧道列表
    async loadTunnelList(callback, forceReload = false) {
      try {
        // 如果已经有隧道数据且不强制重新加载，直接返回
        if (this.tunnelList.length > 0 && !forceReload) {
          if (callback && typeof callback === 'function') {
            callback();
          }
          return Promise.resolve();
        }

        // 先尝试获取用户可用的隧道权限列表
        let res = await userTunnel();
        if (res.code === 0 && res.data && res.data.length > 0) {
          // 如果是普通用户，使用用户隧道权限列表
          this.tunnelList = res.data;
          // 如果有回调函数，在隧道列表加载完成后执行
          if (callback && typeof callback === 'function') {
            callback();
          }
          return Promise.resolve();
        } else {
          throw new Error(res.msg || '没有可用的隧道');
        }
      } catch (error) {
        console.error('加载隧道列表失败:', error);
        this.$message.error('加载隧道列表失败');
        return Promise.reject(error);
      }
    },
    
    // 搜索功能
    handleSearch() {
      if (!this.searchKeyword.trim()) {
        this.loadForwardList();
        return;
      }
      
      // 实现本地搜索过滤
      this.loading = true;
      setTimeout(() => {
        const filtered = this.forwardList.filter(forward => 
          forward.name.includes(this.searchKeyword) || 
          forward.remoteAddr.includes(this.searchKeyword)
        );
        this.forwardList = filtered;
        this.loading = false;
      }, 300);
    },
    
    // 新增转发
    async handleAdd() {
      this.isEdit = false;
      this.dialogTitle = '新增转发';
      
      try {
        // 只在没有隧道数据时才加载
        await this.loadTunnelList();
        this.dialogVisible = true;
      } catch (error) {
        this.$message.error('加载隧道列表失败，无法新增');
      }
    },
    
    // 编辑转发
    async handleEdit(row) {
      this.isEdit = true;
      this.dialogTitle = '编辑转发';
      
      try {
        // 只在没有隧道数据时才加载
        await this.loadTunnelList();
        
        // 隧道列表加载完成后，设置表单数据并弹出对话框
      this.forwardForm = { 
        ...row,
        userId: row.userId, // 确保userId被正确设置
        inPort: row.inPort || null // 设置入口端口
      };
      this.handleTunnelChange(row.tunnelId);
      this.dialogVisible = true;
      } catch (error) {
        this.$message.error('加载隧道列表失败，无法编辑');
      }
    },
    
    // 删除转发
    async handleDelete(row) {
      try {
        await this.$confirm(`确定要删除转发 "${row.name}" 吗？`, '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        // 设置删除loading状态
        this.$set(row, 'deleteLoading', true);
        
        const res = await deleteForward(row.id);
        
        if (res.code === 0) {
          this.$message.success('删除成功');
          this.loadForwardList();
        } else {
          // 删除失败，询问是否强制删除
          this.handleDeleteFailure(row, res.msg || '删除失败');
        }
      } catch (error) {
        if (error !== 'cancel') {
          console.error('删除转发失败:', error);
          this.handleDeleteFailure(row, '网络错误，删除失败');
        }
      } finally {
        // 取消删除loading状态
        this.$set(row, 'deleteLoading', false);
      }
    },

    // 处理删除失败，询问是否强制删除
    async handleDeleteFailure(row, errorMsg) {
      try {
        await this.$confirm(
          `常规删除失败：${errorMsg}\n\n是否需要强制删除？\n\n⚠️ 注意：强制删除不会去验证节点端是否已经删除对应的转发服务，需自行确认节点端服务已停止，否则可能导致服务残留。`, 
          '删除失败 - 强制删除确认', 
          {
            confirmButtonText: '强制删除',
            cancelButtonText: '取消',
            type: 'warning',
            dangerouslyUseHTMLString: false,
            showClose: false
          }
        );
        
        // 用户确认强制删除
        this.$set(row, 'deleteLoading', true);
        
        const res = await forceDeleteForward(row.id);
        
        if (res.code === 0) {
          this.$message.success('强制删除成功');
          this.loadForwardList();
        } else {
          this.$message.error(res.msg || '强制删除失败');
        }
      } catch (error) {
        if (error !== 'cancel') {
          console.error('强制删除转发失败:', error);
          this.$message.error('强制删除失败');
        }
      } finally {
        this.$set(row, 'deleteLoading', false);
      }
    },
    
    // 隧道选择变化处理
    handleTunnelChange(tunnelId) {
      this.selectedTunnel = this.tunnelList.find(tunnel => 
        tunnel.id === tunnelId
      ) || null;
      
      // 只在新增模式下清空端口输入，编辑模式下保留原端口值
      if (!this.isEdit) {
        this.forwardForm.inPort = null;
      }
      
      // 触发端口字段重新验证
      this.$nextTick(() => {
        if (this.$refs.forwardForm) {
          this.$refs.forwardForm.clearValidate('inPort');
        }
      });
    },
    
    // 提交表单
    async handleSubmit() {
      try {
        await this.$refs.forwardForm.validate();
        
        this.submitLoading = true;
        let res;
        
        if (this.isEdit) {
          // 更新时确保包含必要字段
          const updateData = {
            id: this.forwardForm.id,
            userId: this.forwardForm.userId,
            name: this.forwardForm.name,
            tunnelId: this.forwardForm.tunnelId,
            inPort: this.forwardForm.inPort || null,
            remoteAddr: this.forwardForm.remoteAddr
          };
          res = await updateForward(updateData);
        } else {
          // 创建时不需要id和userId（后端会自动设置）
          const createData = {
            name: this.forwardForm.name,
            tunnelId: this.forwardForm.tunnelId,
            inPort: this.forwardForm.inPort || null,
            remoteAddr: this.forwardForm.remoteAddr
          };
          res = await createForward(createData);
        }
        
        if (res.code === 0) {
          this.$message.success(this.isEdit ? '修改成功' : '创建成功');
          this.dialogVisible = false;
          await this.loadForwardList();
        } else {
          this.$message.error(res.msg || '操作失败');
        }
      } catch (error) {
        if (error !== false) { // 表单验证失败时不显示错误消息
          console.error('提交失败:', error);
          this.$message.error('操作失败');
        }
      } finally {
        this.submitLoading = false;
      }
    },
    
    // 重置表单
    resetForm() {
      this.forwardForm = {
        id: null,
        userId: null,
        name: '',
        tunnelId: null,
        inPort: null,
        remoteAddr: ''
      };
      this.selectedTunnel = null;
      this.$nextTick(() => {
        if (this.$refs.forwardForm) {
          this.$refs.forwardForm.clearValidate();
        }
      });
    },
    
    // 获取隧道显示名称
    getTunnelDisplayName(tunnel) {
      if (!tunnel) return '未知隧道';
      
      // 处理隧道数据结构
      if (tunnel.name) {
        // 显示隧道名称和IP信息
        if (tunnel.ip) {
          return `${tunnel.name}`;
        }
        return tunnel.name;
      }
      
      return `隧道ID: ${tunnel.id}`;
    },
    
    formatFlow(value) {
      if (value === 0) return '0';
      if (value < 1024) return value + ' B';
      if (value < 1024 * 1024) return (value / 1024).toFixed(2) + ' KB';
      if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(2) + ' MB';
      return (value / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    },
    
    // 格式化入口地址，IPv6需要用[]包裹，支持多IP优化显示
    formatInAddress(ipString, port) {
      if (!ipString || !port) return '';
      
      // 分割IP字符串，处理多个IP的情况
      const ips = ipString.split(',').map(ip => ip.trim()).filter(ip => ip);
      
      if (ips.length === 0) return '';
      
      // 只有一个IP时，正常格式化
      if (ips.length === 1) {
        const ip = ips[0];
        // 检查是否为IPv6地址
        if (ip.includes(':') && !ip.startsWith('[')) {
          // IPv6地址需要用方括号包裹
          return `[${ip}]:${port}`;
        } else {
          // IPv4地址或已包含方括号的IPv6地址直接拼接
          return `${ip}:${port}`;
        }
      }
      
      // 多个IP时，显示第一个IP + 数量提示
      const firstIp = ips[0];
      let formattedFirstIp;
      
      // 格式化第一个IP
      if (firstIp.includes(':') && !firstIp.startsWith('[')) {
        formattedFirstIp = `[${firstIp}]`;
      } else {
        formattedFirstIp = firstIp;
      }
      
      return `${formattedFirstIp}:${port} 等${ips.length}个入口`;
    },
    
    // 获取完整的入口地址列表（用于title显示）
    getFullInAddressList(ipString, port) {
      if (!ipString || !port) return '无入口地址配置';
      
      const ips = ipString.split(',').map(ip => ip.trim()).filter(ip => ip);
      
      if (ips.length === 0) return '无入口地址配置';
      if (ips.length === 1) {
        // 单个IP时，直接返回格式化后的地址
        return this.formatInAddress(ipString, port);
      }
      
      // 多个IP时在title中显示所有地址
      const formattedAddresses = ips.map(ip => {
        if (ip.includes(':') && !ip.startsWith('[')) {
          return `[${ip}]:${port}`;
        } else {
          return `${ip}:${port}`;
        }
      });
      
      return `入口地址列表 (${ips.length}个):\n${formattedAddresses.join('\n')}`;
    },

    // 获取复制用的入口地址（支持多IP）
    getCopyInAddress(ipString, port) {
      if (!ipString || !port) return '';
      
      const ips = ipString.split(',').map(ip => ip.trim()).filter(ip => ip);
      
      if (ips.length === 0) return '';
      if (ips.length === 1) {
        // 单个IP时，返回格式化后的地址
        return this.formatInAddress(ipString, port);
      }
      
      // 多个IP时返回所有地址，用换行符分隔
      const formattedAddresses = ips.map(ip => {
        if (ip.includes(':') && !ip.startsWith('[')) {
          return `[${ip}]:${port}`;
        } else {
          return `${ip}:${port}`;
        }
      });
      
      return formattedAddresses.join('\n');
    },

    // 检查是否有多个IP
    hasMultipleIps(ipString) {
      if (!ipString) return false;
      const ips = ipString.split(',').map(ip => ip.trim()).filter(ip => ip);
      return ips.length > 1;
    },

    // 显示地址列表弹窗
    showAddressDialog(ipString, port, title) {
      if (!ipString || !port) return;
      
      const ips = ipString.split(',').map(ip => ip.trim()).filter(ip => ip);
      
      // 如果只有一个IP，直接复制，不显示弹窗
      if (ips.length <= 1) {
        this.copyToClipboard(this.formatInAddress(ipString, port), title);
        return;
      }
      
      // 格式化地址列表
      this.addressList = ips.map((ip, index) => {
        let formattedAddress;
        if (ip.includes(':') && !ip.startsWith('[')) {
          formattedAddress = `[${ip}]:${port}`;
        } else {
          formattedAddress = `${ip}:${port}`;
        }
        return {
          id: index,
          ip: ip,
          address: formattedAddress,
          copying: false // 复制状态
        };
      });
      
      this.addressDialogTitle = `${title}列表 (共${ips.length}个)`;
      this.addressDialogVisible = true;
    },

    // 复制单个地址
    async copyAddress(addressItem) {
      try {
        this.$set(addressItem, 'copying', true);
        await copyWithMessage(addressItem.address, '地址', this);
      } catch (error) {
        this.$message.error('复制失败');
      } finally {
        this.$set(addressItem, 'copying', false);
      }
    },

    // 复制所有地址
    async copyAllAddresses() {
      if (this.addressList.length === 0) return;
      
      const allAddresses = this.addressList.map(item => item.address).join('\n');
      await copyWithMessage(allAddresses, '所有地址', this);
    },

    // 复制到剪贴板
    async copyToClipboard(text, label = '内容') {
      await copyWithMessage(text, label, this);
    },
    
    // 获取状态类型
    getStatusType(status) {
      switch (parseInt(status)) {
        case 1:
          return 'success'; // 绿色 - 正常
        case 0:
          return 'danger';  // 红色 - 停用
        case -1:
          return 'danger';  // 红色 - 停用
        default:
          return 'info';    // 蓝色 - 未知状态
      }
    },
    
    // 获取状态文本
    getStatusText(status) {
      switch (parseInt(status)) {
        case 1:
          return '正常';
        case 0:
          return '停用';
        case -1:
          return '异常';

        default:
          return '未知';
      }
    },
    



     
     // 处理服务开关
      async handleServiceToggle(forward) {
        // 检查转发状态，只有状态为1（正常）或0（暂停）时才能操作
        if (forward.status !== 1 && forward.status !== 0) {
          this.$message.warning('转发状态异常，无法操作');
          // 恢复开关状态
          this.$set(forward, 'serviceRunning', !forward.serviceRunning);
          return;
        }
        
        const targetState = forward.serviceRunning;
       
       try {
         // 设置加载状态
         this.$set(forward, 'switchLoading', true);
         
         let res;
         if (targetState) {
           // 启动服务
           res = await resumeForwardService(forward.id);
         } else {
           // 暂停服务
           res = await pauseForwardService(forward.id);
         }
         
         if (res.code === 0) {
           this.$message.success(targetState ? '服务已启动' : '服务已暂停');
           // 更新转发状态
           forward.status = targetState ? 1 : 0;
         } else {
           // 操作失败，恢复开关状态
           this.$set(forward, 'serviceRunning', !targetState);
           this.$message.error(res.msg || '操作失败');
         }
       } catch (error) {
         console.error('服务开关操作失败:', error);
         // 操作失败，恢复开关状态
         this.$set(forward, 'serviceRunning', !targetState);
         this.$message.error('网络错误，操作失败');
       } finally {
         // 取消加载状态
         this.$set(forward, 'switchLoading', false);
       }
     }
  },
  
  filters: {
    dateFormat(value) {
      if (!value) return '';
      const date = new Date(value);
      return date.toLocaleString();
    }
  }
}
</script>

<style scoped>
.forward-container {
  padding: 16px;
}

/* 移动端优化 */
@media (max-width: 768px) {
  .forward-container {
    padding: 8px;
  }
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

.table-container {
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

.form-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}

.tunnel-info {
  margin-top: 10px;
}

.dialog-footer {
  text-align: right;
}

/* Element UI 样式调整 */
.el-dialog {
  border-radius: 8px;
}

.el-dialog__title {
  font-weight: 600;
}

.el-button--mini {
  border-radius: 4px;
}

.el-tag {
  border-radius: 4px;
}

.el-input-group__prepend {
  background-color: #f5f7fa;
  border-color: #dcdfe6;
  color: #606266;
}

/* 移动端对话框优化 */
@media (max-width: 768px) {
  .el-dialog {
    border-radius: 6px;
    margin: 15px;
  }
  
  .el-dialog__header {
    padding: 12px 16px 8px;
  }
  
  .el-dialog__body {
    padding: 8px 16px;
  }
  
  .el-dialog__footer {
    padding: 8px 16px 12px;
  }
  
  .el-dialog__title {
    font-size: 15px;
  }
  
  .el-form-item__label {
    font-size: 13px;
  }
  
  .dialog-footer {
    text-align: center;
  }
  
  .dialog-footer .el-button {
    min-width: 70px;
  }
}

.cards-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  padding: 0;
}

/* 移动端卡片容器 */
@media (max-width: 768px) {
  .cards-container {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 0;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
  }
}

.forward-card {
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  padding: 16px;
  transition: all 0.3s ease;
  border: 1px solid #f0f0f0;
  overflow: hidden; /* 防止内容撑大容器 */
}

/* 移动端卡片样式 */
@media (max-width: 768px) {
  .forward-card {
    padding: 12px;
    border-radius: 6px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  
  .forward-card:hover {
    transform: none;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
}

/* 桌面端悬停效果 */
@media (min-width: 769px) {
  .forward-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}

/* 移动端卡片头部 */
@media (max-width: 768px) {
  .card-header {
    margin-bottom: 10px;
    padding-bottom: 6px;
    flex-wrap: wrap;
    gap: 8px;
  }
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

/* 移动端卡片标题 */
@media (max-width: 768px) {
  .card-title {
    font-size: 13px;
  }
  
  .title-text {
    max-width: calc(100% - 60px); /* 为操作按钮留出空间 */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.card-title i {
  margin-right: 6px;
  color: #409EFF;
  flex-shrink: 0;
  font-size: 14px;
}

.title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* 移动端卡片操作 */
@media (max-width: 768px) {
  .card-actions {
    gap: 4px;
  }
  
  .card-actions .el-button--mini {
    padding: 4px;
  }
}

.card-body {
  margin-top: 0;
  overflow: hidden; /* 防止内容撑大容器 */
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.info-row:last-child {
  margin-bottom: 0;
}

/* 移动端信息行 */
@media (max-width: 768px) {
  .info-row {
    margin-bottom: 8px;
    flex-direction: column;
    gap: 6px;
  }
  
  /* 在移动端保持一行显示的信息行 */
  .info-row.inline-on-mobile {
    flex-direction: row;
    gap: 12px;
  }
  
  .info-row.inline-on-mobile .info-item {
    flex: 1;
    min-width: 0;
  }
  
  .info-row.inline-on-mobile .info-item:not(:last-child) {
    margin-right: 8px;
    margin-bottom: 0;
  }
  
  .info-row.inline-on-mobile .value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.info-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0; /* 确保flex子元素可以收缩 */
  overflow: hidden; /* 防止内容撑大容器 */
}

.info-item.full-width {
  flex: 1;
  min-width: 0; /* 确保flex子元素可以收缩 */
  overflow: hidden; /* 防止内容撑大容器 */
}

.info-item:not(:last-child) {
  margin-right: 12px;
}

/* 移动端信息项 */
@media (max-width: 768px) {
  .info-item:not(:last-child) {
    margin-right: 0;
    margin-bottom: 6px;
  }
  
  .info-item:last-child {
    margin-bottom: 0;
  }
}

.label {
  font-size: 11px;
  color: #909399;
  margin-bottom: 2px;
  font-weight: 500;
}

.value {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
}

/* 移动端字体优化 */
@media (max-width: 768px) {
  .label {
    font-size: 10px;
    margin-bottom: 1px;
  }
  
  .value {
    font-size: 12px;
  }
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.flow-stats-mini {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* 移动端流量统计 */
@media (max-width: 768px) {
  .flow-stats-mini {
    gap: 4px;
  }
}

.flow-stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 50px;
}

/* 移动端流量统计项 */
@media (max-width: 480px) {
  .flow-stat-item {
    min-width: 45px;
  }
}

.flow-stat-label {
  font-size: 11px;
  color: #909399;
  margin-bottom: 2px;
  font-weight: 500;
}

.flow-stat-value {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
}

/* 移动端流量统计字体 */
@media (max-width: 768px) {
  .flow-stat-label {
    font-size: 10px;
    margin-bottom: 1px;
  }
  
  .flow-stat-value {
    font-size: 11px;
  }
}

.flow-stat-value.in {
  color: #67C23A;
}

.flow-stat-value.out {
  color: #E6A23C;
}

.flow-stat-value.total {
  color: #F56C6C;
}

/* 服务开关样式优化 */
.el-switch {
  margin-right: 8px;
}

.el-switch__label {
  color: #606266;
  font-weight: 500;
}

.el-switch__label.is-active {
  color: #13ce66;
}

.card-actions .el-switch {
  transform: scale(0.9);
}

/* 禁用状态的开关样式 */
.el-switch.is-disabled {
  opacity: 0.6;
}

.el-switch.is-disabled .el-switch__label {
  color: #c0c4cc !important;
}

/* 地址项样式 */
.address-item {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0; /* 确保flex子元素可以收缩 */
  overflow: hidden; /* 防止内容撑大容器 */
}

.label-with-copy {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.address-value {
  width: 100%;
  min-width: 0; /* 确保flex子元素可以收缩 */
  overflow: hidden; /* 确保容器支持省略号 */
}

.address-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  max-width: 100%; /* 确保不会超出容器 */
  box-sizing: border-box;
  font-family: monospace;
  color: #409EFF;
  font-weight: 500;
}

.address-text.clickable {
  cursor: pointer;
  transition: background-color 0.2s;
}

.address-text.clickable:hover {
  background-color: rgba(64, 158, 255, 0.1);
}

.copy-btn {
  flex-shrink: 0;
  padding: 2px 6px !important;
  margin: 0 !important;
  min-width: auto !important;
  height: 20px !important;
  opacity: 0.6;
  transition: opacity 0.3s ease;
}

.copy-btn:hover {
  opacity: 1;
  color: #409EFF !important;
}

.copy-btn .el-icon-copy-document {
  font-size: 12px;
}

/* 地址项悬停效果 */
.address-item:hover .copy-btn {
  opacity: 1;
}

/* 移动端复制按钮 */
@media (max-width: 768px) {
  .copy-btn {
    opacity: 0.8;
    height: 18px !important;
    padding: 1px 4px !important;
  }
  
  .copy-btn .el-icon-copy-document {
    font-size: 11px;
  }
  
  .address-item:hover .copy-btn {
    opacity: 1;
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

/* 移动端全局优化 */
@media (max-width: 768px) {
  /* 确保内容不会水平滚动 */
  .forward-container * {
    box-sizing: border-box;
    max-width: 100%;
  }
  
  /* 强制约束容器宽度 */
  .forward-card,
  .card-body,
  .info-row,
  .info-row.inline-on-mobile,
  .info-item,
  .address-item,
  .address-value {
    max-width: 100%;
    overflow: hidden;
  }
  
  /* 优化长文本显示 - 保持省略号不换行 */
  .address-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  
  /* 标题文本约束 */
  .title-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  
  /* 移动端空状态调整 */
  .empty-state {
    padding: 20px 15px;
    height: 150px;
  }
  
  /* 移动端form hint */
  .form-hint {
    font-size: 11px;
    line-height: 1.4;
  }
}

/* 移动端头部样式 */
@media (max-width: 768px) {
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
}

/* 超小屏幕优化 */
@media (max-width: 480px) {
  .forward-container {
    padding: 6px;
  }
  
  .header-bar {
    padding: 8px 12px;
    margin-bottom: 8px;
  }
  
  .page-title {
    font-size: 15px;
  }
  
  .forward-card {
    padding: 10px;
  }
  
  .card-header {
    margin-bottom: 8px;
  }
  
  .info-row {
    margin-bottom: 6px;
  }
  
  /* 超小屏幕下调整间距 */
  .info-row.inline-on-mobile {
    gap: 8px;
  }
  
  .info-row.inline-on-mobile .info-item:not(:last-child) {
    margin-right: 6px;
  }
}

/* 地址列表弹窗样式 */
.address-list-dialog .el-dialog__body {
  padding: 16px;
}

.address-list-container {
  max-height: 60vh;
  overflow-y: auto;
}

.address-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #f8f9fa;
  border-radius: 6px;
  border-left: 3px solid #409EFF;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
}

.header-info i {
  color: #409EFF;
  font-size: 16px;
}

.copy-all-btn {
  border-radius: 6px;
  font-weight: 500;
}

.address-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.address-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: white;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.address-list-item:hover {
  border-color: #409EFF;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.address-content {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}

.ip-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.ip-info i {
  color: #909399;
  font-size: 14px;
}

.ip-text {
  font-size: 12px;
  color: #909399;
  font-weight: 500;
}

.address-text-full {
  font-family: monospace;
  font-size: 14px;
  font-weight: 600;
  color: #409EFF;
  word-break: break-all;
  line-height: 1.4;
}

.copy-single-btn {
  flex-shrink: 0;
  color: #409EFF;
  border: 1px solid #409EFF;
  border-radius: 4px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.3s ease;
}

.copy-single-btn:hover {
  background-color: #409EFF;
  color: white;
}

.copy-single-btn.is-loading {
  background-color: rgba(64, 158, 255, 0.1);
}

/* 移动端地址列表优化 */
@media (max-width: 768px) {
  .address-list-dialog .el-dialog__body {
    padding: 12px;
  }
  
  .address-list-header {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 10px;
  }
  
  .header-info {
    justify-content: center;
    font-size: 12px;
  }
  
  .copy-all-btn {
    align-self: center;
    min-width: 100px;
  }
  
  .address-list-item {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 10px;
  }
  
  .address-content {
    margin-right: 0;
    margin-bottom: 6px;
  }
  
  .address-text-full {
    font-size: 12px;
  }
  
  .copy-single-btn {
    align-self: center;
    min-width: 70px;
  }
}

/* 超小屏幕优化 */
@media (max-width: 480px) {
  .address-list-dialog .el-dialog__body {
    padding: 8px;
  }
  
  .address-list-header {
    padding: 8px;
  }
  
  .header-info {
    font-size: 11px;
  }
  
  .address-list-item {
    padding: 8px;
  }
  
  .address-text-full {
    font-size: 11px;
  }
  
  .ip-text {
    font-size: 10px;
  }
}

</style>