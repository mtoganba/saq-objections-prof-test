import { useState } from "react";
import AppShell from "../../components/AppShell";
import { Button, Modal, Notice } from "../../components/ui";
import { initialState } from "../../api/objectionsRepository";
import { ROLES } from "../../data/constants";
import type { Action, CaseDocument, ObjectionCase } from "../../types";
import { caseCsv, downloadFile } from "../../utils/download";
import ActionModal, { Field } from "./components/ActionModal";
import DocumentModal from "./components/DocumentModal";
import NewCaseModal from "./components/NewCaseModal";
import CasesList from "./pages/CasesList";
import CaseWorkspace from "./pages/CaseWorkspace";
import {
  ProcessesPage,
  SessionsPage,
  SourcesPage,
} from "./pages/ReferencePages";
import { dateObject } from "./services/deadlines";
import { applyAction } from "./services/workflow";
import { useObjectionsModel } from "./useObjectionsModel";

type DialogState =
  | { type: "action"; action: Action }
  | { type: "document"; kind: string; document?: CaseDocument }
  | { type: "new" | "clock" | "reset" | "upload" }
  | null;

export default function ObjectionsModule() {
  const model = useObjectionsModel();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogError, setDialogError] = useState("");
  const [uploading, setUploading] = useState(false);
  const c = model.state.cases.find((item) => item.id === model.route.caseId);
  const close = () => {
    setDialog(null);
    setDialogError("");
  };
  const openCase = (c: ObjectionCase) =>
    model.navigate({ page: "detail", caseId: c.id, tab: "review" });

  async function upload(file?: File) {
    if (!file || !c) return;
    setDialogError("");
    if (file.size > 2 * 1024 * 1024) {
      setDialogError("Максимальный размер файла — 2 МБ");
      return;
    }
    if (!/\.(pdf|png|jpe?g|docx?|xlsx?|txt)$/i.test(file.name)) {
      setDialogError("Поддерживаются PDF, PNG, JPG, DOC(X), XLS(X), TXT");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
        reader.readAsDataURL(file);
      });
      const next = structuredClone(model.state);
      const updated = next.cases.find((item) => item.id === c.id)!;
      updated.documents.push({
        name: file.name,
        filename: file.name,
        kind: "attachment",
        text: "Приложенный материал",
        author: ROLES[model.role],
        date: next.date,
        dataUrl,
      });
      updated.history.push({
        date: next.date,
        actor: ROLES[model.role],
        title: "Добавлен материал",
        text: file.name,
      });
      model.commit(next, "Материал добавлен. Срок рассмотрения не изменён.");
      close();
    } catch (cause) {
      setDialogError(
        cause instanceof Error
          ? cause.message
          : "Недостаточно места для сохранения вложения",
      );
    } finally {
      setUploading(false);
    }
  }

  async function submitAction(action: Action, form: FormData) {
    if (!c) return;
    if (!["position", "fill-request-response"].includes(action)) {
      model.perform(c.id, action, form);
      return;
    }
    const files = form
      .getAll("responseFiles")
      .filter(
        (item): item is File => item instanceof File && item.name.length > 0,
      );
    if (action === "position" && !files.length)
      throw new Error("Вложите хотя бы один полученный файл");
    for (const file of files) {
      if (file.size > 2 * 1024 * 1024)
        throw new Error(`Файл «${file.name}» превышает 2 МБ`);
      if (!/\.(pdf|png|jpe?g|docx?|xlsx?|txt)$/i.test(file.name))
        throw new Error("Поддерживаются PDF, PNG, JPG, DOC(X), XLS(X), TXT");
    }
    const attached = await Promise.all(
      files.map(
        (file) =>
          new Promise<{ file: File; dataUrl: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ file, dataUrl: String(reader.result) });
            reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
            reader.readAsDataURL(file);
          }),
      ),
    );
    const next = applyAction(model.state, c.id, action, model.role, form);
    const updated = next.cases.find((item) => item.id === c.id)!;
    if (attached.length) {
      updated.documents.push(
        ...attached.map(({ file, dataUrl }) => ({
          name: file.name,
          filename: file.name,
          kind:
            action === "fill-request-response"
              ? "authority-response-attachment"
              : "response-attachment",
          text:
            action === "fill-request-response"
              ? "Подтверждающий документ ДВГА/КВГА"
              : "Полученный ответ на запрос",
          author: ROLES[model.role],
          date: next.date,
          dataUrl,
        })),
      );
      updated.history.push({
        date: next.date,
        actor: ROLES[model.role],
        title:
          action === "fill-request-response"
            ? "Вложены документы ДВГА/КВГА"
            : "Вложены полученные файлы",
        text: attached.map(({ file }) => file.name).join(", "),
      });
    }
    model.commit(
      next,
      action === "fill-request-response"
        ? "Ответ ДВГА/КВГА и вложения сохранены"
        : "Полученный ответ и вложения сохранены",
    );
  }

  return (
    <AppShell
      route={model.route}
      date={model.state.date}
      role={model.role}
      onRoleChange={model.setRole}
      onNavigate={model.navigate}
      onClock={() => setDialog({ type: "clock" })}
      onReset={() => setDialog({ type: "reset" })}
    >
      {model.error && <Notice tone="amber">{model.error}</Notice>}
      {model.route.page === "registry" && (
        <CasesList
          cases={model.state.cases}
          date={model.state.date}
          onOpen={openCase}
          onCreate={() => setDialog({ type: "new" })}
          onExport={(cases) =>
            downloadFile(
              "saq-objections.csv",
              caseCsv(cases),
              "text/csv;charset=utf-8",
            )
          }
        />
      )}
      {model.route.page === "detail" &&
        (c ? (
          <CaseWorkspace
            c={c}
            tab={model.route.tab || "review"}
            role={model.role}
            onBack={() => model.navigate({ page: "registry" })}
            onTab={(tab) => model.navigate({ ...model.route, tab })}
            onAction={(action, role) => {
              if (
                action === "screen" ||
                action === "send-request-approval" ||
                action === "approve-request" ||
                action === "approve-certificate" ||
                action === "send-certificate-to-commission" ||
                action === "members"
              ) {
                const form = new FormData();
                if (action === "screen") {
                  form.set("identity", "on");
                  form.set("document", "on");
                  form.set("grounds", "on");
                  form.set("competence", "on");
                  form.set(
                    "assignee",
                    c.assignee === "Не назначен"
                      ? "Исполнитель ДАВГА"
                      : c.assignee,
                  );
                  form.set("authority", c.authority);
                  form.set(
                    "basis",
                    "Реквизиты обращения проверены, обращение принято к рассмотрению.",
                  );
                  if (c.type === "control")
                    form.set(
                      "actEffect",
                      "Обращение принято к рассмотрению в общем порядке.",
                    );
                }
                if (action === "approve-request") {
                  form.set("approved", "on");
                }
                if (action === "members") {
                  form.set("meetingConducted", "on");
                }
                const next = applyAction(
                  model.state,
                  c.id,
                  action,
                  role,
                  form,
                );
                model.commit(
                  next,
                  action === "screen"
                    ? "Обращение принято к рассмотрению"
                    : action === "approve-request"
                    ? "Запрос согласован"
                    : action === "approve-certificate"
                      ? "Справка согласована"
                      : action === "send-certificate-to-commission"
                        ? "Справка и документы направлены членам АК"
                        : action === "members"
                          ? "Заседание по данному делу проведено"
                        : "Запрос направлен на согласование",
                );
                return;
              }
              model.setRole(role);
              setDialog({ type: "action", action });
            }}
            onDocument={(kind, document) =>
              setDialog({ type: "document", kind, document })
            }
            onUpload={() => setDialog({ type: "upload" })}
          />
        ) : (
          <Notice>
            Обращение не найдено в этом браузере.{" "}
            <button
              className="text-button"
              onClick={() => model.navigate({ page: "registry" })}
            >
              Открыть реестр
            </button>
          </Notice>
        ))}
      {model.route.page === "sessions" && (
        <SessionsPage cases={model.state.cases} onOpen={openCase} />
      )}
      {model.route.page === "processes" && <ProcessesPage />}
      {model.route.page === "sources" && <SourcesPage />}
      {dialog?.type === "action" && c && (
        <ActionModal
          key={`${c.id}-${dialog.action}`}
          action={dialog.action}
          c={c}
          date={model.state.date}
          onClose={close}
          onSubmit={(form) => submitAction(dialog.action, form)}
        />
      )}
      {dialog?.type === "document" && c && (
        <DocumentModal
          c={c}
          kind={dialog.kind}
          document={dialog.document}
          onClose={close}
        />
      )}
      {dialog?.type === "new" && (
        <NewCaseModal
          state={model.state}
          onClose={close}
          onSave={(next, caseId) => {
            model.commit(next, "Тестовое обращение зарегистрировано");
            model.navigate({ page: "detail", caseId });
          }}
        />
      )}
      {dialog?.type === "clock" && (
        <Modal title="Дата демонстрации" onClose={close}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              try {
                const date = String(
                  new FormData(event.currentTarget).get("date"),
                );
                dateObject(date);
                const minimum = [
                  model.state.date,
                  ...model.state.cases.flatMap((item) =>
                    item.history.map((event) => event.date),
                  ),
                ]
                  .sort()
                  .at(-1)!;
                if (date < minimum || date > "2026-12-31")
                  throw new Error(
                    `Дата должна быть не раньше ${minimum} и не позже 31.12.2026`,
                  );
                model.commit({ ...model.state, date }, "Дата демо изменена");
                close();
              } catch (cause) {
                setDialogError(
                  cause instanceof Error ? cause.message : "Проверьте дату",
                );
              }
            }}
          >
            <Notice>
              Изменение даты помогает показать этапы с обязательными
              интервалами. Даты уже зарегистрированных событий сохраняются.
            </Notice>
            <Field
              field={{
                name: "date",
                label: "Рабочая дата",
                type: "date",
                value: model.state.date,
                required: true,
              }}
            />
            {dialogError && (
              <p className="form-error" role="alert">
                {dialogError}
              </p>
            )}
            <div className="dialog-actions">
              <Button onClick={close}>Отмена</Button>
              <Button primary type="submit">
                Изменить дату
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {dialog?.type === "reset" && (
        <Modal title="Перезапустить демонстрацию" onClose={close}>
          <p>
            Три исходных обращения будут восстановлены. Действия и вложения,
            добавленные в этом браузере, будут удалены.
          </p>
          {dialogError && <p className="form-error">{dialogError}</p>}
          <div className="dialog-actions">
            <Button onClick={close}>Отмена</Button>
            <Button
              primary
              onClick={() => {
                try {
                  model.commit(
                    initialState(),
                    "Три исходных обращения восстановлены",
                  );
                  model.navigate({ page: "registry" });
                  close();
                } catch {
                  setDialogError("Браузер не разрешает сохранение данных");
                }
              }}
            >
              Сбросить демо
            </Button>
          </div>
        </Modal>
      )}
      {dialog?.type === "upload" && (
        <Modal title="Добавить материал дела" onClose={close}>
          <Notice>
            Обычное вложение не продлевает срок рассмотрения. Формальное
            дополнение регистрируется отдельным действием.
          </Notice>
          <label className="field">
            <span>Файл — до 2 МБ</span>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
              disabled={uploading}
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </label>
          {uploading && <p>Сохранение файла…</p>}
          {dialogError && (
            <p className="form-error" role="alert">
              {dialogError}
            </p>
          )}
        </Modal>
      )}
      {model.toast && (
        <div className="react-toast" role="status">
          {model.toast}
        </div>
      )}
    </AppShell>
  );
}
