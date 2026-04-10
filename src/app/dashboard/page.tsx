import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import GenerateModal from "@/components/GenerateModal";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("name, avatar_url")
    .eq("id", user.id)
    .single();

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .single();

  console.log("[dashboard] user:", user.id, user.email);
  console.log("[dashboard] membership:", JSON.stringify(membership));
  console.log("[dashboard] membershipError:", membershipError);

  const workspaceId = membership?.workspace_id ?? null;

  const { data: workspace } = workspaceId
    ? await supabase
        .from("workspaces")
        .select("id, name")
        .eq("id", workspaceId)
        .single()
    : { data: null };

  console.log("[dashboard] workspaceId:", workspaceId);
  console.log("[dashboard] workspace:", JSON.stringify(workspace));

  // Fetch all guides for this workspace, ordered newest first
  const { data: guides, error: guidesError } = workspaceId
    ? await supabase
        .from("guides")
        .select(
          `id, title, summary, created_at,
           guide_steps ( screenshot_url, step_number )`
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  console.log("[dashboard] guides count:", guides?.length ?? 0);
  console.log("[dashboard] guidesError:", guidesError);
  console.log("[dashboard] guides:", JSON.stringify(guides?.map(g => ({ id: g.id, title: (g as { title: string }).title }))));

  // Pull the first-step screenshot for each guide as thumbnail
  type RawGuide = {
    id: string;
    title: string;
    summary: string;
    created_at: string;
    guide_steps: { screenshot_url: string | null; step_number: number }[];
  };

  const guideList = ((guides as RawGuide[]) ?? []).map((g) => {
    const sorted = [...(g.guide_steps ?? [])].sort(
      (a, b) => a.step_number - b.step_number
    );
    return {
      id: g.id,
      title: g.title || "Untitled Guide",
      summary: g.summary,
      created_at: g.created_at,
      thumbnail: sorted[0]?.screenshot_url ?? null,
      stepCount: g.guide_steps?.length ?? 0,
    };
  });

  const formattedDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-blue-600">DocFlow</span>
          {workspace && (
            <>
              <span className="text-gray-300">/</span>
              <span className="text-sm text-gray-600 font-medium">
                {workspace.name}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Page heading + New Guide button */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">
              Welcome{profile?.name ? `, ${profile.name}` : ""} 👋
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {guideList.length === 0
                ? "No guides yet. Capture your first workflow with the extension."
                : `${guideList.length} guide${guideList.length === 1 ? "" : "s"} in your workspace`}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {workspaceId && <GenerateModal workspaceId={workspaceId} />}
            <a
              href="https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <span>+</span> New Guide
            </a>
          </div>
        </div>

        {/* Guides grid */}
        {guideList.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-16 text-center">
            <p className="text-4xl mb-4">📋</p>
            <p className="font-medium text-gray-700">No guides yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Use the DocFlow Chrome extension to capture a workflow.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {guideList.map((guide) => (
              <div
                key={guide.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col"
              >
                {/* Thumbnail */}
                <div className="h-36 bg-gray-100 flex-shrink-0 overflow-hidden">
                  {guide.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={guide.thumbnail}
                      alt={guide.title}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-3xl">
                      📄
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 mb-1">
                    {guide.title}
                  </h3>
                  <p className="text-xs text-gray-400 mb-3">
                    {guide.stepCount} step{guide.stepCount === 1 ? "" : "s"} ·{" "}
                    {formattedDate(guide.created_at)}
                  </p>

                  <div className="mt-auto">
                    <a
                      href={`/guides/${guide.id}`}
                      className="block text-center w-full px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      Edit →
                    </a>
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
