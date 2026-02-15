import './Final1.scss'
import logoSvg from '../src/assets/logo.svg'
import titleDecPng from '../assets/titleDec.png'
import SceneModel from '../components/SceneModel'
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';


type DraftScene = {
  id: number | string;
  subTitle: string;
  img: string;
  text: string[]; // Prompt 里是 text[]
};

type Draft = {
  mainTitle: string;
  scenes: DraftScene[];
};

type FinalScene = {
  id: string;
  subTitle: string;
  scriptText: string[] | string;
  scriptImg: string;
};

type FinalScript = {
  title: string;
  scenes: FinalScene[];
};

const Final1 = () => {

  const location = useLocation();
  const [finalScript, setFinalScript] = useState<FinalScript>({ title: "", scenes: [] });
  const textAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("draft");
      const d: Draft | null = raw ? JSON.parse(raw) : null;

      setFinalScript({
        title: d?.mainTitle || "HISTORY OF THE INTERNET",
        scenes: (d?.scenes || []).map((s: any) => ({
          id: String(s.id),
          subTitle: s.subTitle,
          scriptText: s.text,
          scriptImg: s.img,
        })),
      });
    } catch {
      setFinalScript({ title: "HISTORY OF THE INTERNET", scenes: [] });
    }
  }, [location.key]);

  useEffect(() => {
    const scrollToId = (location.state as any)?.scrollToId;
    if (!scrollToId) return;

    const container = textAreaRef.current;
    if (!container) return;

    requestAnimationFrame(() => {
      const el = document.getElementById(String(scrollToId));
      if (!el) return;

      // 计算元素相对容器的位置
      const OFFSET = 120; // 给标题留空间（你可调 60~120）
      const elTop = el.offsetTop; // 相对 offsetParent（这里通常就是 textArea 内）
      container.scrollTo({
        top: Math.max(0, elTop - OFFSET),
        behavior: "auto", // 无动画
      });
    });
  }, [location.key, finalScript.scenes]);

  return (
    <div className="final1BackGround">
      <div className='logo'>
        <img src={logoSvg} alt="" />
      </div>
      <div className='paper'>
        <div className='scriptTitle'>
          <div className='titleDec1'>
            <img src={titleDecPng} alt="" />
          </div>
          <h3>{finalScript.title}</h3>
          <div className='titleDec2'>
            <img src={titleDecPng} alt="" />
          </div>
        </div>
        <div className='textArea' ref={textAreaRef}>
          {finalScript.scenes.map((item) => (
            <SceneModel
              key={item.id}
              id={item.id}
              subTitle={item.subTitle}
              scriptText={item.scriptText}
              scriptImg={item.scriptImg}
            />
          ))}
        </div>
      </div>
      <div className="export" >
      </div>
    </div>
  )
}

export default Final1