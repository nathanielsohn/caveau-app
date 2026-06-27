"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { showToast } from "@/components/toast";
import {
  createPrivateLocation,
  updatePrivateLocation,
  removePrivateLocation,
  openPrivateLocation,
  INITIAL_PRIVATE_LOCATION_FORM_STATE,
  type PrivateLocationFormState,
} from "./actions";

type PrivateLocationKind =
  | "residence"
  | "restaurant"
  | "retail"
  | "hospitality"
  | "office"
  | "warehouse"
  | "other";

export const PRIVATE_LOCATION_KIND_OPTIONS: {
  value: PrivateLocationKind;
  label: string;
}[] = [
  { value: "residence", label: "Residence" },
  { value: "restaurant", label: "Restaurant" },
  { value: "retail", label: "Retail" },
  { value: "hospitality", label: "Hospitality" },
  { value: "office", label: "Office" },
  { value: "warehouse", label: "Warehouse" },
  { value: "other", label: "Other" },
];

export function privateLocationKindLabel(kind: string | null): string {
  return (
    PRIVATE_LOCATION_KIND_OPTIONS.find((option) => option.value === kind)
      ?.label ?? "Private location"
  );
}

function usePrivateLocationToast(state: PrivateLocationFormState) {
  useEffect(() => {
    if (state.submittedAt === null) return;
    if (state.ok) {
      showToast(state.message ?? "Saved");
    } else if (state.error) {
      showToast(state.error, "error");
    }
  }, [state]);
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  icon: Icon,
  variant = "gold",
}: {
  idleLabel: string;
  pendingLabel: string;
  icon: typeof Save;
  variant?: "gold" | "danger" | "secondary";
}) {
  const { pending } = useFormStatus();
  const className =
    variant === "danger"
      ? "inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-danger/10 text-danger border border-danger/30 text-sm font-medium hover:bg-danger/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      : variant === "secondary"
        ? "inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-[#2A2A30] text-secondary text-sm font-medium hover:text-primary hover:bg-[#1C1C20]/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        : "inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-gold text-black text-sm font-semibold hover:bg-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <button type="submit" disabled={pending} className={className}>
      <Icon className="w-4 h-4" />
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

function TextField({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-muted uppercase tracking-wider mb-2">
        {label}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
      />
    </label>
  );
}

function KindSelect({
  defaultValue,
}: {
  defaultValue?: PrivateLocationKind | null;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-muted uppercase tracking-wider mb-2">
        Location type
      </span>
      <select
        name="privateLocationKind"
        defaultValue={defaultValue ?? "residence"}
        className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
      >
        {PRIVATE_LOCATION_KIND_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CreatePrivateLocationForm() {
  const [state, formAction] = useFormState<PrivateLocationFormState, FormData>(
    createPrivateLocation,
    INITIAL_PRIVATE_LOCATION_FORM_STATE,
  );
  usePrivateLocationToast(state);

  return (
    <form action={formAction} className="glass-card p-6 md:p-8">
      <div className="flex items-center gap-2 mb-5">
        <Plus className="w-4 h-4 text-gold" />
        <h2 className="font-serif text-lg text-primary">
          Add private location
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField
          label="Name"
          name="name"
          placeholder="Sam's Miami wine room"
        />
        <KindSelect />
        <TextField
          label="Location"
          name="location"
          placeholder="Miami Beach, FL"
        />
        <TextField
          label="Elevation"
          name="elevationFt"
          type="number"
          placeholder="12"
        />
      </div>

      <div className="flex justify-end pt-5">
        <SubmitButton
          idleLabel="Add location"
          pendingLabel="Adding..."
          icon={Plus}
        />
      </div>
    </form>
  );
}

export interface PrivateLocationCardData {
  id: string;
  name: string;
  location: string;
  privateLocationKind: PrivateLocationKind | null;
  elevationFt: number | null;
  certifiedAtLabel: string | null;
  installerName: string | null;
  deviceCount: number;
  canRemove: boolean;
}

export function PrivateLocationCard({
  location,
}: {
  location: PrivateLocationCardData;
}) {
  const [updateState, updateAction] = useFormState<
    PrivateLocationFormState,
    FormData
  >(updatePrivateLocation, INITIAL_PRIVATE_LOCATION_FORM_STATE);
  const [removeState, removeAction] = useFormState<
    PrivateLocationFormState,
    FormData
  >(removePrivateLocation, INITIAL_PRIVATE_LOCATION_FORM_STATE);

  usePrivateLocationToast(updateState);
  usePrivateLocationToast(removeState);

  return (
    <div className="glass-card p-6 md:p-8">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-serif text-lg text-primary truncate">
              {location.name}
            </h2>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${
                location.certifiedAtLabel
                  ? "bg-gold/10 text-gold border-gold/30"
                  : "bg-warn/10 text-warn border-warn/30"
              }`}
            >
              {location.certifiedAtLabel ? "Certified" : "Pending"}
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            {privateLocationKindLabel(location.privateLocationKind)} ·{" "}
            {location.location}
          </p>
          <p className="text-xs text-secondary mt-1">
            {location.certifiedAtLabel
              ? `Certified ${location.certifiedAtLabel}`
              : "Certification pending installation and calibration"}
            {location.installerName ? ` · ${location.installerName}` : ""}
          </p>
        </div>
        <form action={openPrivateLocation}>
          <input type="hidden" name="facilityId" value={location.id} />
          <SubmitButton
            idleLabel="View"
            pendingLabel="Opening..."
            icon={ExternalLink}
            variant="secondary"
          />
        </form>
      </div>

      <form action={updateAction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="hidden" name="facilityId" value={location.id} />
        <TextField label="Name" name="name" defaultValue={location.name} />
        <KindSelect defaultValue={location.privateLocationKind} />
        <TextField
          label="Location"
          name="location"
          defaultValue={location.location}
        />
        <TextField
          label="Elevation"
          name="elevationFt"
          type="number"
          defaultValue={location.elevationFt}
        />

        <div className="md:col-span-2 flex items-center justify-between gap-3 flex-wrap pt-2">
          <p className="text-xs text-muted">
            {location.deviceCount} Sentinel device
            {location.deviceCount === 1 ? "" : "s"} registered
          </p>
          <SubmitButton idleLabel="Save" pendingLabel="Saving..." icon={Save} />
        </div>
      </form>

      <div className="mt-5 pt-5 border-t border-[#2A2A30]/60">
        {location.canRemove ? (
          <form action={removeAction} className="flex justify-end">
            <input type="hidden" name="facilityId" value={location.id} />
            <SubmitButton
              idleLabel="Remove location"
              pendingLabel="Removing..."
              icon={Trash2}
              variant="danger"
            />
          </form>
        ) : (
          <p className="text-xs text-muted">
            Locations with certification or monitoring history are retained for
            audit continuity.
          </p>
        )}
      </div>
    </div>
  );
}
