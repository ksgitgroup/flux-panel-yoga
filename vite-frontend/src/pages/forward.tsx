import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Switch } from "@heroui/switch";
import { Alert } from "@heroui/alert";
import { Accordion, AccordionItem } from "@heroui/accordion";
import { Divider } from "@heroui/divider";
import { Tabs, Tab } from "@heroui/tabs";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { SpeedBadge } from "@/components/SpeedBadge";
import toast from 'react-hot-toast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


import {
  createForward,
  getForwardList,
  updateForward,
  deleteForward,
  forceDeleteForward,
  userTunnel,
  pauseForwardService,
  resumeForwardService,
  diagnoseForward,
  updateForwardOrder,
  batchUpdateForward,
  getDiagnosisLatestBatch,
  getProtocolList,
  getTagList,
  createTag
} from "@/api";
import { getDiagnosisHistory } from "@/api";
import { JwtUtil } from "@/utils/jwt";

interface Protocol {
  id: number;
  name: string;
}

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface Forward {
  id: number;
  name: string;
  tunnelId: number;
  tunnelName: string;
  inIp: string;
  inPort: number;
  remoteAddr: string;
  interfaceName?: string;
  strategy: string;
  status: number;
  inFlow: number;
  outFlow: number;
  serviceRunning: boolean;
  createdTime: string;
  userName?: string;
  userId?: number;
  inx?: number;
  protocolId?: number;
  tagIds?: string;
}

interface Tunnel {
  id: number;
  name: string;
  inNodePortSta?: number;
  inNodePortEnd?: number;
}

interface ForwardForm {
  id?: number;
  userId?: number;
  name: string;
  tunnelId: number | null;
  inPort: number | null;
  remoteAddr: string;
  interfaceName?: string;
  strategy: string;
  protocolId: number | null;
  tagIds: string[];
}

interface AddressItem {
  id: number;
  address: string;
  copying: boolean;
}

interface DiagnosisResult {
  forwardName: string;
  timestamp: number;
  results: Array<{
    success: boolean;
    description: string;
    nodeName: string;
    nodeId: string;
    targetIp: string;
    targetPort?: number;
    message?: string;
    averageTime?: number;
    packetLoss?: number;
  }>;
}

interface DiagnosisHistoryItem {
  id: number;
  overallSuccess: boolean;
  resultsJson: string;
  averageTime?: number;
  packetLoss?: number;
  createdTime: number;
}

interface DiagnosisBatchItem {
  id: number;
  targetType: string;
  targetId: number;
  targetName: string;
  overallSuccess: boolean;
  resultsJson?: string;
  averageTime?: number;
  packetLoss?: number;
  createdTime: number;
  history?: DiagnosisHistoryItem[];
}

// 添加分组接口
interface UserGroup {
  userId: number | null;
  userName: string;
  tunnelGroups: TunnelGroup[];
}

interface TunnelGroup {
  tunnelId: number;
  tunnelName: string;
  forwards: Forward[];
}

const splitTagIds = (tagIds?: string | null): string[] =>
  tagIds ? tagIds.split(',').map((id) => id.trim()).filter(Boolean) : [];

const getTagChipColor = (color?: string): "default" | "primary" | "secondary" | "success" | "warning" | "danger" => {
  const validColors = new Set(["default", "primary", "secondary", "success", "warning", "danger"]);
  return validColors.has(color || "") ? (color as "default" | "primary" | "secondary" | "success" | "warning" | "danger") : "default";
};

const getTagDotClass = (color?: string) => {
  switch (color) {
    case "primary":
      return "bg-primary";
    case "secondary":
      return "bg-secondary";
    case "success":
      return "bg-success";
    case "warning":
      return "bg-warning";
    case "danger":
      return "bg-danger";
    default:
      return "bg-default-400";
  }
};

