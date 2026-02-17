"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Drive = { id: string; name: string };
type Item = { id: string; name: string; file?: { mimeType: string }; folder?: { childCount: number }; size: number };

export function EvidencePicker({ onSelected }: { onSelected: (items: any[]) => void }) {
  const [open, setOpen] = useState(false);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [driveId, setDriveId] = useState<string>("");
  const [itemId, setItemId] = useState("root");
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Record<string, Item>>({});
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string>("");
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/onedrive/drives")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setDrives(data);
          if (data[0]) setDriveId(data[0].id);
        } else setError(data.error || "Connect OneDrive");
      })
      .catch(() => setError("Connect OneDrive"));
  }, [open]);

  useEffect(() => {
    if (!driveId || !open) return;
    fetch(`/api/onedrive/items?driveId=${driveId}&itemId=${itemId}`).then((r) => r.json()).then(setItems);
  }, [driveId, itemId, open]);

  async function doSearch() {
    if (!driveId || !search) return;
    const res = await fetch(`/api/onedrive/search?driveId=${driveId}&q=${encodeURIComponent(search)}`);
    setItems(await res.json());
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Pick OneDrive Evidence</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>Evidence Picker</DialogTitle>
        {!!error && <p className="rounded bg-amber-100 p-2 text-sm">{error}. You can still use local upload mode.</p>}
        <div className="flex gap-2">
          <select className="h-9 flex-1 rounded border px-2" value={driveId} onChange={(e) => setDriveId(e.target.value)}>
            {drives.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <Input placeholder="Search files" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button onClick={doSearch}>Search</Button>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Save current folder label" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button
            variant="secondary"
            onClick={async () => {
              await fetch("/api/onedrive/folders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ driveId, folderId: itemId, label: label || "Saved folder" })
              });
              setLabel("");
            }}
          >
            Save Folder
          </Button>
        </div>
        <div className="max-h-80 space-y-1 overflow-auto rounded border p-2">
          {items?.map((it) => (
            <div key={it.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <button onClick={() => it.folder && setItemId(it.id)} className="text-left">
                {it.folder ? "[Folder] " : ""}
                {it.name}
              </button>
              {it.file && (
                <input
                  type="checkbox"
                  checked={!!selected[it.id]}
                  onChange={(e) => {
                    const next = { ...selected };
                    if (e.target.checked) next[it.id] = it;
                    else delete next[it.id];
                    setSelected(next);
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <Button onClick={() => { onSelected(Object.values(selected).map((s) => ({ driveId, itemId: s.id, filename: s.name, size: s.size, mimeType: s.file?.mimeType }))); setOpen(false); }}>Attach selected</Button>
      </DialogContent>
    </Dialog>
  );
}
