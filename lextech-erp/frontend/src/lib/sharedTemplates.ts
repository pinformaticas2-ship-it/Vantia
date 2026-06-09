export type SharedTemplateType = 'email_template' | 'email_signature' | 'email_group' | 'client_export';

export interface SharedTemplate {
  id: string;
  type: SharedTemplateType;
  name: string;
  data: Record<string, unknown>;
  is_default: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

type GetToken = (opts?: { skipCache?: boolean }) => Promise<string | null>;

async function authHeaders(getToken: GetToken) {
  const token = await getToken({ skipCache: true });
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function fetchSharedTemplates(type: SharedTemplateType, getToken: GetToken): Promise<SharedTemplate[]> {
  const headers = await authHeaders(getToken);
  const res = await fetch(`/api/shared-templates?type=${type}`, { headers });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

export async function createSharedTemplate(
  type: SharedTemplateType,
  name: string,
  data: Record<string, unknown>,
  getToken: GetToken,
): Promise<SharedTemplate | null> {
  const headers = await authHeaders(getToken);
  const res = await fetch('/api/shared-templates', {
    method: 'POST',
    headers,
    body: JSON.stringify({ type, name, data }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export async function updateSharedTemplate(
  id: string,
  name: string,
  data: Record<string, unknown>,
  getToken: GetToken,
): Promise<SharedTemplate | null> {
  const headers = await authHeaders(getToken);
  const res = await fetch(`/api/shared-templates/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name, data }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export async function deleteSharedTemplate(id: string, getToken: GetToken): Promise<boolean> {
  const headers = await authHeaders(getToken);
  const res = await fetch(`/api/shared-templates/${id}`, { method: 'DELETE', headers });
  return res.ok;
}

export async function setDefaultSharedTemplate(id: string, getToken: GetToken): Promise<boolean> {
  const headers = await authHeaders(getToken);
  const res = await fetch(`/api/shared-templates/${id}/default`, { method: 'PATCH', headers });
  return res.ok;
}
