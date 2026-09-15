export type ProfileSheetDxf = {
  ok: true;
  id: string;
  name: string;
  dxf: string;
};

export type ProfileSheetListItem = {
  id: string;
  name: string;
  hasDxf: boolean;
};

export async function listProfileSheets(): Promise<ProfileSheetListItem[]> {
  const res = await fetch('/api/profile-sheet?list=1');
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error || `List failed (${res.status})`);
  return body.sheets;
}

export async function loadProfileSheet(id: string): Promise<ProfileSheetDxf> {
  const res = await fetch(`/api/profile-sheet?id=${encodeURIComponent(id)}`);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error || `Load failed (${res.status})`);
  return body;
}

export async function saveProfileSheet(id: string, dxf: string): Promise<{ chars: number }> {
  const res = await fetch('/api/profile-sheet', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, dxf }),
  });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error || `Save failed (${res.status})`);
  return { chars: body.chars };
}
