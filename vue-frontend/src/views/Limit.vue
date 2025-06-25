<template>
  <div class="speed-limit-container">
    <div class="action-buttons" style="margin-bottom: 10px;">
          <el-button
            type="primary" 
            icon="el-icon-plus" 
            @click="handleAdd"
            class="add-btn"
          >
            新增限速
          </el-button>
        </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>加载中...</p>
    </div>

    <!-- 限速规则列表 - 桌面端表格 -->
    <div v-else-if="!isMobile && !loading && filteredSpeedLimitList.length !== 0" class="table-container">
      <div class="custom-table">
        <div class="table-header">
          <div class="th">ID</div>
          <div class="th">规则名称</div>
          <div class="th">速度限制</div>
          <div class="th">状态</div>
          <div class="th">绑定隧道</div>
          <div class="th">创建时间</div>
          <div class="th">更新时间</div>
          <div class="th">操作</div>
        </div>
        
        <div v-for="rule in filteredSpeedLimitList" :key="rule.id" class="table-row">
          <div class="td">{{ rule.id }}</div>
          <div class="td">{{ rule.name }}</div>
          <div class="td">
            <el-tag type="info">{{ rule.speed }} Mbps</el-tag>
          </div>
          <div class="td">
            <el-tag :type="rule.status === 1 ? 'success' : 'danger'">
              {{ rule.status === 1 ? '运行' : '异常' }}
            </el-tag>
          </div>
          <div class="td">
            <el-tag v-if="rule.tunnelName" type="success">{{ rule.tunnelName }}</el-tag>
            <span v-else class="text-muted">未绑定</span>
          </div>
          <div class="td">{{ rule.createdTime | dateFormat }}</div>
          <div class="td">{{ rule.updatedTime | dateFormat }}</div>
          <div class="td">
            <div class="action-buttons-inline">
              <el-button 
                size="mini" 
                type="primary" 
                icon="el-icon-edit"
                @click="handleEdit(rule)"
                circle
              ></el-button>
              <el-button 
                size="mini" 
                type="danger" 
                icon="el-icon-delete"
                @click="handleDelete(rule)"
                circle
              ></el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 限速规则列表 - 移动端卡片 -->
    <div v-else class="cards-container" v-loading="loading">
      <div
        v-for="rule in filteredSpeedLimitList"
        :key="rule.id"
        class="rule-card"
      >
        <div class="card-header">
          <div class="card-title">
            <i class="el-icon-odometer"></i>
            {{ rule.name }}
          </div>
          <div class="card-status">
            <el-tag :type="rule.status === 1 ? 'success' : 'danger'" size="mini">
              {{ rule.status === 1 ? '运行' : '异常' }}
            </el-tag>
          </div>
        </div>

        <div class="card-content">
          <div class="info-row">
            <span class="info-label">ID:</span>
            <span class="info-value">{{ rule.id }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">速度限制:</span>
            <span class="info-value speed-value">{{ rule.speed }} Mbps</span>
          </div>
          <div class="info-row">
            <span class="info-label">绑定隧道:</span>
            <span class="info-value tunnel-value">
              {{ rule.tunnelName || '未绑定' }}
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">创建时间:</span>
            <span class="info-value">{{ rule.createdTime | dateFormat }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">更新时间:</span>
            <span class="info-value">{{ rule.updatedTime | dateFormat }}</span>
          </div>
        </div>

        <div class="card-actions">
          <el-button 
            @click="handleEdit(rule)"
            type="primary"
            size="small"
            icon="el-icon-edit"
            plain
          >
            编辑
          </el-button>
          <el-button 
            @click="handleDelete(rule)"
            type="danger"
            size="small"
            icon="el-icon-delete"
            plain
          >
            删除
          </el-button>
        </div>
      </div>
    </div>
      
    <!-- 空状态 -->
    <div v-if="!loading && filteredSpeedLimitList.length === 0"  style="margin-top: 10px;">
      <el-empty description="暂无限速规则">
        
      </el-empty>
    </div>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      :title="dialogTitle"
      :visible.sync="dialogVisible" 
      :width="isMobile ? '90%' : '500px'"
      @close="resetForm"
    >
      <el-form 
        :model="speedLimitForm" 
        :rules="rules" 
        ref="speedLimitForm"
        label-width="100px"
      >
        <el-form-item label="规则名称" prop="name">
          <el-input 
            v-model="speedLimitForm.name" 
            placeholder="请输入限速规则名称"
            clearable
          ></el-input>
        </el-form-item>
        
        <el-form-item label="速度限制" prop="speed">
          <el-input-number
            v-model="speedLimitForm.speed"
            :min="1"
            :max="1000000"
            placeholder="请输入速度限制"
            style="width: 100%;"
          ></el-input-number>
          <div class="form-hint">
            单位：Mbps，范围：1-1000000
          </div>
        </el-form-item>
        
        <el-form-item label="绑定隧道" prop="tunnelId">
          <el-select 
            v-model="speedLimitForm.tunnelId" 
            placeholder="请选择要绑定的隧道"
            style="width: 100%;"
            filterable
            @change="handleTunnelChange"
          >
            <el-option
              v-for="tunnel in tunnelList"
              :key="tunnel.id"
              :label="tunnel.name"
              :value="tunnel.id"
            ></el-option>
          </el-select>
          <div class="form-hint">
            选择要应用限速规则的隧道
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
import { createSpeedLimit, getSpeedLimitList, updateSpeedLimit, deleteSpeedLimit, getTunnelList } from "@/api";

export default {
  name: "Limit",
  data() {
    return {
      speedLimitList: [],
      tunnelList: [],
      loading: false,
      dialogVisible: false,
      dialogTitle: '',
      isEdit: false,
      submitLoading: false,
      searchKeyword: '',
      isMobile: false,
      
      // 表单数据
      speedLimitForm: {
        id: null,
        name: '',
        speed: 100,
        tunnelId: null,
        tunnelName: '',
        status: 1
      },
      
      // 表单验证规则
      rules: {
        name: [
          { required: true, message: '请输入规则名称', trigger: 'blur' },
          { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
        ],
        speed: [
          { required: true, message: '请输入速度限制', trigger: 'blur' },
          { type: 'number', min: 1, message: '速度限制必须大于0', trigger: 'blur' }
        ],
        tunnelId: [
          { required: true, message: '请选择要绑定的隧道', trigger: 'change' }
        ]
      }
    };
  },
  
  computed: {
    filteredSpeedLimitList() {
      if (!this.searchKeyword.trim()) {
        return this.speedLimitList;
      }
      return this.speedLimitList.filter(item => 
        item.name.toLowerCase().includes(this.searchKeyword.toLowerCase())
      );
    }
  },
  
  mounted() {
    this.checkMobile();
    this.loadSpeedLimits();
    this.loadTunnels();
    window.addEventListener('resize', this.checkMobile);
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.checkMobile);
  },
  
  methods: {
    checkMobile() {
      this.isMobile = window.innerWidth <= 768;
    },

    // 加载限速规则列表
    async loadSpeedLimits() {
      try {
        this.loading = true;
        const res = await getSpeedLimitList();
        if (res.code === 0) {
          this.speedLimitList = res.data || [];
        } else {
          this.$message.error(res.msg || '获取限速规则列表失败');
        }
      } catch (error) {
        console.error('加载限速规则列表失败:', error);
        this.$message.error('加载限速规则列表失败');
      } finally {
        this.loading = false;
      }
    },

    // 加载隧道列表
    async loadTunnels() {
      try {
        const res = await getTunnelList();
        if (res.code === 0) {
          this.tunnelList = res.data || [];
        } else {
          console.error('获取隧道列表失败:', res.msg);
        }
      } catch (error) {
        console.error('加载隧道列表失败:', error);
      }
    },
    
    // 搜索功能
    handleSearch() {
      // 通过 computed 属性实现实时搜索
    },
    
    // 处理隧道选择变化
    handleTunnelChange(tunnelId) {
      const selectedTunnel = this.tunnelList.find(tunnel => tunnel.id === tunnelId);
      if (selectedTunnel) {
        this.speedLimitForm.tunnelName = selectedTunnel.name;
      } else {
        this.speedLimitForm.tunnelName = '';
      }
    },

    // 新增限速规则
    handleAdd() {
      this.isEdit = false;
      this.dialogTitle = '新增限速规则';
      this.dialogVisible = true;
    },
    
    // 编辑限速规则
    handleEdit(row) {
      this.isEdit = true;
      this.dialogTitle = '编辑限速规则';
      this.speedLimitForm = { 
        id: row.id,
        name: row.name,
        speed: row.speed,
        tunnelId: row.tunnelId,
        tunnelName: row.tunnelName,
        status: row.status || 1
      };
      this.dialogVisible = true;
    },
    
    // 删除限速规则
    async handleDelete(row) {
      try {
        await this.$confirm(`确定要删除限速规则 "${row.name}" 吗？`, '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        const res = await deleteSpeedLimit(row.id);
        if (res.code === 0) {
          this.$message.success('删除成功');
          this.loadSpeedLimits();
        } else {
          this.$message.error(res.msg || '删除失败');
        }
      } catch (error) {
        if (error !== 'cancel') {
          console.error('删除限速规则失败:', error);
          this.$message.error('删除失败');
        }
      }
    },
    
    // 提交表单
    async handleSubmit() {
      try {
        await this.$refs.speedLimitForm.validate();
        
        this.submitLoading = true;
        let res;
        
        if (this.isEdit) {
          res = await updateSpeedLimit(this.speedLimitForm);
        } else {
          const { id, ...createData } = this.speedLimitForm;
          res = await createSpeedLimit(createData);
        }
        
        if (res.code === 0) {
          this.$message.success(this.isEdit ? '修改成功' : '创建成功');
          this.dialogVisible = false;
          this.loadSpeedLimits();
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
      this.speedLimitForm = {
        id: null,
        name: '',
        speed: 100,
        tunnelId: null,
        tunnelName: '',
        status: 1
      };
      this.$nextTick(() => {
        if (this.$refs.speedLimitForm) {
          this.$refs.speedLimitForm.clearValidate();
        }
      });
    }
  },
  
  filters: {
    dateFormat(value) {
      if (!value) return '';
      const date = new Date(value);
      return date.toLocaleString();
    }
  }
};
</script>

<style scoped>
.speed-limit-container {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
  padding: 20px;
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
}

.header-top {
  margin-bottom: 20px;
}

.page-title {
  margin: 0;
  color: #303133;
  font-size: 24px;
  font-weight: 600;
  display: flex;
  align-items: center;
}

.page-title i {
  margin-right: 12px;
  font-size: 28px;
  color: #409EFF;
}

.header-actions {
  display: flex;
  gap: 15px;
  align-items: center;
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.add-btn {
  border-radius: 6px;
  font-weight: 500;
}

.table-container {
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
  padding: 20px;
  overflow-x: auto;
}

.custom-table {
  width: 100%;
  border-collapse: collapse;
  display: table;
}

.table-header {
  display: table-row;
  background: #f8f9fa;
  font-weight: 600;
}

.table-row {
  display: table-row;
  border-bottom: 1px solid #ebeef5;
  transition: background-color 0.3s;
}

.table-row:hover {
  background-color: #f5f7fa;
}

.th, .td {
  display: table-cell;
  padding: 12px 15px;
  text-align: left;
  vertical-align: middle;
  border-bottom: 1px solid #ebeef5;
}

.th {
  background: #f8f9fa;
  color: #909399;
  font-weight: 600;
  font-size: 13px;
}

.td {
  font-size: 14px;
  color: #606266;
}

.action-buttons-inline {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.cards-container {
  display: grid;
  gap: 15px;
}

.rule-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.rule-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 20px 15px;
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

.card-content {
  padding: 15px 20px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 14px;
  color: #909399;
  font-weight: 500;
}

.info-value {
  font-size: 14px;
  color: #303133;
  text-align: right;
  max-width: 60%;
  word-break: break-all;
}

.speed-value {
  color: #409EFF;
  font-weight: 600;
}

.tunnel-value {
  color: #67C23A;
}

.card-actions {
  display: flex;
  padding: 15px 20px 20px;
  gap: 10px;
}

.card-actions .el-button {
  flex: 1;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
}

.form-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}

.dialog-footer {
  text-align: right;
}

.text-muted {
  color: #909399;
  font-style: italic;
}

/* Element UI 样式调整 */
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

/* 响应式设计 */
@media (max-width: 768px) {
  .speed-limit-container {
    padding: 10px;
  }
  
  .page-header {
    padding: 15px;
  }
  
  .page-title {
    font-size: 20px;
    margin-bottom: 15px;
  }
  
  .header-actions {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .action-buttons {
    justify-content: space-between;
  }
  
  .action-buttons .el-button {
    flex: 1;
  }
  
  .card-actions {
    padding: 15px;
  }
  
  .card-header {
    padding: 15px;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .card-content {
    padding: 10px 15px;
  }
  
  .info-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 0;
  }
  
  .info-value {
    max-width: 100%;
    text-align: left;
  }

  .table-container {
    display: none;
  }
}

@media (max-width: 480px) {
  .speed-limit-container {
    padding: 8px;
  }
  
  .page-header {
    padding: 12px;
  }
  
  .page-title {
    font-size: 18px;
  }
  
  .page-title i {
    font-size: 22px;
  }
  
  .action-buttons {
    flex-direction: column;
  }
  
  .empty-state {
    padding: 40px 15px;
  }
}
</style> 