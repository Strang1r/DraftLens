import "dotenv/config";
import OpenAI from "openai";
import { z } from "zod";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

//生成图片
/* export const DraftSchema = z.object({
  mainTitle: z.string().min(1),
  scenes: z
    .array(
      z.object({
        id: z.number().int(),
        subTitle: z.string().min(1),
        text: z.array(z.string().min(1)).min(1),
      })
    )
    .min(4)
    .max(6),
}); */

export const AnnotationsSchema = z.object({
  paragraphs: z.array(
    z.object({
      keyWords: z.array(z.string().min(1)).min(1).max(2),
      keySentences: z.array(z.string().min(1)).max(1),
    })
  ),
});
export type Annotations = z.infer<typeof AnnotationsSchema>;


export const DraftSchema = z.object({
  mainTitle: z.string().min(1),
  scenes: z
    .array(
      z.object({
        id: z.number().int().min(1).max(5),
        subTitle: z.string().min(1).max(60),
        img: z.string().regex(/^\/assets\/[1-5]\.png$/),
        text: z.array(z.string().min(1)).min(1),
        annotations: AnnotationsSchema.optional(),
        rationale: z.string().optional(),
      })
    )
    .min(3)
    .max(5),
});

// condition3 search 
const WhyHereSchema = z.object({
  explanation: z.string().min(0),
});
export type WhyHere = z.infer<typeof WhyHereSchema>;

// condition4 summary
const SceneRationaleSchema = z.object({
  rationale: z.string().min(0),
});
export type SceneRationale = z.infer<typeof SceneRationaleSchema>;

const SceneAlternativesSchema = z.object({
  conversational: z.object({
    text: z.array(z.string().min(1)).min(1).max(3),
  }),
  professional: z.object({
    text: z.array(z.string().min(1)).min(1).max(3),
  }),
});

export type SceneAlternatives = z.infer<typeof SceneAlternativesSchema>;

export type Draft = z.infer<typeof DraftSchema>;

export function withTimeout<T>(p: Promise<T>, ms: number, label = "timeout"): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

export async function generateDraftFromLLM(args: {
  instruction: string;
}): Promise<Draft> {
  const { instruction } = args;

  const system = `
You generate a short video script as STRICT JSON only.
Return JSON with EXACT keys: mainTitle, scenes. No other keys. No markdown. No commentary.

Constraints:
- Language: English only.
- mainTitle: <= 10 words.
- scenes: 3 to 5 items.
- Each scene must have:
 - id: number (1..5)
 - subTitle: string, <= 10 words.
   Must follow this exact format: "SceneX: subtitle"
 - text: array of 1-3 paragraphs (strings), each scene total 80-120 words.
 - img: string, MUST be exactly "/assets/{id}.png" where {id} equals the scene id.
- Style: popular science + storytelling, clear and accessible.
- Avoid: first-person ("I/we"), rhetorical questions, lists/bullets, and value judgments.

Output MUST be valid JSON parsable by JSON.parse.
`.trim();

  const user = `
Instruction: ${instruction || "(empty)"}

Image guidance (for img selection only):
- Each scene img references a square, brown/sepia story hand-sketched illustration.
- Do not describe the image in text; only choose the appropriate "/assets/x.png".
`.trim();

  const req = client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const resp = await withTimeout(req, 20000);
  const content = resp.choices?.[0]?.message?.content ?? "{}";

  console.log("LLM response:", content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("LLM returned non-JSON");
  }

  // 校验结构
  return DraftSchema.parse(parsed);
}

export async function generateSceneImageBase64(args: {
  mainTitle: string;
  subTitle: string;
  text: string[];
}) {
  const prompt = `
Square 1:1 illustration, warm brown/sepia tone, story hand-sketched style.
Rough pencil/ink lines, minimal detail, non-photorealistic.
No text in image. No UI/screenshots.

Scene title: ${args.subTitle}
Context: ${args.mainTitle}
Scene content: ${args.text.join(" ")}
Depict the core idea of this scene visually.
`.trim();

  const resp = await client.images.generate({
    model: "gpt-image-1-mini",
    prompt,
    size: "1024x1024",
  });

  const b64 = resp.data?.[0]?.b64_json;
  if (!b64) {
    // 如果没 b64，直接把 resp.data 打出来看
    console.log("Image resp.data:", resp.data);
    throw new Error("No b64_json returned from image model");
  }

  return `data:image/png;base64,${b64}`;
}

