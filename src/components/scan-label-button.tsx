"use client";

/**
 * Wine label scanner button (feature #24).
 *
 * Reusable client component used by both the standalone AddWineForm and
 * the inline locker-slot add-wine form. Owns its own file input, upload
 * state, scan state, and error state. The parent only has to:
 *   1. Listen for `onParsed` to populate form fields
 *   2. Read `imageKey` from `onParsed` and persist it on submit
 *
 * Behavior matrix:
 *   - S3 not configured (visionConfigured=false AND no upload action) → the
 *     parent should hide this button entirely.
 *   - GOOGLE_CLOUD_VISION_API_KEY unset → button renders disabled with a
 *     tooltip; manual entry still works.
 *   - Configured → tap → camera (mobile) or file picker (desktop) → upload
 *     → scan → onParsed callback fires with parsed fields + imageKey.
 *
 * Errors from any step (validation, upload, OCR) surface inline and the
 * status region announces them via aria-live.
 */

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  ScanWineLabelResult,
  ScanUploadUrlResult,
} from "@/app/collection/label-scan-actions";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"] as const;
type AllowedType = (typeof ALLOWED)[number];
function isAllowed(type: string): type is AllowedType {
  return (ALLOWED as readonly string[]).includes(type);
}

export interface ScanLabelButtonProps {
  visionConfigured: boolean;
  requestUploadUrlAction: (
    contentType: string,
    contentLength: number,
  ) => Promise<ScanUploadUrlResult>;
  scanAction: (key: string) => Promise<ScanWineLabelResult>;
  onParsed: (result: {
    producer?: string;
    name?: string;
    vintage?: number;
    region?: string;
    varietal?: string;
    imageKey: string;
  }) => void;
}

type Status = "idle" | "uploading" | "scanning";

export default function ScanLabelButton({
  visionConfigured,
  requestUploadUrlAction,
  scanAction,
  onParsed,
}: ScanLabelButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const disabled = !visionConfigured || status !== "idle";

  function openPicker() {
    setError(null);
    setSuccess(null);
    inputRef.current?.click();
  }

  async function handleFile(file: File) {
    if (!isAllowed(file.type)) {
      setError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 5MB or smaller.");
      return;
    }

    setError(null);
    setSuccess(null);
    setStatus("uploading");

    try {
      const presign = await requestUploadUrlAction(file.type, file.size);
      if (!presign.ok) {
        setError(presign.error);
        return;
      }

      const putRes = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "Content-Length": String(file.size),
        },
        body: file,
      });
      if (!putRes.ok) {
        setError(`Upload failed (${putRes.status})`);
        return;
      }

      setStatus("scanning");
      const scan = await scanAction(presign.key);
      if (!scan.ok) {
        setError(scan.error);
        return;
      }

      onParsed({
        producer: scan.data.producer,
        name: scan.data.name,
        vintage: scan.data.vintage,
        region: scan.data.region,
        varietal: scan.data.varietal,
        imageKey: scan.data.imageKey,
      });
      setSuccess("Fields populated from label");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setStatus("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  const statusMessage =
    status === "uploading"
      ? "Uploading photo…"
      : status === "scanning"
        ? "Scanning label…"
        : success ?? error ?? "";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Scan wine label with camera"
        title={
          !visionConfigured
            ? "Label scanning is not configured on this server"
            : "Take a photo of the label to auto-fill the form"
        }
        className="flex items-center justify-center gap-2 w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-gold/40 text-gold bg-gold/5 hover:bg-gold/10 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <AnimatePresence mode="wait" initial={false}>
          {status === "idle" ? (
            <motion.span
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <Camera size={16} />
              Scan Label
            </motion.span>
          ) : (
            <motion.span
              key="busy"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <Loader2 size={16} className="animate-spin" />
              {status === "uploading" ? "Uploading…" : "Scanning…"}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={onChange}
        className="hidden"
      />

      {/* aria-live region — empty most of the time, announces progress
          and result so screen readers stay in the loop. */}
      <div
        role="status"
        aria-live="polite"
        className={`text-xs min-h-[1rem] ${
          error ? "text-danger" : success ? "text-gold" : "text-secondary"
        }`}
      >
        {statusMessage}
      </div>
    </div>
  );
}
