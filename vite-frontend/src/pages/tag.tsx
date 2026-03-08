import { useState, useEffect, useMemo } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Tabs, Tab } from "@heroui/tabs";
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

import {
    AssetHost,
    createTag,
    getTagList,
    getAssetList,
    updateTag,
    deleteTag
} from "@/api";

interface Tag {
    id: number;
    name: string;
    color: string;
    createdTime: number;
}

export default function TagPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [tags, setTags] = useState<Tag[]>([]);
    const [assets, setAssets] = useState<AssetHost[]>([]);
    const [activeTab, setActiveTab] = useState('forward');

    // 模态框状态
    const [modalOpen, setModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [isEdit, setIsEdit] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);

    // 表单状态
    const [form, setForm] = useState<Partial<Tag>>({
        name: '',
        color: 'primary'
    });

    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        loadAll();
    }, []);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [tagsRes, assetsRes] = await Promise.all([getTagList(), getAssetList()]);
            if (tagsRes.code === 0) setTags(tagsRes.data || []);
            if (assetsRes.code === 0) setAssets(assetsRes.data || []);
        } catch {
            toast.error("加载数据失败");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenAddModal = () => {
        setIsEdit(false);
        setForm({ name: '', color: 'primary' });
        setErrors({});
        setModalOpen(true);
    };

    const handleOpenEditModal = (tag: Tag) => {
        setIsEdit(true);
        setForm({ ...tag });
        setErrors({});
        setModalOpen(true);
    };

    const handleOpenDeleteModal = (tag: Tag) => {
        setTagToDelete(tag);
        setDeleteModalOpen(true);
    };

    const validateForm = () => {
        const newErrors: { [key: string]: string } = {};
        if (!form.name?.trim()) newErrors.name = "名称不能为空";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;
        setSubmitLoading(true);
        try {
            const apiCall = isEdit ? updateTag : createTag;
            const res = await apiCall(form as any);
            if (res.code === 0) {
                toast.success(isEdit ? "更新成功" : "创建成功");
                setModalOpen(false);
                void loadAll();
            } else {
                toast.error(res.msg || (isEdit ? "更新失败" : "创建失败"));
            }
        } catch {
            toast.error("网络请求失败");
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!tagToDelete) return;
        setDeleteLoading(true);
        try {
            const res = await deleteTag(tagToDelete.id);
            if (res.code === 0) {
                toast.success("删除成功");
                setDeleteModalOpen(false);
                void loadAll();
            } else {
                toast.error(res.msg || "删除失败");
            }
        } catch {
            toast.error("网络请求失败");
        } finally {
            setDeleteLoading(false);
        }
    };

    // Compute asset tag stats
    const assetTagStats = useMemo(() => {
        const tagMap = new Map<string, { count: number; source: Set<string> }>();
        assets.forEach(a => {
            const parseTags = (raw?: string | null, source?: string) => {
                if (!raw) return;
                let tagArr: string[] = [];
                try { tagArr = JSON.parse(raw); } catch { tagArr = raw.split(',').map(t => t.trim()).filter(Boolean); }
                tagArr.forEach(t => {
                    const entry = tagMap.get(t) || { count: 0, source: new Set<string>() };
                    entry.count++;
                    if (source) entry.source.add(source);
                    tagMap.set(t, entry);
                });
            };
            parseTags(a.tags, 'asset');
            // probeTags from probe sync are displayed separately in assets but we aggregate here
            if ((a as any).probeTags) parseTags((a as any).probeTags, 'probe');
        });
        return Array.from(tagMap.entries())
            .map(([name, info]) => ({ name, count: info.count, sources: Array.from(info.source) }))
            .sort((a, b) => b.count - a.count);
    }, [assets]);

    const colorOptions = [
        { value: "default", label: "默认" },
        { value: "primary", label: "主要" },
        { value: "secondary", label: "次要" },
        { value: "success", label: "成功" },
        { value: "warning", label: "警告" },
        { value: "danger", label: "危险" }
    ];

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
                <div>
                    <h1 className="text-2xl font-bold">标签管理</h1>
                    <p className="text-default-500 text-sm mt-1">统一管理转发标签与资产标签</p>
                </div>
            </div>

            <Tabs
                selectedKey={activeTab}
                onSelectionChange={(key) => setActiveTab(key as string)}
                variant="solid"
                size="sm"
                color="primary"
                classNames={{
                    tabList: "gap-1 px-1 py-1 bg-default-100 dark:bg-default-50/20 rounded-xl mb-4",
                    tab: "rounded-lg px-4 py-1.5 text-xs font-semibold",
                    cursor: "rounded-lg",
                }}
            >
                <Tab key="forward" title={
                    <div className="flex items-center gap-1.5">
                        <span>转发标签</span>
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary px-1">{tags.length}</span>
                    </div>
                }>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-default-400">用于转发规则分类的全局标签，支持颜色标记。</p>
                            <Button size="sm" color="primary" onPress={handleOpenAddModal}>
                                添加标签
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                            {tags.map((tag) => (
                                <Card key={tag.id} className="w-full">
                                    <CardHeader className="flex justify-center px-4 pt-6 pb-2">
                                        <Chip color={tag.color as any} variant="flat" size="lg" className="px-4">
                                            {tag.name}
                                        </Chip>
                                    </CardHeader>
                                    <CardBody className="px-4 pb-4 pt-2">
                                        <div className="text-center text-xs text-default-400 mb-4">
                                            {tag.createdTime ? new Date(tag.createdTime).toLocaleString() : '-'}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button size="sm" color="default" variant="flat" onPress={() => handleOpenEditModal(tag)} className="flex-1">
                                                编辑
                                            </Button>
                                            <Button size="sm" color="danger" variant="flat" onPress={() => handleOpenDeleteModal(tag)} className="flex-1">
                                                删除
                                            </Button>
                                        </div>
                                    </CardBody>
                                </Card>
                            ))}
                            {tags.length === 0 && (
                                <div className="col-span-full text-center py-10 text-default-500">
                                    暂无转发标签，请先添加
                                </div>
                            )}
                        </div>
                    </div>
                </Tab>

                <Tab key="asset" title={
                    <div className="flex items-center gap-1.5">
                        <span>资产标签</span>
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary/20 text-[9px] font-bold text-secondary px-1">{assetTagStats.length}</span>
                    </div>
                }>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-default-400">
                                资产标签来自手动标记和探针自动同步，在资产编辑页中管理。
                            </p>
                            <Button size="sm" variant="flat" color="primary"
                                onPress={() => navigate('/assets')}>
                                前往资产管理
                            </Button>
                        </div>

                        {assetTagStats.length > 0 ? (
                            <div className="space-y-3">
                                {/* Tag cloud */}
                                <Card>
                                    <CardBody className="p-4">
                                        <p className="text-xs font-semibold text-default-600 mb-3">标签概览</p>
                                        <div className="flex flex-wrap gap-2">
                                            {assetTagStats.map(t => (
                                                <Chip key={t.name} size="sm" variant="flat"
                                                    color={t.sources.includes('probe') ? 'secondary' : 'primary'}
                                                    className="text-xs cursor-pointer hover:opacity-80"
                                                    onClick={() => navigate(`/assets?search=${encodeURIComponent(t.name)}`)}>
                                                    {t.name}
                                                    <span className="ml-1 text-default-400">({t.count})</span>
                                                </Chip>
                                            ))}
                                        </div>
                                    </CardBody>
                                </Card>

                                {/* Tag table */}
                                <Card>
                                    <CardBody className="p-0">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b border-divider">
                                                    <th className="text-left px-4 py-2.5 font-semibold text-default-600">标签名称</th>
                                                    <th className="text-center px-4 py-2.5 font-semibold text-default-600">使用次数</th>
                                                    <th className="text-center px-4 py-2.5 font-semibold text-default-600">来源</th>
                                                    <th className="text-right px-4 py-2.5 font-semibold text-default-600">操作</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {assetTagStats.map(t => (
                                                    <tr key={t.name} className="border-b border-divider/50 hover:bg-default-50/50 dark:hover:bg-default-50/5">
                                                        <td className="px-4 py-2">
                                                            <Chip size="sm" variant="flat" color="default">{t.name}</Chip>
                                                        </td>
                                                        <td className="px-4 py-2 text-center font-mono">{t.count}</td>
                                                        <td className="px-4 py-2 text-center">
                                                            <div className="flex justify-center gap-1">
                                                                {t.sources.includes('asset') && <Chip size="sm" variant="dot" color="primary" className="h-4 text-[9px]">手动</Chip>}
                                                                {t.sources.includes('probe') && <Chip size="sm" variant="dot" color="secondary" className="h-4 text-[9px]">探针</Chip>}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2 text-right">
                                                            <Button size="sm" variant="light" color="primary" className="h-6 text-[10px] min-w-0 px-2"
                                                                onPress={() => navigate(`/assets?search=${encodeURIComponent(t.name)}`)}>
                                                                查看资产
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </CardBody>
                                </Card>
                            </div>
                        ) : (
                            <div className="text-center py-10 text-default-500">
                                暂无资产标签数据
                            </div>
                        )}
                    </div>
                </Tab>
            </Tabs>

            {/* 新增/编辑模态框 */}
            <Modal isOpen={modalOpen} onOpenChange={setModalOpen} placement="top-center">
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>{isEdit ? "编辑标签" : "添加标签"}</ModalHeader>
                            <ModalBody>
                                <div className="flex gap-4 flex-col">
                                    <Input
                                        label="标签名称"
                                        placeholder="请输入标签名称"
                                        value={form.name}
                                        onValueChange={(val) => {
                                            setForm({ ...form, name: val });
                                            if (errors.name) setErrors({ ...errors, name: '' });
                                        }}
                                        isInvalid={!!errors.name}
                                        errorMessage={errors.name}
                                        isRequired
                                    />
                                    <Select
                                        label="标签配色"
                                        placeholder="请选择标签的颜色类别"
                                        selectedKeys={form.color ? [form.color] : []}
                                        onSelectionChange={(keys) => setForm({ ...form, color: Array.from(keys)[0] as string })}
                                        renderValue={(items) => items.map((item) => (
                                            <div key={item.key} className="flex items-center gap-2">
                                                <div className={`w-3 h-3 rounded-full bg-${item.textValue === '默认' ? 'default-400' : item.key}`}></div>
                                                <span>{item.textValue}</span>
                                            </div>
                                        ))}
                                    >
                                        {colorOptions.map((color) => (
                                            <SelectItem key={color.value} textValue={color.label}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-3 h-3 rounded-full bg-${color.value === 'default' ? 'default-400' : color.value}`}></div>
                                                    <span>{color.label}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </Select>
                                    <div className="mt-4 flex justify-center">
                                        <p className="text-sm text-default-500 mr-2">预览: </p>
                                        <Chip color={(form.color || 'primary') as any} variant="flat">
                                            {form.name || '标签名称'}
                                        </Chip>
                                    </div>
                                </div>
                            </ModalBody>
                            <ModalFooter>
                                <Button color="danger" variant="flat" onPress={onClose}>取消</Button>
                                <Button color="primary" onPress={handleSubmit} isLoading={submitLoading}>保存</Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* 删除确认模态框 */}
            <Modal isOpen={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>确认删除</ModalHeader>
                            <ModalBody>
                                <p>确定要删除标签 <strong>{tagToDelete?.name}</strong> 吗？</p>
                                <p className="text-danger text-sm">此操作可能导致关联了此标签的转发显示失去该标签！</p>
                            </ModalBody>
                            <ModalFooter>
                                <Button color="default" variant="flat" onPress={onClose}>取消</Button>
                                <Button color="danger" onPress={handleDelete} isLoading={deleteLoading}>确定删除</Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}
