<template>
  <div class="unified-empty-state" :class="{ 'small': size === 'small', 'large': size === 'large' }">
    <el-empty 
      :description="description" 
      :image-size="computedImageSize"
      :image="image"
    >
      <template #description>
        <p class="empty-description">{{ description }}</p>
      </template>
      <slot></slot>
    </el-empty>
  </div>
</template>

<script>
export default {
  name: 'EmptyState',
  props: {
    description: {
      type: String,
      default: '暂无数据'
    },
    size: {
      type: String,
      default: 'default', // 'small', 'default', 'large'
      validator: value => ['small', 'default', 'large'].includes(value)
    },
    image: {
      type: String,
      default: undefined
    },
    imageSize: {
      type: Number,
      default: undefined
    }
  },
  computed: {
    computedImageSize() {
      if (this.imageSize) return this.imageSize;
      
      switch (this.size) {
        case 'small':
          return 80;
        case 'large':
          return 120;
        default:
          return 100;
      }
    }
  }
}
</script>

<style scoped>
.unified-empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  padding: 20px;
  width: 100%;
}

.unified-empty-state.small {
  min-height: 150px;
  padding: 15px;
}

.unified-empty-state.large {
  min-height: 250px;
  padding: 30px;
}

.empty-description {
  color: #909399;
  font-size: 14px;
  margin: 0;
  line-height: 1.4;
}

/* 针对网格布局的支持 */
.unified-empty-state {
  grid-column: 1 / -1;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .unified-empty-state {
    min-height: 150px;
    padding: 15px 10px;
  }
  
  .unified-empty-state.small {
    min-height: 120px;
    padding: 10px;
  }
  
  .unified-empty-state.large {
    min-height: 180px;
    padding: 20px 15px;
  }
  
  .empty-description {
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .unified-empty-state {
    min-height: 120px;
    padding: 10px 8px;
  }
  
  .unified-empty-state.small {
    min-height: 100px;
    padding: 8px;
  }
  
  .unified-empty-state.large {
    min-height: 150px;
    padding: 15px 10px;
  }
  
  .empty-description {
    font-size: 12px;
  }
}
</style> 