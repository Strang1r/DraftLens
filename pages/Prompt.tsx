import './Prompt.scss'
import logoSvg from '../src/assets/logo.svg'
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const Prompt = () => {
  const [input, setInput] = useState('');
  const [submittedInput, setSubmittedInput] = useState<string | null>(null);
  const [showAIResponse, setShowAIResponse] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

  // 如果不启动后端，可以用这个函数生成假数据测试前端
  const makeDraftFallback = (instruction: string, variant: "A" | "B") => ({
    id: variant,
    instruction,
    mainTitle: variant === "A" ? "THE ORIGINS OF THE INTERNET" : "HISTORY OF THE INTERNET",
    scenes: [
      { id: 1, subTitle: `Scene1: (${variant})`, img: "/assets/1.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`, `ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`] },
      { id: 2, subTitle: `Scene2: (${variant})`, img: "/assets/2.png", text: [`ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`] },
      { id: 3, subTitle: `Scene3: (${variant})`, img: "/assets/3.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`] },
      { id: 4, subTitle: `Scene4: (${variant})`, img: "/assets/4.png", text: [`ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`] },
      { id: 5, subTitle: `Scene5: (${variant})`, img: "/assets/5.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`] },
    ],
  });

  const handleSubmit = async (e: React.FormEvent) => {

    setShowAIResponse(false);
    setSubmittedInput(null);
    e.preventDefault();

    if (isGenerating) return;
    setIsGenerating(true);

    const instruction = input.trim();
    if (!instruction) { setIsGenerating(false); return; }

    setSubmittedInput(instruction);
    setInput('');


    // 清空后 textarea 复位
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
    });

    setShowAIResponse(true);

    await sleep(3000);

    const conditionId = sessionStorage.getItem("experimentConditionId") || "1";

    // 不启动后端：兜底统一函数：写入 storage + 跳转
    const goWithFallback = (reason?: any) => {
      console.warn("⚠️ Using fallback because backend/AI unavailable:", reason);

      if (String(conditionId) === "1") {
        const options = [makeDraftFallback(instruction, "A"), makeDraftFallback(instruction, "B")];
        sessionStorage.setItem("draftOptions", JSON.stringify(options));
        navigate("/select");
      } else {
        const draft = makeDraftFallback(instruction, "A");
        sessionStorage.setItem("selectedScript", JSON.stringify(draft));
        navigate(`/condition${conditionId}`);
      }
    };

    try {
      const res = await fetch("http://localhost:3001/api/script/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, conditionId }),
      });

      // 后端启动但报错（500/401等）也走 fallback
      if (!res.ok) {
        alert("AI generation failed. Please try again.");
        goWithFallback(`HTTP ${res.status}`);
        return;
      }

      const data = await res.json(); // mode: "select" | "single"

      // 后端在线，但 LLM 失败（后端 catch 里会带 error:"llm_failed"）
      if (data?.error === "llm_failed") {
        alert("AI generation failed. Please try again.");
      }

      // 如果后端说 llm_failed，但依然给了可用结果：不要 alert
      /* if (data?.error === "llm_failed") {
        const hasSelectableOptions = data?.mode === "select" && Array.isArray(data?.options) && data.options.length > 0;
        const hasSingleDraft = data?.mode === "single" && data?.draft;

        if (!hasSelectableOptions && !hasSingleDraft) {
          alert("AI generation failed. Please try again.");
          goWithFallback("llm_failed_no_usable_payload");
          return;
        } else {
          console.warn("⚠️ Partial LLM failure, but usable payload returned:", data);
          // 这里可以选择不提示，或改成更温和的 toast：比如 “Generated 1 draft; 1 failed”
        }
      } */

      if (data?.mode === "select") {
        sessionStorage.setItem("draftOptions", JSON.stringify(data.options));
        navigate("/select");
      } else if (data?.mode === "single") {
        sessionStorage.setItem("selectedScript", JSON.stringify(data.draft));
        navigate(`/condition${conditionId}`);
      } else {
        // 返回结构不对，也兜底
        goWithFallback("invalid_response_shape");
      }
    } catch (err) {
      console.error(err);
      setShowAIResponse(false);
      goWithFallback(err);
    } finally {
      setIsGenerating(false);
    }

  };

  // 跳转页面逻辑
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cond = params.get("cond"); // 1~6

    if (cond && ["1", "2", "3", "4", "5", "6"].includes(cond)) {
      sessionStorage.setItem("experimentConditionId", cond);
    } else {
      // 如果你不想随机，就给一个默认值，比如 1
      sessionStorage.setItem("experimentConditionId", "1");
    }
  }, [location.search]);

  // 自动调整文本框高度
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <div className="promptBackGround">
      <div className='logo'>
        <img src={logoSvg} alt="" />
      </div>
      <div className='promptBackGround'>
        <form className='promptInput' onSubmit={handleSubmit}>
          <textarea
            value={input}
            ref={textareaRef}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (isGenerating) return;
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            placeholder="Describe what you want the script to be about."
          />
          <button className='submitButton' type="submit">
          </button>
        </form>
        <div className='promptTip'>
          <p>DraftLens will generate a draft divided into 3 – 5 scenes based on your input.
          </p>
          <p>You can review and revise the title, text, and images in each scene.</p>
        </div>
        {submittedInput && (
          <div className='userPrompt'>
            <p>{submittedInput}</p>
          </div>
        )}
        {showAIResponse && (
          <div className='AIResponse'>
            <div className="spinner" />
            <p>Preparing your draft…</p>
          </div>
        )}
      </div>

    </div >
  )
}

export default Prompt