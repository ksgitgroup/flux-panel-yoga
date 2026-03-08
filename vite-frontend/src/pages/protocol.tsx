import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Spinner } from "@heroui/spinner";
import toast from 'react-hot-toast';

import {
    createProtocol,
    getProtocolList,
    updateProtocol,
    deleteProtocol
} from "@/api";

interface Protocol {
    id: number;
    name: string;
    description: string;
    configSchema: string;
    createdTime: number;
}

export default function ProtocolPage() {
    const [loading, setLoading] = useState(true);
    const [protocols, setProtocols] = useState<Protocol[]>([]);

    // 模态框状态
    const [modalOpen, setModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [isEdit, setIsEdit] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [protocolToDelete, setProtocolToDelete] = useState<Protocol | null>(null);

    // 表单状态
    const [form, setForm] = useState<Partial<Protocol>>({
        name: '',
        description: '',
        configSchema: ''
    });

    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        loadProtocols();
    }, []);

    const loadProtocols = async () => {
        setLoading(true);
        try {
            const res = await getProtocolList();
            if (res.code === 0) {
                setProtocols(res.data || []);
            } else {
                toast.error(res.msg || "加载协议列表失败");
            }
        } catch (error) {
            toast.error("网络错误，加载协议列表失败");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenAddModal = () => {
        setIsEdit(false);
        setForm({
            name: '',
            description: '',
            configSchema: ''
        });
        setErrors({});
        setModalOpen(true);
    };

    const handleOpenEditModal = (protocol: Protocol) => {
        setIsEdit(true);
        setForm({ ...protocol });
        setErrors({});
        setModalOpen(true);
    };

    const handleOpenDeleteModal = (protocol: Protocol) => {
        setProtocolToDelete(protocol);
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
            const apiCall = isEdit ? updateProtocol : createProtocol;
            const res = await apiCall(form as any);

            if (res.code === 0) {
                toast.success(isEdit ? "更新成功" : "创建成功");
                setModalOpen(false);
                loadProtocols();
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
        if (!protocolToDelete) return;

        setDeleteLoading(true);
        try {
            const res = await deleteProtocol(protocolToDelete.id);
            if (res.code === 0) {
                toast.success("删除成功");
                setDeleteModalOpen(false);
                loadProtocols();
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

    return (
        <div className="p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">协议管理</h1>
                    <p className="text-default-500 text-sm mt-1">管理支持的转发协议及其配置模板</p>
                </div>
                <Button color="primary" onPress={handleOpenAddModal}>
                    添加协议
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {protocols.map((protocol) => (
                    <Card key={protocol.id} className="w-full">
                        <CardHeader className="flex flex-col items-start px-4 pt-4 pb-0">
                            <h4 className="text-lg font-bold">{protocol.name}</h4>
                            <p className="text-small text-default-500">{protocol.description || '无描述'}</p>
                        </CardHeader>
                        <CardBody className="px-4 py-4">
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-small text-default-500">创建时间</span>
                                    <span className="text-small">{formatDate(protocol.createdTime)}</span>
                                </div>
                            </div>
                            <div className="flex gap-2 mt-4">
                                <Button size="sm" color="primary" variant="flat" onPress={() => handleOpenEditModal(protocol)} className="flex-1">
                                    编辑
                                </Button>
                                <Button size="sm" color="danger" variant="flat" onPress={() => handleOpenDeleteModal(protocol)} className="flex-1">
                                    删除
                                </Button>
                            </div>
                        </CardBody>
                    </Card>
                ))}
                {protocols.length === 0 && (
                    <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 text-center py-10 text-default-500">
                        暂无协议数据，请先添加
                    </div>
                )}
            </div>

            {/* 新增/编辑模态框 */}
            <Modal
                isOpen={modalOpen}
                onOpenChange={setModalOpen}
                placement="top-center"
                scrollBehavior="inside"
                classNames={{
                    backdrop: "bg-background/50 backdrop-opacity-40"
                }}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">
                                {isEdit ? "编辑协议" : "添加协议"}
                            </ModalHeader>
                            <ModalBody>
                                <div className="flex gap-4 flex-col">
                                    <Input
                                        label="协议名称"
                                        placeholder="请输入协议名称"
                                        value={form.name}
                                        onValueChange={(val) => {
                                            setForm({ ...form, name: val });
                                            if (errors.name) setErrors({ ...errors, name: '' });
                                        }}
                                        isInvalid={!!errors.name}
                                        errorMessage={errors.name}
                                        isRequired
                                    />

                                    <Input
                                        label="描述"
                                        placeholder="请输入对该协议的描述"
                                        value={form.description}
                                        onValueChange={(val) => setForm({ ...form, description: val })}
                                    />

                                    {/* <Input
                    label="配置 Schema (JSON)"
                    placeholder="用于生成动态表单的 Schema"
                    value={form.configSchema}
                    onValueChange={(val) => setForm({...form, configSchema: val})}
                  /> */}
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
                                <p>确定要删除协议 <strong>{protocolToDelete?.name}</strong> 吗？</p>
                                <p className="text-danger text-sm">此操作可能导致关联了此协议的转发显示异常！</p>
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
