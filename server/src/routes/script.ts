import { Router } from "express";
import {
  generateAnnotationsFromLLM,
  withTimeout, generateDraftFromLLM,
  generateSceneImageBase64,
  generateSceneAlternativesFromLLM,
  generateWhyHereFromLLM,
  generateSceneRationaleFromLLM,
  generateSentenceIssuesFromLLM,
  generateIssueSuggestionFromLLM,
  generateChatReplyFromLLM2,
  generateDraftImage
}
  from "../ai/llm";

console.log("🔥 USING SCRIPT ROUTE FILE:", __filename);

const router = Router();

router.post("/generate", async (req, res) => {

  const { instruction, conditionId } = req.body ?? {};
  const safeInstruction = String(instruction ?? "").trim();

  const cond = String(conditionId ?? "").trim(); // "1".."6"
  const needAnnotations = cond === "2";
  const needRationale = cond === "4";

  const makeDraftFallback = () => ({
    mainTitle: "THE ORIGINS OF THE INTERNET",
    scenes: [
      { id: 1, subTitle: `Scene1`, img: "/assets/1.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`, `ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`] },
      { id: 2, subTitle: `Scene2`, img: "/assets/2.png", text: [`ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`] },
      { id: 3, subTitle: `Scene3`, img: "/assets/3.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`] },
      { id: 4, subTitle: `Scene4`, img: "/assets/4.png", text: [`ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`] },
      { id: 5, subTitle: `Scene5`, img: "/assets/5.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`] },
    ],
  });

  async function mapLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, idx: number) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let i = 0;

    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx], idx);
      }
    });

    await Promise.all(workers);
    return results;
  }

  const attachImages = async (draft: { mainTitle: string; scenes: any[] }) => {
    const scenesWithImgs = await mapLimit(draft.scenes, 2, async (s: any) => {
      try {
        const img = await withTimeout(
          generateDraftImage({
            mainTitle: draft.mainTitle,
            subTitle: s.subTitle,
            text: s.text,
          }),
          60000, // 图片生成较慢，保持 60 秒超时
          "image_timeout"
        );
        return { ...s, img }; // 将生成的 Base64 挂载到 img 字段
      } catch (e: any) {
        console.warn("Image gen failed, fallback:", s.id, e?.message || e);
        return { ...s, img: "" }; // 失败时返回空，前端可处理占位图
      }
    });
    return { ...draft, scenes: scenesWithImgs };
  };

  try {
    if (!safeInstruction) {
      return res.status(400).json({ error: "missing_instruction" });
    }

    // 永远单版本：你仍然可以把 conditionId 传给 LLM 用于不同 prompt/控制
    const draftRaw = await generateDraftFromLLM({
      instruction: safeInstruction,
    } as any);

    const scenesEnhanced = await Promise.all(
      draftRaw.scenes.map(async (scene: any) => {
        // 默认：不生成
        let annotations: any = undefined;
        let rationale: string | undefined = undefined;

        // condition2 才生成 annotations
        if (needAnnotations) {
          annotations = {
            paragraphs: scene.text.map(() => ({ keyWords: [], keySentences: [] })),
          };
          try {
            annotations = await withTimeout(
              generateAnnotationsFromLLM({ text: scene.text }),
              15000,
              "annotation_timeout"
            );
          } catch (e: any) {
            console.warn("Annotation failed for scene:", scene.id, e?.message || e);
          }
        }

        // condition4 才生成 rationale
        if (needRationale) {
          rationale = "";
          try {
            const out = await withTimeout(
              generateSceneRationaleFromLLM({
                mainTitle: draftRaw.mainTitle,
                subTitle: scene.subTitle,
                text: scene.text,
              }),
              15000,
              "rationale_timeout"
            );
            rationale = out.rationale || "";
          } catch (e: any) {
            console.warn("Rationale failed for scene:", scene.id, e?.message || e);
          }
        }

        // 只在需要时才把字段挂回去（避免其它 condition 前端看到多余字段）
        return {
          ...scene,
          ...(needAnnotations ? { annotations } : {}),
          ...(needRationale ? { rationale } : {}),
        };
      })
    );

    // 先组合出完整的文本数据，再传给 attachImages
    const draftWithText = { ...draftRaw, scenes: scenesEnhanced };

    // 遍历 scenesEnhanced 中的每一个 scene 并生成图片
    const draft = await attachImages(draftWithText);

    return res.json({ draft });
  } catch (e: any) {
    console.error("LLM failed:", e?.message || e);
    return res.json({ draft: makeDraftFallback(), error: "llm_failed" });
  }
});

