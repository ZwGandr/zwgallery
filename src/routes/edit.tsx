import { useEffect, useState } from "react";
import axios from "axios";
import { Button, Card, CardBody, Link, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Progress } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { BASE_API2 } from "../constants/api.ts";
import { useAdminSession } from "../contexts/admin_session_context.ts";

type JsonObject = Record<string, unknown>;
type PhotoRecord = { id: number; data: JsonObject; revision: string };
type EditRow = PhotoRecord & { original: string; draft: JsonObject };
type PhotoPage = { items: PhotoRecord[]; nextId: number | null };

const clone = (value: JsonObject): JsonObject => JSON.parse(JSON.stringify(value));
const nested = (object: JsonObject, path: string[]): unknown =>
  path.reduce<unknown>((current, key) => current && typeof current === "object"
    ? (current as JsonObject)[key] : undefined, object);
const display = (value: unknown): string => value === null || value === undefined ? "" : String(value);

function editPath(source: JsonObject, path: string[], value: string, numeric = false): JsonObject {
  const copy = clone(source);
  let target = copy;
  for (const key of path.slice(0, -1)) {
    if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) target[key] = {};
    target = target[key] as JsonObject;
  }
  const key = path[path.length - 1];
  if (numeric && value.trim() === "") {
    delete target[key];
    if (path.length === 3 && path[1] === "location" && !Object.keys(target).length) {
      delete (copy.metadata as JsonObject).location;
    }
  } else target[key] = numeric ? Number(value) : value;
  if (path.length === 3 && path[0] === "metadata" && key === "model"
      && (path[1] === "camera" || path[1] === "lens") && value.trim() !== ""
      && (!target.manufacture || typeof target.manufacture !== "object")) {
    target.manufacture = { name: "Other" };
  }
  return copy;
}

