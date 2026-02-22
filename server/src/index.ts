import "dotenv/config";
import express from "express";
import cors from "cors";
import scriptRouter from "./routes/script";
import path from "path";

console.log("CWD:", process.cwd());
console.log("ENV path guess:", path.join(process.cwd(), ".env"));
console.log("KEY prefix:", process.env.GEMINI_API_KEY?.slice(0, 12));
console.log("KEY suffix:", process.env.GEMINI_API_KEY?.slice(-6));

const app = express();

app.use(cors({
  origin: ["http://localhost:5175"], // 你的 Vite 端口
  credentials: true,
}));

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/script", scriptRouter);

const port = Number(process.env.PORT || 3001);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

console.log("GEMINI_API_KEY loaded:", process.env.GEMINI_API_KEY?.slice(0, 6));

async function listMyModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  // 直接访问 Google 的 API 目录接口
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error("❌ API 返回错误:", data.error.message);
      return;
    }

    console.log("\n🚀 --- 你的 API Key 拥有的可用模型清单 ---");
    data.models?.forEach((m: any) => {
      // 提取简短的模型名
      const shortName = m.name.replace('models/', '');
      const methods = m.supportedGenerationMethods.join(', ');
      console.log(`- 模型: ${shortName.padEnd(25)} | 支持功能: ${methods}`);
    });
    console.log("------------------------------------------\n");

  } catch (err: any) {
    console.error("无法获取列表，请检查网络或 API Key:", err.message);
  }
}

listMyModels();