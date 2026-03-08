import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/modal";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { siteConfig } from "@/config/site";
import { title } from "@/components/primitives";
import DefaultLayout from "@/layouts/default";
import {
  checkCaptcha,
  completeTwoFactorLogin,
  getDingtalkAuthorizeUrl,
  getIamAuthOptions,
  IamAuthOptions,
  LoginData,
  LoginResponse,
  login
} from "@/api";
import { persistAuthSession } from "@/utils/auth";
import "@/utils/tac.css";
import "@/utils/tac.min.js";
import bgImage from "@/images/bg.jpg";

interface LoginForm {
  username: string;
  password: string;
  captchaId: string;
}

interface TwoFactorForm {
  twoFactorCode: string;
}

interface CaptchaConfig {
  requestCaptchaDataUrl: string;
  validCaptchaUrl: string;
  bindEl: string;
  validSuccess: (res: any, captcha: any, tac: any) => void;
  validFail?: (res: any, captcha: any, tac: any) => void;
  btnCloseFun?: (event: any, tac: any) => void;
  btnRefreshFun?: (event: any, tac: any) => void;
}

interface CaptchaStyle {
  btnUrl?: string;
  bgUrl?: string;
  logoUrl?: string | null;
  moveTrackMaskBgColor?: string;
  moveTrackMaskBorderColor?: string;
}

