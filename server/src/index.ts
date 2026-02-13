import "dotenv/config";
import express from "express";
import cors from "cors";
import scriptRouter from "./routes/script";
import path from "path";

console.log("CWD:", process.cwd());
console.log("ENV path guess:", path.join(process.cwd(), ".env"));
console.log("KEY prefix:", process.env.OPENAI_API_KEY?.slice(0, 12));
console.log("KEY suffix:", process.env.OPENAI_API_KEY?.slice(-6));

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

console.log("OPENAI_API_KEY loaded:", process.env.OPENAI_API_KEY?.slice(0, 6));