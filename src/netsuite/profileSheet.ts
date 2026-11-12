/** Which drawing on the Profile Sheet: the profile itself, or its knife template. */
export type SheetField = 'profile' | 'knife';

export const SHEET_FIELD_LABEL: Record<SheetField, string> = {
  profile: 'Profile drawing',
  knife: 'Knife template',
};

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

export async function listProfileSheets(field: SheetField): Promise<ProfileSheetListItem[]> {
  const res = await fetch(`/api/profile-sheet?list=1&field=${field}`);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error || `List failed (${res.status})`);
  return body.sheets;
}

export async function loadProfileSheet(id: string, field: SheetField): Promise<ProfileSheetDxf> {
  const res = await fetch(`/api/profile-sheet?id=${encodeURIComponent(id)}&field=${field}`);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error || `Load failed (${res.status})`);
  return body;
}

export async function saveProfileSheet(id: string, field: SheetField, dxf: string): Promise<{ chars: number }> {
  const res = await fetch('/api/profile-sheet', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, field, dxf }),
  });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error || `Save failed (${res.status})`);
  return { chars: body.chars };
}