router.post("/alternatives", async (req, res) => {
  const { mainTitle, subTitle, text, generateImages } = req.body ?? {};
  const safeMainTitle = String(mainTitle ?? "").trim();
  const safeSubTitle = String(subTitle ?? "").trim();
  const safeText: string[] = Array.isArray(text) ? text.map(String) : [];
  const wantImages = Boolean(generateImages);

  if (!safeMainTitle || !safeSubTitle || safeText.length === 0) {
    return res.status(400).json({ error: "missing_fields" });
  }

  try {
    // 1) 先让 LLM 生成两套文本（只要 text）
    const altTexts = await generateSceneAlternativesFromLLM({
      mainTitle: safeMainTitle,
      subTitle: safeSubTitle,
      text: safeText,
    });

    // 2) 再分别生成两张图（基于同一个 subTitle，但 text 不同）
    let conversationalImg = "/assets/4.png";
    let professionalImg = "/assets/5.png";

    if (wantImages) {
      // 优化：使用 Promise.all 并行生成两张图片，提速 100%
      // 假设函数名为 generateDraftImage
      const [imgA, imgB] = await Promise.all([
        withTimeout(
          generateDraftImage({ // 确保函数名一致
            mainTitle: safeMainTitle,
            subTitle: safeSubTitle,
            text: altTexts.conversational.text,
          }),
          60000,
          "image_timeout_conversational"
        ).catch(err => {
          console.error("Conversational image failed", err);
          return "/assets/4.png"; // 单张失败时的 fallback
        }),
        withTimeout(
          generateDraftImage({
            mainTitle: safeMainTitle,
            subTitle: safeSubTitle,
            text: altTexts.professional.text,
          }),
          60000,
          "image_timeout_professional"
        ).catch(err => {
          console.error("Professional image failed", err);
          return "/assets/5.png";
        })
      ]);

      conversationalImg = imgA;
      professionalImg = imgB;
    }

    // 3) 返回给前端：只给 text + img，不给 subtitle（subtitle 前端继续用当前 scene 的）
    return res.json({
      alternatives: [
        { id: "A", tone: "conversational", text: altTexts.conversational.text, img: conversationalImg },
        { id: "B", tone: "professional", text: altTexts.professional.text, img: professionalImg },
      ],
    });
  } catch (e: any) {
    console.error("alternatives failed:", e?.message || e);
    return res.status(500).json({ error: "alternatives_failed" });
  }
});

router.post("/why-here", async (req, res) => {
  const { searchTerm, sceneText } = req.body ?? {};
  const safeTerm = String(searchTerm ?? "").trim();
  const safeText: string[] = Array.isArray(sceneText) ? sceneText.map(String) : [];

  // 空搜索：直接返回空解释（前端就显示默认文案）
  if (!safeTerm) {
    return res.json({ explanation: "" });
  }

  // sceneText 最好传数组（你 scene.text 本来就是 string[]）
  if (safeText.length === 0) {
    return res.status(400).json({ error: "missing_sceneText", explanation: "" });
  }

  try {
    const out = await withTimeout(
      generateWhyHereFromLLM({ searchTerm: safeTerm, sceneText: safeText }),
      15000,
      "why_here_timeout"
    );
    return res.json(out); // { explanation }
  } catch (e: any) {
    console.error("why-here failed:", e?.message || e);
    return res.json({ explanation: "", error: "why_here_failed" });
  }
});

