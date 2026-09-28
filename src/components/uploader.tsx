"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/text";

export function PdfUploader({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  function accept(next: File | null) {
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".pdf") && next.type && next.type !== "application/pdf") {
      setError("Only PDF files can be uploaded.");
      setFile(null);
      return;
    }
    if (next.size > 15 * 1024 * 1024) {
      setError("That PDF is larger than 15 MB.");
      setFile(null);
      return;
    }
    setError("");
    setFile(next);
    onFile(next);
  }

  return (
    <div>
      <label
        className={`block cursor-pointer rounded-3xl border-2 border-dashed px-6 py-12 text-center ${dragOver ? "border-accent bg-accent/5" : "border-line bg-white"} ${disabled ? "pointer-events-none opacity-60" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          accept(event.dataTransfer.files?.[0] || null);
        }}
      >
        <span className="font-display text-3xl">Drop a lesson PDF</span>
        <span className="mt-2 block text-sm text-muted">or click to choose a file. 15 MB maximum.</span>
        <input
          className="sr-only"
          type="file"
          accept="application/pdf,.pdf"
          disabled={disabled}
          onChange={(event) => accept(event.target.files?.[0] || null)}
        />
      </label>
      {file ? (
        <div className="mt-4 rounded-2xl bg-paper px-4 py-3 text-sm">
          <p className="font-semibold">{file.name}</p>
          <p className="text-muted">{formatBytes(file.size)} · Ready to upload</p>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm font-medium text-bad" role="alert">{error}</p> : null}
    </div>
  );
}
