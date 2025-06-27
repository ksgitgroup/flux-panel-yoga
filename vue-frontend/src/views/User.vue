<template>
  <div class="user-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <h1 class="page-title">用户管理</h1>
      <div class="header-actions">
        <!-- 搜索框 -->
        <el-input
          v-model="searchKeyword"
          placeholder="搜索用户名"
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
          新增用户
        </el-button>
      </div>
    </div>

    <!-- 用户列表 -->
    <div class="list-container">
      <!-- 桌面端表格视图 -->
      <div class="desktop-view">
        <el-table 
          :data="userList" 
          v-loading="loading"
          stripe
          border
          style="width: 100%"
        >
          <el-table-column prop="id" label="ID" width="60"></el-table-column>
          <el-table-column prop="user" label="用户名" ></el-table-column>
          <el-table-column label="流量统计" >
            <template slot-scope="scope">
              <div class="flow-stats">
                <div class="flow-item">
                  <span class="flow-label">总量:</span>
                  <span class="flow-value">{{ formatFlow(scope.row.flow, 'gb') }}</span>
                </div>
                <div class="flow-item">
                  <span class="flow-label">已用:</span>
                  <span class="flow-value used">{{ formatFlow(calculateUserTotalUsedFlow(scope.row)) }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="num" label="转发数量" width="100"></el-table-column>
          <el-table-column prop="status" label="状态" width="80">
            <template slot-scope="scope">
              <el-tag :type="scope.row.status === 1 ? 'success' : 'danger'" size="small">
                {{ scope.row.status === 1 ? '正常' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="expTime" label="过期时间" width="180">
            <template slot-scope="scope">
              <span v-if="scope.row.expTime" :class="getExpTimeClass(scope.row.expTime)">
                {{ scope.row.expTime | dateFormat }}
              </span>
              <span v-else class="no-exptime">永久</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="240">
            <template slot-scope="scope">
              <el-button 
                size="mini" 
                type="primary" 
                icon="el-icon-edit"
                @click="handleEdit(scope.row)"
              >
                编辑
              </el-button>
              <el-button 
                size="mini" 
                type="success" 
                icon="el-icon-s-tools"
                @click="handleAssignTunnel(scope.row)"
              >
                分配
              </el-button>
              <el-button 
                size="mini" 
                type="danger" 
                icon="el-icon-delete"
                @click="handleDelete(scope.row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 移动端卡片视图 -->
      <div class="mobile-view" v-loading="loading">
        <EmptyState 
          v-if="userList.length === 0 && !loading" 
          description="暂无用户数据"
        />
        
        <div v-for="user in userList" :key="user.id" class="user-card">
          <!-- 卡片头部 -->
          <div class="card-header">
            <div class="user-info">
              <div class="user-name">{{ user.name }}</div>
              <div class="user-account">@{{ user.user }}</div>
            </div>
            <div class="user-status">
              <el-tag :type="user.status === 1 ? 'success' : 'danger'" size="small">
                {{ user.status === 1 ? '正常' : '禁用' }}
              </el-tag>
            </div>
          </div>

          <!-- 卡片内容 -->
          <div class="card-content">
            <!-- 流量信息 -->
            <div class="info-section">
              <div class="section-title">流量统计</div>
              <div class="flow-info">
                <div class="flow-item">
                  <span class="label">总流量</span>
                  <span class="value primary">{{ formatFlow(user.flow, 'gb') }}</span>
                </div>
                <div class="flow-item">
                  <span class="label">已使用</span>
                  <span class="value danger">{{ formatFlow(calculateUserTotalUsedFlow(user)) }}</span>
                </div>
                <div class="flow-item">
                  <span class="label">转发数量</span>
                  <span class="value">{{ user.num }}</span>
                </div>
              </div>
            </div>

            <!-- 时间信息 -->
            <div class="info-section">
              <div class="section-title">时间信息</div>
              <div class="time-info">
                <div class="time-item">
                  <span class="label">过期时间</span>
                  <span v-if="user.expTime" :class="['value', getExpTimeClass(user.expTime)]">
                    {{ user.expTime | dateFormat }}
                  </span>
                  <span v-else class="value no-exptime">永久</span>
                </div>
                <div class="time-item">
                  <span class="label">流量重置</span>
                  <span class="value">
                    <span v-if="user.flowResetTime">每月{{ user.flowResetTime }}号</span>
                    <span v-else class="no-reset-time">未设置</span>
                  </span>
                </div>
                <div class="time-item">
                  <span class="label">创建时间</span>
                  <span class="value">{{ user.createdTime | dateFormat }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="card-actions">
            <el-button 
              size="small" 
              type="primary" 
              icon="el-icon-edit"
              @click="handleEdit(user)"
              plain
            >
              编辑
            </el-button>
            <el-button 
              size="small" 
              type="success" 
              icon="el-icon-s-tools"
              @click="handleAssignTunnel(user)"
              plain
            >
              分配权限
            </el-button>
            <el-button 
              size="small" 
              type="danger" 
              icon="el-icon-delete"
              @click="handleDelete(user)"
              plain
            >
              删除
            </el-button>
          </div>
        </div>
      </div>
      
      <!-- 分页组件 -->
      <div class="pagination-container">
        <!-- 桌面端分页 -->
        <el-pagination
          class="desktop-pagination"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.current"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pagination.size"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
        >
        </el-pagination>
        
        <!-- 移动端分页 -->
        <el-pagination
          class="mobile-pagination"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.current"
          :page-sizes="[10, 20, 50]"
          :page-size="pagination.size"
          layout="prev, pager, next"
          :total="pagination.total"
          small
        >
        </el-pagination>
      </div>
    </div>

    <!-- 新增/编辑用户对话框 -->
    <el-dialog 
      :title="dialogTitle" 
      :visible.sync="dialogVisible" 
      width="500px"
      @close="resetForm"
    >
      <el-form 
        :model="userForm" 
        :rules="rules" 
        ref="userForm" 
        label-width="80px"
      >
        
        <el-form-item label="用户名" prop="user">
          <el-input 
            v-model="userForm.user" 
            placeholder="请输入用户名"
            clearable
          ></el-input>
        </el-form-item>
        
        <el-form-item label="密码" prop="pwd">
          <el-input 
            v-model="userForm.pwd" 
            type="password" 
            :placeholder="isEdit ? '留空则不修改密码' : '请输入密码'"
            clearable
            show-password
          ></el-input>
        </el-form-item>
        <el-form-item label="流量(GB)" prop="flow">
              <el-input-number 
                v-model="userForm.flow" 
                :min="0" 
                :max="99999"
                placeholder="请输入流量"
                style="width: 100%;"
              ></el-input-number>
            </el-form-item>
        
            <el-form-item label="转发数量" prop="num">
              <el-input-number 
                v-model="userForm.num" 
                :min="0" 
                :max="9999"
                placeholder="请输入转发数量"
                style="width: 100%;"
              ></el-input-number>
            </el-form-item>
        
        <el-form-item label="过期时间" prop="expTime">
          <el-date-picker
            v-model="userForm.expTime"
            type="datetime"
            placeholder="选择过期时间"
            style="width: 100%;"
            :picker-options="pickerOptions"
          >
          </el-date-picker>
        </el-form-item>
        
        <el-form-item label="流量重置日期" prop="flowResetTime">
          <el-select 
            v-model="userForm.flowResetTime" 
            placeholder="选择每月重置日期"
            style="width: 100%;"
          >
            <el-option
              v-for="day in 31"
              :key="day"
              :label="`每月${day}号（0点重置）`"
              :value="day"
            ></el-option>
          </el-select>
        </el-form-item>
        
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="userForm.status">
            <el-radio :label="1">正常</el-radio>
            <el-radio :label="0">禁用</el-radio>
          </el-radio-group>
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

    <!-- 用户隧道权限分配对话框 -->
    <el-dialog 
      :title="`用户 ${currentUser.name} 的隧道权限管理`" 
      :visible.sync="tunnelDialogVisible" 
      width="50%"
      @close="resetTunnelDialog"
    >
      <!-- 分配新隧道权限 -->
      <div class="assign-section">
        <h4>分配新隧道权限</h4>
        <el-form :model="tunnelForm" :rules="tunnelRules" ref="tunnelForm" label-width="120px">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="选择隧道" prop="tunnelId">
                <el-select 
                  v-model="tunnelForm.tunnelId" 
                  placeholder="请选择隧道"
                  style="width: 100%;"
                  @change="handleTunnelChange"
                >
                  <el-option
                    v-for="tunnel in availableTunnels"
                    :key="tunnel.id"
                    :label="`${tunnel.name}`"
                    :value="tunnel.id"
                  ></el-option>
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="限速规则" prop="speedId">
                <el-select 
                  v-model="tunnelForm.speedId" 
                  placeholder="请选择限速规则"
                  style="width: 100%;"
                  clearable
                  :disabled="!tunnelForm.tunnelId"
                >
                  <el-option
                    label="不限速"
                    :value="null"
                  ></el-option>
                  <el-option
                    v-for="speedLimit in availableSpeedLimits"
                    :key="speedLimit.id"
                    :label="`${speedLimit.name}`"
                    :value="speedLimit.id"
                  ></el-option>
                  <el-option
                    v-if="tunnelForm.tunnelId && availableSpeedLimits.length === 0"
                    label="该隧道暂无限速规则"
                    :value="null"
                    disabled
                  ></el-option>
                </el-select>
                <div v-if="tunnelForm.tunnelId && availableSpeedLimits.length === 0" class="form-hint">
                  该隧道暂无可用的限速规则，请先在限速管理中为该隧道创建限速规则
                </div>
              </el-form-item>
            </el-col>
          </el-row>
          
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="流量限制(GB)" prop="flow">
                <el-input-number 
                  v-model="tunnelForm.flow" 
                  :min="0" 
                  :max="99999"
                  placeholder="流量限制"
                  style="width: 100%;"
                ></el-input-number>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="转发数量" prop="num">
                <el-input-number 
                  v-model="tunnelForm.num" 
                  :min="0" 
                  :max="9999"
                  placeholder="转发数量"
                  style="width: 100%;"
                ></el-input-number>
              </el-form-item>
            </el-col>
          </el-row>
          
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="流量重置日期" prop="flowResetTime">
                <el-select 
                  v-model="tunnelForm.flowResetTime" 
                  placeholder="选择每月重置日期"
                  style="width: 100%;"
                >
                  <el-option
                    v-for="day in 31"
                    :key="day"
                    :label="`每月${day}号（0点重置）`"
                    :value="day"
                  ></el-option>
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="到期时间" prop="expTime">
                <el-date-picker
                  v-model="tunnelForm.expTime"
                  type="datetime"
                  placeholder="选择到期时间"
                  style="width: 100%;"
                  :picker-options="pickerOptions"
                >
                </el-date-picker>
              </el-form-item>
            </el-col>
          </el-row>
          
          <el-form item>
            <el-button 
              type="primary" 
              @click="handleAssignTunnelPermission"
              :loading="assignLoading"
            >
              分配权限
            </el-button>
          </el-form>
        </el-form>
      </div>

      <el-divider></el-divider>

      <!-- 已有隧道权限列表 -->
      <div class="permission-list-section">
        <h4>已有隧道权限</h4>
        
        <!-- 桌面端表格视图 -->
        <div class="desktop-view">
          <el-table 
            :data="userTunnelList" 
            v-loading="tunnelListLoading"
            border
            style="width: 100%"
          >
            <el-table-column prop="tunnelName" label="隧道名称" min-width="120"></el-table-column>
            <el-table-column label="状态" width="80">
              <template slot-scope="scope">
                <el-tag :type="scope.row.status === 1 ? 'success' : 'danger'" size="small">
                  {{ scope.row.status === 1 ? '正常' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="流量统计" width="180">
              <template slot-scope="scope">
                <div class="tunnel-flow-stats">
                  <div class="tunnel-flow-item">
                    <span class="tunnel-flow-label">限制:</span>
                    <span class="tunnel-flow-value">{{ formatFlow(scope.row.flow, 'gb') }}</span>
                  </div>
                  <div class="tunnel-flow-item">
                    <span class="tunnel-flow-label">已用:</span>
                    <span class="tunnel-flow-value used">{{ formatFlow(calculateTunnelUsedFlow(scope.row)) }}</span>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="num" label="转发数量" width="100"></el-table-column>
            <el-table-column prop="speedLimitName" label="限速规则" width="120">
              <template slot-scope="scope">
                <el-tag v-if="scope.row.speedLimitName" type="warning" size="small">
                  {{ scope.row.speedLimitName }}
                </el-tag>
                <el-tag v-else type="success" size="small">不限速</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="expTime" label="到期时间" width="150">
              <template slot-scope="scope">
                {{ scope.row.expTime | dateFormat }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template slot-scope="scope">
                <el-button 
                  size="mini" 
                  type="primary" 
                  icon="el-icon-edit"
                  @click="handleEditTunnelPermission(scope.row)"
                >
                </el-button>
                <el-button 
                  size="mini" 
                  type="danger" 
                  icon="el-icon-delete"
                  @click="handleRemoveTunnelPermission(scope.row)"
                >
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 移动端卡片视图 -->
        <div class="mobile-view" v-loading="tunnelListLoading">
          <EmptyState 
            v-if="userTunnelList.length === 0 && !tunnelListLoading" 
            description="暂无隧道权限"
          />
          
          <div v-for="tunnel in userTunnelList" :key="tunnel.id" class="tunnel-card">
            <!-- 卡片头部 -->
            <div class="card-header">
              <div class="tunnel-info">
                <div class="tunnel-name">{{ tunnel.tunnelName }}</div>
                <div class="tunnel-meta">
                  <el-tag :type="tunnel.status === 1 ? 'success' : 'danger'" size="mini">
                    {{ tunnel.status === 1 ? '正常' : '禁用' }}
                  </el-tag>
                  <el-tag v-if="tunnel.speedLimitName" type="warning" size="mini" style="margin-left: 5px;">
                    {{ tunnel.speedLimitName }}
                  </el-tag>
                  <el-tag v-else type="success" size="mini" style="margin-left: 5px;">不限速</el-tag>
                </div>
              </div>
            </div>

            <!-- 卡片内容 -->
            <div class="card-content">
              <div class="tunnel-stats">
                <div class="stat-item">
                  <div class="stat-label">流量限制</div>
                  <div class="stat-value primary">{{ formatFlow(tunnel.flow, 'gb') }}</div>
                </div>
                <div class="stat-item">
                  <div class="stat-label">已使用</div>
                  <div class="stat-value danger">{{ formatFlow(calculateTunnelUsedFlow(tunnel)) }}</div>
                </div>
                <div class="stat-item">
                  <div class="stat-label">转发数量</div>
                  <div class="stat-value">{{ tunnel.num }}</div>
                </div>
              </div>
              
              <div class="tunnel-details">
                <div class="detail-item">
                  <span class="detail-label">流量重置</span>
                  <span class="detail-value">每月{{ tunnel.flowResetTime }}号</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">到期时间</span>
                  <span class="detail-value">{{ tunnel.expTime | dateFormat }}</span>
                </div>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="card-actions">
              <el-button 
                size="small" 
                type="primary" 
                icon="el-icon-edit"
                @click="handleEditTunnelPermission(tunnel)"
                plain
              >
                编辑
              </el-button>
              <el-button 
                size="small" 
                type="danger" 
                icon="el-icon-delete"
                @click="handleRemoveTunnelPermission(tunnel)"
                plain
              >
                删除
              </el-button>
            </div>
          </div>
        </div>
      </div>
      
      <span slot="footer" class="dialog-footer">
        <el-button @click="tunnelDialogVisible = false">关 闭</el-button>
      </span>
    </el-dialog>

    <!-- 编辑隧道权限对话框 -->
    <el-dialog 
      :title="`编辑隧道权限 - ${editTunnelForm.tunnelName}`" 
      :visible.sync="editTunnelDialogVisible" 
      width="50%"
      @close="resetEditTunnelForm"
    >
      <el-form :model="editTunnelForm" :rules="editTunnelRules" ref="editTunnelForm" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="流量限制(GB)" prop="flow">
              <el-input-number 
                v-model="editTunnelForm.flow" 
                :min="0" 
                :max="99999"
                placeholder="流量限制"
                style="width: 100%;"
              ></el-input-number>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="转发数量" prop="num">
              <el-input-number 
                v-model="editTunnelForm.num" 
                :min="0" 
                :max="9999"
                placeholder="转发数量"
                style="width: 100%;"
              ></el-input-number>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-form-item label="限速规则" prop="speedId">
          <el-select 
            v-model="editTunnelForm.speedId" 
            placeholder="请选择限速规则"
            style="width: 100%;"
            clearable
          >
            <el-option
              label="不限速"
              :value="null"
            ></el-option>
            <el-option
              v-for="speedLimit in editAvailableSpeedLimits"
              :key="speedLimit.id"
              :label="`${speedLimit.name}`"
              :value="speedLimit.id"
            ></el-option>
            <el-option
              v-if="editTunnelForm.tunnelId && editAvailableSpeedLimits.length === 0"
              label="该隧道暂无限速规则"
              :value="null"
              disabled
            ></el-option>
          </el-select>
          <div v-if="editTunnelForm.tunnelId && editAvailableSpeedLimits.length === 0" class="form-hint">
            该隧道暂无可用的限速规则，请先在限速管理中为该隧道创建限速规则
          </div>
        </el-form-item>
        
        <el-form-item label="流量重置日期" prop="flowResetTime">
          <el-select 
            v-model="editTunnelForm.flowResetTime" 
            placeholder="选择每月重置日期"
            style="width: 100%;"
          >
            <el-option
              v-for="day in 31"
              :key="day"
              :label="`每月${day}号（0点重置）`"
              :value="day"
            ></el-option>
          </el-select>
        </el-form-item>
        
        <el-form-item label="到期时间" prop="expTime">
          <el-date-picker
            v-model="editTunnelForm.expTime"
            type="datetime"
            placeholder="选择到期时间"
            style="width: 100%;"
            :picker-options="pickerOptions"
          >
          </el-date-picker>
        </el-form-item>
      </el-form>
      
      <span slot="footer" class="dialog-footer">
        <el-button @click="editTunnelDialogVisible = false">取 消</el-button>
        <el-button 
          type="primary" 
          @click="handleUpdateTunnelPermission"
          :loading="updateLoading"
        >
          确 定
        </el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { getAllUsers, createUser, updateUser, deleteUser, getTunnelList, assignUserTunnel, getUserTunnelList, removeUserTunnel, updateUserTunnelFlow, updateUserTunnel, getSpeedLimitList } from "@/api";
import EmptyState from "@/components/EmptyState.vue";

export default {
  name: "User",
  components: {
    EmptyState
  },
  data() {
    return {
      userList: [],
      loading: false,
      dialogVisible: false,
      dialogTitle: '',
      isEdit: false,
      submitLoading: false,
      searchKeyword: '',
      pagination: {
        current: 1,
        size: 10,
        total: 0
      },
      userForm: {
        id: null,
        user: '',
        pwd: '',
        status: 1,
        flow: 0,
        num: 0,
        expTime: null,
        flowResetTime: 1
      },
      rules: {
        user: [
          { required: true, message: '请输入用户名', trigger: 'blur' },
          { min: 3, message: '用户名长度至少3位', trigger: 'blur' }
        ],
        pwd: [
          { 
            validator: (rule, value, callback) => {
              if (!this.isEdit && (!value || value.trim() === '')) {
                callback(new Error('请输入密码'));
              } else if (value && value.length > 0 && value.length < 6) {
                callback(new Error('密码长度至少6位'));
              } else {
                callback();
              }
            }, 
            trigger: 'blur' 
          }
        ],
        status: [
          { required: true, message: '请选择状态', trigger: 'change' }
        ],
        flow: [
          { required: true, message: '请输入流量', trigger: 'blur' }
        ],
        num: [
          { required: true, message: '请输入转发数量', trigger: 'blur' }
        ],
        expTime: [
          { required: true, message: '请选择过期时间', trigger: 'change' }
        ],
        flowResetTime: [
          { required: true, message: '请选择流量重置日期', trigger: 'change' }
        ]
      },
      // 隧道权限管理相关数据
      tunnelDialogVisible: false,
      currentUser: {},
      userTunnelList: [],
      tunnelListLoading: false,
      assignLoading: false,
      allTunnels: [],
      tunnelForm: {
        tunnelId: null,
        flow: 100,
        flowResetTime: 1,
        expTime: null,
        speedId: null,
        num: 0
      },
      tunnelRules: {
        tunnelId: [
          { required: true, message: '请选择隧道', trigger: 'change' }
        ],
        flow: [
          { required: true, message: '请输入流量限制', trigger: 'blur' }
        ],
        num: [
          { required: true, message: '请输入转发数量', trigger: 'blur' }
        ],
        flowResetTime: [
          { required: true, message: '请选择流量重置日期', trigger: 'change' }
        ],
        expTime: [
          { required: true, message: '请选择到期时间', trigger: 'change' }
        ]
      },
      pickerOptions: {
        disabledDate(date) {
          return date.getTime() < Date.now() - 86400000; // 禁用今天之前的日期
        }
      },
      editTunnelDialogVisible: false,
      editTunnelForm: {
        id: null,
        tunnelId: null,
        tunnelName: '',
        flow: 100,
        flowResetTime: 1,
        expTime: null,
        speedId: null,
        num: 0
      },
      editTunnelRules: {
        flow: [
          { required: true, message: '请输入流量限制', trigger: 'blur' }
        ],
        num: [
          { required: true, message: '请输入转发数量', trigger: 'blur' }
        ],
        flowResetTime: [
          { required: true, message: '请选择流量重置日期', trigger: 'change' }
        ],
        expTime: [
          { required: true, message: '请选择到期时间', trigger: 'change' }
        ]
      },
      updateLoading: false,
      speedLimitList: []
    };
  },
  computed: {
    // 可分配的隧道列表（排除已分配的）
    availableTunnels() {
      const assignedTunnelIds = this.userTunnelList.map(item => item.tunnelId);
      return this.allTunnels.filter(tunnel => !assignedTunnelIds.includes(tunnel.id));
    },
    
    // 根据选择的隧道过滤限速规则（分配新权限时使用）
    availableSpeedLimits() {
      if (!this.tunnelForm.tunnelId) {
        return [];
      }
      return this.speedLimitList.filter(speedLimit => speedLimit.tunnelId === this.tunnelForm.tunnelId);
    },
    
    // 根据编辑的隧道过滤限速规则（编辑权限时使用）
    editAvailableSpeedLimits() {
      if (!this.editTunnelForm.tunnelId) {
        return [];
      }
      return this.speedLimitList.filter(speedLimit => speedLimit.tunnelId === this.editTunnelForm.tunnelId);
    }
  },
  mounted() {
    this.getUserList();
    this.getTunnelList();
    this.getSpeedLimitList();
  },
  methods: {
    // 获取用户列表
    getUserList() {
      this.loading = true;
      const params = {
        current: this.pagination.current,
        size: this.pagination.size,
        keyword: this.searchKeyword
      };
      
      getAllUsers(params).then(res => {
        this.loading = false;
        if (res.code !== 0) {
          return this.$message.error(res.msg);
        }
        
        const data = res.data || {};
        this.userList = data.records || [];
        this.pagination.total = data.total || 0;
        this.pagination.current = data.current || 1;
        this.pagination.size = data.size || 10;
      }).catch(() => {
        this.loading = false;
        this.$message.error('获取用户列表失败');
      });
    },

    // 获取隧道列表
    getTunnelList() {
      getTunnelList().then(res => {
        if (res.code === 0) {
          this.allTunnels = res.data || [];
        }
      }).catch(() => {
        console.error('获取隧道列表失败');
      });
    },
    
    // 搜索
    handleSearch() {
      this.pagination.current = 1; // 重置到第一页
      this.getUserList();
    },
    
    // 每页条数改变
    handleSizeChange(size) {
      this.pagination.size = size;
      this.pagination.current = 1; // 重置到第一页
      this.getUserList();
    },
    
    // 当前页改变
    handleCurrentChange(current) {
      this.pagination.current = current;
      this.getUserList();
    },
    
    // 新增用户
    handleAdd() {
      this.dialogTitle = '新增用户';
      this.isEdit = false;
      this.dialogVisible = true;
    },
    
    // 编辑用户
    handleEdit(row) {
      this.dialogTitle = '编辑用户';
      this.isEdit = true;
      this.userForm = {
        id: row.id,
        name: row.name,
        user: row.user,
        pwd: '',
        status: row.status,
        flow: row.flow,
        num: row.num,
        expTime: row.expTime ? new Date(row.expTime) : null,
        flowResetTime: row.flowResetTime || 1
      };
      this.dialogVisible = true;
    },

    // 分配隧道权限
    handleAssignTunnel(row) {
      this.currentUser = row;
      this.tunnelDialogVisible = true;
      this.getUserTunnelList();
      // 设置默认时间为下个月的今天
      this.setDefaultTimes();
    },

    // 设置默认时间为下个月的今天
    setDefaultTimes() {
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes());
      // 流量重置时间现在是数字选择，不需要设置
      this.tunnelForm.expTime = nextMonth;
    },
    
    // 删除用户
    handleDelete(row) {
      this.$confirm(`确定要删除用户 "${row.user}" 吗？`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        deleteUser(row.id).then(res => {
          if (res.code !== 0) {
            return this.$message.error(res.msg);
          }
          this.$message.success('删除成功');
          this.getUserList();
        }).catch(() => {
          this.$message.error('删除失败');
        });
      });
    },
    
    // 提交表单
    handleSubmit() {
      this.$refs.userForm.validate(valid => {
        if (valid) {
          this.submitLoading = true;
          
          const apiCall = this.isEdit ? updateUser : createUser;
          const submitData = { ...this.userForm };
          
          // 如果是编辑且密码为空，则不提交密码字段
          if (this.isEdit && !submitData.pwd) {
            delete submitData.pwd;
          }
          
          // 转换过期时间为时间戳
          if (submitData.expTime) {
            submitData.expTime = submitData.expTime.getTime();
          }
          
          // 流量重置时间现在是数字（几号），直接使用
          
          apiCall(submitData).then(res => {
            this.submitLoading = false;
            if (res.code !== 0) {
              return this.$message.error(res.msg);
            }
            
            this.$message.success(this.isEdit ? '更新成功' : '创建成功');
            this.dialogVisible = false;
            this.getUserList();
          }).catch(() => {
            this.submitLoading = false;
            this.$message.error(this.isEdit ? '更新失败' : '创建失败');
          });
        }
      });
    },

    // ============ 隧道权限管理相关方法 ============

    // 获取用户隧道权限列表
    getUserTunnelList() {
      this.tunnelListLoading = true;
      getUserTunnelList({ userId: this.currentUser.id }).then(res => {
        this.tunnelListLoading = false;
        if (res.code === 0) {
          this.userTunnelList = res.data || [];
        } else {
          this.$message.error(res.msg || '获取隧道权限列表失败');
        }
      }).catch(() => {
        this.tunnelListLoading = false;
        this.$message.error('获取隧道权限列表失败');
      });
    },

    // 分配隧道权限
    handleAssignTunnelPermission() {
      this.$refs.tunnelForm.validate(valid => {
        if (valid) {
          this.assignLoading = true;
          const data = {
            userId: this.currentUser.id,
            tunnelId: this.tunnelForm.tunnelId,
            flow: this.tunnelForm.flow,
            flowResetTime: this.tunnelForm.flowResetTime,
            expTime: this.tunnelForm.expTime.getTime(),
            speedId: this.tunnelForm.speedId,
            num: this.tunnelForm.num
          };
          
          assignUserTunnel(data).then(res => {
            this.assignLoading = false;
            if (res.code === 0) {
              this.$message.success('分配成功');
              this.resetTunnelForm();
              this.getUserTunnelList(); // 刷新列表
            } else {
              this.$message.error(res.msg || '分配失败');
            }
          }).catch(() => {
            this.assignLoading = false;
            this.$message.error('分配失败');
          });
        }
      });
    },

    // 删除隧道权限
    handleRemoveTunnelPermission(row) {
      this.$confirm(`确定要删除该隧道权限吗？`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        removeUserTunnel({ id: row.id }).then(res => {
          if (res.code === 0) {
            this.$message.success('删除成功');
            this.getUserTunnelList(); // 刷新列表
          } else {
            this.$message.error(res.msg || '删除失败');
          }
        }).catch(() => {
          this.$message.error('删除失败');
        });
      });
    },

    // 重置表单
    resetForm() {
      this.userForm = {
        id: null,
        name: '',
        user: '',
        pwd: '',
        status: 1,
        flow: 0,
        num: 0,
        expTime: null,
        flowResetTime: 1
      };
      if (this.$refs.userForm) {
        this.$refs.userForm.resetFields();
      }
    },

    // 重置隧道权限对话框
    resetTunnelDialog() {
      this.currentUser = {};
      this.userTunnelList = [];
      this.resetTunnelForm();
    },

    // 重置隧道分配表单
    resetTunnelForm() {
      this.tunnelForm = {
        tunnelId: null,
        flow: 100,
        flowResetTime: 1,
        expTime: null,
        speedId: null,
        num: 0
      };
      if (this.$refs.tunnelForm) {
        this.$refs.tunnelForm.resetFields();
      }
      // 重置后设置默认时间
      this.setDefaultTimes();
    },

    // 处理隧道选择变化
    handleTunnelChange() {
      // 当隧道选择变化时，清空限速规则选择
      this.tunnelForm.speedId = null;
    },

    // 编辑隧道权限
    handleEditTunnelPermission(row) {
      this.editTunnelForm = {
        id: row.id,
        tunnelId: row.tunnelId,
        tunnelName: row.tunnelName,
        flow: row.flow,
        flowResetTime: row.flowResetTime,
        expTime: new Date(row.expTime),
        speedId: row.speedId,
        num: row.num
      };
      this.editTunnelDialogVisible = true;
    },

    // 更新隧道权限
    handleUpdateTunnelPermission() {
      this.$refs.editTunnelForm.validate(valid => {
        if (valid) {
          this.updateLoading = true;
          const data = {
            id: this.editTunnelForm.id,
            flow: this.editTunnelForm.flow,
            flowResetTime: this.editTunnelForm.flowResetTime,
            expTime: this.editTunnelForm.expTime.getTime(),
            speedId: this.editTunnelForm.speedId,
            num: this.editTunnelForm.num
          };
          
          updateUserTunnel(data).then(res => {
            this.updateLoading = false;
            if (res.code === 0) {
              this.$message.success('更新成功');
              this.editTunnelDialogVisible = false;
              this.getUserTunnelList();
            } else {
              this.$message.error(res.msg || '更新失败');
            }
          }).catch(() => {
            this.updateLoading = false;
            this.$message.error('更新失败');
          });
        }
      });
    },

    // 重置编辑隧道权限表单
    resetEditTunnelForm() {
      this.editTunnelForm = {
        id: null,
        tunnelId: null,
        tunnelName: '',
        flow: 100,
        flowResetTime: 1,
        expTime: null,
        speedId: null,
        num: 0
      };
      if (this.$refs.editTunnelForm) {
        this.$refs.editTunnelForm.resetFields();
      }
    },

    // 获取限速规则列表
    getSpeedLimitList() {
      getSpeedLimitList().then(res => {
        if (res.code === 0) {
          this.speedLimitList = res.data || [];
        }
      }).catch(() => {
        console.error('获取限速规则列表失败');
      });
    },

    formatFlow(value, unit = 'bytes') {
      if (unit === 'gb') {
        // flow字段，单位是GB
        return value + ' GB';
      } else {
        // inFlow、outFlow字段，单位是字节
        if (value === 0) return '0 B';
        if (value < 1024) return value + ' B';
        if (value < 1024 * 1024) return (value / 1024).toFixed(2) + ' KB';
        if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(2) + ' MB';
        return (value / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      }
    },

    calculateFlowPercentage(row) {
      const totalUsedBytes = this.calculateTunnelUsedFlow(row);
      if (row.flow === 0) return 0;
      const flowLimitBytes = row.flow * 1024 * 1024 * 1024; // 将GB转换为字节
      const percentage = (totalUsedBytes / flowLimitBytes) * 100;
      return Math.min(percentage, 100); // 限制最大值为100%
    },

    getFlowStatus(row) {
      const percentage = this.calculateFlowPercentage(row);
      if (percentage >= 90) return 'exception';
      if (percentage >= 70) return 'warning';
      return 'success';
    },

    getExpTimeClass(expTime) {
      const now = new Date();
      const expDate = new Date(expTime);
      
      if (expDate < now) {
        // 已过期
        return 'exp-time-expired';
      }
      
      const diffTime = expDate - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 7) {
        return 'exp-time-soon';
      } else if (diffDays <= 30) {
        return 'exp-time-mid';
      } else {
        return 'exp-time-long';
      }
    },

         /**
      * 计算隧道已用流量
      * 根据隧道的流量计算类型（tunnelFlow）决定单向还是双向计算
      */
     calculateTunnelUsedFlow(tunnel) {
       if (!tunnel) return 0;
       
       const inFlow = tunnel.inFlow || 0;   // 下载流量
       const outFlow = tunnel.outFlow || 0; // 上传流量
       
       // tunnelFlow: 1-单向计算（仅上传），2-双向计算（上传+下载）
       if (tunnel.tunnelFlow === 1) {
         // 单向计算：只计算上传流量（outFlow）
         return outFlow;
       } else {
         // 双向计算或默认：计算上传和下载的总流量
         return inFlow + outFlow;
       }
     },

         /**
      * 计算用户总已用流量
      * 直接使用后端计算好的用户流量统计
      */
     calculateUserTotalUsedFlow(user) {
       // 后端已经根据隧道类型计算了实际流量，直接使用
       return (user.inFlow || 0) + (user.outFlow || 0);
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
.user-container {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
}

.add-btn {
  border-radius: 6px;
}

.list-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 20px;
}

/* 响应式视图控制 */
.desktop-view {
  display: block;
}

.mobile-view {
  display: none;
}

.pagination-container {
  margin-top: 20px;
  text-align: right;
}

/* 分页组件响应式控制 */
.desktop-pagination {
  display: block;
}

.mobile-pagination {
  display: none;
}

/* 对话框样式调整 */
.dialog-footer {
  text-align: right;
}

/* 隧道权限管理样式 */
.assign-section {
  margin-bottom: 20px;
}

.assign-section h4,
.permission-list-section h4 {
  margin-bottom: 15px;
  color: #333;
  font-weight: 600;
}

.permission-list-section {
  margin-top: 20px;
}

/* 移动端卡片样式 */
.user-card, .tunnel-card {
  background: white;
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  margin-bottom: 16px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.user-card:hover, .tunnel-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.card-header {
  padding: 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.user-info, .tunnel-info {
  flex: 1;
}

.user-name, .tunnel-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.user-account {
  font-size: 14px;
  color: #666;
}

.tunnel-meta {
  margin-top: 8px;
}

.user-status {
  display: flex;
  align-items: center;
}

.card-content {
  padding: 16px;
}

.info-section {
  margin-bottom: 16px;
}

.info-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e6e6e6;
}

.flow-info, .time-info {
  display: grid;
  gap: 8px;
}

.flow-item, .time-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 4px;
}

.label {
  font-size: 13px;
  color: #666;
  font-weight: 500;
}

.value {
  font-size: 13px;
  font-weight: 600;
  color: #333;
}

.value.primary {
  color: #409eff;
}

.value.danger {
  color: #f56c6c;
}

.value.success {
  color: #67c23a;
}

.card-actions {
  padding: 12px 16px;
  background: #f8f9fa;
  border-top: 1px solid #e6e6e6;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.card-actions .el-button {
  flex: 1;
  margin: 0;
  min-width: 80px;
}

/* 隧道卡片特有样式 */
.tunnel-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-item {
  text-align: center;
  padding: 12px 8px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e6e6e6;
}

.stat-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
  display: block;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.stat-value.primary {
  color: #409eff;
}

.stat-value.danger {
  color: #f56c6c;
}

.tunnel-details {
  display: grid;
  gap: 8px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 4px;
}

.detail-label {
  font-size: 13px;
  color: #666;
  font-weight: 500;
}

.detail-value {
  font-size: 13px;
  font-weight: 600;
  color: #333;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .user-container {
    padding: 10px;
  }
  
  .page-header {
    flex-direction: column;
    gap: 15px;
    align-items: stretch;
    padding: 16px;
  }
  
  .header-actions {
    flex-direction: column;
    gap: 10px;
  }
  
  .page-title {
    text-align: center;
    font-size: 20px;
  }
  
  .list-container {
    padding: 16px;
  }
  
  .pagination-container {
    text-align: center;
    margin-top: 16px;
    overflow-x: auto;
    padding: 0 10px;
  }
  
  /* 切换到移动端视图 */
  .desktop-view {
    display: none;
  }
  
  .mobile-view {
    display: block;
  }
  
  /* 分页组件移动端切换 */
  .desktop-pagination {
    display: none;
  }
  
  .mobile-pagination {
    display: block;
  }
  
  /* 移动端搜索框优化 */
  .header-actions .el-input {
    width: 100% !important;
    margin-right: 0 !important;
    margin-bottom: 10px;
  }
  
  /* 移动端分页优化 */
  .mobile-pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .mobile-pagination >>> .btn-prev {
    flex-shrink: 0;
  }
  
  .mobile-pagination >>> .el-pager {
    display: flex;
    flex: 1;
    justify-content: center;
    margin: 0 8px;
  }
  
  .mobile-pagination >>> .btn-next {
    flex-shrink: 0;
  }
  
  .mobile-pagination >>> .el-pager li {
    min-width: 30px;
    height: 30px;
    line-height: 30px;
    margin: 0 2px;
  }
  
  .mobile-pagination >>> .btn-prev,
  .mobile-pagination >>> .btn-next {
    min-width: 30px;
    height: 30px;
    line-height: 30px;
  }
  
  /* 移动端对话框优化 */
  .el-dialog {
    width: 95% !important;
    margin-top: 5vh !important;
  }
  
  .assign-section h4,
  .permission-list-section h4 {
    font-size: 16px;
    margin-bottom: 12px;
  }
  
  /* 移动端表单布局优化 - 分配新隧道权限部分 */
  .assign-section .el-row {
    flex-direction: column !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }
  
  .assign-section .el-col {
    width: 100% !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    margin-bottom: 15px;
  }
  
  .assign-section .el-col:last-child {
    margin-bottom: 0;
  }
  
  /* 移动端编辑隧道权限表单布局优化 */
  .el-dialog .el-row {
    flex-direction: column !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }
  
  .el-dialog .el-col {
    width: 100% !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    margin-bottom: 15px;
  }
  
  .el-dialog .el-col:last-child {
    margin-bottom: 0;
  }
  
      /* 隧道统计在小屏幕上的优化 */
    @media (max-width: 480px) {
      .tunnel-stats {
        grid-template-columns: 1fr;
        gap: 8px;
      }
      
      .stat-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        text-align: left;
        padding: 12px;
      }
      
      .stat-label {
        margin-bottom: 0;
      }
      
      .card-actions {
        flex-direction: column;
      }
      
      .card-actions .el-button {
        width: 100%;
      }
      
      /* 超小屏幕分页优化 */
      .mobile-pagination >>> .el-pager li {
        min-width: 25px;
        height: 25px;
        line-height: 25px;
        margin: 0 1px;
        font-size: 12px;
      }
      
      .mobile-pagination >>> .btn-prev,
      .mobile-pagination >>> .btn-next {
        min-width: 25px;
        height: 25px;
        line-height: 25px;
        font-size: 12px;
      }
      
      .pagination-container {
        padding: 0 5px;
      }
    }
}

/* 表格样式优化 */
.list-container >>> .el-table th {
  background-color: #fafafa;
}

.list-container >>> .el-table--border td,
.list-container >>> .el-table--border th {
  border-right: 1px solid #ebeef5;
}

/* 表单提示信息样式 */
.form-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
  line-height: 1.4;
}

/* 按钮样式调整 */
.list-container >>> .el-button--mini {
  padding: 5px 10px;
  margin: 0 2px;
}

/* 分页样式 */
.pagination-container >>> .el-pagination {
  padding: 0;
}

/* 流量统计样式 */
.flow-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.flow-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.flow-label {
  font-size: 12px;
  color: #909399;
  font-weight: 500;
}

.flow-value {
  font-size: 12px;
  font-weight: 600;
}

.flow-value.used {
  color: #F56C6C;
}

.flow-value.in {
  color: #67C23A;
}

.flow-value.out {
  color: #E6A23C;
}

/* 隧道流量统计样式 */
.tunnel-flow-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tunnel-flow-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tunnel-flow-label {
  font-size: 12px;
  color: #909399;
  font-weight: 500;
}

.tunnel-flow-value {
  font-size: 12px;
  font-weight: 600;
}

.tunnel-flow-value.used {
  color: #F56C6C;
}

.tunnel-flow-usage {
  margin-top: 4px;
}

/* 过期时间样式 */
.exp-time-expired {
  color: #F56C6C;
  font-weight: 700;
  text-decoration: line-through;
}

.exp-time-soon {
  color: #F56C6C;
  font-weight: 600;
}

.exp-time-mid {
  color: #E6A23C;
  font-weight: 500;
}

.exp-time-long {
  color: #67C23A;
  font-weight: 500;
}

.no-exptime {
  color: #909399;
  font-style: italic;
}

.no-reset-time {
  color: #909399;
  font-style: italic;
}
</style>