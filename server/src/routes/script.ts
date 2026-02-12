import { Router } from "express";
import { generateDraftFromLLM, generateSceneImageBase64 } from "../ai/llm";
import { withTimeout } from "../ai/llm";

console.log("🔥 USING SCRIPT ROUTE FILE:", __filename);

const router = Router();

router.post("/generate", async (req, res) => {



  const { instruction, conditionId } = req.body ?? {};

  const makeDraftFallback = (variant: "A" | "B") => ({
    id: variant,
    instruction: instruction ?? "",
    mainTitle: variant === "A" ? "THE ORIGINS OF THE INTERNET" : "HISTORY OF THE INTERNET",
    scenes: [
      { id: 1, subTitle: `Scene1: (${variant})`, img: "/assets/1.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`, `ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`] },
      { id: 2, subTitle: `Scene2: (${variant})`, img: "/assets/2.png", text: [`ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`] },
      { id: 3, subTitle: `Scene3: (${variant})`, img: "/assets/3.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`] },
      { id: 4, subTitle: `Scene4: (${variant})`, img: "/assets/4.png", text: [`ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`] },
      { id: 5, subTitle: `Scene5: (${variant})`, img: "/assets/5.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`] },
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
    const scenesWithImgs = await mapLimit(draft.scenes, 1, async (s: any) => {
      try {
        const img = await withTimeout(
          generateSceneImageBase64({
            mainTitle: draft.mainTitle,
            subTitle: s.subTitle,
            text: s.text,
          }),
          60000,
          "image_timeout"
        );
        return { ...s, img };
      } catch (e: any) {
        console.warn("Image gen failed, fallback:", s.id, e?.message || e);
        return { ...s, img: s.img }; // 回退到原 /assets/x.png
      }
    });

    return { ...draft, scenes: scenesWithImgs };
  };

  const toPayload = (variant: "A" | "B", draft: { mainTitle: string; scenes: any[] }) => ({
    id: variant,
    instruction: instruction ?? "",
    mainTitle: draft.mainTitle,
    scenes: draft.scenes,
  });

  try {
    // condition1
    if (String(conditionId) === "1") {
      const [aRaw, bRaw] = await Promise.all([
        generateDraftFromLLM({ instruction: instruction ?? "", variant: "A" }),
        generateDraftFromLLM({ instruction: instruction ?? "", variant: "B" }),
      ]);

      // 生成图片
      /* const [a, b] = await Promise.all([attachImages(aRaw), attachImages(bRaw)]); */
      const a = aRaw;
      const b = bRaw;

      return res.json({
        mode: "select",
        options: [toPayload("A", a), toPayload("B", b)],
      });
    }

    // condition2-6
    const aRaw = await generateDraftFromLLM({ instruction: instruction ?? "", variant: "A" });

    // 生成图片
    /* const a = await attachImages(aRaw); */

    const a = aRaw;
    console.log("✅ returning LLM result");
    return res.json({ mode: "single", draft: toPayload("A", a) });

  } catch (e: any) {
    // 兜底：AI 失败仍然返回可用结构
    console.error("LLM failed:", e?.message || e);
    if (String(conditionId) === "1") {
      return res.json({
        mode: "select",
        options: [makeDraftFallback("A"), makeDraftFallback("B")],
        error: "llm_failed",
      });
    }
    console.log("⚠️ returning FALLBACK because:", e?.message || e);
    return res.json({ mode: "single", draft: makeDraftFallback("A"), error: "llm_failed" });
  }
});


export default router;