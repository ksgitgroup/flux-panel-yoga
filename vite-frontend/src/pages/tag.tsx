import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import toast from 'react-hot-toast';

import {
    createTag,
    getTagList,
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
    const [loading, setLoading] = useState(true);
    const [tags, setTags] = useState<Tag[]>([]);

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
        loadTags();
    }, []);

    const loadTags = async () => {
        setLoading(true);
        try {
            const res = await getTagList();
            if (res.code === 0) {
                setTags(res.data || []);
            } else {
                toast.error(res.msg || "加载标签列表失败");
            }
        } catch (error) {
            toast.error("网络错误，加载标签列表失败");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenAddModal = () => {
        setIsEdit(false);
        setForm({
            name: '',
            color: 'primary'
        });
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
                loadTags();
            } else {
                toast.error(res.msg || (isEdit ? "更新失败" : "创建失败"));
            }
        } catch (error) {
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
                loadTags();
            } else {
                toast.error(res.msg || "删除失败");
            }
        } catch (error) {
            toast.error("网络请求失败");
        } finally {
            setDeleteLoading(false);
        }
    };

    const formatDate = (timestamp: number) => {
        if (!timestamp) return '-';
        return new Date(timestamp).toLocaleString();
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Spinner size="lg" />
            </div>
        );
    }

    // HeroUI 自带色彩库: default, primary, secondary, success, warning, danger
    const colorOptions = [
        { value: "default", label: "默认", class: "bg-default" },
        { value: "primary", label: "主要", class: "bg-primary" },
        { value: "secondary", label: "次要", class: "bg-secondary" },
        { value: "success", label: "成功", class: "bg-success" },
        { value: "warning", label: "警告", class: "bg-warning" },
        { value: "danger", label: "危险", class: "bg-danger" }
    ];

    return (
        <div className="p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">标签管理</h1>
                    <p className="text-default-500 text-sm mt-1">管理可应用于转发的全局标签系统</p>
                </div>
                <Button color="primary" onPress={handleOpenAddModal}>
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
                                {formatDate(tag.createdTime)}
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
                        暂无标签数据，请先添加
                    </div>
                )}
            </div>

            {/* 新增/编辑模态框 */}
            <Modal
                isOpen={modalOpen}
                onOpenChange={setModalOpen}
                placement="top-center"
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">
                                {isEdit ? "编辑标签" : "添加标签"}
                            </ModalHeader>
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
                                        renderValue={(items) => {
                                            return items.map((item) => (
                                                <div key={item.key} className="flex items-center gap-2">
                                                    <div className={`w-3 h-3 rounded-full bg-${item.textValue === '默认' ? 'default-400' : item.key}`}></div>
                                                    <span>{item.textValue}</span>
                                                </div>
                                            ));
                                        }}
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
                                <Button color="danger" variant="flat" onPress={onClose}>
                                    取消
                                </Button>
                                <Button color="primary" onPress={handleSubmit} isLoading={submitLoading}>
                                    保存
                                </Button>
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
                            <ModalHeader className="flex flex-col gap-1">确认删除</ModalHeader>
                            <ModalBody>
                                <p>确定要删除标签 <strong>{tagToDelete?.name}</strong> 吗？</p>
                                <p className="text-danger text-sm">此操作可能导致关联了此标签的转发显示失去该标签！</p>
                            </ModalBody>
                            <ModalFooter>
                                <Button color="default" variant="flat" onPress={onClose}>
                                    取消
                                </Button>
                                <Button color="danger" onPress={handleDelete} isLoading={deleteLoading}>
                                    确定删除
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}
