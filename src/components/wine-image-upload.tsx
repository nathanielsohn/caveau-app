"use client";

/**
 * Wine bottle photo uploader (feature #18).
 *
 * Browser → S3 direct upload via presigned PUT URL. Three steps:
 *   1. Server action returns a presigned URL + final object key.
 *   2. We PUT the file straight to S3 (no proxy, no API route).
 *   3. Server action persists the key on the wine row and revalidates.
 *
 * Designed to be self-contained: drop it on a wine detail page with the
 * wineId and current public URL (or null) and it handles the rest.
 *
 * The component shows an optimistic preview as soon as the user picks a
 * file, swaps to the freshly hosted URL on success, and rolls back to
 * whatever was there before if the upload fails.
 */

import Image from "next/image";
import { useRef, useState } from "react";
import { Camera, Loader2, Upload, X } from "lucide-react";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"] as const;
type AllowedType = (typeof ALLOWED)[number];

function isAllowed(type: string): type is AllowedType {
  return (ALLOWED as readonly string[]).includes(type);
}

export interface WineImageUploadProps {
  wineId: string;
  initialUrl: string | null;
  /** Server action: returns a presigned PUT URL + the final object key. */
  requestUrlAction: (
    wineId: string,
    contentType: string,
  ) => Promise<{ uploadUrl: string; key: string; publicUrl: string }>;
  /** Server action: persist the key after a successful upload. */
  setImageAction: (
    wineId: string,
    key: string,
  ) => Promise<{ publicUrl: string }>;
}

export default function WineImageUpload({
  wineId,
  initialUrl,
  requestUrlAction,
  setImageAction,
}: WineImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [displayUrl, setDisplayUrl] = useState<string | null>(initialUrl);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!isAllowed(file.type)) {
      setError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 5MB or smaller.");
      return;
    }

    // Optimistic preview from the local file so the UI feels instant.
    const previewUrl = URL.createObjectURL(file);
    const previousUrl = displayUrl;
    setDisplayUrl(previewUrl);
    setPending(true);

    try {
      const { uploadUrl, key, publicUrl } = await requestUrlAction(wineId, file.type);

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }

      await setImageAction(wineId, key);

      // Swap the optimistic blob URL for the real public URL and free the blob.
      setDisplayUrl(publicUrl);
      URL.revokeObjectURL(previewUrl);
    } catch (e) {
      // Roll back the optimistic preview.
      URL.revokeObjectURL(previewUrl);
      setDisplayUrl(previousUrl);
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  return (
    <div className="w-full md:w-48 flex-shrink-0">
      <div className="relative w-full h-56 md:h-64 rounded-xl bg-caveau-graphite border border-[#2A2A30]/50 overflow-hidden group">
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt="Wine bottle photo"
            fill
            sizes="(min-width: 768px) 192px, 100vw"
            /* Blob: URLs (optimistic previews) can't be processed by the
               Next.js image optimizer — skip it there, let S3 URLs optimize. */
            unoptimized={displayUrl.startsWith("blob:")}
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Camera className="w-12 h-12 text-burgundy/50" strokeWidth={1.2} />
          </div>
        )}

        {/* Hover overlay with action button */}
        <button
          type="button"
          onClick={openPicker}
          disabled={pending}
          aria-label={displayUrl ? "Replace bottle photo" : "Upload bottle photo"}
          className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/50 transition-colors duration-200 text-transparent group-hover:text-gold disabled:cursor-not-allowed"
        >
          {pending ? (
            <span className="flex items-center gap-2 text-gold text-sm font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading…
            </span>
          ) : (
            <span className="flex items-center gap-2 text-sm font-medium">
              <Upload className="w-4 h-4" />
              {displayUrl ? "Replace" : "Add photo"}
            </span>
          )}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onChange}
        className="hidden"
      />

      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-danger">
          <X className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
