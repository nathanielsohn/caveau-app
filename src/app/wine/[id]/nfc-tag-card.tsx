"use client";

/**
 * NFC tag intake card (feature #43).
 *
 * Renders on the wine detail page. When the bottle has no tag, shows an
 * "Assign NFC Tag" button that opens the intake dialog. When a tag is
 * already assigned, shows the tag metadata + the tap-to-verify URL + a
 * remove button.
 *
 * Two tag tiers:
 *   - capsule: invisible chip under the foil for trophy bottles ($1,000+)
 *   - collar:  visible navy/gold Caveau neck collar with an embedded chip
 */

import { useEffect, useRef, useState, useTransition } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  Copy,
  Nfc,
  Ribbon,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { showToast } from "@/components/toast";
import type {
  AssignTagResult,
  TagUploadUrlResult,
} from "./nfc-actions";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"] as const;

export interface NfcTagCardProps {
  wineId: string;
  wineName: string;
  tag: {
    tagId: string;
    tier: "capsule" | "collar";
    intakeImageUrl: string | null;
    activatedAt: string | null;
    scanCount: number;
  } | null;
  /** Absolute URL origin so the displayed tap-link is copy-pasteable. */
  bottleUrl: string;
  s3Configured: boolean;
  assignAction: (formData: FormData) => Promise<AssignTagResult>;
  removeAction: (formData: FormData) => Promise<AssignTagResult>;
  requestUploadUrlAction: (
    wineId: string,
    contentType: string,
    contentLength: number,
  ) => Promise<TagUploadUrlResult>;
}

