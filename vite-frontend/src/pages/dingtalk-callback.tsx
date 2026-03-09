import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import { completeDingtalkAuth, LoginResponse } from "@/api";
import DefaultLayout from "@/layouts/default";
import { persistAuthSession } from "@/utils/auth";

type CallbackState = 'loading' | 'pending_approval' | 'error';

export default function DingtalkCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<CallbackState>('loading');
  const [message, setMessage] = useState("");

  useEffect(() => {
    const authCode = searchParams.get("authCode") || searchParams.get("code");
    const stateParam = searchParams.get("state");

    if (!authCode || !stateParam) {
      setMessage("回调参数不完整，请返回登录页重试");
      setState('error');
      return;
    }

    let cancelled = false;

    const completeLogin = async () => {
      try {
        const response = await completeDingtalkAuth(authCode, stateParam);
        if (cancelled) return;

        // code=1001: 账号待审批（首次登录自动创建或已存在但未启用）
        if (response.code === 1001) {
          setMessage(response.msg || "账号待管理员审批");
          setState('pending_approval');
          return;
        }

        if (response.code !== 0 || !response.data) {
          setMessage(response.msg || "钉钉登录失败");
          setState('error');
          return;
        }

        const authData: LoginResponse = response.data;

        if (!persistAuthSession(authData)) {
          setMessage("登录响应不完整（缺少 token/name），请联系管理员");
          setState('error');
          return;
        }

        if (authData.requirePasswordChange) {
          localStorage.setItem("force_password_change", "true");
          localStorage.removeItem("force_two_factor_setup");
          navigate("/change-password", { replace: true });
          return;
        }

        localStorage.removeItem("force_password_change");

        if (authData.requireTwoFactorSetup) {
          localStorage.setItem("force_two_factor_setup", "true");
          navigate("/profile", { replace: true });
          return;
        }

        localStorage.removeItem("force_two_factor_setup");
        toast.success("钉钉登录成功");
        navigate("/dashboard", { replace: true });
      } catch (error) {
        if (!cancelled) {
          setMessage("钉钉登录请求失败，请检查网络连接");
          setState('error');
        }
      }
    };

    void completeLogin();
    return () => { cancelled = true; };
  }, [navigate, searchParams]);

  return (
    <DefaultLayout>
      <section className="flex min-h-[calc(100dvh-120px)] items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg">
          <CardBody className="gap-4 p-8 text-center">
            {state === 'pending_approval' ? (
              <>
                <div className="flex justify-center">
                  <Chip size="lg" color="warning" variant="flat">待审批</Chip>
                </div>
                <h1 className="text-2xl font-bold">账号已创建</h1>
                <p className="text-sm text-default-500">{message}</p>
                <p className="text-xs text-default-400">您的钉钉身份已验证通过，系统已自动创建账号。<br/>管理员审批通过并分配角色后即可正常登录。</p>
                <Button color="primary" variant="flat" className="mt-2" onPress={() => navigate("/", { replace: true })}>
                  返回登录页
                </Button>
              </>
            ) : state === 'error' ? (
              <>
                <h1 className="text-2xl font-bold">钉钉登录失败</h1>
                <p className="text-sm text-default-500 whitespace-pre-wrap">{message}</p>
                <Button color="primary" variant="flat" className="mt-2" onPress={() => navigate("/", { replace: true })}>
                  返回登录页
                </Button>
              </>
            ) : (
              <>
                <Spinner size="lg" />
                <h1 className="text-2xl font-bold">正在完成钉钉登录</h1>
                <p className="text-sm text-default-500">Flux 正在校验组织身份并建立后台会话…</p>
              </>
            )}
          </CardBody>
        </Card>
      </section>
    </DefaultLayout>
  );
}