router.post("/issues", async (req, res) => {
  const { sceneText } = req.body ?? {};
  const safeText: string[] = Array.isArray(sceneText) ? sceneText.map(String) : [];

  if (safeText.length === 0) {
    return res.status(400).json({ error: "missing_sceneText", issues: [] });
  }

  try {
    const out = await withTimeout(
      generateSentenceIssuesFromLLM({ sceneText: safeText }),
      15000,
      "issues_timeout"
    );

    // out: { issues: [{id,sentence,issue}] }
    return res.json(out);
  } catch (e: any) {
    console.error("issues failed:", e?.message || e);
    return res.json({ issues: [], error: "issues_failed" });
  }
});

router.post("/issue-suggestion", async (req, res) => {
  const { sentence, issue, prevSuggestion } = req.body ?? {};

  const safeSentence = String(sentence ?? "").trim();
  const safeIssue = String(issue ?? "").trim();
  const safePrev = String(prevSuggestion ?? "").trim();

  if (!safeSentence || !safeIssue) {
    return res.status(400).json({ error: "missing_fields", suggestion: "" });
  }

  try {
    const out = await withTimeout(
      generateIssueSuggestionFromLLM({
        sentence: safeSentence,
        issue: safeIssue,
        prevSuggestion: safePrev || undefined,
      }),
      15000,
      "issue_suggestion_timeout"
    );

    // out: { suggestion }
    return res.json(out);
  } catch (e: any) {
    console.error("issue-suggestion failed:", e?.message || e);
    return res.json({ suggestion: "", error: "issue_suggestion_failed" });
  }
});

router.post("/chat2", async (req, res) => {
  try {
    const { userPrompt, sceneText } = req.body ?? {};

    // 基础校验
    const safeUserPrompt = String(userPrompt ?? "").trim();
    const safeSceneText = Array.isArray(sceneText)
      ? sceneText.map((t) => String(t ?? ""))
      : [];

    // 用户没输入内容
    if (!safeUserPrompt) {
      return res.status(400).json({
        answer: "Please enter your request.",
      });
    }

    // 可选：超短/确认类输入的快速提示（不想要可删）
    /* const isTiny = safeUserPrompt.length <= 2;
    const isConfirmLike =
      /^(1|ok|okay|yes|yep|sure|thanks|thank you|cool|got it|done)$/i.test(
        safeUserPrompt
      );

    if (isTiny || isConfirmLike) {
      return res.json({
        answer:
          "Tell me what you’d like help with (e.g., clarity, tone, structure, examples).",
      });
    } */

    // 调用 LLM（纯聊天）
    const result = await generateChatReplyFromLLM2({
      userPrompt: safeUserPrompt,
      sceneText: safeSceneText, // 不想给上下文就可以不传
    });

    return res.json(result); // { answer }
  } catch (error: any) {
    console.error("Chat route error:", error);

    return res.status(500).json({
      answer: "The AI assistant is temporarily unavailable.",
    });
  }
});

router.post("/generate-image", async (req, res) => {

  try {
    const { mainTitle, subTitle, text } = req.body ?? {};

    // 1. 基础参数校验
    const safeMainTitle = String(mainTitle ?? "Untitled");
    const safeSubTitle = String(subTitle ?? "New Scene");
    const safeText = Array.isArray(text)
      ? text.map(t => String(t ?? ""))
      : [];

    // 如果文本内容为空，生成可能没有意义，可以返回 400
    if (safeText.length === 0 || (safeText.length === 1 && safeText[0] === "")) {
      return res.status(400).json({
        error: "Scene content is empty. Please provide some text to generate an image."
      });
    }

    console.log(`Generating image for scene: ${safeSubTitle}...`);

    // 2. 调用 LLM 生成图片
    const base64DataUrl = await generateSceneImageBase64({
      mainTitle,
      subTitle,
      text,
    });

    // 3. 返回给前端 (前端可以通过 data.b64 获取)
    return res.json({
      b64: base64DataUrl
    });

  } catch (error: any) {
    console.error("Image generation route error:", error);

    // 根据 Gemini 的错误类型返回更友好的提示
    // 比如因为安全过滤（Safety）导致的生成失败
    const isSafety = error.message?.includes("safety") || error.message?.includes("filtered");
    return res.status(500).json({
      error: isSafety ? "Content safety filter triggered." : "AI Artist is busy, try again."
    });
  }
});

export default router;
