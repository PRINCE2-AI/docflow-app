import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GuideEditor from "./GuideEditor";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function GuidePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: guide } = await supabase
    .from("guides")
    .select("id, title, summary, public_slug, is_public")
    .eq("id", id)
    .single();

  if (!guide) notFound();

  const { data: steps } = await supabase
    .from("guide_steps")
    .select("id, step_number, title, description, screenshot_url, placeholder_note")
    .eq("guide_id", id)
    .order("step_number");

  return <GuideEditor guide={guide} steps={steps ?? []} />;
}
