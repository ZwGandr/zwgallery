import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Button, Card, CardBody, CardHeader, Chip, Input, Link, Progress, Textarea } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { BASE_API2 } from "../constants/api.ts";
import { ImageOptimizationError, optimizeUploadImage } from "../utils/optimizeUploadImage.ts";

type Session = "loading" | "anonymous" | "authenticated";
type SessionResponse = { authenticated: boolean; username?: string };
type Stage = "idle" | "login" | "compress" | "presign" | "put" | "finalize";
type Dimensions = { width: number; height: number };
type PresignResult = { uploadId: string; uploadUrl: string; contentType: string };
type CreatePhotoResult = { payload: { id: number } };

const MAX_SIZE = 30 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function defaultLocalDateTime(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function timezoneOffset(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export default function UploadPage() {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const csrfToken = useRef<string | null>(null);
  const [session, setSession] = useState<Session>("loading");
  const [username, setUsername] = useState("");
  const [currentUsername, setCurrentUsername] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [authorName, setAuthorName] = useState("zwgandr");
  const [takenAt, setTakenAt] = useState(defaultLocalDateTime);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    axios.get<SessionResponse>(`${BASE_API2}/admin/session`, { withCredentials: true })
      .then(({ data }) => {
        if (active) {
          setSession(data.authenticated ? "authenticated" : "anonymous");
          setCurrentUsername(data.authenticated ? data.username ?? "" : "");
        }
      })
      .catch(() => {
        if (active) {
          setSession("anonymous");
          setError(t("upload.error.network"));
        }
      });
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setDimensions(null);
      return;
    }
    // 预览只使用浏览器本地 object URL；选择文件不会自动上传。
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    let active = true;
    setPreviewUrl(url);
    setDimensions(null);
    image.onload = () => {
      if (!active) return;
      if (image.naturalWidth < 1 || image.naturalHeight < 1
          || image.naturalWidth > 20000 || image.naturalHeight > 20000) {
        setError(t("upload.error.dimensions"));
        return;
      }
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => { if (active) setError(t("upload.error.dimensions")); };
    image.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file, t]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = "";
    setError("");
    setPublishedId(null);
    setPendingUploadId(null);
    setFile(null);
    setOriginalSize(null);
    if (!selected) return;
    if (!IMAGE_TYPES.has(selected.type)) {
      setError(t("upload.error.file_type"));
      return;
    }
    if (selected.size < 1 || selected.size > MAX_SIZE) {
      setError(t("upload.error.file_size"));
      return;
    }
    setTitle(selected.name.replace(/\.[^.]+$/, "").slice(0, 200));
    setStage("compress");
    try {
      // 签名请求与 R2 PUT 均使用压缩后的文件、大小及 MIME 类型。
      const optimized = await optimizeUploadImage(selected);
      setOriginalSize(selected.size);
      setFile(optimized);
    } catch (cause) {
      const reason = cause instanceof ImageOptimizationError ? cause.reason : "target";
      setError(t(`upload.error.optimize_${reason}`));
    } finally {
      setStage("idle");
    }
  }

  async function getCsrfToken(): Promise<string> {
    // CSRF 与管理员会话均使用同源 /api；R2 PUT 不携带这枚 token 或 cookie。
    const { data } = await axios.get<{ token: string }>(`${BASE_API2}/admin/csrf`, {
      withCredentials: true,
    });
    csrfToken.current = data.token;
    return data.token;
  }

  function requestError(cause: unknown): string {
    if (axios.isAxiosError(cause)) {
      return cause.response
        ? t("upload.error.server", { status: cause.response.status })
        : t("upload.error.network");
    }
    return cause instanceof Error ? cause.message : t("upload.error.network");
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage !== "idle") return;
    setError("");
    setStage("login");
    try {
      const token = await getCsrfToken();
      // 两位管理员分别输入自己的用户名和密码；明文密码不写入前端配置。
      const { data } = await axios.post<SessionResponse>(`${BASE_API2}/admin/session`, {
        username: username.trim(), password,
      }, {
        withCredentials: true,
        headers: { "X-CSRF-TOKEN": token },
      });
      // 登录会更换会话 ID，重新获取 token 供后续写入使用。
      await getCsrfToken();
      setPassword("");
      setCurrentUsername(data.username ?? username.trim());
      setSession("authenticated");
    } catch (cause) {
      csrfToken.current = null;
      setError(requestError(cause));
    } finally {
      setStage("idle");
    }
  }

  async function logout() {
    setError("");
    try {
      const token = csrfToken.current ?? await getCsrfToken();
      await axios.delete(`${BASE_API2}/admin/session`, {
        withCredentials: true,
        headers: { "X-CSRF-TOKEN": token },
      });
      csrfToken.current = null;
      setCurrentUsername("");
      setSession("anonymous");
    } catch (cause) {
      csrfToken.current = null;
      setError(requestError(cause));
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage !== "idle" || !file || !dimensions || session !== "authenticated") return;
    setError("");
    setPublishedId(null);

    const date = new Date(takenAt);
    if (!title.trim() || !authorName.trim() || !takenAt || Number.isNaN(date.getTime())) {
      setError(t("upload.error.required"));
      return;
    }
    const hasLatitude = latitude.trim() !== "";
    const hasLongitude = longitude.trim() !== "";
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (hasLatitude !== hasLongitude || (hasLatitude &&
        (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180))) {
      setError(t("upload.error.location"));
      return;
    }

    let currentStage: Stage = pendingUploadId ? "finalize" : "presign";
    let uploadedToR2 = pendingUploadId !== null;
    try {
      let uploadId = pendingUploadId;
      const token = csrfToken.current ?? await getCsrfToken();
      if (!uploadId) {
        setStage("presign");
        const { data } = await axios.post<PresignResult>(`${BASE_API2}/admin/uploads/presign`, {
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }, { withCredentials: true, headers: { "X-CSRF-TOKEN": token } });
        const target = new URL(data.uploadUrl);
        if (target.protocol !== "https:" || !target.hostname.endsWith(".r2.cloudflarestorage.com")) {
          throw new Error(t("upload.error.r2"));
        }
        currentStage = "put";
        setStage("put");
        const response = await fetch(data.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": data.contentType },
          credentials: "omit",
        });
        if (!response.ok) throw new Error(t("upload.error.r2"));
        uploadId = data.uploadId;
        uploadedToR2 = true;
        // PUT 已成功时保留 uploadId，登记失败可重试而不重复上传。
        setPendingUploadId(uploadId);
      }

      currentStage = "finalize";
      setStage("finalize");
      const { data: created } = await axios.post<CreatePhotoResult>(`${BASE_API2}/admin/photos`, {
        uploadId,
        title: title.trim(),
        description: description.trim(),
        authorName: authorName.trim(),
        width: dimensions.width,
        height: dimensions.height,
        metadata: {
          datetime: date.toISOString(),
          timezone: timezoneOffset(date),
          ...(hasLatitude ? { location: { latitude: lat, longitude: lon } } : {}),
        },
      }, { withCredentials: true, headers: { "X-CSRF-TOKEN": token } });
      setPendingUploadId(null);
      setPublishedId(created.payload.id);
    } catch (cause) {
      if (axios.isAxiosError(cause) && [401, 403].includes(cause.response?.status ?? 0)) {
        csrfToken.current = null;
        if (cause.response?.status === 401) {
          setCurrentUsername("");
          setSession("anonymous");
        }
      }
      setError(currentStage === "finalize" && uploadedToR2
        ? `${t("upload.error.finalize")} ${requestError(cause)}`
        : currentStage === "put" ? t("upload.error.r2") : requestError(cause));
    } finally {
      setStage("idle");
    }
  }

  const busy = stage !== "idle";
  const stageLabel = stage === "idle" ? "" : t(`upload.stage.${stage}`);

  return <div className="px-3 md:px-6 py-6 pb-12 w-full max-w-2xl mx-auto">
    <div className="flex items-center justify-between gap-3 mb-5">
      <h1 className="text-3xl font-semibold">{t("upload.title")}</h1>
      {session === "authenticated" && <div className="flex items-center gap-2">
        {currentUsername && <Chip size="sm" variant="flat">
          {t("upload.signed_in_as", { username: currentUsername })}
        </Chip>}
        <Button size="sm" variant="flat" onPress={logout} isDisabled={busy}>{t("upload.logout")}</Button>
      </div>}
    </div>

    {error && <Card className="mb-5 border border-danger-300 bg-danger-50 text-danger-700" role="alert">
      <CardBody className="text-sm">{error}</CardBody>
    </Card>}

    {session === "loading" && <Progress isIndeterminate aria-label="Loading"/>}

    {session === "anonymous" && <Card>
      <CardBody className="gap-4">
        <p className="text-default-500">{t("upload.login_hint")}</p>
        <form onSubmit={login} className="flex flex-col gap-4">
          <Input label={t("upload.username")} value={username} onValueChange={setUsername}
                 autoComplete="username" maxLength={100} isRequired/>
          <Input label={t("upload.password")} type="password" value={password}
                 onValueChange={setPassword} autoComplete="current-password" isRequired/>
          <Button color="primary" type="submit" isLoading={busy}>{t("upload.login")}</Button>
        </form>
      </CardBody>
    </Card>}

    {session === "authenticated" && <form onSubmit={upload} className="flex flex-col gap-5">
      <Card>
        <CardHeader className="font-semibold">{t("upload.choose_file")}</CardHeader>
        <CardBody className="gap-4">
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp"
                 className="sr-only" aria-label={t("upload.choose_file")}
                 onChange={chooseFile} disabled={busy || pendingUploadId !== null}/>
          <Button type="button" variant="flat" onPress={() => fileInput.current?.click()}
                  isDisabled={busy || pendingUploadId !== null}>
            {t("upload.choose_file")}
          </Button>
          <p className="text-xs text-default-500">{t("upload.file_hint")}</p>
          {file && <div className="flex flex-col gap-3">
            {previewUrl && <img src={previewUrl} alt={file.name}
                                className="max-h-72 w-full rounded-large object-contain bg-default-100"/>}
            <div className="flex flex-wrap items-center gap-2 text-sm text-default-500">
              <span className="break-all">{file.name}</span>
              <Chip size="sm" variant="flat">{(file.size / 1024).toFixed(0)} KiB</Chip>
              {dimensions && <Chip size="sm" variant="flat">{dimensions.width} × {dimensions.height}</Chip>}
            </div>
            {originalSize !== null && originalSize !== file.size &&
              <p className="text-xs text-success-600">
                {t("upload.optimized", {
                  before: (originalSize / 1024 / 1024).toFixed(2),
                  after: (file.size / 1024).toFixed(0),
                })}
              </p>}
          </div>}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="gap-4">
          <Input label={t("upload.photo_title")} value={title} onValueChange={setTitle}
                 maxLength={200} isRequired isDisabled={busy}/>
          <Textarea label={t("upload.description")} value={description}
                    onValueChange={setDescription} maxLength={2000} isDisabled={busy}/>
          <Input label={t("upload.author")} value={authorName} onValueChange={setAuthorName}
                 maxLength={100} isRequired isDisabled={busy}/>
          <Input label={t("upload.datetime")} type="datetime-local" value={takenAt}
                 onValueChange={setTakenAt} isRequired isDisabled={busy}/>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label={t("upload.latitude")} type="number" step="any" value={latitude}
                   onValueChange={setLatitude} isDisabled={busy}/>
            <Input label={t("upload.longitude")} type="number" step="any" value={longitude}
                   onValueChange={setLongitude} isDisabled={busy}/>
          </div>
          <p className="text-xs text-default-500">{t("upload.location_hint")}</p>
        </CardBody>
      </Card>

      {busy && <Progress isIndeterminate label={stageLabel} aria-label={stageLabel}/>}
      <Button color="primary" size="lg" type="submit" isLoading={busy}
              isDisabled={!file || !dimensions || publishedId !== null}>
        {pendingUploadId ? t("upload.retry") : t("upload.submit")}
      </Button>
      {publishedId !== null && <Card className="border border-success-300 bg-success-50">
        <CardBody className="flex-row items-center justify-between gap-3">
          <span>{t("upload.published")} #{publishedId}</span>
          <Link href={`/photo/${publishedId}`}>{t("upload.view_photo")}</Link>
        </CardBody>
      </Card>}
    </form>}
  </div>;
}