export default function IndexPage() {
  const [form, setForm] = useState<LoginForm>({
    username: "",
    password: "",
    captchaId: "",
  });
  const [twoFactorForm, setTwoFactorForm] = useState<TwoFactorForm>({
    twoFactorCode: "",
  });
  const [loading, setLoading] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<LoginForm>>({});
  const [twoFactorErrors, setTwoFactorErrors] = useState<Partial<TwoFactorForm>>({});
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [authOptions, setAuthOptions] = useState<IamAuthOptions | null>(null);
  const [authOptionsLoading, setAuthOptionsLoading] = useState(true);
  const [dingtalkLoading, setDingtalkLoading] = useState(false);
  const [twoFactorModalOpen, setTwoFactorModalOpen] = useState(false);
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState("");
  const [twoFactorChallengeExpiresAt, setTwoFactorChallengeExpiresAt] = useState<number | null>(null);
  const navigate = useNavigate();
  const tacInstanceRef = useRef<any>(null);
  const captchaContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const loadAuthOptions = async () => {
      try {
        const response = await getIamAuthOptions();
        if (response.code === 0 && response.data) {
          setAuthOptions(response.data);
        }
      } catch (error) {
        console.error("加载认证选项失败:", error);
      } finally {
        setAuthOptionsLoading(false);
      }
    };
    void loadAuthOptions();
  }, []);

  useEffect(() => {
    return () => {
      if (tacInstanceRef.current) {
        tacInstanceRef.current.destroyWindow();
        tacInstanceRef.current = null;
      }
    };
  }, []);

  const validatePrimaryForm = (): boolean => {
    const newErrors: Partial<LoginForm> = {};

    if (!form.username.trim()) {
      newErrors.username = "请输入用户名";
    }

    if (!form.password.trim()) {
      newErrors.password = "请输入密码";
    } else if (form.password.length < 6) {
      newErrors.password = "密码长度至少6位";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateTwoFactorForm = (): boolean => {
    const newErrors: Partial<TwoFactorForm> = {};
    if (!/^\d{6}$/.test(twoFactorForm.twoFactorCode.trim())) {
      newErrors.twoFactorCode = "请输入 6 位数字验证码";
    }
    setTwoFactorErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof LoginForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleTwoFactorInputChange = (value: string) => {
    setTwoFactorForm({ twoFactorCode: value.replace(/[^\d]/g, "").slice(0, 6) });
    if (twoFactorErrors.twoFactorCode) {
      setTwoFactorErrors({});
    }
  };

  const resetTwoFactorChallenge = () => {
    setTwoFactorModalOpen(false);
    setTwoFactorChallengeToken("");
    setTwoFactorChallengeExpiresAt(null);
    setTwoFactorForm({ twoFactorCode: "" });
    setTwoFactorErrors({});
    setTwoFactorLoading(false);
  };

  const handleAuthSuccess = (authData?: LoginResponse) => {
    if (!persistAuthSession(authData)) {
      toast.error("登录响应不完整，请重试");
      return;
    }
    const session = authData;
    if (!session) {
      toast.error("登录响应不完整，请重试");
      return;
    }

    if (session.requirePasswordChange) {
      localStorage.setItem("force_password_change", "true");
      localStorage.removeItem("force_two_factor_setup");
      toast.success("检测到默认密码，即将跳转到修改密码页面");
      navigate("/change-password");
      return;
    }

    localStorage.removeItem("force_password_change");

    if (session.requireTwoFactorSetup) {
      localStorage.setItem("force_two_factor_setup", "true");
      toast.success(session.twoFactorRequired ? "当前安全策略要求先完成二步验证绑定" : "请完成二步验证绑定");
      navigate("/profile");
      return;
    }

    localStorage.removeItem("force_two_factor_setup");
    toast.success("登录成功");
    navigate("/dashboard");
  };

  const handleDingtalkLogin = async () => {
    setDingtalkLoading(true);
    try {
      const response = await getDingtalkAuthorizeUrl('web');
      if (response.code !== 0 || !response.data?.authorizeUrl) {
        toast.error(response.msg || "获取钉钉登录地址失败");
        return;
      }
      window.location.assign(response.data.authorizeUrl);
    } catch (error) {
      toast.error("获取钉钉登录地址失败");
    } finally {
      setDingtalkLoading(false);
    }
  };

  const initCaptcha = async () => {
    if (!window.TAC || !captchaContainerRef.current) {
      return;
    }

    try {
      if (tacInstanceRef.current) {
        tacInstanceRef.current.destroyWindow();
        tacInstanceRef.current = null;
      }

      const baseURL = axios.defaults.baseURL || (import.meta.env.VITE_API_BASE ? `${import.meta.env.VITE_API_BASE}/api/v1/` : "/api/v1/");
      const config: CaptchaConfig = {
        requestCaptchaDataUrl: `${baseURL}captcha/generate`,
        validCaptchaUrl: `${baseURL}captcha/verify`,
        bindEl: "#captcha-container",
        validSuccess: (res: any, _: any, tac: any) => {
          const validToken = res?.data?.validToken || "";
          setForm((prev) => ({ ...prev, captchaId: validToken }));
          setShowCaptcha(false);
          tac.destroyWindow();
          performLogin(validToken);
        },
        validFail: (_: any, _captcha: any, tac: any) => {
          tac.reloadCaptcha();
        },
        btnCloseFun: (_event: any, tac: any) => {
          setShowCaptcha(false);
          tac.destroyWindow();
          setLoading(false);
        },
        btnRefreshFun: (_event: any, tac: any) => {
          tac.reloadCaptcha();
        },
      };

      const isDarkMode = document.documentElement.classList.contains("dark")
        || document.documentElement.getAttribute("data-theme") === "dark"
        || window.matchMedia("(prefers-color-scheme: dark)").matches;
      const trackColor = isDarkMode ? "#4a5568" : "#7db0be";
      const style: CaptchaStyle = {
        bgUrl: bgImage,
        logoUrl: null,
        moveTrackMaskBgColor: trackColor,
        moveTrackMaskBorderColor: trackColor,
      };

      tacInstanceRef.current = new window.TAC(config, style);
      tacInstanceRef.current.init();
    } catch (error) {
      console.error("初始化验证码失败:", error);
      toast.error("验证码初始化失败，请刷新页面重试");
      setShowCaptcha(false);
      setLoading(false);
    }
  };

  const performLogin = async (captchaIdOverride?: string) => {
    try {
      const loginData: LoginData = {
        username: form.username.trim(),
        password: form.password,
        captchaId: captchaIdOverride ?? form.captchaId,
      };

      const response = await login(loginData);
      if (response.code !== 0) {
        toast.error(response.msg || "登录失败");
        return;
      }

      if (response.data?.requireTwoFactorVerification && response.data.twoFactorChallengeToken) {
        setTwoFactorChallengeToken(response.data.twoFactorChallengeToken);
        setTwoFactorChallengeExpiresAt(response.data.twoFactorChallengeExpiresAt ?? null);
        setTwoFactorForm({ twoFactorCode: "" });
        setTwoFactorErrors({});
        setTwoFactorModalOpen(true);
        toast.success("账号密码验证通过，请完成二步验证");
        return;
      }

      handleAuthSuccess(response.data);
    } catch (error) {
      console.error("登录错误:", error);
      toast.error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!validatePrimaryForm()) return;

    resetTwoFactorChallenge();
    setLoading(true);

    try {
      const checkResponse = await checkCaptcha();
      if (checkResponse.code !== 0) {
        toast.error(`检查验证码状态失败，请重试${checkResponse.msg || ""}`);
        setLoading(false);
        return;
      }

      if (checkResponse.data === 0) {
        await performLogin();
      } else {
        setShowCaptcha(true);
        setTimeout(() => {
          initCaptcha();
        }, 100);
      }
    } catch (error) {
      console.error("检查验证码状态错误:", error);
      toast.error("网络错误，请稍后重试");
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async () => {
    if (!validateTwoFactorForm() || !twoFactorChallengeToken) {
      return;
    }

    setTwoFactorLoading(true);
    try {
      const response = await completeTwoFactorLogin({
        challengeToken: twoFactorChallengeToken,
        twoFactorCode: twoFactorForm.twoFactorCode.trim(),
      });
      if (response.code !== 0) {
        toast.error(response.msg || "二步验证失败");
        return;
      }
      resetTwoFactorChallenge();
      handleAuthSuccess(response.data);
    } catch (error) {
      console.error("二步验证错误:", error);
      toast.error("网络错误，请稍后重试");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handlePrimaryKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      handleLogin();
    }
  };

  const handleTwoFactorKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !twoFactorLoading) {
      handleTwoFactorSubmit();
    }
  };

  const challengeExpiryText = twoFactorChallengeExpiresAt
    ? new Date(twoFactorChallengeExpiresAt).toLocaleString()
    : "5 分钟内有效";

  return (
    <DefaultLayout>
      <section className="flex min-h-[calc(100dvh-120px)] flex-col items-center justify-center gap-4 pb-20 py-4 sm:min-h-[calc(100dvh-200px)] sm:py-8 md:py-10">
        <div className="w-full max-w-md px-4 sm:px-0">
          <Card className="w-full">
            <CardHeader className="flex-col items-center px-6 pb-0 pt-6">
              <h1 className={title({ size: "sm" })}>登陆</h1>
              <p className="text-small text-default-500 mt-2">请选择管理员本地登录或钉钉登录</p>
            </CardHeader>
            <CardBody className="px-6 py-6">
              <div className="flex flex-col gap-4">
                {(authOptions?.localAdminEnabled ?? true) && (
                  <>
                    <Input
                      label="管理员用户名"
                      placeholder="请输入用户名"
                      value={form.username}
                      onChange={(e) => handleInputChange('username', e.target.value)}
                      onKeyDown={handlePrimaryKeyPress}
                      variant="bordered"
                      isDisabled={loading || dingtalkLoading}
                      isInvalid={!!errors.username}
                      errorMessage={errors.username}
                    />
                    
                    <Input
                      label="管理员密码"
                      placeholder="请输入密码"
                      type="password"
                      value={form.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      onKeyDown={handlePrimaryKeyPress}
                      variant="bordered"
                      isDisabled={loading || dingtalkLoading}
                      isInvalid={!!errors.password}
                      errorMessage={errors.password}
                    />

                    <p className="text-xs leading-6 text-default-500">
                      本地登录仅保留给应急管理员。若账号启用了二步验证，提交用户名和密码后会进入单独的验证码确认步骤。
                    </p>

                    <Button
                      color="primary"
                      size="lg"
                      onClick={handleLogin}
                      isLoading={loading}
                      isDisabled={loading || dingtalkLoading || authOptionsLoading}
                      className="mt-2"
                    >
                      {loading ? (showCaptcha ? "验证中..." : "登录中...") : "管理员登录"}
                    </Button>
                  </>
                )}

                {authOptions?.dingtalkOauthEnabled && authOptions?.dingtalkConfigured && (
                  <>
                    <div className="relative py-1">
                      <div className="h-px bg-divider" />
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-content1 px-3 text-xs text-default-400">
                        企业成员
                      </span>
                    </div>
                    <Button
                      color="default"
                      size="lg"
                      variant="bordered"
                      onClick={handleDingtalkLogin}
                      isLoading={dingtalkLoading}
                      isDisabled={loading || dingtalkLoading}
                    >
                      使用钉钉登录
                    </Button>
                    <p className="text-xs leading-6 text-default-500">
                      企业成员通过钉钉完成组织身份验证，并按 Flux 中的角色权限进入对应模块。
                    </p>
                  </>
                )}

                {!authOptionsLoading && !(authOptions?.localAdminEnabled ?? true) && !(authOptions?.dingtalkOauthEnabled && authOptions?.dingtalkConfigured) && (
                  <p className="text-sm text-danger">当前没有可用的登录方式，请联系管理员检查 IAM 配置。</p>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      
        <div className="fixed inset-x-0 bottom-4 py-4 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {siteConfig.release_version} · {siteConfig.build_revision}
          </p>
        </div>

        {showCaptcha && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm captcha-backdrop-enter" />
            <div className="mb-4">
              <div
                id="captcha-container"
                ref={captchaContainerRef}
                className="w-full flex justify-center"
                style={{
                  filter: document.documentElement.classList.contains("dark")
                    || document.documentElement.getAttribute("data-theme") === "dark"
                    || window.matchMedia("(prefers-color-scheme: dark)").matches
                    ? "brightness(0.8) contrast(0.9)"
                    : "none",
                }}
              />
            </div>
          </div>
        )}

        <Modal
          isOpen={twoFactorModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              resetTwoFactorChallenge();
            }
          }}
          size="md"
          backdrop="blur"
          placement="center"
          isDismissable={!twoFactorLoading}
          hideCloseButton={twoFactorLoading}
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <h2 className="text-lg font-bold">二步验证</h2>
                  <p className="text-small text-default-500">
                    账号密码已通过，请输入认证器中的 6 位验证码后完成登录。
                  </p>
                </ModalHeader>
                <ModalBody>
                  <div className="space-y-4 pb-2">
                    <Input
                      label="二步验证码"
                      placeholder="请输入 6 位验证码"
                      value={twoFactorForm.twoFactorCode}
                      onChange={(e) => handleTwoFactorInputChange(e.target.value)}
                      onKeyDown={handleTwoFactorKeyPress}
                      variant="bordered"
                      isDisabled={twoFactorLoading}
                      isInvalid={!!twoFactorErrors.twoFactorCode}
                      errorMessage={twoFactorErrors.twoFactorCode}
                      autoFocus
                    />
                    <div className="rounded-xl border border-default-200 bg-default-50 px-3 py-3 text-xs leading-6 text-default-500 dark:bg-default-100/10">
                      <p>登录账号：{form.username.trim() || "-"}</p>
                      <p>验证会话有效期：{challengeExpiryText}</p>
                    </div>
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button
                    variant="light"
                    onPress={() => {
                      resetTwoFactorChallenge();
                      onClose();
                    }}
                    isDisabled={twoFactorLoading}
                  >
                    取消
                  </Button>
                  <Button color="primary" onPress={handleTwoFactorSubmit} isLoading={twoFactorLoading}>
                    验证并登录
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>
      </section>
    </DefaultLayout>
  );
}
