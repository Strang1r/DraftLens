import './Prompt.scss'
import logoSvg from '../src/assets/logo.svg'
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Spinner from '../components/Spinner';

const Prompt = () => {
  const [input, setInput] = useState('');
  const [submittedInput, setSubmittedInput] = useState<string | null>(null);
  const [showAIResponse, setShowAIResponse] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

  // 如果不启动后端，可以用这个函数生成假数据测试前端
  const makeDraftFallback = (instruction: string) => ({
    id: "single",
    instruction,
    mainTitle: "THE ORIGINS OF THE INTERNET",
    scenes: [
      {
        id: 1, subTitle: `Scene1: 1`,
        annotations: {
          paragraphs: [
            {
              keyWords: ["ARPANET", "Cold War"],
              keySentences: [
                "In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions."
              ]
            },
            {
              keyWords: ["packet-based", "decentralized"],
              keySentences: [
                "ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures."
              ]
            }
          ]
        },
        img: "/assets/1.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`, `ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`]
      },
      {
        id: 2, subTitle: `Scene2: 2`,
        annotations: {
          paragraphs: [
            {
              keyWords: ["ARPANET", "Cold War"],
              keySentences: [
                "In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions."
              ]
            },
          ]
        },
        img: "/assets/2.png", text: [`ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`]
      },
      {
        id: 3, subTitle: `Scene3: 3`,
        annotations: {
          paragraphs: [
            {
              keyWords: ["ARPANET", "Cold War"],
              keySentences: [
                "In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions."
              ]
            },
          ]
        },
        img: "/assets/3.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`]
      },
      {
        id: 4, subTitle: `Scene4: 4`, img: "/assets/4.png",
        annotations: {
          paragraphs: [
            {
              keyWords: ["ARPANET", "Cold War"],
              keySentences: [
                "In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions."
              ]
            },
          ]
        },
        text: [`ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`]
      },
      {
        id: 5, subTitle: `Scene5: 5`, img: "/assets/5.png",
        annotations: {
          paragraphs: [
            {
              keyWords: ["ARPANET", "Cold War"],
              keySentences: [
                "In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions."
              ]
            },
          ]
        },
        text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`]
      },
    ],
  });

  // 跳转页面逻辑
  const navigate = useNavigate();
  const location = useLocation();

  // 监听 URL 参数，设置实验条件 ID（1~6）
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

    await sleep(1000);

    const conditionId = sessionStorage.getItem("experimentConditionId") || "1";

    // 统一兜底：写入 draft + 跳 /final
    const goWithFallback = (reason?: any) => {
      console.warn("⚠️ Using fallback because backend/AI unavailable:", reason);
      const draft = makeDraftFallback(instruction);
      sessionStorage.setItem("draft", JSON.stringify(draft));
      navigate("/final");
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

      const data = await res.json(); // { draft, error? }

      // 兼容旧后端返回：
      // 新版期望：data.draft
      // 老版可能：{ mode:"single", draft } 或 { mode:"select", options:[...] }
      /* const draft =
        data?.draft ??
        (data?.mode === "single" ? data?.draft : null) ??
        (Array.isArray(data?.options) ? data.options[0] : null);
 */
      const draft = data?.draft;

      if (!draft) {
        goWithFallback("no_draft_in_response");
        return;
      }

      sessionStorage.setItem("draft", JSON.stringify(draft));
      navigate("/final");

    } catch (err) {
      console.error(err);
      setShowAIResponse(false);
      goWithFallback(err);
    } finally {
      setIsGenerating(false);
    }

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
            <Spinner />
            <p>Preparing your draft…</p>
          </div>
        )}
      </div>

    </div >
  )
}

export default Prompt