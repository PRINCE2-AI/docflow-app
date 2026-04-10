import base64
import json
import os
import uuid
from typing import Any

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client

load_dotenv()

app = FastAPI(title="DocFlow Guide API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_origin_regex=r"chrome-extension://.*",
    allow_methods=["*"],
    allow_headers=["*"],
)

anthropic_client = anthropic.Anthropic()
supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)


# ── Request / Response models ─────────────────────────────────────────────────

class Step(BaseModel):
    step_number: int
    action: str
    element_text: str
    element_xpath: str | None = None
    page_url: str
    timestamp: int
    screenshot_base64: str | None = None


class CreateGuideRequest(BaseModel):
    steps: list[Step]
    workspace_id: str | None = None


class GuideStep(BaseModel):
    step_number: int
    title: str
    description: str


class CreateGuideResponse(BaseModel):
    guide_id: str
    title: str
    summary: str
    steps: list[GuideStep]


class GenerateFromPromptRequest(BaseModel):
    prompt: str
    workspace_id: str


class AIGuideStep(BaseModel):
    step_number: int
    title: str
    description: str
    placeholder_note: str


class GenerateFromPromptResponse(BaseModel):
    guide_id: str
    title: str


# ── Helper: upload screenshot ─────────────────────────────────────────────────

def upload_screenshot(guide_id: str, step_number: int, data_url: str) -> str | None:
    """Upload base64 PNG to Supabase Storage bucket 'screenshots'. Returns public URL."""
    try:
        raw = data_url
        if "," in raw:
            raw = raw.split(",", 1)[1]
        img_bytes = base64.b64decode(raw)
        path = f"guides/{guide_id}/step_{step_number}.png"
        supabase.storage.from_("screenshots").upload(
            path,
            img_bytes,
            {"content-type": "image/png", "upsert": "true"},
        )
        return supabase.storage.from_("screenshots").get_public_url(path)
    except Exception as exc:
        print(f"[DocFlow] Screenshot upload failed (step {step_number}): {exc}")
        return None


# ── Endpoint ──────────────────────────────────────────────────────────────────

@app.post("/api/guides/create", response_model=CreateGuideResponse)
async def create_guide(body: CreateGuideRequest) -> CreateGuideResponse:
    if not body.steps:
        raise HTTPException(status_code=422, detail="steps array must not be empty")

    guide_id = str(uuid.uuid4())

    # 1. Upload screenshots to Supabase Storage
    screenshot_urls: dict[int, str | None] = {}
    for step in body.steps:
        if step.screenshot_base64:
            url = upload_screenshot(guide_id, step.step_number, step.screenshot_base64)
            screenshot_urls[step.step_number] = url

    # 2. Serialize steps for Claude — omit screenshot payload to save tokens
    steps_for_prompt = [
        {
            "step_number":   s.step_number,
            "action":        s.action,
            "element_text":  s.element_text,
            "element_xpath": s.element_xpath,
            "page_url":      s.page_url,
            "timestamp":     s.timestamp,
        }
        for s in body.steps
    ]

    prompt = (
        "You are a documentation AI. Given these captured user actions, "
        "generate a step-by-step guide. Return JSON only, no markdown:\n"
        "{\n"
        '  "guide_title": string,\n'
        '  "guide_summary": string,\n'
        '  "steps": [{"step_number": int, "title": string, "description": string}]\n'
        "}\n\n"
        f"Actions: {json.dumps(steps_for_prompt, indent=2)}"
    )

    # 3. Build content blocks: text prompt + optional screenshots
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]

    for step in body.steps:
        if step.screenshot_base64:
            raw = step.screenshot_base64
            if "," in raw:
                raw = raw.split(",", 1)[1]
            content.append({
                "type": "image",
                "source": {
                    "type":       "base64",
                    "media_type": "image/png",
                    "data":       raw,
                },
            })
            content.append({
                "type": "text",
                "text": f"(Screenshot after step {step.step_number})",
            })

    # 4. Call Claude
    message = anthropic_client.messages.create(
        model="claude-sonnet-4-6-20250929",
        max_tokens=4096,
        messages=[{"role": "user", "content": content}],
    )

    raw_text = message.content[0].text.strip()

    # Strip accidental markdown fences
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1]
        raw_text = raw_text.rsplit("```", 1)[0].strip()

    try:
        guide_data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Claude returned non-JSON response: {raw_text[:300]}",
        ) from exc

    title   = guide_data.get("guide_title", "Untitled Guide")
    summary = guide_data.get("guide_summary", "")
    steps   = guide_data.get("steps", [])

    # 5. Save guide to DB
    supabase.table("guides").insert({
        "id":           guide_id,
        "workspace_id": body.workspace_id,
        "title":        title,
        "summary":      summary,
        "status":       "published",
    }).execute()

    # 6. Save guide_steps to DB
    step_rows = [
        {
            "guide_id":       guide_id,
            "step_number":    s["step_number"],
            "title":          s["title"],
            "description":    s["description"],
            "screenshot_url": screenshot_urls.get(s["step_number"]),
        }
        for s in steps
    ]
    if step_rows:
        supabase.table("guide_steps").insert(step_rows).execute()

    return CreateGuideResponse(
        guide_id=guide_id,
        title=title,
        summary=summary,
        steps=[
            GuideStep(
                step_number=s["step_number"],
                title=s["title"],
                description=s["description"],
            )
            for s in steps
        ],
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/guides/generate-from-prompt", response_model=GenerateFromPromptResponse)
async def generate_from_prompt(body: GenerateFromPromptRequest) -> GenerateFromPromptResponse:
    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="prompt must not be empty")

    guide_id = str(uuid.uuid4())

    prompt = (
        f"Generate a step-by-step guide for: {body.prompt}\n\n"
        "Return JSON only, no markdown:\n"
        "{\n"
        '  "guide_title": string,\n'
        '  "guide_summary": string,\n'
        '  "steps": [\n'
        "    {\n"
        '      "step_number": int,\n'
        '      "title": string,\n'
        '      "description": string,\n'
        '      "placeholder_note": string\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "placeholder_note should describe what the screenshot should show for this step."
    )

    message = anthropic_client.messages.create(
        model="claude-sonnet-4-6-20250929",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    raw_text = message.content[0].text.strip()

    # Strip markdown fences
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1]
        raw_text = raw_text.rsplit("```", 1)[0].strip()

    try:
        guide_data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Claude returned non-JSON response: {raw_text[:300]}",
        ) from exc

    title = guide_data.get("guide_title", "Untitled Guide")
    summary = guide_data.get("guide_summary", "")
    steps = guide_data.get("steps", [])

    # Save guide to DB
    supabase.table("guides").insert({
        "id": guide_id,
        "workspace_id": body.workspace_id,
        "title": title,
        "summary": summary,
        "status": "published",
    }).execute()

    # Save guide_steps to DB (no screenshots for AI-generated guides)
    step_rows = [
        {
            "guide_id": guide_id,
            "step_number": s["step_number"],
            "title": s["title"],
            "description": s["description"],
            "screenshot_url": None,
            "placeholder_note": s.get("placeholder_note"),
        }
        for s in steps
    ]
    if step_rows:
        supabase.table("guide_steps").insert(step_rows).execute()

    return GenerateFromPromptResponse(guide_id=guide_id, title=title)
