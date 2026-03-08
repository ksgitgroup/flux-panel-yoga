import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import { completeDingtalkAuth, LoginResponse } from "@/api";
import DefaultLayout from "@/layouts/default";
import { persistAuthSession } from "@/utils/auth";

function handleAuthSuccess(authData: LoginResponse, navigate: ReturnType<typeof useNavigate>) {
  if (!persistAuthSession(authData)) {
    toast.error("登录响应不完整，请重试");
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
  navigate("/dashboard", { replace: true });
}

export default function DingtalkCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const authCode = searchParams.get("authCode") || searchParams.get("code");
    const state = searchParams.get("state");

    if (!authCode || !state) {
      setErrorMessage("回调参数不完整，请返回登录页重试");
      return;
    }

    let cancelled = false;

    const completeLogin = async () => {
      try {
        const response = await completeDingtalkAuth(authCode, state);
        if (cancelled) {
          return;
        }
        if (response.code !== 0 || !response.data) {
          setErrorMessage(response.msg || "钉钉登录失败");
          return;
        }
        toast.success("钉钉登录成功");
        handleAuthSuccess(response.data, navigate);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage("钉钉登录请求失败");
        }
      }
    };

    void completeLogin();
    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <DefaultLayout>
      <section className="flex min-h-[calc(100dvh-120px)] items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg">
          <CardBody className="gap-4 p-8 text-center">
            {errorMessage ? (
              <>
                <h1 className="text-2xl font-bold">钉钉登录失败</h1>
                <p className="text-sm text-default-500">{errorMessage}</p>
              </>
            ) : (
              <>
                <Spinner size="lg" />
                <h1 className="text-2xl font-bold">正在完成钉钉登录</h1>
                <p className="text-sm text-default-500">Flux 正在校验组织身份并建立后台会话。</p>
              </>
            )}
          </CardBody>
        </Card>
      </section>
    </DefaultLayout>
  );
}
