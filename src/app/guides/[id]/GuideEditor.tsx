"use client";

import { useRef, useState } from "react";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/client";

type Guide = { id: string; title: string; summary: string; public_slug?: string | null; is_public?: boolean };
type GuideStep = {
  id: string;
  step_number: number;
  title: string;
  description: string;
  screenshot_url: string | null;
  placeholder_note?: string | null;
};

interface Props {
  guide: Guide;
  steps: GuideStep[];
}

export default function GuideEditor({ guide, steps: initialSteps }: Props) {
  const supabase = createClient();

  const [title, setTitle] = useState(guide.title);
  const [summary, setSummary] = useState(guide.summary);
  const [steps, setSteps] = useState<GuideStep[]>(initialSteps);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [shareLabel, setShareLabel] = useState<"Share" | "Copied!">("Share");

  // Per-field debounce timers
  const guideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Guide-level save ──────────────────────────────────────────────────────

  function scheduleGuideSave(newTitle: string, newSummary: string) {
    if (guideTimer.current) clearTimeout(guideTimer.current);
    guideTimer.current = setTimeout(async () => {
      setPendingSaves((n) => n + 1);
      await supabase
        .from("guides")
        .update({ title: newTitle, summary: newSummary })
        .eq("id", guide.id);
      setPendingSaves((n) => n - 1);
    }, 1000);
  }

  // ── Step-level save ───────────────────────────────────────────────────────

  function scheduleStepSave(
    stepId: string,
    field: "title" | "description",
    value: string
  ) {
    const key = `${stepId}:${field}`;
    if (stepTimers.current[key]) clearTimeout(stepTimers.current[key]);
    stepTimers.current[key] = setTimeout(async () => {
      setPendingSaves((n) => n + 1);
      await supabase
        .from("guide_steps")
        .update({ [field]: value })
        .eq("id", stepId);
      setPendingSaves((n) => n - 1);
    }, 1000);
  }

  // ── Inline edit helpers ───────────────────────────────────────────────────

  function updateStep(
    stepId: string,
    field: "title" | "description",
    value: string
  ) {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, [field]: value } : s))
    );
    scheduleStepSave(stepId, field, value);
  }

  const isSaving = pendingSaves > 0;

  // ── Share ─────────────────────────────────────────────────────────────────

  async function handleShare() {
    const slug = nanoid(10);
    await supabase
      .from("guides")
      .update({ is_public: true, public_slug: slug })
      .eq("id", guide.id);

    const link = `${window.location.origin}/share/${slug}`;
    await navigator.clipboard.writeText(link);
    setShareLabel("Copied!");
    setTimeout(() => setShareLabel("Share"), 2000);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <a
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ← Dashboard
        </a>
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-medium transition-colors ${
              isSaving ? "text-blue-500" : "text-gray-400"
            }`}
          >
            {isSaving ? "Saving…" : "All changes saved"}
          </span>
          <button
            onClick={handleShare}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              shareLabel === "Copied!"
                ? "bg-green-100 text-green-700"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {shareLabel === "Copied!" ? "✓ Copied!" : "Share"}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Guide title */}
        <input
          className="w-full text-3xl font-bold text-gray-900 bg-transparent border-transparent rounded-lg px-2 py-1 -mx-2 outline-none hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-blue-300 transition mb-2"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleGuideSave(e.target.value, summary);
          }}
          placeholder="Untitled Guide"
        />

        {/* Guide summary */}
        <textarea
          className="w-full text-base text-gray-500 bg-transparent border-transparent rounded-lg px-2 py-1 -mx-2 outline-none hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-blue-300 resize-none transition mb-10"
          rows={2}
          value={summary}
          onChange={(e) => {
            setSummary(e.target.value);
            scheduleGuideSave(title, e.target.value);
          }}
          placeholder="Add a summary…"
        />

        {/* Steps */}
        {steps.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">
            No steps captured yet.
          </p>
        ) : (
          <div className="space-y-5">
            {steps.map((step) => (
              <div
                key={step.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                {/* Screenshot or placeholder */}
                {step.screenshot_url ? (
                  <div className="border-b border-gray-100 bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={step.screenshot_url}
                      alt={`Step ${step.step_number}`}
                      className="w-full object-cover max-h-72"
                    />
                  </div>
                ) : (
                  <div className="border-b border-gray-100 bg-gray-100 h-48 flex items-center justify-center p-6">
                    <p className="text-sm text-gray-400 text-center italic">
                      {step.placeholder_note || "📸 Screenshot placeholder — AI-generated step"}
                    </p>
                  </div>
                )}

                {/* Step body */}
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    {/* Step number badge */}
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {step.step_number}
                    </span>

                    <div className="flex-1 min-w-0">
                      {/* Step title */}
                      <input
                        className="w-full font-semibold text-gray-900 bg-transparent border-transparent rounded-md px-1.5 py-0.5 -mx-1.5 outline-none hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-blue-300 transition mb-1"
                        value={step.title}
                        onChange={(e) =>
                          updateStep(step.id, "title", e.target.value)
                        }
                        placeholder="Step title"
                      />

                      {/* Step description */}
                      <textarea
                        className="w-full text-sm text-gray-600 bg-transparent border-transparent rounded-md px-1.5 py-0.5 -mx-1.5 outline-none hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-blue-300 resize-none transition"
                        rows={2}
                        value={step.description}
                        onChange={(e) =>
                          updateStep(step.id, "description", e.target.value)
                        }
                        placeholder="Step description"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