export default function EditPage() {
  const { t } = useTranslation();
  const { status, getCsrfToken, handleAuthError } = useAdminSession();
  const [rows, setRows] = useState<EditRow[]>([]);
  const [nextId, setNextId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [advancedId, setAdvancedId] = useState<number | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [numericInputs, setNumericInputs] = useState<Record<string, string>>({});
  const [geocodingId, setGeocodingId] = useState<number | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      setRows([]);
      setNextId(null);
      return;
    }
    let active = true;
    setLoading(true);
    axios.get<{ payload: PhotoPage }>(`${BASE_API2}/admin/photos`, { withCredentials: true })
      .then(({ data }) => {
        if (!active) return;
        setRows(data.payload.items.map(item => ({ ...item, original: JSON.stringify(item.data), draft: clone(item.data) })));
        setNextId(data.payload.nextId);
      })
      .catch(cause => {
        if (!active) return;
        if (axios.isAxiosError(cause)) handleAuthError(cause.response?.status ?? 0);
        setError(t("edit.load_error"));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status]);

  const changed = rows.filter(row => JSON.stringify(row.draft) !== row.original);

  function updateRow(id: number, update: (draft: JsonObject) => JsonObject) {
    setRows(current => current.map(row => row.id === id ? { ...row, draft: update(row.draft) } : row));
    setMessage("");
    setError("");
  }

  function field(id: number, path: string[], value: string, numeric = false) {
    if (numeric) {
      const key = `${id}:${path.join(".")}`;
      setNumericInputs(current => ({ ...current, [key]: value }));
      if (value.trim() !== "" && (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(value) || !Number.isFinite(Number(value)))) return;
    }
    updateRow(id, draft => editPath(draft, path, value, numeric));
  }

  function finishNumeric(id: number, path: string[]) {
    const key = `${id}:${path.join(".")}`;
    setNumericInputs(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function changeUrl(id: number, value: string) {
    updateRow(id, draft => {
      const oldUrl = display(nested(draft, ["large_file", "url"]));
      let next = editPath(draft, ["large_file", "url"], value);
      for (const name of ["thumb_file", "medium_file", "hdr_file"]) {
        if (nested(next, [name, "url"]) === oldUrl) next = editPath(next, [name, "url"], value);
      }
      return next;
    });
  }

  async function reverseAddress(row: EditRow) {
    const latitude = Number(nested(row.draft, ["metadata", "location", "latitude"]));
    const longitude = Number(nested(row.draft, ["metadata", "location", "longitude"]));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    setGeocodingId(row.id);
    setError("");
    try {
      const { data } = await axios.get<{ payload: JsonObject }>(`${BASE_API2}/admin/geo/reverse`, {
        params: { latitude, longitude }, withCredentials: true,
      });
      updateRow(row.id, draft => {
        const next = clone(draft);
        const metadata = next.metadata as JsonObject;
        if (data.payload.city) metadata.city = data.payload.city;
        if (data.payload.place) metadata.place = data.payload.place;
        metadata.has_location = true;
        return next;
      });
      setMessage(t("edit.address_ready"));
    } catch (cause) {
      if (axios.isAxiosError(cause)) {
        handleAuthError(cause.response?.status ?? 0);
        setError(t(cause.response?.status === 503 ? "edit.mapbox_missing" : "edit.address_error"));
      } else setError(t("edit.address_error"));
    } finally {
      setGeocodingId(null);
    }
  }

  async function loadMore() {
    if (!nextId || loading || changed.length) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get<{ payload: PhotoPage }>(`${BASE_API2}/admin/photos`, {
        params: { last_id: nextId }, withCredentials: true,
      });
      setRows(current => [...current, ...data.payload.items.map(item => ({
        ...item, original: JSON.stringify(item.data), draft: clone(item.data),
      }))]);
      setNextId(data.payload.nextId);
    } catch (cause) {
      if (axios.isAxiosError(cause)) handleAuthError(cause.response?.status ?? 0);
      setError(t("edit.load_error"));
    } finally {
      setLoading(false);
    }
  }

  async function movePhoto(id: number, direction: "up" | "down") {
    if (movingId !== null || saving || deleting || changed.length) return;
    const index = rows.findIndex(row => row.id === id);
    const neighbor = index + (direction === "up" ? -1 : 1);
    if (index < 0 || neighbor < 0 || neighbor >= rows.length) return;
    setMovingId(id);
    setError("");
    setMessage("");
    try {
      const token = await getCsrfToken();
      await axios.post(`${BASE_API2}/admin/photos/${id}/move`, { direction }, {
        withCredentials: true, headers: { "X-CSRF-TOKEN": token },
      });
      const reordered = [...rows];
      [reordered[index], reordered[neighbor]] = [reordered[neighbor], reordered[index]];
      setRows(reordered);
      if (nextId !== null) setNextId(reordered[reordered.length - 1].id);
      setMessage(t("edit.moved"));
    } catch (cause) {
      if (axios.isAxiosError(cause)) handleAuthError(cause.response?.status ?? 0);
      setError(t("edit.move_error"));
    } finally {
      setMovingId(null);
    }
  }

  async function deletePhoto() {
    const row = rows.find(item => item.id === deleteId);
    if (!row || deleting || saving) return;
    setDeleting(true);
    setError("");
    try {
      const token = await getCsrfToken();
      await axios.delete(`${BASE_API2}/admin/photos/${row.id}`, {
        data: { revision: row.revision }, withCredentials: true,
        headers: { "X-CSRF-TOKEN": token },
      });
      setRows(current => current.filter(item => item.id !== row.id));
      if (expandedId === row.id) setExpandedId(null);
      setDeleteId(null);
      setMessage(t("edit.deleted"));
    } catch (cause) {
      if (axios.isAxiosError(cause)) {
        const code = cause.response?.status ?? 0;
        handleAuthError(code);
        setError(t(code === 409 ? "edit.delete_conflict" : "edit.delete_error", { status: code || "?" }));
      } else setError(t("edit.delete_error", { status: "?" }));
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  }

  async function save() {
    if (!changed.length || saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    let saved = 0;
    try {
      const token = await getCsrfToken();
      for (const row of changed) {
        const { data } = await axios.put<{ payload: PhotoRecord }>(`${BASE_API2}/admin/photos/${row.id}`, {
          revision: row.revision, data: row.draft,
        }, { withCredentials: true, headers: { "X-CSRF-TOKEN": token } });
        setRows(current => current.map(item => item.id === row.id ? {
          ...data.payload, original: JSON.stringify(data.payload.data), draft: clone(data.payload.data),
        } : item));
        saved++;
      }
      setMessage(t("edit.saved", { count: saved }));
    } catch (cause) {
      if (axios.isAxiosError(cause)) {
        const code = cause.response?.status ?? 0;
        handleAuthError(code);
        setError(code === 409 ? t("edit.conflict", { count: saved })
          : t("edit.save_error", { count: saved, status: code || "?" }));
      } else setError(t("edit.save_error", { count: saved, status: "?" }));
    } finally {
      setSaving(false);
    }
  }

  function openAdvanced(row: EditRow) {
    setAdvancedId(row.id);
    setJsonText(JSON.stringify(row.draft, null, 2));
    setJsonError("");
  }

  function applyAdvanced() {
    try {
      const parsed: unknown = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
        || (parsed as JsonObject).id !== advancedId) {
        setJsonError(t("edit.json_id"));
        return;
      }
      updateRow(advancedId!, () => parsed as JsonObject);
      setAdvancedId(null);
    } catch {
      setJsonError(t("edit.json_invalid"));
    }
  }

  const inputClass = "w-full min-w-0 rounded-md border border-default-200 bg-content1 px-2 py-1 text-xs text-foreground focus:outline-primary";
  const invalidNumber = Object.values(numericInputs).some(value => value.trim() !== ""
    && (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(value) || !Number.isFinite(Number(value))));
  const textField = (row: EditRow, label: string, path: string[], width = "", numeric = false) =>
    <label className={`block min-w-0 ${width}`}>
      <span className="block text-[11px] text-default-500">{t(label)}</span>
      <input className={inputClass} type="text" inputMode={numeric ? "decimal" : undefined}
             value={numeric ? numericInputs[`${row.id}:${path.join(".")}`] ?? display(nested(row.draft, path))
               : display(nested(row.draft, path))}
             onChange={event => field(row.id, path, event.target.value, numeric)}
             onBlur={numeric ? () => finishNumeric(row.id, path) : undefined} disabled={saving}/>
    </label>;

  return <div className="w-full px-3 md:px-6 py-5 pb-12">
    {status === "loading" && <Progress isIndeterminate aria-label={t("edit.loading")}/>}
    {status === "anonymous" && <Card><CardBody>{t("edit.login_required")}</CardBody></Card>}
    {status === "authenticated" && <>
      <div className="sticky top-0 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background/95 py-3 backdrop-blur">
        <div>
          <h1 className="text-xl font-semibold">{t("edit.title")}</h1>
          <p className="text-xs text-default-500">{t("edit.summary", { count: rows.length, changed: changed.length })}</p>
        </div>
        <Button color="primary" isLoading={saving} isDisabled={!changed.length || loading || movingId !== null || invalidNumber} onPress={save}>
          {t("edit.save")}
        </Button>
      </div>
      <p className="mb-4 max-w-2xl text-xs text-default-500">{t("edit.help")}</p>
      {message && <p role="status" className="mb-3 text-sm text-success">{message}</p>}
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      <div className="space-y-3">
        {rows.map((row, index) => {
          const dirty = JSON.stringify(row.draft) !== row.original;
          const expanded = expandedId === row.id;
          const preview = display(nested(row.draft, ["thumb_file", "url"]));
          return <section key={row.id} className={`rounded-xl border bg-content1 p-3 sm:p-4 ${dirty ? "border-warning-400" : "border-default-200"}`}>
            <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
              <img src={preview} alt="" loading="lazy" className="aspect-square h-24 w-24 shrink-0 rounded-lg bg-default-100 object-cover sm:h-28 sm:w-28"/>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{display(nested(row.draft, ["title"])) || t("edit.untitled")}</div>
                <div className="mt-1 text-xs text-default-500"><Link href={`/photo/${row.id}`} size="sm">#{row.id}</Link>
                  {dirty && <span className="ml-2 text-warning-600">{t("edit.unsaved")}</span>}
                </div>
                <div className="mt-1 truncate text-xs text-default-500">{display(nested(row.draft, ["metadata", "datetime"]))}</div>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button size="sm" variant="flat" isDisabled={index === 0 || movingId !== null || loading || saving || deleting || changed.length > 0}
                  onPress={() => movePhoto(row.id, "up")}>{t("edit.move_up")}</Button>
                <Button size="sm" variant="flat" isDisabled={index === rows.length - 1 || movingId !== null || loading || saving || deleting || changed.length > 0}
                  onPress={() => movePhoto(row.id, "down")}>{t("edit.move_down")}</Button>
                <Button size="sm" variant={expanded ? "solid" : "flat"} color={expanded ? "primary" : "default"}
                  aria-expanded={expanded} aria-controls={`edit-fields-${row.id}`}
                  onPress={() => setExpandedId(expanded ? null : row.id)}>{t(expanded ? "edit.collapse" : "edit.expand")}</Button>
                <Button size="sm" variant="flat" color="danger" isDisabled={saving || deleting || movingId !== null || dirty}
                  onPress={() => setDeleteId(row.id)}>{t("edit.delete")}</Button>
              </div>
            </div>
            {expanded && <div id={`edit-fields-${row.id}`} className="mt-4 grid gap-4 border-t border-default-200 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div className="space-y-2"><h2 className="text-sm font-medium">{t("edit.basic")}</h2>
                {textField(row, "edit.field.title", ["title"])}
                {textField(row, "edit.field.description", ["description"])}
                {textField(row, "edit.field.author", ["author", "name"])}</div>
              <div className="space-y-2"><h2 className="text-sm font-medium">{t("edit.capture")}</h2>
                {textField(row, "edit.field.datetime", ["metadata", "datetime"])}
                {textField(row, "edit.field.timezone", ["metadata", "timezone"])}</div>
              <div className="space-y-2"><h2 className="text-sm font-medium">{t("edit.equipment")}</h2>
                {textField(row, "edit.field.camera", ["metadata", "camera", "model"])}
                {textField(row, "edit.field.lens", ["metadata", "lens", "model"])}</div>
              <div className="space-y-2"><h2 className="text-sm font-medium">{t("edit.exposure")}</h2>
                {textField(row, "edit.field.iso", ["metadata", "photographic_sensitivity"], "", true)}
                {textField(row, "edit.field.aperture", ["metadata", "f_number"], "", true)}
                {textField(row, "edit.field.shutter", ["metadata", "exposure_time_rat"])}
                {textField(row, "edit.field.focal", ["metadata", "focal_length"], "", true)}</div>
              <div className="space-y-2"><h2 className="text-sm font-medium">{t("edit.location")}</h2>
                {textField(row, "edit.field.latitude", ["metadata", "location", "latitude"], "", true)}
                {textField(row, "edit.field.longitude", ["metadata", "location", "longitude"], "", true)}</div>
              <div className="space-y-2"><h2 className="text-sm font-medium">{t("edit.address")}</h2>
                {textField(row, "edit.field.country", ["metadata", "city", "prefecture", "country", "name"])}
                {textField(row, "edit.field.region", ["metadata", "city", "prefecture", "name"])}
                {textField(row, "edit.field.city", ["metadata", "city", "name"])}
                {textField(row, "edit.field.place", ["metadata", "place", "name"])}</div>
              <div className="space-y-2 sm:col-span-2"><h2 className="text-sm font-medium">{t("edit.image_url")}</h2>
                <label className="block text-[11px] text-default-500">{t("edit.field.url")}
                  <input className={inputClass} value={display(nested(row.draft, ["large_file", "url"]))}
                    onChange={event => changeUrl(row.id, event.target.value)} disabled={saving}/></label></div>
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-4">
                <Button size="sm" variant="flat" onPress={() => openAdvanced(row)} isDisabled={saving}>{t("edit.json")}</Button>
                <Button size="sm" variant="flat" isLoading={geocodingId === row.id}
                  isDisabled={saving || geocodingId !== null || invalidNumber
                    || typeof nested(row.draft, ["metadata", "location", "latitude"]) !== "number"
                    || typeof nested(row.draft, ["metadata", "location", "longitude"]) !== "number"}
                  onPress={() => reverseAddress(row)}>{t("edit.reverse")}</Button>
              </div>
            </div>}
          </section>;
        })}
      </div>
      {loading && <Progress isIndeterminate aria-label={t("edit.loading")} className="mt-4"/>}
      {nextId !== null && <div className="mt-4 text-center"><Button variant="flat" onPress={loadMore}
        isDisabled={loading || saving || movingId !== null || changed.length > 0}>{t("edit.load_more")}</Button>
        {changed.length > 0 && <p className="mt-1 text-xs text-default-500">{t("edit.save_before_more")}</p>}
      </div>}
      <Modal isOpen={advancedId !== null} onOpenChange={open => { if (!open) setAdvancedId(null); }} size="3xl" scrollBehavior="inside">
        <ModalContent><ModalHeader>{t("edit.json_title", { id: advancedId })}</ModalHeader>
          <ModalBody><p className="text-xs text-default-500">{t("edit.json_help")}</p>
            <textarea aria-label="JSON" spellCheck={false} value={jsonText} onChange={event => setJsonText(event.target.value)}
              className="min-h-[50vh] w-full rounded-lg border border-default-200 bg-content1 p-3 font-mono text-xs"/>
            {jsonError && <p role="alert" className="text-sm text-danger">{jsonError}</p>}
          </ModalBody><ModalFooter><Button variant="flat" onPress={() => setAdvancedId(null)}>{t("edit.cancel")}</Button>
            <Button color="primary" onPress={applyAdvanced}>{t("edit.apply")}</Button></ModalFooter></ModalContent>
      </Modal>
      <Modal isOpen={deleteId !== null} onOpenChange={open => { if (!open && !deleting) setDeleteId(null); }}>
        <ModalContent><ModalHeader>{t("edit.delete_title")}</ModalHeader>
          <ModalBody><p>{t("edit.delete_confirm", { id: deleteId })}</p>
            <p className="text-xs text-default-500">{t("edit.delete_storage_note")}</p></ModalBody>
          <ModalFooter><Button variant="flat" onPress={() => setDeleteId(null)} isDisabled={deleting}>{t("edit.cancel")}</Button>
            <Button color="danger" isLoading={deleting} onPress={deletePhoto}>{t("edit.delete")}</Button></ModalFooter></ModalContent>
      </Modal>
    </>}
  </div>;
}
