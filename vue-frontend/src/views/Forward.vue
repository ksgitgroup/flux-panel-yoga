<template>
  <div class="forward-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <h1 class="page-title">转发管理</h1>
      <div class="header-actions">
        <!-- 搜索框 -->
        <el-input
          v-model="searchKeyword"
          placeholder="搜索转发名称或远程地址"
          prefix-icon="el-icon-search"
          @keyup.enter.native="handleSearch"
          clearable
          style="width: 250px; margin-right: 15px;"
        >
          <el-button slot="append" icon="el-icon-search" @click="handleSearch"></el-button>
        </el-input>
        
        <el-button 
          type="primary" 
          icon="el-icon-plus" 
          @click="handleAdd"
          class="add-btn"
        >
          新增转发
        </el-button>
      </div>
    </div>

    <!-- 转发列表 -->
    <div class="table-container">
      <div v-loading="loading" class="cards-container">
        <div v-if="forwardList.length === 0 && !loading" class="empty-state">
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
              {{ forward.name }}
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
            <div class="info-row">
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
                      @click="copyToClipboard(formatInAddress(forward.inIp, forward.inPort), '入口地址')"
                      class="copy-btn"
                      title="复制入口地址"
                    ></el-button>
                  </div>
                  <div class="address-value">
                    <span class="value address-text" :title="formatInAddress(forward.inIp, forward.inPort)">
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
                    <span class="value address-text" :title="forward.remoteAddr">
                      {{ forward.remoteAddr}}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="info-row">
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
      width="600px"
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
      
      // 对话框状态
      dialogVisible: false,
      dialogTitle: '',
      isEdit: false,
      
      // 表单数据
      forwardForm: {
        id: null,
        userId: null,
        name: '',
        tunnelId: null,
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
    this.loadForwardList();
  },
  
  methods: {
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
        userId: row.userId // 确保userId被正确设置
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
        tunnel.id === tunnelId || tunnel.tunnelId === tunnelId
      ) || null;
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
            remoteAddr: this.forwardForm.remoteAddr
          };
          res = await updateForward(updateData);
        } else {
          // 创建时不需要id和userId（后端会自动设置）
          const createData = {
            name: this.forwardForm.name,
            tunnelId: this.forwardForm.tunnelId,
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
      
      // 处理用户隧道权限列表的数据结构
      if (tunnel.tunnelId) {
        const tunnelInfo = this.tunnelList.find(t => t.id === tunnel.tunnelId);
        if (tunnelInfo && tunnelInfo.ip && tunnelInfo.port) {
          return `${tunnelInfo.name || tunnel.tunnelId} (${tunnelInfo.ip}:${tunnelInfo.port})`;
        }
        return `隧道ID: ${tunnel.tunnelId}`;
      }
      
      // 处理直接隧道数据结构
      if (tunnel.name) {
        if (tunnel.ip && tunnel.port) {
          return `${tunnel.name} (${tunnel.ip}:${tunnel.port})`;
        }
        return tunnel.name;
      }
      
      return `隧道ID: ${tunnel.id || 'unknown'}`;
    },
    
    formatFlow(value) {
      if (value === 0) return '0';
      if (value < 1024) return value + ' B';
      if (value < 1024 * 1024) return (value / 1024).toFixed(2) + ' KB';
      if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(2) + ' MB';
      return (value / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    },
    
    // 格式化入口地址，IPv6需要用[]包裹
    formatInAddress(ip, port) {
      if (!ip || !port) return '';
      
      // 检查是否为IPv6地址
      if (ip.includes(':')) {
        // IPv6地址需要用方括号包裹
        return `[${ip}]:${port}`;
      } else {
        // IPv4地址直接拼接
        return `${ip}:${port}`;
      }
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
  padding: 20px;
  background-color: #f5f5f5;
  min-height: 100vh;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 20px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.page-title {
  margin: 0;
  color: #303133;
  font-size: 24px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
}

.add-btn {
  border-radius: 6px;
  font-weight: 500;
}

.table-container {
  padding: 20px;
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
.el-table {
  border-radius: 8px;
}

.el-dialog {
  border-radius: 12px;
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

.cards-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  padding: 10px 0;
}

.forward-card {
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  padding: 24px;
  transition: all 0.3s ease;
  border: 1px solid #f0f0f0;
}

.forward-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
}

.card-title i {
  margin-right: 8px;
  color: #409EFF;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-body {
  margin-top: 16px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0; /* 确保flex子元素可以收缩 */
}

.info-item.full-width {
  flex: 1;
  min-width: 0; /* 确保flex子元素可以收缩 */
}

.info-item:not(:last-child) {
  margin-right: 20px;
}

.label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
  font-weight: 500;
}

.value {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 300px;
}

.flow-stats-mini {
  display: flex;
  gap: 8px;
}

.flow-stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.flow-stat-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
  font-weight: 500;
}

.flow-stat-value {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
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
}

.label-with-copy {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.address-value {
  width: 100%;
  min-width: 0; /* 确保flex子元素可以收缩 */
}

.address-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  max-width: 100%; /* 确保不会超出容器 */
  box-sizing: border-box;
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