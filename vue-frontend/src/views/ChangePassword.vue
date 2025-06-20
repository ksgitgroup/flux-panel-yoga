<template>
    <div class="change-password-container">
      <!-- 背景装饰 -->
      <div class="bg-decoration">
        <div class="circle circle-1"></div>
        <div class="circle circle-2"></div>
        <div class="circle circle-3"></div>
      </div>
      
      <!-- 主要内容区域 -->
      <div class="change-password-wrapper">
        <!-- 修改密码表单 -->
        <div class="change-password-form-container">
          <div class="change-password-form">
            <div class="form-header">
              <div class="warning-icon">
                <i class="el-icon-warning" style="font-size: 50px; color: #E6A23C;"></i>
              </div>
                          <h2 class="form-title">安全提醒</h2>
            <p class="form-subtitle">检测到您使用的是默认账号密码，为了您的账户安全，请立即修改账号和密码</p>
            </div>
            
            <el-form 
              :model="passwordForm" 
              :rules="rules" 
              ref="passwordForm" 
              @keyup.enter.native="handleSubmit"
              class="change-password-form-content"
              label-width="100px"
            >
              <el-form-item label="新用户名" prop="newUsername">
                <div class="input-wrapper">
                  <el-input 
                    v-model="passwordForm.newUsername" 
                    placeholder="请输入新用户名（至少3位）" 
                    clearable
                    size="large"
                    class="custom-input"
                  ></el-input>
                </div>
              </el-form-item>
              
              <el-form-item label="当前密码" prop="currentPassword">
                <div class="input-wrapper">
                  <el-input 
                    v-model="passwordForm.currentPassword" 
                    type="password"
                    placeholder="请输入当前密码" 
                    show-password
                    size="large"
                    class="custom-input"
                  ></el-input>
                </div>
              </el-form-item>
              
              <el-form-item label="新密码" prop="newPassword">
                <div class="input-wrapper">
                  <el-input 
                    v-model="passwordForm.newPassword" 
                    type="password"
                    placeholder="请输入新密码（至少6位）" 
                    show-password
                    size="large"
                    class="custom-input"
                  ></el-input>
                </div>
              </el-form-item>
              
              <el-form-item label="确认密码" prop="confirmPassword">
                <div class="input-wrapper">
                  <el-input 
                    v-model="passwordForm.confirmPassword" 
                    type="password"
                    placeholder="请再次输入新密码" 
                    show-password
                    size="large"
                    class="custom-input"
                  ></el-input>
                </div>
              </el-form-item>
              
              <el-form-item class="change-password-btn-item">
                <el-button 
                  type="primary" 
                  :loading="loading" 
                  @click="handleSubmit" 
                  class="change-password-btn"
                  size="large"
                >
                  <span v-if="!loading">立即修改账号密码</span>
                  <span v-else>修改中...</span>
                </el-button>
              </el-form-item>
            </el-form>
            
            <div class="form-footer">
              <p class="warning-text">注意：修改账号密码后需要重新登录</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <script>
  import { updatePassword } from "@/api";
  
  export default {
  name: 'ChangeAccountPassword',
    data() {
      return {
        passwordForm: {
          newUsername: '',
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        },
        rules: {
          newUsername: [
            { required: true, message: '请输入新用户名', trigger: 'blur' },
            { min: 3, message: '用户名长度至少3位', trigger: 'blur' },
            { max: 20, message: '用户名长度不能超过20位', trigger: 'blur' }
          ],
          currentPassword: [
            { required: true, message: '请输入当前密码', trigger: 'blur' },
            { min: 1, message: '密码不能为空', trigger: 'blur' }
          ],
          newPassword: [
            { required: true, message: '请输入新密码', trigger: 'blur' },
            { min: 6, message: '新密码长度不能少于6位', trigger: 'blur' },
            { max: 20, message: '新密码长度不能超过20位', trigger: 'blur' }
          ],
          confirmPassword: [
            { required: true, message: '请再次输入新密码', trigger: 'blur' },
            { validator: this.validateConfirmPassword, trigger: 'blur' }
          ]
        },
        loading: false
      };
    },
    methods: {
      // 确认密码验证器
      validateConfirmPassword(rule, value, callback) {
        if (value === '') {
          callback(new Error('请再次输入密码'));
        } else if (value !== this.passwordForm.newPassword) {
          callback(new Error('两次输入密码不一致'));
        } else {
          callback();
        }
      },
      
      // 提交修改密码
      handleSubmit() {
        this.$refs.passwordForm.validate(async (valid) => {
          if (valid) {
            try {
              this.loading = true;
              
              // 调用修改密码接口
              const response = await updatePassword(this.passwordForm);
              
              if (response.code === 0) {
                this.$message.success(response.msg || '账号密码修改成功');
                
                // 提示用户重新登录
                this.$confirm('账号密码修改成功，请重新登录', '提示', {
                  confirmButtonText: '确定',
                  type: 'success',
                  showCancelButton: false,
                  closeOnClickModal: false,
                  closeOnPressEscape: false
                }).then(() => {
                  this.logout();
                }).catch(() => {
                  this.logout();
                });
              } else {
                this.$message.error(response.msg || '账号密码修改失败');
              }
            } catch (error) {
              this.$message.error('修改账号密码时发生错误');
              console.error('修改账号密码错误:', error);
            } finally {
              this.loading = false;
            }
          }
        });
      },
      
      // 退出登录
      logout() {
        localStorage.clear();
        this.$router.push("/login");
      }
    }
  };
  </script>
  
  <style scoped>
  .change-password-container {
    height: 100vh;
    width: 100vw;
    position: relative;
    overflow: hidden;
    background: linear-gradient(135deg, #E6A23C 0%, #F56C6C 100%);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  /* 背景装饰 */
  .bg-decoration {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    z-index: 1;
  }
  
  .circle {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    animation: float 6s ease-in-out infinite;
  }
  
  .circle-1 {
    width: 200px;
    height: 200px;
    top: 10%;
    left: 10%;
    animation-delay: 0s;
  }
  
  .circle-2 {
    width: 150px;
    height: 150px;
    top: 60%;
    right: 15%;
    animation-delay: 2s;
  }
  
  .circle-3 {
    width: 100px;
    height: 100px;
    bottom: 20%;
    left: 20%;
    animation-delay: 4s;
  }
  
  @keyframes float {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    50% { transform: translateY(-20px) rotate(180deg); }
  }
  
  /* 主要内容区域 */
  .change-password-wrapper {
    position: relative;
    z-index: 2;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    max-width: 600px;
  }
  
  /* 修改密码表单 */
  .change-password-form-container {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
  }
  
  .change-password-form {
    width: 100%;
    max-width: 500px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 20px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
    padding: 40px;
    backdrop-filter: blur(10px);
  }
  
  .form-header {
    text-align: center;
    margin-bottom: 40px;
  }
  
  .warning-icon {
    margin-bottom: 15px;
  }
  
  .form-title {
    font-size: 2rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.5rem;
  }
  
  .form-subtitle {
    color: #6b7280;
    font-size: 1rem;
    margin: 0;
    line-height: 1.5;
  }
  
  .change-password-form-content {
    margin-bottom: 30px;
  }
  
  .input-wrapper {
    position: relative;
    margin-bottom: 20px;
  }
  
  /* 自定义输入框样式 */
  .custom-input >>> .el-input__inner {
    height: 50px;
    border-radius: 12px;
    border: 2px solid #e5e7eb;
    font-size: 16px;
    padding-left: 15px;
    transition: all 0.3s ease;
    background: #f9fafb;
  }
  
  .custom-input >>> .el-input__inner:focus {
    border-color: #E6A23C;
    background: white;
    box-shadow: 0 0 0 3px rgba(230, 162, 60, 0.1);
  }
  
  .custom-input >>> .el-input__suffix {
    right: 15px;
  }
  
  /* 修改密码按钮 */
  .change-password-btn-item {
    margin-bottom: 0;
  }
  
  .change-password-btn {
    width: 100%;
    height: 50px;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    background: linear-gradient(135deg, #E6A23C 0%, #F56C6C 100%);
    border: none;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(230, 162, 60, 0.4);
  }
  
  .change-password-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(230, 162, 60, 0.6);
  }
  
  .change-password-btn:active {
    transform: translateY(0);
  }
  
  /* 表单底部 */
  .form-footer {
    text-align: center;
    margin-top: 30px;
  }
  
  .warning-text {
    color: #F56C6C;
    font-size: 0.875rem;
    margin: 0 0 10px 0;
    font-weight: 600;
  }
  
  .copyright {
    color: #9ca3af;
    font-size: 0.875rem;
    margin: 0;
  }
  
  /* 响应式设计 */
  @media (max-width: 768px) {
    .change-password-form-container {
      padding: 20px;
    }
    
    .change-password-form {
      padding: 30px 20px;
    }
    
    .form-title {
      font-size: 1.5rem;
    }
  }
  
  /* 表单验证错误样式 */
  .change-password-form-content >>> .el-form-item__error {
    font-size: 14px;
    color: #ef4444;
    margin-top: 5px;
  }
  
  /* 加载状态 */
  .change-password-btn.is-loading {
    pointer-events: none;
  }
  </style>