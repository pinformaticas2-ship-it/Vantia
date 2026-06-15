import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { safeJson } from "../lib/api";

interface WhatsAppContact {
  id: string;
  internal_number?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  commercial_name?: string | null;
  phone_mobile?: string | null;
  phone_1?: string | null;
  email?: string | null;
  photo_url?: string | null;
  type?: string | null;
  last_message_body?: string | null;
  last_message_at?: string | null;
  last_message_status?: string | null;
  last_message_direction?: string | null;
  message_count?: number;
}

interface WhatsAppMessage {
  id: string;
  client_id?: string | null;
  direction: "outbound" | "inbound" | "system";
  message_type?: string | null;
  body?: string | null;
  status?: string | null;
  created_at: string;
  contact_name?: string | null;
  from_phone?: string | null;
  to_phone?: string | null;
  sent_by_user_name?: string | null;
}

interface WhatsAppStatus {
  configured: boolean;
  phoneNumberIdConfigured: boolean;
  accessTokenConfigured: boolean;
  verifyTokenConfigured: boolean;
  businessAccountIdConfigured?: boolean;
  webhookBaseUrlConfigured?: boolean;
  graphVersion?: string;
  configSource?: string;
  webhookUrl?: string;
  phoneNumberIdPreview?: string;
  verifyTokenPreview?: string;
  businessAccountIdPreview?: string;
  mode: string;
}

interface WhatsAppConfigForm {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  graphVersion: string;
  webhookBaseUrl: string;
  businessAccountId: string;
}

const AUTH_SESSION_KEY = "whatsapp-business-authenticated";

function normalizePhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("34") && digits.length >= 11) return digits;
  return digits.length === 9 ? `34${digits}` : digits;
}

function getClientLabel(client: WhatsAppContact) {
  const fullName = `${client.first_name || ""} ${client.last_name || ""}`.trim();
  return client.commercial_name || fullName || client.email || `Cliente ${client.internal_number || ""}`.trim();
}

function getClientPhone(client: WhatsAppContact) {
  return normalizePhone(client.phone_mobile || client.phone_1 || "");
}