export default function NfcTagCard(props: NfcTagCardProps) {
  const { tag } = props;
  const [showAssign, setShowAssign] = useState(false);
  const [isRemoving, startRemove] = useTransition();

  async function handleRemove() {
    if (!tag) return;
    if (!confirm("Remove the NFC tag from this bottle? This can't be undone.")) {
      return;
    }
    const fd = new FormData();
    fd.set("wineId", props.wineId);
    startRemove(async () => {
      const res = await props.removeAction(fd);
      if (res.ok) {
        showToast("NFC tag removed");
      } else {
        showToast(res.error ?? "Could not remove tag");
      }
    });
  }

  if (!tag) {
    return (
      <>
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0">
                <Nfc className="w-5 h-5 text-gold" />
              </div>
              <div>
                <h2 className="font-serif text-xl text-primary">
                  NFC Bottle Tracking
                </h2>
                <p className="text-xs text-muted mt-1 max-w-sm">
                  No QR stickers. Tap-to-verify via a chip hidden under the
                  foil or embedded in a branded neck collar.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAssign(true)}
              className="btn-gold text-sm px-4 py-2 min-h-[44px]"
            >
              Assign NFC Tag
            </button>
          </div>
        </div>
        <NfcTagForm
          open={showAssign}
          onClose={() => setShowAssign(false)}
          wineId={props.wineId}
          wineName={props.wineName}
          s3Configured={props.s3Configured}
          assignAction={props.assignAction}
          requestUploadUrlAction={props.requestUploadUrlAction}
        />
      </>
    );
  }

  return (
    <div className="glass-card p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-ok/10 border border-ok/20 flex items-center justify-center flex-shrink-0">
          <BadgeCheck className="w-5 h-5 text-ok" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-serif text-xl text-primary">NFC Tag Active</h2>
            <TierBadge tier={tag.tier} />
          </div>
          <p className="text-xs text-muted mt-1">
            Tap a phone to the {tag.tier === "capsule" ? "capsule" : "collar"} to
            pull up this bottle&apos;s Custody & Condition Report.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#2A2A30]/50">
        <div>
          <p className="text-[11px] text-muted uppercase tracking-wider">
            Tag ID
          </p>
          <p className="font-mono text-sm text-gold-text mt-1 break-all">
            {tag.tagId}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted uppercase tracking-wider">
            Activated
          </p>
          <p className="text-sm text-secondary mt-1">
            {tag.activatedAt
              ? new Date(tag.activatedAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted uppercase tracking-wider">
            Verified Taps
          </p>
          <p className="text-sm text-primary font-semibold tabular-nums mt-1">
            {tag.scanCount.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="pt-4 border-t border-[#2A2A30]/50 space-y-3">
        <p className="text-[11px] text-muted uppercase tracking-wider">
          Public tap-to-verify URL
        </p>
        <CopyableUrl url={props.bottleUrl} />
      </div>

      {tag.intakeImageUrl && (
        <div className="pt-4 border-t border-[#2A2A30]/50 space-y-2">
          <p className="text-[11px] text-muted uppercase tracking-wider">
            Intake photo
          </p>
          <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-[#0C0C0E] border border-[#2A2A30]/60">
            <Image
              src={tag.intakeImageUrl}
              alt="NFC tag intake photo"
              fill
              sizes="128px"
              className="object-cover"
            />
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-[#2A2A30]/50 flex justify-end">
        <button
          type="button"
          onClick={handleRemove}
          disabled={isRemoving}
          className="text-xs text-muted hover:text-danger transition-colors disabled:opacity-50"
        >
          {isRemoving ? "Removing…" : "Remove tag"}
        </button>
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: "capsule" | "collar" }) {
  if (tier === "capsule") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium bg-gold/10 text-gold border-gold/20">
        <Sparkles size={11} />
        Capsule · Trophy
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium bg-[#60A5FA]/10 text-[#60A5FA] border-[#60A5FA]/20">
      <Ribbon size={11} />
      Collar · Cellar
    </span>
  );
}

function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast("Could not copy link");
    }
  }
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 text-xs text-secondary font-mono bg-caveau-graphite border border-[#2A2A30] rounded-lg px-3 py-2 overflow-x-auto whitespace-nowrap">
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg border border-[#2A2A30] text-muted hover:text-gold hover:border-gold/40 transition-colors"
        aria-label="Copy tap-to-verify URL"
      >
        {copied ? <CheckCircle2 size={16} className="text-ok" /> : <Copy size={16} />}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Assign tag dialog                                                  */
/* ------------------------------------------------------------------ */

interface NfcTagFormProps {
  open: boolean;
  onClose: () => void;
  wineId: string;
  wineName: string;
  s3Configured: boolean;
  assignAction: (formData: FormData) => Promise<AssignTagResult>;
  requestUploadUrlAction: (
    wineId: string,
    contentType: string,
    contentLength: number,
  ) => Promise<TagUploadUrlResult>;
}

function NfcTagForm({
  open,
  onClose,
  wineId,
  wineName,
  s3Configured,
  assignAction,
  requestUploadUrlAction,
}: NfcTagFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tier, setTier] = useState<"capsule" | "collar">("collar");
  const [tagId, setTagId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setTier("collar");
      setTagId("");
      setError(null);
      setImageKey(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    // Intentional: we only want to reset when the dialog toggles closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleFile(file: File) {
    setError(null);
    if (!(ALLOWED as readonly string[]).includes(file.type)) {
      setError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 5MB or smaller.");
      return;
    }
    const blobUrl = URL.createObjectURL(file);
    const prev = previewUrl;
    setPreviewUrl(blobUrl);
    setUploading(true);
    try {
      const res = await requestUploadUrlAction(wineId, file.type, file.size);
      const put = await fetch(res.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "Content-Length": String(file.size),
        },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      setImageKey(res.key);
      if (prev) URL.revokeObjectURL(prev);
    } catch (e) {
      URL.revokeObjectURL(blobUrl);
      setPreviewUrl(prev);
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    if (!formData.get("tagId") || !String(formData.get("tagId")).trim()) {
      setError("Enter the NFC tag serial.");
      return;
    }
    startTransition(async () => {
      const res = await assignAction(formData);
      if (res.ok) {
        showToast("NFC tag assigned");
        onClose();
      } else {
        setError(res.error ?? "Could not assign tag");
      }
    });
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="nfc-assign-title"
      className="fixed inset-0 z-50 m-auto w-full max-w-md p-0 bg-transparent backdrop:bg-black/60 backdrop:backdrop-blur-sm open:flex items-center justify-center"
    >
      <div className="w-full max-h-[90vh] overflow-y-auto glass-card p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between">
          <h2 id="nfc-assign-title" className="font-serif text-xl text-primary">
            Assign NFC Tag
          </h2>
          <button
            onClick={onClose}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-muted hover:text-primary transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-secondary">
          Tagging{" "}
          <span className="text-primary font-medium">{wineName}</span>
        </p>

        {error && (
          <div
            role="alert"
            className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2"
          >
            {error}
          </div>
        )}

        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="wineId" value={wineId} />
          {imageKey && (
            <input type="hidden" name="intakeImageKey" value={imageKey} />
          )}

          {/* Tier picker */}
          <div>
            <label className="block text-xs text-muted uppercase tracking-wide mb-2">
              Tag tier
            </label>
            <div className="grid grid-cols-2 gap-2">
              <TierOption
                value="capsule"
                active={tier === "capsule"}
                onClick={() => setTier("capsule")}
                title="Capsule"
                subtitle="Trophy ($1,000+)"
                icon={<Sparkles size={16} className="text-gold" />}
              />
              <TierOption
                value="collar"
                active={tier === "collar"}
                onClick={() => setTier("collar")}
                title="Collar"
                subtitle="Standard cellar"
                icon={<Ribbon size={16} className="text-[#60A5FA]" />}
              />
            </div>
            <input type="hidden" name="tier" value={tier} />
          </div>

          {/* Tag ID */}
          <div>
            <label
              htmlFor="nfc-tag-id"
              className="block text-xs text-muted uppercase tracking-wide mb-1.5"
            >
              Tag ID *
            </label>
            <input
              id="nfc-tag-id"
              name="tagId"
              type="text"
              required
              minLength={6}
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              value={tagId}
              onChange={(e) => setTagId(e.target.value.trim())}
              placeholder="Scan or enter serial (e.g. CV-9H2K-4T)"
              className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2.5 text-sm text-primary placeholder:text-muted font-mono focus:outline-none focus:border-gold/50 transition-colors"
            />
            <p className="text-[11px] text-muted mt-1">
              Printed on the tag liner at intake. 6–64 characters, letters /
              digits / dash / underscore.
            </p>
          </div>

          {/* Intake photo */}
          <div>
            <label className="block text-xs text-muted uppercase tracking-wide mb-1.5">
              Intake photo (optional)
            </label>
            {s3Configured ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl text-sm text-secondary bg-caveau-graphite border border-[#2A2A30] hover:border-gold/40 transition-colors disabled:opacity-50"
                >
                  <Upload size={14} />
                  {uploading ? "Uploading…" : previewUrl ? "Replace" : "Upload"}
                </button>
                {previewUrl && (
                  <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-[#0C0C0E] border border-[#2A2A30]/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Intake preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2">
                Photo uploads are disabled on this environment. Set
                <code className="mx-1 text-gold-text">AWS_S3_BUCKET</code>
                to enable.
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              className="hidden"
            />
          </div>

          <button
            type="submit"
            disabled={isPending || uploading}
            className="w-full btn-gold py-3 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Assigning…" : "Assign Tag"}
          </button>
        </form>
      </div>
    </dialog>
  );
}

function TierOption({
  active,
  onClick,
  title,
  subtitle,
  icon,
}: {
  value: "capsule" | "collar";
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-2 p-3 rounded-xl border text-left transition-all min-h-[64px] ${
        active
          ? "border-gold/50 bg-gold/5"
          : "border-[#2A2A30] bg-caveau-graphite hover:border-gold/30"
      }`}
      aria-pressed={active}
    >
      <span className="mt-0.5">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-primary">{title}</span>
        <span className="block text-[11px] text-muted">{subtitle}</span>
      </span>
    </button>
  );
}
