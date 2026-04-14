"use client";

import { useEffect } from "react";
// React 18 / Next 14 ships useFormState in react-dom.
import { useFormState, useFormStatus } from "react-dom";
import {
  updateAlertPreferences,
  INITIAL_ALERT_PREFS_STATE,
  type AlertPrefsState,
} from "./actions";
import { showToast } from "@/components/toast";

interface PreferencesFormProps {
  defaults: {
    email: string;
    emailAlertsEnabled: boolean;
    emailAlertSeverity: string;
    emailAlertCooldownMin: number;
  };
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-gold min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Saving…" : "Save preferences"}
    </button>
  );
}

export default function PreferencesForm({ defaults }: PreferencesFormProps) {
  const [state, formAction] = useFormState<AlertPrefsState, FormData>(
    updateAlertPreferences,
    INITIAL_ALERT_PREFS_STATE,
  );

  useEffect(() => {
    if (state.submittedAt === null) return;
    if (state.ok) {
      showToast("Preferences saved");
    } else if (state.error) {
      showToast(state.error, "error");
    }
  }, [state]);

  return (
    <form action={formAction}>
      {/* Master toggle */}
      <label className="flex items-start justify-between gap-4 py-4 border-b border-[#2A2A30]/60 cursor-pointer">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-primary font-medium">Enable email alerts</p>
          <p className="text-xs text-muted mt-0.5 truncate">
            Send notifications to {defaults.email}
          </p>
        </div>
        <input
          type="checkbox"
          name="emailAlertsEnabled"
          defaultChecked={defaults.emailAlertsEnabled}
          className="mt-1 w-5 h-5 rounded border-[#2A2A30] bg-[#0F0F11] text-gold focus:ring-gold focus:ring-offset-0"
        />
      </label>

      {/* Severity threshold */}
      <div className="py-4 border-b border-[#2A2A30]/60">
        <label
          htmlFor="emailAlertSeverity"
          className="block text-sm text-primary font-medium mb-1"
        >
          Minimum severity
        </label>
        <p className="text-xs text-muted mb-3">
          Only receive emails for alerts at this severity or higher.
        </p>
        <select
          id="emailAlertSeverity"
          name="emailAlertSeverity"
          defaultValue={defaults.emailAlertSeverity}
          className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-[#0F0F11] border border-[#2A2A30] text-sm text-primary focus:border-gold/60 focus:outline-none"
        >
          <option value="info">Info — all alerts</option>
          <option value="warning">Warning — warnings and critical</option>
          <option value="critical">Critical only</option>
        </select>
      </div>

      {/* Cooldown */}
      <div className="py-4 border-b border-[#2A2A30]/60">
        <label
          htmlFor="emailAlertCooldownMin"
          className="block text-sm text-primary font-medium mb-1"
        >
          Duplicate cooldown
        </label>
        <p className="text-xs text-muted mb-3">
          Wait at least this many minutes before re-sending a notification for
          the same locker and alert type. Set to 0 to disable.
        </p>
        <div className="flex items-center gap-3">
          <input
            id="emailAlertCooldownMin"
            name="emailAlertCooldownMin"
            type="number"
            min={0}
            max={1440}
            defaultValue={defaults.emailAlertCooldownMin}
            className="w-28 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#0F0F11] border border-[#2A2A30] text-sm text-primary focus:border-gold/60 focus:outline-none"
          />
          <span className="text-xs text-muted">minutes</span>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end pt-6">
        <SubmitButton />
      </div>
    </form>
  );
}
