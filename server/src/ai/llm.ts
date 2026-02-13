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

export const DraftSchema = z.object({
  mainTitle: z.string().min(1),
  scenes: z
    .array(
      z.object({
        id: z.number().int().min(1).max(5),
        subTitle: z.string().min(1).max(60),
        img: z.string().regex(/^\/assets\/[1-5]\.png$/),
        text: z.array(z.string().min(1)).min(1),
      })
    )
    .min(3)
    .max(5),
});

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