function timeLabel(iso?: string | null) {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortDateLabel(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
}

export default function WhatsApp() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialClientId = searchParams.get("clientId") || "";

  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [conversation, setConversation] = useState<WhatsAppMessage[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(initialClientId);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConfig, setTestingConfig] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => (
    typeof window !== "undefined" && window.sessionStorage.getItem(AUTH_SESSION_KEY) === "1"
  ));
  const [configForm, setConfigForm] = useState<WhatsAppConfigForm>({
    accessToken: "",
    phoneNumberId: "",
    verifyToken: "",
    graphVersion: "v23.0",
    webhookBaseUrl: "",
    businessAccountId: "",
  });

  const apiGet = useCallback(async (path: string) => {
    const token = await getToken({ skipCache: true });
    const response = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await safeJson(response);
    if (!response.ok) throw new Error(json.error || "No se pudo cargar WhatsApp Business");
    return json;
  }, [getToken]);

  const apiPost = useCallback(async (path: string, body: unknown) => {
    const token = await getToken({ skipCache: true });
    const response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = await safeJson(response);
    if (!response.ok) throw new Error(json.error || "No se pudo guardar en WhatsApp Business");
    return json;
  }, [getToken]);

  const apiPut = useCallback(async (path: string, body: unknown) => {
    const token = await getToken({ skipCache: true });
    const response = await fetch(path, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = await safeJson(response);
    if (!response.ok) throw new Error(json.error || "No se pudo actualizar la configuración");
    return json;
  }, [getToken]);

  const fetchShell = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setConfigMessage(null);
      const [statusRes, contactsRes, configRes] = await Promise.all([
        apiGet("/api/whatsapp/status"),
        apiGet("/api/whatsapp/contacts"),
        apiGet("/api/whatsapp/config"),
      ]);
      setStatus(statusRes.data || null);
      setContacts(contactsRes.data || []);
      setConfigForm((prev) => ({
        accessToken: prev.accessToken,
        phoneNumberId: configRes.data?.phoneNumberId || "",
        verifyToken: configRes.data?.verifyToken || "",
        graphVersion: configRes.data?.graphVersion || "v23.0",
        webhookBaseUrl: configRes.data?.webhookBaseUrl || "",
        businessAccountId: configRes.data?.businessAccountId || "",
      }));
    } catch (err: any) {
      setError(err.message || "No se pudo cargar el módulo de WhatsApp");
    } finally {
      setLoading(false);
    }
  }, [apiGet]);

  const fetchConversation = useCallback(async (clientId: string) => {
    if (!clientId) {
      setConversation([]);
      return;
    }
    try {
      setLoadingConversation(true);
      const result = await apiGet(`/api/whatsapp/conversations/client/${clientId}`);
      setConversation(result.data?.messages || []);
    } catch (err: any) {
      setError(err.message || "No se pudo cargar la conversación");
    } finally {
      setLoadingConversation(false);
    }
  }, [apiGet]);

  useEffect(() => {
    fetchShell();
  }, [fetchShell]);

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (!q) return true;
      return (
        getClientLabel(contact).toLowerCase().includes(q)
        || getClientPhone(contact).includes(q.replace(/\D/g, ""))
        || String(contact.internal_number || "").includes(q)
      );
    });
  }, [contacts, query]);

  const selectedClient = useMemo(
    () => contacts.find((contact) => contact.id === selectedClientId) || null,
    [contacts, selectedClientId],
  );

  const quickReplies = useMemo(() => {
    if (!selectedClient) return [];
    return [
      "He recibido la documentación. La revisamos ahora mismo.",
      "Te escribimos en cuanto tengamos validado el documento.",
      "Gracias. Si necesitas algo más, envíanoslo por este canal.",
    ];
  }, [selectedClient]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (selectedClientId) {
      fetchConversation(selectedClientId);
      return;
    }
    if (!selectedClientId && filteredContacts.length > 0) {
      setSelectedClientId(initialClientId || filteredContacts[0].id);
    }
  }, [fetchConversation, filteredContacts, initialClientId, isAuthenticated, selectedClientId]);

  const handleSend = async () => {
    if (!selectedClient || !composer.trim()) return;
    try {
      setSending(true);
      setError(null);
      const payload = {
        clientId: selectedClient.id,
        to: getClientPhone(selectedClient),
        body: composer.trim(),
      };
      const result = await apiPost("/api/whatsapp/messages", payload);
      setConversation((prev) => [...prev, result.data]);
      setContacts((prev) => prev.map((item) => (
        item.id === selectedClient.id
          ? {
              ...item,
              last_message_body: result.data?.body,
              last_message_at: result.data?.created_at,
              message_count: (item.message_count || 0) + 1,
            }
          : item
      )));
      setComposer("");
    } catch (err: any) {
      setError(err.message || "No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  };

  const handleConfigChange = (field: keyof WhatsAppConfigForm, value: string) => {
    setConfigForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveConfig = async () => {
    try {
      setSavingConfig(true);
      setError(null);
      setConfigMessage(null);
      await apiPut("/api/whatsapp/config", configForm);
      setConfigMessage("Configuración guardada correctamente.");
      await fetchShell();
    } catch (err: any) {
      setError(err.message || "No se pudo guardar la configuración de WhatsApp");
    } finally {
      setSavingConfig(false);
    }
  };

  const testConfig = useCallback(async () => {
    try {
      setTestingConfig(true);
      setError(null);
      setConfigMessage(null);
      const token = await getToken({ skipCache: true });
      const response = await fetch("/api/whatsapp/config/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(json.error || "No se pudo validar la conexión");
      const details = [json.data?.displayPhoneNumber, json.data?.verifiedName].filter(Boolean).join(" · ");
      setConfigMessage(details ? `Conexión correcta: ${details}` : "Conexión correcta con WhatsApp Business.");
      setIsAuthenticated(true);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(AUTH_SESSION_KEY, "1");
      }
      await fetchShell();
    } catch (err: any) {
      setError(err.message || "No se pudo validar la conexión con WhatsApp Business");
    } finally {
      setTestingConfig(false);
    }
  }, [fetchShell, getToken]);

  const disconnectView = () => {
    setIsAuthenticated(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(AUTH_SESSION_KEY);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-slate-400">
        <div className="flex items-center gap-3">
          <Loader2 size={22} className="animate-spin text-[#ab0433]" />
          <span className="text-sm font-medium">Cargando módulo de WhatsApp Business...</span>
        </div>
      </div>
    );
  }

  if (error && contacts.length === 0 && !status) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
          <p className="text-sm font-semibold">No se pudo cargar el módulo de WhatsApp</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
        <button
          type="button"
          onClick={fetchShell}
          className="inline-flex items-center gap-2 rounded-xl bg-[#ab0433] px-4 py-2 text-sm font-semibold text-white hover:bg-[#92042c]"
        >
          <RefreshCw size={15} />
          Reintentar
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <WhatsAppAuthGate
        status={status}
        error={error}
        configMessage={configMessage}
        configForm={configForm}
        onBack={() => navigate("/dashboard/clientes")}
        onChange={handleConfigChange}
        onSave={saveConfig}
        onTest={testConfig}
        savingConfig={savingConfig}
        testingConfig={testingConfig}
      />
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-white">
      <aside className="flex w-[320px] shrink-0 flex-col bg-[linear-gradient(180deg,#1f2334_0%,#111827_100%)] text-white">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/45">LexTech</p>
              <h1 className="mt-1 text-2xl font-black">WhatsApp</h1>
            </div>
            <button
              type="button"
              onClick={disconnectView}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/75 transition hover:bg-white/10 hover:text-white"
              title="Volver a conexión"
            >
              <Settings2 size={16} />
            </button>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Canal Business autenticado
            </div>
            <p className="mt-1 text-sm text-white/75">{status?.phoneNumberIdPreview || "WhatsApp Business Cloud API"}</p>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
            <Search size={15} className="text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conversación..."
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {filteredContacts.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/60">
              No hay contactos con teléfono para WhatsApp.
            </div>
          ) : filteredContacts.map((contact) => {
            const isSelected = contact.id === selectedClientId;
            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => setSelectedClientId(contact.id)}
                className={`mb-1.5 flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                  isSelected
                    ? "border-[#ab0433]/60 bg-white/95 text-slate-900 shadow-lg"
                    : "border-transparent bg-transparent text-white/85 hover:bg-white/6"
                }`}
              >
                {contact.photo_url ? (
                  <img src={contact.photo_url} alt="" className="h-11 w-11 rounded-2xl object-cover" />
                ) : (
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isSelected ? "bg-slate-100 text-slate-500" : "bg-white/10 text-white/60"}`}>
                    <UserRound size={18} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-sm font-semibold ${isSelected ? "text-slate-900" : "text-white"}`}>
                      {getClientLabel(contact)}
                    </p>
                    <span className={`text-[11px] ${isSelected ? "text-slate-400" : "text-white/40"}`}>
                      {shortDateLabel(contact.last_message_at)}
                    </span>
                  </div>
                  {contact.internal_number ? (
                    <p className={`mt-1 text-[11px] font-semibold ${isSelected ? "text-[#ab0433]" : "text-emerald-300"}`}>
                      EXP-{String(contact.internal_number).padStart(4, "0")}
                    </p>
                  ) : null}
                  <p className={`mt-1 line-clamp-2 text-xs leading-5 ${isSelected ? "text-slate-500" : "text-white/60"}`}>
                    {contact.last_message_body || "Sin conversación registrada todavía."}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[#f6f8fc]">
        <div className="border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/dashboard/clientes")}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                title="Volver"
              >
                <ArrowLeft size={17} />
              </button>
              {selectedClient ? (
                <>
                  {selectedClient.photo_url ? (
                    <img src={selectedClient.photo_url} alt="" className="h-12 w-12 rounded-2xl border border-slate-200 object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
                      <UserRound size={20} />
                    </div>
                  )}
                  <div>
                    <h2 className="text-xl font-black text-slate-900">{getClientLabel(selectedClient)}</h2>
                    <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      WhatsApp Cloud API directa
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <h2 className="text-xl font-black text-slate-900">Panel de mensajería</h2>
                  <p className="mt-1 text-sm text-slate-500">Selecciona una conversación para empezar.</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {selectedClient?.internal_number ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-400">Expediente</p>
                  <p className="mt-1 text-sm font-bold text-blue-700">EXP-{String(selectedClient.internal_number).padStart(4, "0")}</p>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => selectedClient && fetchConversation(selectedClient.id)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw size={15} />
                Actualizar
              </button>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(171,4,51,0.06),transparent_26%),linear-gradient(180deg,#f8fafc_0%,#f3f6fb_100%)] px-6 py-5">
            {!selectedClient ? (
              <EmptyConversation />
            ) : loadingConversation ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 size={24} className="animate-spin text-[#ab0433]" />
              </div>
            ) : conversation.length === 0 ? (
              <div className="mx-auto flex max-w-xl flex-col items-center rounded-[28px] border border-dashed border-slate-200 bg-white px-8 py-10 text-center">
                <MessageCircle size={30} className="text-slate-300" />
                <p className="mt-4 text-base font-bold text-slate-700">Todavía no hay mensajes</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Cuando entren mensajes por el webhook o envíes uno desde el ERP, aparecerán aquí con el historial completo.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {conversation.map((message) => {
                  const outbound = message.direction === "outbound";
                  return (
                    <div
                      key={message.id}
                      className={`max-w-[72%] rounded-[24px] px-4 py-3 shadow-sm ${
                        outbound
                          ? "ml-auto rounded-br-md bg-[linear-gradient(135deg,#ab0433_0%,#c8104e_100%)] text-white"
                          : "rounded-bl-md border border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      <p className="text-sm leading-6">{message.body || "Mensaje sin texto"}</p>
                      <div className={`mt-2 flex items-center justify-between gap-3 text-[11px] ${
                        outbound ? "text-white/70" : "text-slate-400"
                      }`}>
                        <span>{outbound ? (message.status || "enviado") : (message.contact_name || "entrante")}</span>
                        <span>{timeLabel(message.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white px-6 py-4">
            {selectedClient ? (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {quickReplies.map((reply) => (
                    <button
                      key={reply}
                      type="button"
                      onClick={() => setComposer(reply)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition hover:border-[#ab0433]/20 hover:bg-red-50 hover:text-[#ab0433]"
                    >
                      {reply}
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-3 rounded-[26px] border border-slate-200 bg-slate-50 px-3 py-3">
                  <button
                    type="button"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-slate-400 transition hover:bg-white hover:text-slate-600"
                    title="Teléfono"
                  >
                    <Phone size={18} />
                  </button>
                  <textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    placeholder="Responder al cliente..."
                    className="min-h-[44px] max-h-32 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!composer.trim() || sending || !status?.configured}
                    className={`inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${
                      !composer.trim() || sending || !status?.configured
                        ? "cursor-not-allowed bg-slate-200 text-slate-400"
                        : "bg-[#ab0433] text-white hover:bg-[#92042c]"
                    }`}
                  >
                    {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    {sending ? "Enviando..." : "Enviar"}
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-400">
                Selecciona una conversación para responder desde el ERP.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function WhatsAppAuthGate({
  status,
  error,
  configMessage,
  configForm,
  onBack,
  onChange,
  onSave,
  onTest,
  savingConfig,
  testingConfig,
}: {
  status: WhatsAppStatus | null;
  error: string | null;
  configMessage: string | null;
  configForm: WhatsAppConfigForm;
  onBack: () => void;
  onChange: (field: keyof WhatsAppConfigForm, value: string) => void;
  onSave: () => Promise<void>;
  onTest: () => Promise<void>;
  savingConfig: boolean;
  testingConfig: boolean;
}) {
  return (
    <div className="flex h-full items-stretch overflow-hidden bg-white">
      <section className="flex w-[38%] min-w-[360px] flex-col bg-[linear-gradient(180deg,#1f2334_0%,#111827_100%)] px-8 py-8 text-white">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 self-start rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={15} />
          Volver a Clientes
        </button>

        <div className="mt-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-white/40">WhatsApp Business</p>
          <h1 className="mt-3 text-4xl font-black leading-tight">Conecta tu canal y entra al panel de mensajería</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-white/70">
            Antes de abrir la bandeja real, autentica el número Business del despacho. Cuando la conexión esté verificada,
            el módulo mostrará tus conversaciones y te permitirá responder desde el ERP.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <Feature icon={<ShieldCheck size={18} />} title="Canal protegido">
            La sesión queda validada dentro del ERP antes de abrir la bandeja.
          </Feature>
          <Feature icon={<Smartphone size={18} />} title="Número Business real">
            Trabaja sobre tu número Cloud API con token, phone number id y webhook.
          </Feature>
          <Feature icon={<MessageCircle size={18} />} title="Mensajería integrada">
            Las conversaciones se consultan desde la misma interfaz, sin abrir WhatsApp Web.
          </Feature>
        </div>

        <div className="mt-auto rounded-[28px] border border-white/10 bg-white/5 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/40">Estado actual</p>
          <div className="mt-4 space-y-3 text-sm text-white/80">
            <StatusRow label="Token" ready={!!status?.accessTokenConfigured} />
            <StatusRow label="Phone number id" ready={!!status?.phoneNumberIdConfigured} />
            <StatusRow label="Verify token" ready={!!status?.verifyTokenConfigured} />
            <StatusRow label="Webhook público" ready={!!status?.webhookBaseUrlConfigured} />
          </div>
        </div>
      </section>

      <section className="flex flex-1 flex-col bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-8 py-8">
        <div className="max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Autenticador</p>
          <h2 className="mt-2 text-3xl font-black text-slate-900">Acceso a WhatsApp Business Cloud API</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Introduce o revisa la configuración del canal. Después valida la conexión para entrar a la pantalla de mensajería.
          </p>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}
          {configMessage ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{configMessage}</div>
          ) : null}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <ConfigField
                label="Access token"
                value={configForm.accessToken}
                onChange={(value) => onChange("accessToken", value)}
                placeholder="EAAG..."
                help="Token de Meta para el número Business."
              />
              <ConfigField
                label="Phone number id"
                value={configForm.phoneNumberId}
                onChange={(value) => onChange("phoneNumberId", value)}
                placeholder="123456789012345"
                help="Identificador del número dentro de la Cloud API."
              />
              <ConfigField
                label="Verify token"
                value={configForm.verifyToken}
                onChange={(value) => onChange("verifyToken", value)}
                placeholder="token-seguro"
                help="Se usa para verificar el webhook."
              />
              <ConfigField
                label="Webhook base URL"
                value={configForm.webhookBaseUrl}
                onChange={(value) => onChange("webhookBaseUrl", value)}
                placeholder="https://tu-dominio.com"
                help="La URL pública base del backend."
              />
              <ConfigField
                label="Graph version"
                value={configForm.graphVersion}
                onChange={(value) => onChange("graphVersion", value)}
                placeholder="v23.0"
                help="Versión de Meta Graph API."
              />
              <ConfigField
                label="Business account id"
                value={configForm.businessAccountId}
                onChange={(value) => onChange("businessAccountId", value)}
                placeholder="opcional"
                help="Útil para trazabilidad y soporte."
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onSave}
                disabled={savingConfig}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#ab0433] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#92042c] disabled:opacity-60"
              >
                {savingConfig ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                Guardar credenciales
              </button>
              <button
                type="button"
                onClick={onTest}
                disabled={testingConfig || !(status?.phoneNumberIdConfigured || configForm.phoneNumberId) || !(status?.accessTokenConfigured || configForm.accessToken)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {testingConfig ? <Loader2 size={15} className="animate-spin" /> : <LockKeyhole size={15} />}
                Verificar y entrar
              </button>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Resumen</p>
            <div className="mt-5 space-y-4 text-sm">
              <SummaryItem label="Origen" value={status?.configSource || "Sin configurar"} />
              <SummaryItem label="Phone number id" value={status?.phoneNumberIdPreview || "Pendiente"} />
              <SummaryItem label="Verify token" value={status?.verifyTokenPreview || "Pendiente"} />
              <SummaryItem label="Webhook" value={status?.webhookUrl || "Pendiente"} multiline />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white">{icon}</div>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-sm leading-6 text-white/60">{children}</p>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${ready ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/55"}`}>
        <span className={`h-2 w-2 rounded-full ${ready ? "bg-emerald-400" : "bg-white/35"}`} />
        {ready ? "Listo" : "Pendiente"}
      </span>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`mt-1 text-sm text-slate-700 ${multiline ? "break-all leading-6" : ""}`}>{value}</p>
    </div>
  );
}

function EmptyConversation() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md rounded-[28px] border border-dashed border-slate-200 bg-white px-8 py-10 text-center">
        <MessageCircle size={28} className="mx-auto text-slate-300" />
        <p className="mt-4 text-base font-semibold text-slate-700">Selecciona una conversación</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Aquí verás el historial completo y podrás responder al cliente desde el ERP.
        </p>
      </div>
    </div>
  );
}

function ConfigField({
  label,
  value,
  onChange,
  placeholder,
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  help?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition-colors focus:border-[#ab0433]/35 focus:bg-white"
      />
      {help ? <span className="mt-2 block text-xs leading-5 text-slate-400">{help}</span> : null}
    </label>
  );
}