export async function generateSceneAlternativesFromLLM(args: {
  mainTitle: string;
  subTitle: string;   // 用当前 scene subtitle 当上下文
  text: string[];     // 当前 scene 原文
}): Promise<SceneAlternatives> {
  const system = `
You rewrite ONE scene into TWO alternative versions as STRICT JSON only.
Return JSON with EXACT keys: conversational, professional.
Each must contain key: text (array of 1-3 paragraphs). No other keys. No markdown.

Constraints:
- Language: English only.
- Keep the same factual meaning; do not introduce new facts.
- conversational: friendly, simple, approachable, but still accurate.
- professional: formal, concise, neutral tone.
- Avoid lists/bullets.
- Total per version: about 80-120 words (across its paragraphs).
Output MUST be valid JSON parsable by JSON.parse.
`.trim();

  const user = `
Main title: ${args.mainTitle}
Scene subtitle (keep unchanged): ${args.subTitle}

Original scene text:
${args.text.join("\n\n")}
`.trim();

  const req = client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const resp = await withTimeout(req, 20000, "alt_text_timeout");
  const content = resp.choices?.[0]?.message?.content ?? "{}";

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("LLM returned non-JSON for alternatives");
  }

  return SceneAlternativesSchema.parse(parsed);
}

export async function generateAnnotationsFromLLM(args: {
  text: string[] | string;
}): Promise<Annotations> {
  const paragraphs = Array.isArray(args.text)
    ? args.text.map((p) => String(p ?? ""))
    : String(args.text || "").split(/\n\s*\n/).filter(Boolean);

  const system = `
You extract annotations for EACH paragraph as STRICT JSON only.

Return JSON with EXACT key:
- paragraphs

paragraphs is an array with the SAME length as the input paragraphs.
Each paragraphs[i] MUST contain EXACT keys:
- keyWords: string[] (1-2 items)
- keySentences: string[] (0-1 item)

Rules:
- Language: English only.
- Treat each paragraph independently.
- For EACH paragraph:
  - keyWords: pick 1-2 short terms/phrases (<= 3 words each) that APPEAR in that paragraph.
  - keySentences: pick at most ONE sentence excerpt copied EXACTLY from that paragraph.
    Must be a contiguous substring with identical punctuation/spaces.
- Do NOT invent facts. Do NOT paraphrase.
- If no good key sentence exists, return [] for keySentences.

Output MUST be valid JSON parsable by JSON.parse. No markdown.
`.trim();

  const user = `
Paragraphs:
${paragraphs.map((p, i) => `P${i + 1}: ${p}`).join("\n\n")}
`.trim();

  const req = client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const resp = await withTimeout(req, 15000, "annotation_timeout");
  const content = resp.choices?.[0]?.message?.content ?? "{}";

  console.log("LLM annotation response:", content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("LLM returned non-JSON for annotations");
  }

  // ✅ 结构校验
  const ann = AnnotationsSchema.parse(parsed);

  // ✅ 防御：长度不一致时，强制补齐/截断
  if (ann.paragraphs.length !== paragraphs.length) {
    const fixed = paragraphs.map((_, i) => ann.paragraphs[i] ?? { keyWords: [], keySentences: [] });
    return { paragraphs: fixed };
  }

  return ann;
}

export async function generateWhyHereFromLLM(args: {
  searchTerm: string;
  sceneText: string[] | string;
}): Promise<WhyHere> {
  const paragraphs = Array.isArray(args.sceneText)
    ? args.sceneText.map((p) => String(p ?? ""))
    : String(args.sceneText || "").split(/\n\s*\n/).filter(Boolean);

  const system = `
You explain why a given search term appears in the scene text.
Return STRICT JSON only with EXACT key: explanation.
Constraints:
- English only.
- within 80 words.
- Explain the role/purpose in THIS scene (definition, example, evidence, transition, etc.).
- Do NOT add new facts beyond the text.
- No markdown.
`.trim();

  const user = `
Search term: ${String(args.searchTerm || "").trim()}

Scene text:
${paragraphs.join("\n\n")}
`.trim();

  const req = client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const resp = await withTimeout(req, 15000, "why_here_timeout");
  const content = resp.choices?.[0]?.message?.content ?? "{}";

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("LLM returned non-JSON for whyHere");
  }

  return WhyHereSchema.parse(parsed);
}

export async function generateSceneRationaleFromLLM(args: {
  mainTitle: string;
  subTitle: string;
  text: string[] | string;
}): Promise<SceneRationale> {
  const paragraphs = Array.isArray(args.text)
    ? args.text.map((p) => String(p ?? ""))
    : String(args.text || "").split(/\n\s*\n/).filter(Boolean);

  const system = `
You explain the writing rationale for ONE scene as STRICT JSON only.
Return JSON with EXACT key: rationale. No other keys. No markdown.

What to include in rationale (1 sentences, <= 40 words):
- Why this scene exists (writing intent / goal)
- What role it plays in the overall script (setup, context, transition, evidence, payoff, etc.)
- Stay grounded in the given text; do NOT add new facts.
Language: English only.
`.trim();

  const user = `
Main title: ${String(args.mainTitle || "").trim()}
Scene subtitle: ${String(args.subTitle || "").trim()}

Scene text:
${paragraphs.join("\n\n")}
`.trim();

  const req = client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const resp = await withTimeout(req, 15000, "rationale_timeout");
  const content = resp.choices?.[0]?.message?.content ?? "{}";

  console.log("LLM rationale response:", content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("LLM returned non-JSON for rationale");
  }

  return SceneRationaleSchema.parse(parsed);
}