export default function ForwardPage() {
  const [loading, setLoading] = useState(true);
  const [forwards, setForwards] = useState<Forward[]>([]);
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // 快速创建标签
  const createQuickTag = async (name: string) => {
    try {
      const res = await createTag({ name, color: 'primary' });
      if (res.code === 0) {
        toast.success('标签创建成功');
        // 重新加载标签列表
        const tagsRes = await getTagList();
        if (tagsRes.code === 0) {
          setTags(tagsRes.data);
          // 自动选中新创建的标签
          const newTag = tagsRes.data.find((t: Tag) => t.name === name);
          if (newTag) {
            setForm(prev => ({
              ...prev,
              tagIds: [...(prev.tagIds || []), newTag.id.toString()]
            }));
          }
        }
      } else {
        toast.error('创建标签失败: ' + res.msg);
      }
    } catch (error) {
      console.error('快速创建标签出错:', error);
      toast.error('网络错误，创建失败');
    }
  };

  // 检测是否为移动端
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 显示模式状态 - 从localStorage读取，默认为平铺显示
  const [viewMode, setViewMode] = useState<'grouped' | 'direct'>(() => {
    try {
      const savedMode = localStorage.getItem('forward-view-mode');
      return (savedMode as 'grouped' | 'direct') || 'direct';
    } catch {
      return 'direct';
    }
  });

  // 拖拽排序相关状态
  const [forwardOrder, setForwardOrder] = useState<number[]>([]);

  // 搜索关键字状态
  const [searchKeyword, setSearchKeyword] = useState("");

  // 高级筛选状态
  const [tunnelFilter, setTunnelFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'paused'>('all');
  const [healthFilter, setHealthFilter] = useState<'all' | 'healthy' | 'unhealthy' | 'unknown'>('all');
  const [protocolFilter, setProtocolFilter] = useState<number | null>(null);
  const [tagFilters, setTagFilters] = useState<string[]>([]);

  // 批量选择状态
  const [selectedForwardIds, setSelectedForwardIds] = useState<number[]>([]);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchUpdateType, setBatchUpdateType] = useState<'protocol' | 'tag' | null>(null);
  const [batchProtocolId, setBatchProtocolId] = useState<number | null>(null);
  const [batchTagIds, setBatchTagIds] = useState<string[]>([]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const toggleSelect = (id: number) => {
    setSelectedForwardIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // 诊断数据映射 (forwardId -> DiagnosisBatchItem)
  const [diagnosisMap, setDiagnosisMap] = useState<Record<number, DiagnosisBatchItem>>({});

  // 模态框状态
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [diagnosisModalOpen, setDiagnosisModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [forwardToDelete, setForwardToDelete] = useState<Forward | null>(null);
  const [currentDiagnosisForward, setCurrentDiagnosisForward] = useState<Forward | null>(null);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [diagnosisHistory, setDiagnosisHistory] = useState<DiagnosisHistoryItem[]>([]);
  const [_historyLoading, setHistoryLoading] = useState(false);
  const [addressModalTitle, setAddressModalTitle] = useState('');
  const [addressList, setAddressList] = useState<AddressItem[]>([]);

  // 导出相关状态
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportData, setExportData] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [selectedTunnelForExport, setSelectedTunnelForExport] = useState<number | null>(null);

  // 导入相关状态
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [selectedTunnelForImport, setSelectedTunnelForImport] = useState<number | null>(null);
  const [importResults, setImportResults] = useState<Array<{
    line: string;
    success: boolean;
    message: string;
    forwardName?: string;
  }>>([]);

  // 表单状态
  const [form, setForm] = useState<ForwardForm>({
    name: '',
    tunnelId: null,
    inPort: null,
    remoteAddr: '',
    interfaceName: '',
    strategy: 'fifo',
    protocolId: null,
    tagIds: []
  });

  // 表单验证错误
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [selectedTunnel, setSelectedTunnel] = useState<Tunnel | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setSelectedForwardIds((prev) => prev.filter((id) => forwards.some((forward) => forward.id === id)));
  }, [forwards]);

  // 切换显示模式并保存到localStorage
  const handleViewModeChange = () => {
    const newMode = viewMode === 'grouped' ? 'direct' : 'grouped';
    setViewMode(newMode);
    try {
      localStorage.setItem('forward-view-mode', newMode);

      // 切换到直接显示模式时，初始化拖拽排序顺序
      if (newMode === 'direct') {
        // 在平铺模式下，只对当前用户的转发进行排序
        const currentUserId = JwtUtil.getUserIdFromToken();
        let userForwards = forwards;
        if (currentUserId !== null) {
          userForwards = forwards.filter((f: Forward) => f.userId === currentUserId);
        }

        // 检查数据库中是否有排序信息
        const hasDbOrdering = userForwards.some((f: Forward) => f.inx !== undefined && f.inx !== 0);

        if (hasDbOrdering) {
          // 使用数据库中的排序信息
          const dbOrder = userForwards
            .sort((a: Forward, b: Forward) => (a.inx ?? 0) - (b.inx ?? 0))
            .map((f: Forward) => f.id);
          setForwardOrder(dbOrder);

          // 同步到localStorage
          try {
            localStorage.setItem('forward-order', JSON.stringify(dbOrder));
          } catch (error) {
            console.warn('无法保存排序到localStorage:', error);
          }
        } else {
          // 使用本地存储的顺序
          const savedOrder = localStorage.getItem('forward-order');
          if (savedOrder) {
            try {
              const orderIds = JSON.parse(savedOrder);
              const validOrder = orderIds.filter((id: number) =>
                userForwards.some((f: Forward) => f.id === id)
              );
              userForwards.forEach((forward: Forward) => {
                if (!validOrder.includes(forward.id)) {
                  validOrder.push(forward.id);
                }
              });
              setForwardOrder(validOrder);
            } catch {
              setForwardOrder(userForwards.map((f: Forward) => f.id));
            }
          } else {
            setForwardOrder(userForwards.map((f: Forward) => f.id));
          }
        }
      }
    } catch (error) {
      console.warn('无法保存显示模式到localStorage:', error);
    }
  };

  const loadData = async (lod = true) => {
    setLoading(lod);
    try {
      const [forwardsRes, tunnelsRes, protocolsRes, tagsRes] = await Promise.all([
        getForwardList(),
        userTunnel(),
        getProtocolList(),
        getTagList()
      ]);

      if (forwardsRes.code === 0) {
        const forwardsData: Forward[] = forwardsRes.data?.map((forward: any) => ({
          ...forward,
          serviceRunning: forward.status === 1
        })) || [];
        setForwards(forwardsData);

        // 加载诊断数据
        loadDiagnosisData(forwardsData);

        // 初始化拖拽排序顺序
        if (viewMode === 'direct') {
          // 在平铺模式下，只对当前用户的转发进行排序
          const currentUserId = JwtUtil.getUserIdFromToken();
          let userForwards = forwardsData;
          if (currentUserId !== null) {
            userForwards = forwardsData.filter((f: Forward) => f.userId === currentUserId);
          }

          // 检查数据库中是否有排序信息
          const hasDbOrdering = userForwards.some((f: Forward) => f.inx !== undefined && f.inx !== 0);

          if (hasDbOrdering) {
            // 使用数据库中的排序信息
            const dbOrder = userForwards
              .sort((a: Forward, b: Forward) => (a.inx ?? 0) - (b.inx ?? 0))
              .map((f: Forward) => f.id);
            setForwardOrder(dbOrder);

            // 同步到localStorage
            try {
              localStorage.setItem('forward-order', JSON.stringify(dbOrder));
            } catch (error) {
              console.warn('无法保存排序到localStorage:', error);
            }
          } else {
            // 使用本地存储的顺序
            const savedOrder = localStorage.getItem('forward-order');
            if (savedOrder) {
              try {
                const orderIds = JSON.parse(savedOrder);
                // 验证保存的顺序是否仍然有效（只包含当前用户的转发）
                const validOrder = orderIds.filter((id: number) =>
                  userForwards.some((f: Forward) => f.id === id)
                );
                // 添加新的转发ID（如果存在）
                userForwards.forEach((forward: Forward) => {
                  if (!validOrder.includes(forward.id)) {
                    validOrder.push(forward.id);
                  }
                });
                setForwardOrder(validOrder);
              } catch {
                setForwardOrder(userForwards.map((f: Forward) => f.id));
              }
            } else {
              setForwardOrder(userForwards.map((f: Forward) => f.id));
            }
          }
        }
      } else {
        toast.error(forwardsRes.msg || '获取转发列表失败');
      }

      if (tunnelsRes.code === 0) {
        setTunnels(tunnelsRes.data || []);
      } else {
        console.warn('获取隧道列表失败:', tunnelsRes.msg);
      }

      if (protocolsRes.code === 0) setProtocols(protocolsRes.data || []);
      if (tagsRes.code === 0) setTags(tagsRes.data || []);
    } catch (error) {
      console.error('加载数据失败:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载批量诊断数据
  const loadDiagnosisData = async (forwardsData: Forward[]) => {
    try {
      const ids = forwardsData.map(f => f.id);
      if (ids.length === 0) return;
      const resp = await getDiagnosisLatestBatch({ targetType: 'forward', targetIds: ids });
      if (resp.code === 0 && resp.data) {
        setDiagnosisMap(resp.data);
      }
    } catch {
      // silent
    }
  };

  // 按用户和隧道分组转发数据
  const groupForwardsByUserAndTunnel = (sourceForwards: Forward[] = getSortedForwards()): UserGroup[] => {
    const userMap = new Map<string, UserGroup>();

    sourceForwards.forEach(forward => {
      const userKey = forward.userId ? forward.userId.toString() : 'unknown';
      const userName = forward.userName || '未知用户';

      if (!userMap.has(userKey)) {
        userMap.set(userKey, {
          userId: forward.userId || null,
          userName,
          tunnelGroups: []
        });
      }

      const userGroup = userMap.get(userKey)!;
      let tunnelGroup = userGroup.tunnelGroups.find(tg => tg.tunnelId === forward.tunnelId);

      if (!tunnelGroup) {
        tunnelGroup = {
          tunnelId: forward.tunnelId,
          tunnelName: forward.tunnelName,
          forwards: []
        };
        userGroup.tunnelGroups.push(tunnelGroup);
      }

      tunnelGroup.forwards.push(forward);
    });

    // 排序：先按用户名，再按隧道名
    const result = Array.from(userMap.values());
    result.sort((a, b) => a.userName.localeCompare(b.userName));
    result.forEach(userGroup => {
      userGroup.tunnelGroups.sort((a, b) => a.tunnelName.localeCompare(b.tunnelName));
    });

    return result;
  };

  // 表单验证
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!form.name.trim()) {
      newErrors.name = '请输入转发名称';
    } else if (form.name.length < 2 || form.name.length > 50) {
      newErrors.name = '转发名称长度应在2-50个字符之间';
    }

    if (!form.tunnelId) {
      newErrors.tunnelId = '请选择关联隧道';
    }

    if (!form.remoteAddr.trim()) {
      newErrors.remoteAddr = '请输入远程地址';
    } else {
      // 验证地址格式
      const addresses = form.remoteAddr.split('\n').map(addr => addr.trim()).filter(addr => addr);
      const ipv4Pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?):\d+$/;
      const ipv6FullPattern = /^\[((([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4}|:))|(([0-9a-fA-F]{1,4}:){6}(:[0-9a-fA-F]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-fA-F]{1,4}:){5}(((:[0-9a-fA-F]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-fA-F]{1,4}:){4}(((:[0-9a-fA-F]{1,4}){1,3})|((:[0-9a-fA-F]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){3}(((:[0-9a-fA-F]{1,4}){1,4})|((:[0-9a-fA-F]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){2}(((:[0-9a-fA-F]{1,4}){1,5})|((:[0-9a-fA-F]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-fA-F]{1,4}:){1}(((:[0-9a-fA-F]{1,4}){1,6})|((:[0-9a-fA-F]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-fA-F]{1,4}){1,7})|((:[0-9a-fA-F]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))\]:\d+$/;
      const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*:\d+$/;

      for (let i = 0; i < addresses.length; i++) {
        const addr = addresses[i];
        if (!ipv4Pattern.test(addr) && !ipv6FullPattern.test(addr) && !domainPattern.test(addr)) {
          newErrors.remoteAddr = `第${i + 1}行地址格式错误`;
          break;
        }
      }
    }

    if (form.inPort !== null && (form.inPort < 1 || form.inPort > 65535)) {
      newErrors.inPort = '端口号必须在1-65535之间';
    }

    if (selectedTunnel && selectedTunnel.inNodePortSta && selectedTunnel.inNodePortEnd && form.inPort) {
      if (form.inPort < selectedTunnel.inNodePortSta || form.inPort > selectedTunnel.inNodePortEnd) {
        newErrors.inPort = `端口号必须在${selectedTunnel.inNodePortSta}-${selectedTunnel.inNodePortEnd}范围内`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 新增转发
  const handleAdd = () => {
    setIsEdit(false);
    setForm({
      name: '',
      tunnelId: null,
      inPort: null,
      remoteAddr: '',
      interfaceName: '',
      strategy: 'fifo',
      protocolId: null,
      tagIds: []
    });
    setSelectedTunnel(null);
    setErrors({});
    setModalOpen(true);
  };

  // 编辑转发
  const handleEdit = (forward: Forward) => {
    setIsEdit(true);
    setForm({
      id: forward.id,
      userId: forward.userId,
      name: forward.name,
      tunnelId: forward.tunnelId,
      inPort: forward.inPort,
      remoteAddr: forward.remoteAddr.split(',').join('\n'),
      interfaceName: forward.interfaceName || '',
      strategy: forward.strategy || 'fifo',
      protocolId: forward.protocolId || null,
      tagIds: forward.tagIds ? forward.tagIds.split(',').filter(Boolean) : []
    });
    const tunnel = tunnels.find(t => t.id === forward.tunnelId);
    setSelectedTunnel(tunnel || null);
    setErrors({});
    setModalOpen(true);
  };

  // 复制转发（打开新建弹窗，预填原转发配置供重命名）
  const handleCopy = (forward: Forward) => {
    setIsEdit(false);
    setForm({
      name: forward.name + ' (副本)',
      tunnelId: forward.tunnelId,
      inPort: null, // 不复制端口，让系统自动分配
      remoteAddr: forward.remoteAddr.split(',').join('\n'),
      interfaceName: forward.interfaceName || '',
      strategy: forward.strategy || 'fifo',
      protocolId: forward.protocolId || null,
      tagIds: forward.tagIds ? forward.tagIds.split(',').filter(Boolean) : []
    });
    const tunnel = tunnels.find(t => t.id === forward.tunnelId);
    setSelectedTunnel(tunnel || null);
    setErrors({});
    setModalOpen(true);
  };

  // 显示删除确认
  const handleDelete = (forward: Forward) => {
    setForwardToDelete(forward);
    setDeleteModalOpen(true);
  };

  // 确认删除转发
  const confirmDelete = async () => {
    if (!forwardToDelete) return;

    setDeleteLoading(true);
    try {
      const res = await deleteForward(forwardToDelete.id);
      if (res.code === 0) {
        toast.success('删除成功');
        setDeleteModalOpen(false);
        loadData();
      } else {
        // 删除失败，询问是否强制删除
        const confirmed = window.confirm(`常规删除失败：${res.msg || '删除失败'}\n\n是否需要强制删除？\n\n⚠️ 注意：强制删除不会去验证节点端是否已经删除对应的转发服务。`);
        if (confirmed) {
          const forceRes = await forceDeleteForward(forwardToDelete.id);
          if (forceRes.code === 0) {
            toast.success('强制删除成功');
            setDeleteModalOpen(false);
            loadData();
          } else {
            toast.error(forceRes.msg || '强制删除失败');
          }
        }
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  // 处理隧道选择变化
  const handleTunnelChange = (tunnelId: string) => {
    const tunnel = tunnels.find(t => t.id === parseInt(tunnelId));
    setSelectedTunnel(tunnel || null);
    setForm(prev => ({ ...prev, tunnelId: parseInt(tunnelId) }));
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitLoading(true);
    try {
      const processedRemoteAddr = form.remoteAddr
        .split('\n')
        .map(addr => addr.trim())
        .filter(addr => addr)
        .join(',');

      const addressCount = processedRemoteAddr.split(',').length;

      let res;
      if (isEdit) {
        // 更新时确保包含必要字段
        const updateData = {
          id: form.id,
          userId: form.userId,
          name: form.name,
          tunnelId: form.tunnelId,
          inPort: form.inPort,
          remoteAddr: processedRemoteAddr,
          interfaceName: form.interfaceName,
          strategy: addressCount > 1 ? form.strategy : 'fifo',
          protocolId: form.protocolId,
          tagIds: form.tagIds ? form.tagIds.join(',') : null
        };
        res = await updateForward(updateData);
      } else {
        // 创建时不需要id和userId（后端会自动设置）
        const createData = {
          name: form.name,
          tunnelId: form.tunnelId,
          inPort: form.inPort,
          remoteAddr: processedRemoteAddr,
          interfaceName: form.interfaceName,
          strategy: addressCount > 1 ? form.strategy : 'fifo',
          protocolId: form.protocolId,
          tagIds: form.tagIds ? form.tagIds.join(',') : null
        };
        res = await createForward(createData);
      }

      if (res.code === 0) {
        toast.success(isEdit ? '修改成功' : '创建成功');
        setModalOpen(false);
        loadData();
      } else {
        toast.error(res.msg || '操作失败');
      }
    } catch (error) {
      console.error('提交失败:', error);
      toast.error('操作失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const openBatchModal = (type: 'protocol' | 'tag') => {
    if (selectedForwardIds.length === 0) {
      toast.error('请先选择需要批量处理的转发');
      return;
    }

    const selectedItems = forwards.filter((forward) => selectedForwardIds.includes(forward.id));
    if (type === 'protocol') {
      const protocolIds = Array.from(new Set(selectedItems
        .map((forward) => forward.protocolId)
        .filter((id): id is number => id !== undefined && id !== null)));
      setBatchProtocolId(protocolIds.length === 1 ? protocolIds[0] : null);
    } else {
      setBatchTagIds([]);
    }

    setBatchUpdateType(type);
    setBatchModalOpen(true);
  };

  const closeBatchModal = () => {
    setBatchModalOpen(false);
    setBatchUpdateType(null);
    setBatchProtocolId(null);
    setBatchTagIds([]);
  };

  // 批量更新处理
  const handleBatchUpdate = async () => {
    if (selectedForwardIds.length === 0 || !batchUpdateType) return;

    if (batchUpdateType === 'protocol' && batchProtocolId === null) {
      toast.error('请选择要应用的协议');
      return;
    }

    setBatchSubmitting(true);
    try {
      const payload = batchUpdateType === 'protocol'
        ? { ids: selectedForwardIds, protocolId: batchProtocolId ?? undefined }
        : { ids: selectedForwardIds, tagIds: batchTagIds.join(',') };

      const res = await batchUpdateForward(payload);
      if (res.code === 0) {
        toast.success(batchUpdateType === 'protocol' ? '批量设置协议成功' : '批量打标签成功');
        setSelectedForwardIds([]);
        closeBatchModal();
        await loadData(false);
      } else {
        toast.error(res.msg || '批量更新失败');
      }
    } catch (error) {
      console.error('批量更新失败:', error);
      toast.error('批量更新失败，请稍后重试');
    } finally {
      setBatchSubmitting(false);
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedForwardIds.length === 0) return;
    if (!window.confirm(`确定要删除选中的 ${selectedForwardIds.length} 个转发吗？`)) return;

    try {
      let successCount = 0;
      for (const id of selectedForwardIds) {
        const res = await deleteForward(id);
        if (res.code === 0) successCount++;
      }
      toast.success(`成功删除 ${successCount} 个转发`);
      setSelectedForwardIds([]);
      loadData();
    } catch (err) {
      toast.error('批量删除操作出现异常');
    }
  };

  // 处理服务开关
  const handleServiceToggle = async (forward: Forward) => {
    if (forward.status !== 1 && forward.status !== 0) {
      toast.error('转发状态异常，无法操作');
      return;
    }

    const targetState = !forward.serviceRunning;

    try {
      // 乐观更新UI
      setForwards(prev => prev.map(f =>
        f.id === forward.id
          ? { ...f, serviceRunning: targetState }
          : f
      ));

      let res;
      if (targetState) {
        res = await resumeForwardService(forward.id);
      } else {
        res = await pauseForwardService(forward.id);
      }

      if (res.code === 0) {
        toast.success(targetState ? '服务已启动' : '服务已暂停');
        // 更新转发状态
        setForwards(prev => prev.map(f =>
          f.id === forward.id
            ? { ...f, status: targetState ? 1 : 0 }
            : f
        ));
      } else {
        // 操作失败，恢复UI状态
        setForwards(prev => prev.map(f =>
          f.id === forward.id
            ? { ...f, serviceRunning: !targetState }
            : f
        ));
        toast.error(res.msg || '操作失败');
      }
    } catch (error) {
      // 操作失败，恢复UI状态
      setForwards(prev => prev.map(f =>
        f.id === forward.id
          ? { ...f, serviceRunning: !targetState }
          : f
      ));
      console.error('服务开关操作失败:', error);
      toast.error('网络错误，操作失败');
    }
  };

  const loadDiagnosisHistory = async (forwardId: number) => {
    setHistoryLoading(true);
    try {
      const res = await getDiagnosisHistory({ targetType: 'forward', targetId: forwardId, limit: 10 });
      if (res.code === 0) {
        const historyItems = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.records)
            ? res.data.records
            : [];
        setDiagnosisHistory(historyItems);
      }
    } catch (err) {
      console.error("加载历史记录失败", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // 诊断转发
  const handleDiagnose = async (forward: Forward) => {
    setCurrentDiagnosisForward(forward);
    setDiagnosisModalOpen(true);
    setDiagnosisLoading(true);
    setDiagnosisResult(null);
    setDiagnosisHistory([]);

    loadDiagnosisHistory(forward.id);

    try {
      const response = await diagnoseForward(forward.id);
      if (response.code === 0) {
        setDiagnosisResult(response.data);
        loadDiagnosisHistory(forward.id);
        // 更新本地列表中的诊断状态
        loadDiagnosisData(forwards);
      } else {
        toast.error(response.msg || '诊断失败');
        setDiagnosisResult({
          forwardName: forward.name,
          timestamp: Date.now(),
          results: [{
            success: false,
            description: '诊断失败',
            nodeName: '-',
            nodeId: '-',
            targetIp: forward.remoteAddr.split(',')[0] || '-',
            message: response.msg || '诊断过程中发生错误'
          }]
        });
      }
    } catch (error) {
      console.error('诊断失败:', error);
      toast.error('网络错误，请重试');
      setDiagnosisResult({
        forwardName: forward.name,
        timestamp: Date.now(),
        results: [{
          success: false,
          description: '网络错误',
          nodeName: '-',
          nodeId: '-',
          targetIp: forward.remoteAddr.split(',')[0] || '-',
          message: '无法连接到服务器'
        }]
      });
    } finally {
      setDiagnosisLoading(false);
    }
  };

  // 获取连接质量
  const getQualityDisplay = (averageTime?: number, packetLoss?: number) => {
    if (averageTime === undefined || packetLoss === undefined) return null;

    if (averageTime < 30 && packetLoss === 0) return { text: '🚀 优秀', color: 'success' };
    if (averageTime < 50 && packetLoss === 0) return { text: '✨ 很好', color: 'success' };
    if (averageTime < 100 && packetLoss < 1) return { text: '👍 良好', color: 'primary' };
    if (averageTime < 150 && packetLoss < 2) return { text: '😐 一般', color: 'warning' };
    if (averageTime < 200 && packetLoss < 5) return { text: '😟 较差', color: 'warning' };
    return { text: '😵 很差', color: 'danger' };
  };

  // 格式化流量
  const formatFlow = (value: number): string => {
    if (value === 0) return '0 B';
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(2) + ' KB';
    if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(2) + ' MB';
    return (value / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  // 格式化入口地址
  const formatInAddress = (ipString: string, port: number): string => {
    if (!ipString || !port) return '';

    const ips = ipString.split(',').map(ip => ip.trim()).filter(ip => ip);
    if (ips.length === 0) return '';

    if (ips.length === 1) {
      const ip = ips[0];
      if (ip.includes(':') && !ip.startsWith('[')) {
        return `[${ip}]:${port}`;
      } else {
        return `${ip}:${port}`;
      }
    }

    const firstIp = ips[0];
    let formattedFirstIp;
    if (firstIp.includes(':') && !firstIp.startsWith('[')) {
      formattedFirstIp = `[${firstIp}]`;
    } else {
      formattedFirstIp = firstIp;
    }

    return `${formattedFirstIp}:${port} (+${ips.length - 1})`;
  };

  // 格式化远程地址
  const formatRemoteAddress = (addressString: string): string => {
    if (!addressString) return '';

    const addresses = addressString.split(',').map(addr => addr.trim()).filter(addr => addr);
    if (addresses.length === 0) return '';
    if (addresses.length === 1) return addresses[0];

    return `${addresses[0]} (+${addresses.length - 1})`;
  };

  // 检查是否有多个地址
  const hasMultipleAddresses = (addressString: string): boolean => {
    if (!addressString) return false;
    const addresses = addressString.split(',').map(addr => addr.trim()).filter(addr => addr);
    return addresses.length > 1;
  };

  // 显示地址列表弹窗
  const showAddressModal = (addressString: string, port: number | null, title: string) => {
    if (!addressString) return;

    let addresses: string[];
    if (port !== null) {
      // 入口地址处理
      const ips = addressString.split(',').map(ip => ip.trim()).filter(ip => ip);
      if (ips.length <= 1) {
        copyToClipboard(formatInAddress(addressString, port), title);
        return;
      }
      addresses = ips.map(ip => {
        if (ip.includes(':') && !ip.startsWith('[')) {
          return `[${ip}]:${port}`;
        } else {
          return `${ip}:${port}`;
        }
      });
    } else {
      // 远程地址处理
      addresses = addressString.split(',').map(addr => addr.trim()).filter(addr => addr);
      if (addresses.length <= 1) {
        copyToClipboard(addressString, title);
        return;
      }
    }

    setAddressList(addresses.map((address, index) => ({
      id: index,
      address,
      copying: false
    })));
    setAddressModalTitle(`${title} (${addresses.length}个)`);
    setAddressModalOpen(true);
  };

  // 复制到剪贴板
  const copyToClipboard = async (text: string, label: string = '内容') => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已复制${label}`);
    } catch (error) {
      toast.error('复制失败：请使用https访问面板（例如nginx反代），http无法复制。');
    }
  };

  // 复制地址
  const copyAddress = async (addressItem: AddressItem) => {
    try {
      setAddressList(prev => prev.map(item =>
        item.id === addressItem.id ? { ...item, copying: true } : item
      ));
      await copyToClipboard(addressItem.address, '地址');
    } catch (error) {
      toast.error('复制失败：请使用https访问面板（例如nginx反代），http无法复制。');
    } finally {
      setAddressList(prev => prev.map(item =>
        item.id === addressItem.id ? { ...item, copying: false } : item
      ));
    }
  };

  // 复制所有地址
  const copyAllAddresses = async () => {
    if (addressList.length === 0) return;
    const allAddresses = addressList.map(item => item.address).join('\n');
    await copyToClipboard(allAddresses, '所有地址');
  };

  // 导出转发数据
  const handleExport = () => {
    setSelectedTunnelForExport(null);
    setExportData('');
    setExportModalOpen(true);
  };

  // 执行导出
  const executeExport = () => {
    if (!selectedTunnelForExport) {
      toast.error('请选择要导出的隧道');
      return;
    }

    setExportLoading(true);

    try {
      // 根据当前显示模式获取要导出的转发列表
      let forwardsToExport: Forward[] = [];

      if (viewMode === 'grouped') {
        // 分组模式下，获取指定隧道的转发
        const userGroups = groupForwardsByUserAndTunnel();
        forwardsToExport = userGroups.flatMap(userGroup =>
          userGroup.tunnelGroups
            .filter(tunnelGroup => tunnelGroup.tunnelId === selectedTunnelForExport)
            .flatMap(tunnelGroup => tunnelGroup.forwards)
        );
      } else {
        // 直接显示模式下，过滤指定隧道的转发
        forwardsToExport = getSortedForwards().filter(forward => forward.tunnelId === selectedTunnelForExport);
      }

      if (forwardsToExport.length === 0) {
        toast.error('所选隧道没有转发数据');
        setExportLoading(false);
        return;
      }

      // 格式化导出数据：remoteAddr|name|inPort
      const exportLines = forwardsToExport.map(forward => {
        return `${forward.remoteAddr}|${forward.name}|${forward.inPort}`;
      });

      const exportText = exportLines.join('\n');
      setExportData(exportText);
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('导出失败');
    } finally {
      setExportLoading(false);
    }
  };

  // 复制导出数据
  const copyExportData = async () => {
    await copyToClipboard(exportData, '转发数据');
  };

  // 导入转发数据
  const handleImport = () => {
    setImportData('');
    setImportResults([]);
    setSelectedTunnelForImport(null);
    setImportModalOpen(true);
  };

  // 执行导入
  const executeImport = async () => {
    if (!importData.trim()) {
      toast.error('请输入要导入的数据');
      return;
    }

    if (!selectedTunnelForImport) {
      toast.error('请选择要导入的隧道');
      return;
    }

    setImportLoading(true);
    setImportResults([]); // 清空之前的结果

    try {
      const lines = importData.trim().split('\n').filter(line => line.trim());

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const parts = line.split('|');

        if (parts.length < 2) {
          setImportResults(prev => [{
            line,
            success: false,
            message: '格式错误：需要至少包含目标地址和转发名称'
          }, ...prev]);
          continue;
        }

        const [remoteAddr, name, inPort] = parts;

        if (!remoteAddr.trim() || !name.trim()) {
          setImportResults(prev => [{
            line,
            success: false,
            message: '目标地址和转发名称不能为空'
          }, ...prev]);
          continue;
        }

        // 验证远程地址格式 - 支持单个地址或多个地址用逗号分隔
        const addresses = remoteAddr.trim().split(',');
        const addressPattern = /^[^:]+:\d+$/;
        const isValidFormat = addresses.every(addr => addressPattern.test(addr.trim()));

        if (!isValidFormat) {
          setImportResults(prev => [{
            line,
            success: false,
            message: '目标地址格式错误，应为 地址:端口 格式，多个地址用逗号分隔'
          }, ...prev]);
          continue;
        }

        try {
          // 处理入口端口
          let portNumber: number | null = null;
          if (inPort && inPort.trim()) {
            const port = parseInt(inPort.trim());
            if (isNaN(port) || port < 1 || port > 65535) {
              setImportResults(prev => [{
                line,
                success: false,
                message: '入口端口格式错误，应为1-65535之间的数字'
              }, ...prev]);
              continue;
            }
            portNumber = port;
          }

          // 调用创建转发接口
          const response = await createForward({
            name: name.trim(),
            tunnelId: selectedTunnelForImport, // 使用用户选择的隧道
            inPort: portNumber, // 使用指定端口或自动分配
            remoteAddr: remoteAddr.trim(),
            strategy: 'fifo'
          });

          if (response.code === 0) {
            setImportResults(prev => [{
              line,
              success: true,
              message: '创建成功',
              forwardName: name.trim()
            }, ...prev]);
          } else {
            setImportResults(prev => [{
              line,
              success: false,
              message: response.msg || '创建失败'
            }, ...prev]);
          }
        } catch (error) {
          setImportResults(prev => [{
            line,
            success: false,
            message: '网络错误，创建失败'
          }, ...prev]);
        }
      }


      toast.success(`导入执行完成`);

      // 导入完成后刷新转发列表
      await loadData(false);
    } catch (error) {
      console.error('导入失败:', error);
      toast.error('导入过程中发生错误');
    } finally {
      setImportLoading(false);
    }
  };

  // 获取状态显示
  const getStatusDisplay = (status: number) => {
    switch (status) {
      case 1:
        return { color: 'success', text: '正常' };
      case 0:
        return { color: 'warning', text: '暂停' };
      case -1:
        return { color: 'danger', text: '异常' };
      default:
        return { color: 'default', text: '未知' };
    }
  };

  // 获取策略显示
  const getStrategyDisplay = (strategy: string) => {
    switch (strategy) {
      case 'fifo':
        return { color: 'primary', text: '主备' };
      case 'round':
        return { color: 'success', text: '轮询' };
      case 'rand':
        return { color: 'warning', text: '随机' };
      default:
        return { color: 'default', text: '未知' };
    }
  };

  // 获取地址数量
  const getAddressCount = (addressString: string): number => {
    if (!addressString) return 0;
    const addresses = addressString.split('\n').map(addr => addr.trim()).filter(addr => addr);
    return addresses.length;
  };

  // 处理拖拽结束
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!active || !over || active.id === over.id) return;

    // 确保 forwardOrder 存在且有效
    if (!forwardOrder || forwardOrder.length === 0) return;

    const activeId = Number(active.id);
    const overId = Number(over.id);

    // 检查 ID 是否有效
    if (isNaN(activeId) || isNaN(overId)) return;

    const oldIndex = forwardOrder.indexOf(activeId);
    const newIndex = forwardOrder.indexOf(overId);

    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      const newOrder = arrayMove(forwardOrder, oldIndex, newIndex);
      setForwardOrder(newOrder);

      // 保存到localStorage
      try {
        localStorage.setItem('forward-order', JSON.stringify(newOrder));
      } catch (error) {
        console.warn('无法保存排序到localStorage:', error);
      }

      // 持久化到数据库
      try {
        const forwardsToUpdate = newOrder.map((id, index) => ({
          id,
          inx: index
        }));

        const response = await updateForwardOrder({ forwards: forwardsToUpdate });
        if (response.code === 0) {
          // 更新本地数据中的 inx 字段
          setForwards(prev => prev.map(forward => {
            const updatedForward = forwardsToUpdate.find(f => f.id === forward.id);
            if (updatedForward) {
              return { ...forward, inx: updatedForward.inx };
            }
            return forward;
          }));
        } else {
          toast.error('保存排序失败：' + (response.msg || '未知错误'));
        }
      } catch (error) {
        console.error('保存排序到数据库失败:', error);
        toast.error('保存排序失败，请重试');
      }
    }
  };

  // 传感器配置 - 使用默认配置避免错误
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 根据排序顺序获取转发列表
  const getSortedForwards = (): Forward[] => {
    // 确保 forwards 数组存在且有效
    if (!forwards || forwards.length === 0) {
      return [];
    }

    // 在平铺模式下，只显示当前用户的转发
    let filteredForwards = forwards;
    if (viewMode === 'direct') {
      const currentUserId = JwtUtil.getUserIdFromToken();
      if (currentUserId !== null) {
        filteredForwards = forwards.filter(forward => forward.userId === currentUserId);
      }
    }

    // 隧道筛选
    if (tunnelFilter !== null) {
      filteredForwards = filteredForwards.filter((f: Forward) => f.tunnelId === tunnelFilter);
    }

    // 状态筛选
    if (statusFilter === 'running') {
      filteredForwards = filteredForwards.filter((f: Forward) => f.status === 1);
    } else if (statusFilter === 'paused') {
      filteredForwards = filteredForwards.filter((f: Forward) => f.status === 0);
    }

    // 健康状况筛选
    if (healthFilter !== 'all') {
      filteredForwards = filteredForwards.filter((f: Forward) => {
        const diag = diagnosisMap[f.id];
        if (healthFilter === 'healthy') return diag && diag.overallSuccess;
        if (healthFilter === 'unhealthy') return diag && !diag.overallSuccess;
        if (healthFilter === 'unknown') return !diag;
        return true;
      });
    }

    // 协议筛选
    if (protocolFilter !== null) {
      filteredForwards = filteredForwards.filter((f: Forward) => f.protocolId === protocolFilter);
    }

    // 标签筛选
    if (tagFilters.length > 0) {
      filteredForwards = filteredForwards.filter((f: Forward) => {
        if (!f.tagIds) return false;
        const fTags = splitTagIds(f.tagIds);
        return tagFilters.every(t => fTags.includes(t));
      });
    }

    // 关键词搜索过滤
    if (searchKeyword && searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase().trim();
      filteredForwards = filteredForwards.filter((f: Forward) => {
        return (
          (f.name && f.name.toLowerCase().includes(keyword)) ||
          (f.remoteAddr && f.remoteAddr.toLowerCase().includes(keyword)) ||
          (f.inIp && f.inIp.toLowerCase().includes(keyword)) ||
          (f.inPort && f.inPort.toString().includes(keyword))
        );
      });
    }

    // 确保过滤后的转发列表有效
    if (!filteredForwards || filteredForwards.length === 0) {
      return [];
    }

    // 优先使用数据库中的 inx 字段进行排序
    const sortedForwards = [...filteredForwards].sort((a, b) => {
      const aInx = a.inx ?? 0;
      const bInx = b.inx ?? 0;
      return aInx - bInx;
    });

    // 如果数据库中没有排序信息，则使用本地存储的顺序
    if (forwardOrder && forwardOrder.length > 0 && sortedForwards.every(f => f.inx === undefined || f.inx === 0)) {
      const forwardMap = new Map(filteredForwards.map(f => [f.id, f]));
      const localSortedForwards: Forward[] = [];

      forwardOrder.forEach(id => {
        const forward = forwardMap.get(id);
        if (forward) {
          localSortedForwards.push(forward);
        }
      });

      // 添加不在排序列表中的转发（新添加的）
      filteredForwards.forEach(forward => {
        if (!forwardOrder.includes(forward.id)) {
          localSortedForwards.push(forward);
        }
      });

      return localSortedForwards;
    }

    return sortedForwards;
  };

  const accessibleForwards = useMemo(() => {
    if (viewMode !== 'direct') {
      return forwards;
    }

    const currentUserId = JwtUtil.getUserIdFromToken();
    if (currentUserId === null) {
      return forwards;
    }

    return forwards.filter((forward) => forward.userId === currentUserId);
  }, [forwards, viewMode]);

  const visibleForwards = useMemo(() => getSortedForwards(), [
    forwards,
    viewMode,
    tunnelFilter,
    statusFilter,
    healthFilter,
    protocolFilter,
    tagFilters,
    searchKeyword,
    forwardOrder,
    diagnosisMap,
  ]);

  const userGroups = useMemo(() => groupForwardsByUserAndTunnel(visibleForwards), [visibleForwards]);
  const visibleForwardIds = useMemo(() => visibleForwards.map((forward) => forward.id), [visibleForwards]);
  const selectedVisibleCount = useMemo(
    () => selectedForwardIds.filter((id) => visibleForwardIds.includes(id)).length,
    [selectedForwardIds, visibleForwardIds]
  );
  const hiddenSelectedCount = selectedForwardIds.length - selectedVisibleCount;
  const allVisibleSelected = visibleForwardIds.length > 0 && selectedVisibleCount === visibleForwardIds.length;
  const activeFilterCount = [
    tunnelFilter !== null,
    statusFilter !== 'all',
    healthFilter !== 'all',
    protocolFilter !== null,
    tagFilters.length > 0,
    searchKeyword.trim() !== "",
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;
  const runningCount = accessibleForwards.filter((forward) => forward.status === 1).length;
  const unhealthyCount = accessibleForwards.filter((forward) => {
    const diagnosis = diagnosisMap[forward.id];
    return diagnosis ? !diagnosis.overallSuccess : false;
  }).length;
  const selectedForwards = useMemo(
    () => forwards.filter((forward) => selectedForwardIds.includes(forward.id)),
    [forwards, selectedForwardIds]
  );
  const visibleUnhealthyIds = useMemo(
    () => visibleForwards
      .filter((forward) => {
        const diagnosis = diagnosisMap[forward.id];
        return diagnosis ? !diagnosis.overallSuccess : false;
      })
      .map((forward) => forward.id),
    [visibleForwards, diagnosisMap]
  );
  const tagUsageCount = useMemo(() => {
    return tags.reduce<Record<string, number>>((acc, tag) => {
      acc[tag.id.toString()] = accessibleForwards.filter((forward) =>
        splitTagIds(forward.tagIds).includes(tag.id.toString())
      ).length;
      return acc;
    }, {});
  }, [tags, accessibleForwards]);

  const handleToggleSelectAllVisible = () => {
    if (visibleForwardIds.length === 0) {
      toast('当前筛选结果为空');
      return;
    }

    setSelectedForwardIds(allVisibleSelected ? [] : visibleForwardIds);
  };

  const handleSelectVisibleUnhealthy = () => {
    if (visibleUnhealthyIds.length === 0) {
      toast('当前筛选结果中没有故障项');
      return;
    }

    setSelectedForwardIds(visibleUnhealthyIds);
  };

  // 可拖拽的转发卡片组件
  const SortableForwardCard = ({ forward }: { forward: Forward }) => {
    // 确保 forward 对象有效
    if (!forward || !forward.id) {
      return null;
    }

    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: forward.id });

    const style = {
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition: transition || undefined,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div ref={setNodeRef} style={style} {...attributes}>
        {renderForwardCard(forward, listeners)}
      </div>
    );
  };

  // 渲染转发卡片
  const renderForwardCard = (forward: Forward, listeners?: any) => {
    const statusDisplay = getStatusDisplay(forward.status);
    const strategyDisplay = getStrategyDisplay(forward.strategy);
    const protocolName = protocols.find((protocol) => protocol.id === forward.protocolId)?.name;
    const forwardTags = splitTagIds(forward.tagIds)
      .map((tagId) => tags.find((tag) => tag.id.toString() === tagId))
      .filter((tag): tag is Tag => Boolean(tag));

    return (
      <Card key={forward.id} className="group shadow-sm border border-divider hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <div className="w-full space-y-1">
            {/* 第一行：转发名称（独占一行，不截断） */}
            <div className="flex items-center gap-2">
              <div
                className="flex-shrink-0 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); toggleSelect(forward.id); }}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selectedForwardIds.includes(forward.id)
                  ? 'bg-primary border-primary text-white'
                  : 'border-default-300 bg-white/50 hover:border-primary/50'
                  }`}>
                  {selectedForwardIds.includes(forward.id) && (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              {viewMode === 'direct' && (
                <div
                  className={`cursor-grab active:cursor-grabbing p-1 text-default-400 hover:text-default-600 transition-colors touch-manipulation flex-shrink-0 ${isMobile
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100'
                    }`}
                  {...listeners}
                  title={isMobile ? "长按拖拽排序" : "拖拽排序"}
                  style={{ touchAction: 'none' }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 2zm0 6a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 8zm0 6a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 14zm6-8a2 2 0 1 1-.001-4.001A2 2 0 0 1 13 6zm0 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 8zm0 6a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 14z" />
                  </svg>
                </div>
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <h3 className="font-semibold text-foreground text-sm break-all">{forward.name}</h3>
              </div>
              {/* 诊断健康+延迟徽标 */}
              {(() => {
                const diag = diagnosisMap[forward.id];
                return (
                  <div className="flex-shrink-0 ml-auto self-start">
                    <SpeedBadge
                      averageTime={diag?.averageTime}
                      packetLoss={diag?.packetLoss}
                      overallSuccess={diag?.overallSuccess}
                      history={diag?.history}
                      compact
                    />
                  </div>
                );
              })()}
            </div>
            {/* 第二行：隧道名 + 状态开关 */}
            <div className="flex justify-between items-center mt-1">
              <p className="text-xs text-default-500 truncate">{forward.tunnelName}</p>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Switch
                  size="sm"
                  isSelected={forward.serviceRunning}
                  onValueChange={() => handleServiceToggle(forward)}
                  isDisabled={forward.status !== 1 && forward.status !== 0}
                />
                <Chip
                  color={statusDisplay.color as any}
                  variant="flat"
                  size="sm"
                  className="text-xs"
                >
                  {statusDisplay.text}
                </Chip>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardBody className="pt-0 pb-3">
          <div className="space-y-2">
            {/* 地址信息 */}
            <div className="space-y-1">
              <div
                className={`cursor-pointer px-2 py-1 bg-default-50 dark:bg-default-100/50 rounded border border-default-200 dark:border-default-300 transition-colors duration-200 ${hasMultipleAddresses(forward.inIp) ? 'hover:bg-default-100 dark:hover:bg-default-200/50' : ''
                  }`}
                onClick={() => showAddressModal(forward.inIp, forward.inPort, '入口端口')}
                title={formatInAddress(forward.inIp, forward.inPort)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-xs font-medium text-default-600 flex-shrink-0">入口:</span>
                    <code className="text-xs font-mono text-foreground truncate min-w-0">
                      {formatInAddress(forward.inIp, forward.inPort)}
                    </code>
                  </div>
                  {hasMultipleAddresses(forward.inIp) && (
                    <svg className="w-3 h-3 text-default-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
              </div>

              <div
                className={`cursor-pointer px-2 py-1 bg-default-50 dark:bg-default-100/50 rounded border border-default-200 dark:border-default-300 transition-colors duration-200 ${hasMultipleAddresses(forward.remoteAddr) ? 'hover:bg-default-100 dark:hover:bg-default-200/50' : ''
                  }`}
                onClick={() => showAddressModal(forward.remoteAddr, null, '目标地址')}
                title={formatRemoteAddress(forward.remoteAddr)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-xs font-medium text-default-600 flex-shrink-0">目标:</span>
                    <code className="text-xs font-mono text-foreground truncate min-w-0">
                      {formatRemoteAddress(forward.remoteAddr)}
                    </code>
                  </div>
                  {hasMultipleAddresses(forward.remoteAddr) && (
                    <svg className="w-3 h-3 text-default-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
              </div>
            </div>

            {/* 统计信息 */}
            <div className="flex items-center justify-between pt-2 border-t border-divider">
              <div className="flex items-center gap-1 flex-wrap">
                <Chip color={strategyDisplay.color as any} variant="flat" size="sm" className="text-xs">
                  {strategyDisplay.text}
                </Chip>
                {protocolName && (
                  <Chip variant="flat" size="sm" className="text-xs" color="secondary">
                    协议 · {protocolName}
                  </Chip>
                )}
                {forwardTags.slice(0, 2).map((tag) => (
                  <Chip
                    key={tag.id}
                    variant="flat"
                    size="sm"
                    className="text-xs"
                    color={getTagChipColor(tag.color)}
                  >
                    #{tag.name}
                  </Chip>
                ))}
                {forwardTags.length > 2 && (
                  <Chip variant="flat" size="sm" className="text-xs">
                    +{forwardTags.length - 2} 标签
                  </Chip>
                )}
                <Chip variant="flat" size="sm" className="text-xs" color="primary">
                  ↑{formatFlow(forward.inFlow || 0)}
                </Chip>
                <Chip variant="flat" size="sm" className="text-xs" color="success">
                  ↓{formatFlow(forward.outFlow || 0)}
                </Chip>
              </div>
            </div>
            {/* 创建时间 */}
            {forward.createdTime && (
              <div className="text-xs text-default-400">
                创建于 {new Date(forward.createdTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>

          {/* 操作按钮 2x2 网格 */}
          <div className="grid grid-cols-2 gap-1.5 mt-3">
            <Button
              size="sm"
              variant="flat"
              color="primary"
              onPress={() => handleEdit(forward)}
              className="min-h-8"
              startContent={
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              }
            >
              编辑
            </Button>
            <Button
              size="sm"
              variant="flat"
              color="warning"
              onPress={() => handleDiagnose(forward)}
              className="min-h-8"
              startContent={
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              }
            >
              诊断
            </Button>
            <Button
              size="sm"
              variant="flat"
              color="secondary"
              onPress={() => handleCopy(forward)}
              className="min-h-8"
              startContent={
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                  <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                </svg>
              }
            >
              复制
            </Button>
            <Button
              size="sm"
              variant="flat"
              color="danger"
              onPress={() => handleDelete(forward)}
              className="min-h-8"
              startContent={
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v4a1 1 0 11-2 0V7zM12 7a1 1 0 012 0v4a1 1 0 11-2 0V7z" clipRule="evenodd" />
                </svg>
              }
            >
              删除
            </Button>
          </div>
          <div className="mt-4 pt-3 border-t border-divider">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold text-default-400 tracking-wider">最近 10 次历史 (诊断看板)</span>
              {(() => {
                const diag = diagnosisMap[forward.id];
                if (!diag) return null;
                return (
                  <Chip size="sm" variant="flat" color={diag.overallSuccess ? 'success' : 'danger'} className="h-4 text-[9px] px-1 min-w-0">
                    {diag.overallSuccess ? '正常' : '故障'}
                  </Chip>
                );
              })()}
            </div>
            {(() => {
              const diag = diagnosisMap[forward.id];
              if (!diag?.history || diag.history.length === 0) {
                return (
                  <div className="flex items-center justify-center p-2 rounded-lg bg-default-50 dark:bg-default-100/30 border border-dashed border-divider">
                    <span className="text-[10px] text-default-400 italic">暂无诊断数据</span>
                  </div>
                );
              }
              return (
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5" style={{ scrollbarWidth: 'none' }}>
                  {diag.history.slice(0, 10).map((h, i) => (
                    <div
                      key={i}
                      className={`flex-shrink-0 w-8 h-7 rounded-md flex flex-col items-center justify-center shadow-sm transition-all hover:scale-110 active:scale-95 cursor-help ${h.overallSuccess ? 'bg-success-500/90 text-white' : 'bg-danger-500/90 text-white'
                        }`}
                      title={`时间: ${new Date(h.createdTime).toLocaleString()}\n${h.overallSuccess ? `延迟: ${Math.round(h.averageTime || 0)}ms` : '故障'}`}
                    >
                      <span className="text-[10px] font-bold leading-none">
                        {h.overallSuccess ? (h.averageTime ? Math.round(h.averageTime) : '✓') : '✗'}
                      </span>
                      {h.overallSuccess && <span className="text-[6px] opacity-70 mt-0.5">ms</span>}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </CardBody>
      </Card>
    );
  };

  if (loading) {
    return (

      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <Spinner size="sm" />
          <span className="text-default-600">正在加载...</span>
        </div>
      </div>

    );
  }
  return (

    <div className="px-3 lg:px-6 py-8">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground lg:text-[30px]">转发管理</h1>
              <Chip size="sm" variant="flat" color="primary">
                {viewMode === 'grouped' ? '分组视图' : '平铺视图'}
              </Chip>
              <Chip size="sm" variant="flat" color={activeFilterCount > 0 ? 'warning' : 'default'}>
                筛选 {visibleForwards.length} / {accessibleForwards.length}
              </Chip>
              <Chip size="sm" variant="flat" color={selectedForwardIds.length > 0 ? 'secondary' : 'default'}>
                已选 {selectedForwardIds.length}
              </Chip>
            </div>
            <p className="mt-2 text-sm text-default-500">
              搜索、筛选、诊断和批量处理收敛在同一条工具栏里，默认仅展示当前权限范围内的转发。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="flat"
              color="default"
              onPress={handleViewModeChange}
              isIconOnly
              className="text-sm"
              title={viewMode === 'grouped' ? '切换到平铺视图' : '切换到分组视图'}
            >
              {viewMode === 'grouped' ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM3 16a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                </svg>
              )}
            </Button>
            <Button size="sm" variant="flat" color="warning" onPress={handleImport}>
              导入
            </Button>
            <Button size="sm" variant="flat" color="success" onPress={handleExport} isLoading={exportLoading}>
              导出
            </Button>
            <Button size="sm" variant="solid" color="primary" onPress={handleAdd}>
              新增转发
            </Button>
          </div>
        </div>

        <div className="rounded-[28px] border border-divider bg-white/80 p-4 shadow-sm backdrop-blur-md dark:bg-default-100/20">
          <div className="flex flex-wrap items-center gap-2.5">
            <Input
              value={searchKeyword}
              onValueChange={setSearchKeyword}
              placeholder="搜索名称、端口、入口或目标地址"
              startContent={
                <svg className="w-4 h-4 text-default-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
              size="sm"
              variant="flat"
              radius="lg"
              className="w-full sm:max-w-[280px]"
              isClearable
              onClear={() => setSearchKeyword("")}
            />

            <Tabs
              selectedKey={statusFilter}
              onSelectionChange={(key) => setStatusFilter(key as any)}
              size="sm"
              variant="bordered"
              radius="full"
              classNames={{
                tabList: "bg-default-100/60 dark:bg-default-100/20 p-1",
                cursor: "bg-white dark:bg-primary shadow-sm",
                tabContent: "group-data-[selected=true]:text-primary-600 dark:group-data-[selected=true]:text-white font-semibold",
                tab: "h-8 px-3",
              }}
            >
              <Tab key="all" title={`全部 (${accessibleForwards.length})`} />
              <Tab key="running" title={`运行中 (${runningCount})`} />
              <Tab key="paused" title={`已暂停 (${accessibleForwards.length - runningCount})`} />
            </Tabs>

            <Tabs
              selectedKey={healthFilter}
              onSelectionChange={(key) => setHealthFilter(key as any)}
              size="sm"
              variant="light"
              radius="full"
              color={healthFilter === 'unhealthy' ? 'danger' : healthFilter === 'healthy' ? 'success' : 'default'}
              classNames={{
                tabList: "bg-transparent",
                tab: "h-8 px-3",
                tabContent: "font-medium"
              }}
            >
              <Tab key="all" title="全部健康" />
              <Tab key="healthy" title="正常" />
              <Tab key="unhealthy" title={`故障 (${unhealthyCount})`} />
            </Tabs>

            <Select
              aria-label="筛选隧道"
              placeholder="全部隧道"
              selectedKeys={tunnelFilter !== null ? new Set([tunnelFilter.toString()]) : new Set([])}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0];
                setTunnelFilter(selected === 'all' ? null : (selected ? Number(selected) : null));
              }}
              size="sm"
              variant="bordered"
              className="w-full sm:max-w-[180px]"
            >
              {[
                <SelectItem key="all" textValue="全部隧道">全部隧道</SelectItem>,
                ...tunnels.map(t => (
                  <SelectItem key={t.id.toString()} textValue={t.name}>{t.name}</SelectItem>
                ))
              ]}
            </Select>

            <Select
              aria-label="筛选协议"
              placeholder="全部协议"
              selectedKeys={protocolFilter !== null ? new Set([protocolFilter.toString()]) : new Set([])}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0];
                setProtocolFilter(selected === 'all' ? null : (selected ? Number(selected) : null));
              }}
              size="sm"
              variant="bordered"
              className="w-full sm:max-w-[180px]"
            >
              {[
                <SelectItem key="all" textValue="全部协议">全部协议</SelectItem>,
                ...protocols.map(p => (
                  <SelectItem key={p.id.toString()} textValue={p.name}>{p.name}</SelectItem>
                ))
              ]}
            </Select>

            <Popover placement="bottom-start" showArrow offset={12}>
              <PopoverTrigger>
                <Button
                  size="sm"
                  variant={tagFilters.length > 0 ? "solid" : "flat"}
                  color={tagFilters.length > 0 ? "primary" : "default"}
                >
                  标签筛选{tagFilters.length > 0 ? ` (${tagFilters.length})` : ''}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(92vw,420px)] p-0">
                <div className="w-full p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">标签筛选</p>
                      <p className="mt-1 text-xs text-default-500">支持多标签组合，筛选只作用于当前权限数据。</p>
                    </div>
                    {tagFilters.length > 0 && (
                      <Button size="sm" variant="light" color="danger" onPress={() => setTagFilters([])}>
                        清空
                      </Button>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl bg-default-50 px-3 py-2 text-xs text-default-500">
                    <span>已选 {tagFilters.length} 个标签</span>
                    <span>共 {tags.length} 个可用标签</span>
                  </div>

                  <div className="mt-4 flex max-h-64 flex-wrap gap-2 overflow-y-auto pr-1">
                    <Chip
                      size="sm"
                      variant={tagFilters.length === 0 ? "solid" : "flat"}
                      color={tagFilters.length === 0 ? "primary" : "default"}
                      className="cursor-pointer"
                      onClick={() => setTagFilters([])}
                    >
                      全部 ({accessibleForwards.length})
                    </Chip>
                    {tags.map((tag) => {
                      const tagId = tag.id.toString();
                      const isSelected = tagFilters.includes(tagId);
                      return (
                        <Chip
                          key={tag.id}
                          size="sm"
                          variant={isSelected ? "solid" : "flat"}
                          color={isSelected ? "primary" : getTagChipColor(tag.color)}
                          className="cursor-pointer"
                          onClick={() => {
                            setTagFilters((prev) => (isSelected ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
                          }}
                        >
                          {tag.name} ({tagUsageCount[tagId] || 0})
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {hasActiveFilters && (
              <Button
                size="sm"
                variant="light"
                color="danger"
                onPress={() => {
                  setTunnelFilter(null);
                  setStatusFilter('all');
                  setHealthFilter('all');
                  setProtocolFilter(null);
                  setTagFilters([]);
                  setSearchKeyword("");
                }}
              >
                重置
              </Button>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="sm" variant="flat" color="primary">
                当前结果 {visibleForwards.length}
              </Chip>
              <Chip size="sm" variant="flat" color={selectedForwardIds.length > 0 ? "secondary" : "default"}>
                已选择 {selectedForwardIds.length}
              </Chip>
              <Chip size="sm" variant="flat" color={unhealthyCount > 0 ? "danger" : "default"}>
                故障项 {unhealthyCount}
              </Chip>
              {hiddenSelectedCount > 0 && (
                <Chip size="sm" variant="flat" color="warning">
                  隐藏已选 {hiddenSelectedCount}
                </Chip>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={allVisibleSelected ? "solid" : "flat"} color="primary" onPress={handleToggleSelectAllVisible}>
                {allVisibleSelected ? '取消全选' : '全选当前结果'}
              </Button>
              <Button size="sm" variant="flat" color="warning" onPress={handleSelectVisibleUnhealthy}>
                仅选故障项
              </Button>
              <Button size="sm" variant="flat" color="secondary" isDisabled={selectedForwardIds.length === 0} onPress={() => openBatchModal('protocol')}>
                批量设置协议
              </Button>
              <Button size="sm" variant="flat" color="primary" isDisabled={selectedForwardIds.length === 0} onPress={() => openBatchModal('tag')}>
                批量打标签
              </Button>
              <Button size="sm" variant="flat" color="danger" isDisabled={selectedForwardIds.length === 0} onPress={handleBatchDelete}>
                批量删除
              </Button>
            </div>
          </div>

          {(searchKeyword || statusFilter !== 'all' || healthFilter !== 'all' || tunnelFilter !== null || protocolFilter !== null || tagFilters.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-divider/70 pt-3">
              {searchKeyword && (
                <Chip size="sm" variant="flat" onClose={() => setSearchKeyword("")} className="bg-default-100 text-default-600">
                  搜索: {searchKeyword}
                </Chip>
              )}
              {statusFilter !== 'all' && (
                <Chip size="sm" variant="flat" onClose={() => setStatusFilter('all')} className="bg-primary/10 text-primary-600">
                  状态: {statusFilter === 'running' ? '运行中' : '已暂停'}
                </Chip>
              )}
              {healthFilter !== 'all' && (
                <Chip size="sm" variant="flat" onClose={() => setHealthFilter('all')} className="bg-danger/10 text-danger-600">
                  健康: {healthFilter === 'healthy' ? '正常' : '故障'}
                </Chip>
              )}
              {tunnelFilter !== null && (
                <Chip size="sm" variant="flat" onClose={() => setTunnelFilter(null)} className="bg-primary/10 text-primary-600">
                  隧道: {tunnels.find(t => t.id === tunnelFilter)?.name || tunnelFilter}
                </Chip>
              )}
              {protocolFilter !== null && (
                <Chip size="sm" variant="flat" onClose={() => setProtocolFilter(null)} className="bg-secondary/10 text-secondary-600">
                  协议: {protocols.find(p => p.id === protocolFilter)?.name || protocolFilter}
                </Chip>
              )}
              {tagFilters.map(id => {
                const tag = tags.find(t => t.id.toString() === id);
                return (
                  <Chip
                    key={id}
                    size="sm"
                    variant="flat"
                    onClose={() => setTagFilters(prev => prev.filter(tid => tid !== id))}
                    className="bg-default-100 text-default-600"
                  >
                    标签: {tag?.name || id}
                  </Chip>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 根据显示模式渲染不同内容 */}
      {
        viewMode === 'grouped' ? (
          /* 按用户和隧道分组的转发列表 */
          userGroups.length > 0 ? (
            <div className="space-y-6">
              {userGroups.map((userGroup) => (
                <Card key={userGroup.userId || 'unknown'} className="shadow-sm border border-divider w-full overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between w-full min-w-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-base font-medium text-foreground truncate max-w-[150px] sm:max-w-[250px] md:max-w-[350px] lg:max-w-[450px]">{userGroup.userName}</h2>
                          <p className="text-xs text-default-500 truncate max-w-[150px] sm:max-w-[250px] md:max-w-[350px] lg:max-w-[450px]">
                            {userGroup.tunnelGroups.length} 个隧道，
                            {userGroup.tunnelGroups.reduce((total, tg) => total + tg.forwards.length, 0)} 个转发
                          </p>
                        </div>
                      </div>
                      <Chip color="primary" variant="flat" size="sm" className="text-xs flex-shrink-0 ml-2">
                        用户
                      </Chip>
                    </div>
                  </CardHeader>

                  <CardBody className="pt-0">
                    <Accordion variant="splitted" className="px-0">
                      {userGroup.tunnelGroups.map((tunnelGroup) => (
                        <AccordionItem
                          key={tunnelGroup.tunnelId}
                          aria-label={tunnelGroup.tunnelName}
                          title={
                            <div className="flex items-center justify-between w-full min-w-0 pr-4">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="w-8 h-8 bg-success-100 dark:bg-success-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                  </svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h3 className="text-sm font-medium text-foreground truncate max-w-[120px] sm:max-w-[200px] md:max-w-[300px] lg:max-w-[400px]">{tunnelGroup.tunnelName}</h3>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                <Chip variant="flat" size="sm" className="text-xs">
                                  {tunnelGroup.forwards.filter(f => f.serviceRunning).length}/{tunnelGroup.forwards.length}
                                </Chip>
                              </div>
                            </div>
                          }
                          className="shadow-none border border-divider"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 p-4">
                            {tunnelGroup.forwards.map((forward) => renderForwardCard(forward, undefined))}
                          </div>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardBody>
                </Card>
              ))}
            </div>
          ) : (
            /* 空状态 */
            <Card className="shadow-sm border border-gray-200 dark:border-gray-700">
              <CardBody className="text-center py-16">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-default-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-default-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">暂无转发配置</h3>
                    <p className="text-default-500 text-sm mt-1">还没有创建任何转发配置，点击上方按钮开始创建</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )
        ) : (
          /* 直接显示模式 */
          forwards.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              onDragStart={() => { }} // 添加空的 onDragStart 处理器
            >
              <SortableContext
                items={getSortedForwards().map(f => f.id || 0).filter(id => id > 0)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {getSortedForwards().map((forward) => (
                    forward && forward.id ? (
                      <SortableForwardCard key={forward.id} forward={forward} />
                    ) : null
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            /* 空状态 */
            <Card className="shadow-sm border border-gray-200 dark:border-gray-700">
              <CardBody className="text-center py-16">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-default-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-default-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">暂无转发配置</h3>
                    <p className="text-default-500 text-sm mt-1">还没有创建任何转发配置，点击上方按钮开始创建</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )
        )
      }

      {/* 新增/编辑模态框 */}
      <Modal
        isOpen={modalOpen}
        onOpenChange={setModalOpen}
        size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">
                  {isEdit ? '编辑转发' : '新增转发'}
                </h2>
                <p className="text-small text-default-500">
                  {isEdit ? '修改现有转发配置的信息' : '创建新的转发配置'}
                </p>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4 pb-4">
                  <Input
                    label="转发名称"
                    placeholder="请输入转发名称"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    isInvalid={!!errors.name}
                    errorMessage={errors.name}
                    variant="bordered"
                  />

                  <Select
                    label="选择隧道"
                    placeholder="请选择关联的隧道"
                    selectedKeys={form.tunnelId ? [form.tunnelId.toString()] : []}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string;
                      if (selectedKey) {
                        handleTunnelChange(selectedKey);
                      }
                    }}
                    isInvalid={!!errors.tunnelId}
                    errorMessage={errors.tunnelId}
                    variant="bordered"
                  >
                    {tunnels.map((tunnel) => (
                      <SelectItem key={tunnel.id} >
                        {tunnel.name}
                      </SelectItem>
                    ))}
                  </Select>

                  <Input
                    label="入口端口"
                    placeholder="留空自动分配"
                    type="number"
                    value={form.inPort?.toString() || ''}
                    onChange={(e) => setForm(prev => ({
                      ...prev,
                      inPort: e.target.value ? parseInt(e.target.value) : null
                    }))}
                    isInvalid={!!errors.inPort}
                    errorMessage={errors.inPort}
                    variant="bordered"
                    description={
                      selectedTunnel && selectedTunnel.inNodePortSta && selectedTunnel.inNodePortEnd
                        ? `允许范围: ${selectedTunnel.inNodePortSta}-${selectedTunnel.inNodePortEnd}`
                        : '留空将自动分配可用端口'
                    }
                  />

                  <Textarea
                    label="远程地址"
                    placeholder="请输入远程地址，多个地址用换行分隔&#10;例如:&#10;192.168.1.100:8080&#10;example.com:3000"
                    value={form.remoteAddr}
                    onChange={(e) => setForm(prev => ({ ...prev, remoteAddr: e.target.value }))}
                    isInvalid={!!errors.remoteAddr}
                    errorMessage={errors.remoteAddr}
                    variant="bordered"
                    description="格式: IP:端口 或 域名:端口，支持多个地址（每行一个）"
                    minRows={3}
                    maxRows={6}
                  />

                  <Input
                    label="出口网卡名或IP"
                    placeholder="请输入出口网卡名或IP"
                    value={form.interfaceName}
                    onChange={(e) => setForm(prev => ({ ...prev, interfaceName: e.target.value }))}
                    isInvalid={!!errors.interfaceName}
                    errorMessage={errors.interfaceName}
                    variant="bordered"
                    description="用于多IP服务器指定使用那个IP请求远程地址，不懂的默认为空就行"
                  />

                  <Select
                    label="协议 (Protocol)"
                    placeholder="选择协议 (可选)"
                    selectedKeys={form.protocolId ? [form.protocolId.toString()] : []}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string;
                      setForm(prev => ({ ...prev, protocolId: selectedKey ? parseInt(selectedKey) : null }));
                    }}
                    variant="bordered"
                  >
                    {[
                      <SelectItem key="" textValue="无协议">无协议</SelectItem>,
                      ...protocols.map(p => (
                        <SelectItem key={p.id.toString()} textValue={p.name}>{p.name}</SelectItem>
                      ))
                    ]}
                  </Select>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">标签 (Tags)</label>
                      <Button
                        size="sm"
                        variant="light"
                        color="primary"
                        startContent={<i className="i-lucide-plus w-3 h-3" />}
                        className="h-6 text-[10px] px-2 min-w-0"
                        onPress={() => {
                          const name = prompt("请输入新标签名称:");
                          if (name && name.trim()) {
                            createQuickTag(name.trim());
                          }
                        }}
                      >
                        快速新建
                      </Button>
                    </div>
                    <Select
                      placeholder="选择标签 (多项选择)"
                      selectionMode="multiple"
                      selectedKeys={form.tagIds ? new Set(form.tagIds) : new Set([])}
                      onSelectionChange={(keys) => {
                        setForm(prev => ({ ...prev, tagIds: Array.from(keys) as string[] }));
                      }}
                      variant="bordered"
                      classNames={{ trigger: "h-10" }}
                    >
                      {tags.map(t => (
                        <SelectItem key={t.id.toString()} textValue={t.name}>
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${getTagDotClass(t.color)}`}></div>
                            <span>{t.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </Select>
                  </div>

                  {getAddressCount(form.remoteAddr) > 1 && (
                    <Select
                      label="负载策略"
                      placeholder="请选择负载均衡策略"
                      selectedKeys={[form.strategy]}
                      onSelectionChange={(keys) => {
                        const selectedKey = Array.from(keys)[0] as string;
                        setForm(prev => ({ ...prev, strategy: selectedKey }));
                      }}
                      variant="bordered"
                      description="多个目标地址的负载均衡策略"
                    >
                      <SelectItem key="fifo" >主备模式 - 自上而下</SelectItem>
                      <SelectItem key="round" >轮询模式 - 依次轮换</SelectItem>
                      <SelectItem key="rand" >随机模式 - 随机选择</SelectItem>
                      <SelectItem key="hash" >哈希模式 - IP哈希</SelectItem>
                    </Select>
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="primary"
                  onPress={handleSubmit}
                  isLoading={submitLoading}
                >
                  {isEdit ? '保存修改' : '创建转发'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 删除确认模态框 */}
      <Modal
        isOpen={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-lg font-bold text-danger">确认删除</h2>
              </ModalHeader>
              <ModalBody>
                <p className="text-default-600">
                  确定要删除转发 <span className="font-semibold text-foreground">"{forwardToDelete?.name}"</span> 吗？
                </p>
                <p className="text-small text-default-500 mt-2">
                  此操作无法撤销，删除后该转发将永久消失。
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="danger"
                  onPress={confirmDelete}
                  isLoading={deleteLoading}
                >
                  确认删除
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 地址列表弹窗 */}
      <Modal isOpen={addressModalOpen} onClose={() => setAddressModalOpen(false)} size="lg" scrollBehavior="outside">
        <ModalContent>
          <ModalHeader className="text-base">{addressModalTitle}</ModalHeader>
          <ModalBody className="pb-6">
            <div className="mb-4 text-right">
              <Button size="sm" onClick={copyAllAddresses}>
                复制
              </Button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {addressList.map((item) => (
                <div key={item.id} className="flex justify-between items-center p-3 border border-default-200 dark:border-default-100 rounded-lg">
                  <code className="text-sm flex-1 mr-3 text-foreground">{item.address}</code>
                  <Button
                    size="sm"
                    variant="light"
                    isLoading={item.copying}
                    onClick={() => copyAddress(item)}
                  >
                    复制
                  </Button>
                </div>
              ))}
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 导出数据模态框 */}
      <Modal
        isOpen={exportModalOpen}
        onClose={() => {
          setExportModalOpen(false);
          setSelectedTunnelForExport(null);
          setExportData('');
        }}

        size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <h2 className="text-xl font-bold">导出转发数据</h2>
            <p className="text-small text-default-500">
              格式：目标地址|转发名称|入口端口
            </p>
          </ModalHeader>
          <ModalBody className="pb-6">
            <div className="space-y-4">
              {/* 隧道选择 */}
              <div>
                <Select
                  label="选择导出隧道"
                  placeholder="请选择要导出的隧道"
                  selectedKeys={selectedTunnelForExport ? [selectedTunnelForExport.toString()] : []}
                  onSelectionChange={(keys) => {
                    const selectedKey = Array.from(keys)[0] as string;
                    setSelectedTunnelForExport(selectedKey ? parseInt(selectedKey) : null);
                  }}
                  variant="bordered"
                  isRequired
                >
                  {tunnels.map((tunnel) => (
                    <SelectItem key={tunnel.id.toString()} textValue={tunnel.name}>
                      {tunnel.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              {/* 导出按钮和数据 */}
              {exportData && (
                <div className="flex justify-between items-center">
                  <Button
                    color="primary"
                    size="sm"
                    onPress={executeExport}
                    isLoading={exportLoading}
                    isDisabled={!selectedTunnelForExport}
                    startContent={
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    }
                  >
                    重新生成
                  </Button>
                  <Button
                    color="secondary"
                    size="sm"
                    onPress={copyExportData}
                    startContent={
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                      </svg>
                    }
                  >
                    复制
                  </Button>
                </div>
              )}

              {/* 初始导出按钮 */}
              {!exportData && (
                <div className="text-right">
                  <Button
                    color="primary"
                    size="sm"
                    onPress={executeExport}
                    isLoading={exportLoading}
                    isDisabled={!selectedTunnelForExport}
                    startContent={
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    }
                  >
                    生成导出数据
                  </Button>
                </div>
              )}

              {/* 导出数据显示 */}
              {exportData && (
                <div className="relative">
                  <Textarea
                    value={exportData}
                    readOnly
                    variant="bordered"
                    minRows={10}
                    maxRows={20}
                    className="font-mono text-sm"
                    classNames={{
                      input: "font-mono text-sm"
                    }}
                    placeholder="暂无数据"
                  />
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => setExportModalOpen(false)}
            >
              关闭
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 导入数据模态框 */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}

        size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <h2 className="text-xl font-bold">导入转发数据</h2>
            <p className="text-small text-default-500">
              格式：目标地址|转发名称|入口端口，每行一个，入口端口留空将自动分配可用端口
            </p>
            <p className="text-small text-default-400">
              目标地址支持单个地址(如：example.com:8080)或多个地址用逗号分隔(如：3.3.3.3:3,4.4.4.4:4)
            </p>
          </ModalHeader>
          <ModalBody className="pb-6">
            <div className="space-y-4">
              {/* 隧道选择 */}
              <div>
                <Select
                  label="选择导入隧道"
                  placeholder="请选择要导入的隧道"
                  selectedKeys={selectedTunnelForImport ? [selectedTunnelForImport.toString()] : []}
                  onSelectionChange={(keys) => {
                    const selectedKey = Array.from(keys)[0] as string;
                    setSelectedTunnelForImport(selectedKey ? parseInt(selectedKey) : null);
                  }}
                  variant="bordered"
                  isRequired
                >
                  {tunnels.map((tunnel) => (
                    <SelectItem key={tunnel.id.toString()} textValue={tunnel.name}>
                      {tunnel.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              {/* 输入区域 */}
              <div>
                <Textarea
                  label="导入数据"
                  placeholder="请输入要导入的转发数据，格式：目标地址|转发名称|入口端口"
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  variant="flat"
                  minRows={8}
                  maxRows={12}
                  classNames={{
                    input: "font-mono text-sm"
                  }}
                />


              </div>

              {/* 导入结果 */}
              {importResults.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-semibold">导入结果</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-default-500">
                        成功：{importResults.filter(r => r.success).length} /
                        总计：{importResults.length}
                      </span>
                    </div>
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-1" style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgb(156 163 175) transparent'
                  }}>
                    {importResults.map((result, index) => (
                      <div
                        key={index}
                        className={`p-2 rounded border ${result.success
                          ? 'bg-success-50 dark:bg-success-100/10 border-success-200 dark:border-success-300/20'
                          : 'bg-danger-50 dark:bg-danger-100/10 border-danger-200 dark:border-danger-300/20'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          {result.success ? (
                            <svg className="w-3 h-3 text-success-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3 text-danger-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-xs font-medium ${result.success ? 'text-success-700 dark:text-success-300' : 'text-danger-700 dark:text-danger-300'
                                }`}>
                                {result.success ? '成功' : '失败'}
                              </span>
                              <span className="text-xs text-default-500">|</span>
                              <code className="text-xs font-mono text-default-600 truncate">{result.line}</code>
                            </div>
                            <div className={`text-xs ${result.success ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'
                              }`}>
                              {result.message}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => setImportModalOpen(false)}
            >
              关闭
            </Button>
            <Button
              color="warning"
              onPress={executeImport}
              isLoading={importLoading}
              isDisabled={!importData.trim() || !selectedTunnelForImport}
            >
              开始导入
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 诊断结果模态框 */}
      <Modal
        isOpen={diagnosisModalOpen}
        onOpenChange={setDiagnosisModalOpen}

        size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">转发诊断结果</h2>
                {currentDiagnosisForward && (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-small text-default-500 truncate flex-1 min-w-0">{currentDiagnosisForward.name}</span>
                    <Chip
                      color="primary"
                      variant="flat"
                      size="sm"
                      className="flex-shrink-0"
                    >
                      转发服务
                    </Chip>
                  </div>
                )}
              </ModalHeader>
              <ModalBody>
                {diagnosisLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="flex items-center gap-3">
                      <Spinner size="sm" />
                      <span className="text-default-600">正在诊断转发连接...</span>
                    </div>
                  </div>
                ) : diagnosisResult ? (
                  <div className="space-y-4">
                    {/* 总体结论汇总 (v1.4.3) */}
                    {(diagnosisResult as any).totalLatency !== undefined && (
                      <Card className="bg-default-50 border-none shadow-none mb-6">
                        <CardBody className="py-4">
                          <div className="flex items-center justify-around">
                            <div className="text-center">
                              <div className="text-3xl font-bold text-primary">
                                {(diagnosisResult as any).totalLatency > 0 ? (diagnosisResult as any).totalLatency.toFixed(0) : '-'}
                                <span className="text-tiny font-normal text-default-400 ml-1">ms</span>
                              </div>
                              <div className="text-tiny text-default-500 uppercase font-semibold">端到端总延迟</div>
                            </div>
                            <Divider orientation="vertical" className="h-10" />
                            <div className="text-center">
                              <div className="text-3xl font-bold text-warning">
                                {(diagnosisResult as any).totalLoss !== undefined ? (diagnosisResult as any).totalLoss.toFixed(1) : '-'}
                                <span className="text-tiny font-normal text-default-400 ml-1">%</span>
                              </div>
                              <div className="text-tiny text-default-500 uppercase font-semibold">平均丢包率</div>
                            </div>
                            <Divider orientation="vertical" className="h-10" />
                            <div className="text-center">
                              <Chip
                                color={(diagnosisResult as any).overallSuccess ? "success" : "danger"}
                                variant="shadow"
                                size="lg"
                              >
                                {(diagnosisResult as any).overallSuccess ? "整体通路良好" : "路径存在故障"}
                              </Chip>
                              <div className="text-tiny text-default-500 uppercase font-semibold mt-1">诊断结论</div>
                            </div>
                          </div>
                        </CardBody>
                      </Card>
                    )}

                    {diagnosisResult.results.map((result, index) => {
                      const quality = getQualityDisplay(result.averageTime, result.packetLoss);

                      return (
                        <Card key={index} className={`shadow-sm border ${result.success ? 'border-success' : 'border-danger'}`}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between w-full">
                              <div>
                                <h3 className="text-lg font-semibold text-foreground">{result.description}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-small text-default-500">节点: {result.nodeName}</span>
                                  <Chip
                                    color={result.success ? 'success' : 'danger'}
                                    variant="flat"
                                    size="sm"
                                  >
                                    {result.success ? '连接成功' : '连接失败'}
                                  </Chip>
                                </div>
                              </div>
                            </div>
                          </CardHeader>

                          <CardBody className="pt-0">
                            {result.success ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-3 gap-4">
                                  <div className="text-center">
                                    <div className="text-2xl font-bold text-primary">{result.averageTime?.toFixed(0)}</div>
                                    <div className="text-small text-default-500">平均延迟(ms)</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-2xl font-bold text-warning">{result.packetLoss?.toFixed(1)}</div>
                                    <div className="text-small text-default-500">丢包率(%)</div>
                                  </div>
                                  <div className="text-center">
                                    {quality && (
                                      <>
                                        <Chip color={quality.color as any} variant="flat" size="lg">
                                          {quality.text}
                                        </Chip>
                                        <div className="text-small text-default-500 mt-1">连接质量</div>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="text-small text-default-500 flex items-center gap-1">
                                  <span className="flex-shrink-0">目标地址:</span>
                                  <code className="font-mono truncate min-w-0" title={`${result.targetIp}${result.targetPort ? ':' + result.targetPort : ''}`}>
                                    {result.targetIp}{result.targetPort ? ':' + result.targetPort : ''}
                                  </code>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="text-small text-default-500 flex items-center gap-1">
                                  <span className="flex-shrink-0">目标地址:</span>
                                  <code className="font-mono truncate min-w-0" title={`${result.targetIp}${result.targetPort ? ':' + result.targetPort : ''}`}>
                                    {result.targetIp}{result.targetPort ? ':' + result.targetPort : ''}
                                  </code>
                                </div>
                                <Alert
                                  color="danger"
                                  variant="flat"
                                  title="错误详情"
                                  description={result.message}
                                />
                              </div>
                            )}
                          </CardBody>
                        </Card>
                      );
                    })}

                    {/* 历史记录展示 */}
                    {diagnosisHistory.length > 0 && (
                      <div className="mt-8">
                        <h3 className="text-lg font-bold mb-4">最近10次诊断历史</h3>
                        <Accordion variant="splitted">
                          {diagnosisHistory.map((item) => {
                            let parsedResults = [];
                            try {
                              parsedResults = JSON.parse(item.resultsJson);
                            } catch (e) { }

                            return (
                              <AccordionItem
                                key={item.id}
                                aria-label={`历史记录 ${item.id}`}
                                title={
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">
                                      {new Date(item.createdTime).toLocaleString("zh-CN")}
                                    </span>
                                    <Chip size="sm" color={item.overallSuccess ? "success" : "danger"} variant="flat">
                                      {item.overallSuccess ? "成功" : "失败"}
                                    </Chip>
                                    {item.averageTime !== undefined && item.averageTime > 0 && (
                                      <span className="text-[10px] text-default-400 font-mono ml-auto">
                                        延迟: {item.averageTime.toFixed(0)}ms | 丢包: {item.packetLoss?.toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                }
                              >
                                <div className="space-y-3">
                                  {parsedResults.map((r: any, idx: number) => (
                                    <div key={idx} className="bg-default-50 p-3 rounded-lg text-sm">
                                      <div className="font-semibold">{r.description} ({r.nodeName})</div>
                                      <div className="text-default-500 mt-1 flex items-center justify-between">
                                        <span>目标: {r.targetIp}{r.targetPort ? ':' + r.targetPort : ''}</span>
                                        <span className={r.success ? "text-success" : "text-danger"}>
                                          {r.success ? "连接成功" : "连接失败"}
                                        </span>
                                      </div>
                                      {r.success ? (
                                        <div className="text-default-400 mt-1 flex gap-4">
                                          <span>延迟: {r.averageTime?.toFixed(0)} ms</span>
                                          <span>丢包: {r.packetLoss?.toFixed(1)}%</span>
                                        </div>
                                      ) : (
                                        <div className="text-danger mt-1">
                                          {r.message}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-default-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-default-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">暂无诊断数据</h3>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  关闭
                </Button>
                {currentDiagnosisForward && (
                  <Button
                    color="primary"
                    onPress={() => handleDiagnose(currentDiagnosisForward)}
                    isLoading={diagnosisLoading}
                  >
                    重新诊断
                  </Button>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 批量操作模态框 */}
      <Modal
        isOpen={batchModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeBatchModal();
          } else {
            setBatchModalOpen(true);
          }
        }}
        size="lg"
        backdrop="blur"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{batchUpdateType === 'protocol' ? '批量设置协议' : '批量打标签'}</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-divider bg-default-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">本次操作</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Chip size="sm" variant="flat" color="primary">
                        已选择 {selectedForwardIds.length} 条
                      </Chip>
                      <Chip size="sm" variant="flat" color="secondary">
                        当前筛选命中 {selectedVisibleCount} 条
                      </Chip>
                    </div>
                    <p className="mt-3 text-sm text-default-500">
                      {batchUpdateType === 'protocol'
                        ? '保存后会把所选转发的协议统一设置为同一项。'
                        : '保存后会覆盖所选转发的标签集合。若要清空标签，直接保存空选择即可。'}
                    </p>
                  </div>

                  {batchUpdateType === 'protocol' ? (
                    <Select
                      aria-label="批量协议"
                      placeholder="选择要应用的协议"
                      selectedKeys={batchProtocolId !== null ? new Set([batchProtocolId.toString()]) : new Set([])}
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0];
                        setBatchProtocolId(selected ? Number(selected) : null);
                      }}
                      variant="bordered"
                    >
                      {protocols.map((protocol) => (
                        <SelectItem key={protocol.id.toString()} textValue={protocol.name}>
                          {protocol.name}
                        </SelectItem>
                      ))}
                    </Select>
                  ) : (
                    <Select
                      placeholder="选择标签 (多项选择)"
                      selectionMode="multiple"
                      selectedKeys={new Set(batchTagIds)}
                      onSelectionChange={(keys) => setBatchTagIds(Array.from(keys) as string[])}
                      variant="bordered"
                    >
                      {tags.map((tag) => (
                        <SelectItem key={tag.id.toString()} textValue={tag.name}>
                          <div className="flex items-center gap-2">
                            <Chip size="sm" variant="flat" color={getTagChipColor(tag.color)}>
                              {tag.name}
                            </Chip>
                          </div>
                        </SelectItem>
                      ))}
                    </Select>
                  )}

                  {selectedForwards.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">示例对象</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedForwards.slice(0, 6).map((forward) => (
                          <Chip key={forward.id} size="sm" variant="flat">
                            {forward.name}
                          </Chip>
                        ))}
                        {selectedForwards.length > 6 && (
                          <Chip size="sm" variant="flat" color="default">
                            还有 {selectedForwards.length - 6} 条
                          </Chip>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={() => { closeBatchModal(); onClose(); }}>取消</Button>
                <Button color="primary" isLoading={batchSubmitting} onPress={handleBatchUpdate}>
                  {batchUpdateType === 'protocol' ? '应用协议' : '保存标签'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>

  );
} 
