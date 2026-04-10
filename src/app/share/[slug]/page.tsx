import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function SharePage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: guide } = await supabase
    .from("guides")
    .select("id, title, summary")
    .eq("public_slug", slug)
    .eq("is_public", true)
    .single();

  if (!guide) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <span className="text-5xl">🔍</span>
        <h1 className="text-xl font-semibold text-gray-800">Guide not found</h1>
        <p className="text-sm text-gray-500">
          This link may be invalid or the guide has been unpublished.
        </p>
        <a
          href="/login"
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          Sign in to DocFlow →
        </a>
      </div>
    );
  }

  const { data: steps } = await supabase
    .from("guide_steps")
    .select("id, step_number, title, description, screenshot_url")
    .eq("guide_id", guide.id)
    .order("step_number");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <span className="text-lg font-bold text-blue-600">DocFlow</span>
        <span className="text-gray-300">·</span>
        <span className="text-sm text-gray-500">Shared guide</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Title & summary */}
        <h1 className="text-3xl font-bold text-gray-900 mb-3">{guide.title}</h1>
        {guide.summary && (
          <p className="text-base text-gray-500 mb-10">{guide.summary}</p>
        )}

        {/* Steps */}
        {(!steps || steps.length === 0) ? (
          <p className="text-sm text-gray-400 text-center py-12">
            No steps in this guide.
          </p>
        ) : (
          <div className="space-y-5">
            {steps.map((step) => (
              <div
                key={step.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                {step.screenshot_url && (
                  <div className="border-b border-gray-100 bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={step.screenshot_url}
                      alt={`Step ${step.step_number}`}
                      className="w-full object-cover max-h-72"
                    />
                  </div>
                )}
                <div className="p-5 flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {step.step_number}
                  </span>
                  <div>
                    <p className="font-semibold text-gray-900 mb-1">{step.title}</p>
                    <p className="text-sm text-gray-600">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-10">
        <a
          href="/login"
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Made with DocFlow →
        </a>
      </footer>
    </div>
  );
}
