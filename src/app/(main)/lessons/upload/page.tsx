"use client";

import Link from "next/link";
import { useState } from "react";
import { PdfUploader } from "@/components/uploader";
import { PageHeader } from "@/components/ui";
import { api } from "@/lib/client";
import { formatBytes, formatDate } from "@/lib/text";

async function uploadLocal(file: File, title: string) {
  const form = new FormData();
  form.set("file", file);
  if (title.trim()) form.set("title", title.trim());
  return api<UploadResult>("/api/lessons/upload", { method: "POST", body: form });
}

async function uploadDirect(file: File, title: string, onStatus: (message: string) => void) {
  onStatus("Uploading the PDF…");
  const { upload } = await import("@vercel/blob/client");
  const blob = await upload(`lessons/${crypto.randomUUID()}.pdf`, file, {
    access: "private",
    handleUploadUrl: "/api/lessons/blob",
    contentType: "application/pdf",
    multipart: file.size > 4 * 1024 * 1024,
  });
  onStatus("Reading the PDF…");
  return api<UploadResult>("/api/lessons/upload", {
    method: "POST",
    body: JSON.stringify({
      pathname: blob.pathname,
      filename: file.name,
      size: file.size,
      title: title.trim(),
    }),
  });
}

type UploadResult = {
  lessonId: string;
  title: string;
  filename: string;
  fileSize: number;
  pageCount: number;
  processingStatus: string;
  contentStatus: string;
  failureReason: string | null;
  summary: string;
  wordCount: number;
  conceptCount: number;
  maxQuestions: number;
  createdAt: string;
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);

  async function upload() {
    if (!file) {
      setError("Choose a PDF first.");
      return;
    }
    setError("");
    setStatus("Uploading and reading the PDF…");
    try {
      const storage = await api<{ directUpload: boolean }>("/api/storage");
      const data = storage.directUpload ? await uploadDirect(file, title, setStatus) : await uploadLocal(file, title);
      setResult(data);
      setStatus("");
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Upload" title="Upload a lesson" body="Folio extracts the text, checks that there is enough to quiz, and shows a short preview before you generate questions." />
      <div className="card p-5 sm:p-7">
        <label className="block">
          <span className="label">Lesson title</span>
          <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional. Otherwise the PDF title is used." />
        </label>
        <div className="mt-5">
          <PdfUploader onFile={setFile} disabled={Boolean(status)} />
        </div>
        {status ? <p className="mt-4 text-sm font-semibold text-navy" role="status">{status}</p> : null}
        {error ? <p className="mt-4 text-sm font-medium text-bad" role="alert">{error}</p> : null}
        <button className="btn-primary mt-5" disabled={!file || Boolean(status)} onClick={upload}>{status ? "Working…" : "Upload and analyze"}</button>
      </div>
      {result ? (
        <section className="card mt-5 p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{result.processingStatus === "ready" ? "Processed" : "Could not build a quiz"}</p>
          <h2 className="mt-2 font-display text-3xl">{result.title}</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="File name" value={result.filename} />
            <Info label="File size" value={formatBytes(result.fileSize)} />
            <Info label="Upload date" value={formatDate(result.createdAt)} />
            <Info label="Pages" value={String(result.pageCount)} />
            <Info label="Processing status" value={result.processingStatus} />
            <Info label="Extracted content" value={result.contentStatus} />
          </dl>
          {result.failureReason ? <p className="mt-4 rounded-2xl bg-bad/10 px-4 py-3 text-sm text-bad" role="alert">{result.failureReason}</p> : null}
          {result.summary ? <p className="mt-4 text-sm leading-6 text-muted">{result.summary}</p> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/lessons/${result.lessonId}`} className="btn-ghost">Open lesson</Link>
            {result.contentStatus === "readable" ? <Link href={`/lessons/${result.lessonId}/generate`} className="btn-primary">Create a quiz</Link> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-semibold capitalize">{value}</dd>
    </div>
  );
}
