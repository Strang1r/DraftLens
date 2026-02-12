import './HomePage1.scss'
import logoSvg from '../src/assets/logo.svg'
import UserSelect from '../components/UserSelect'
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

type Scene = {
  id: number;
  subTitle: string;
  img: string;
  text: string[];
};

type Draft = {
  id: "A" | "B";
  instruction: string;
  mainTitle?: string; // ✅
  scenes: Scene[];
};

type ScriptVersion = {
  versionId: number;
  title: string;
  scenes: Scene[];
  draft: Draft; // 如果你想 UserSelect 拿到整个 draft，可以加这个字段
};

const HomePage1 = () => {

  /*   const version1Scenes: Scene[] = useMemo(() => [
      {
        id: 1,
        subTitle: "Scene1: Before the Internet",
        img: "/assets/4.png",
        text: [
          "The Internet is a global network that allows computers worldwide to communicate and share information. Although it is now central to daily life, it did not begin as a public or commercial system. Its early development was shaped by specific historical and technological conditions.",
          "In the late 1960s, U.S. researchers created ARPANET, funded by the Department of Defense, to connect isolated and expensive computers across institutions. Designed with decentralized routing, ARPANET improved reliability and enabled resource sharing, laying the technical foundation for the modern Internet."
        ]
      },
      {
        id: 2,
        subTitle: "Scene2: Email and Early Communication",
        img: "/assets/2.png",
        text: [
          "As ARPANET grew, early users began experimenting with new ways to communicate. Email quickly became one of the most popular applications, turning a research network into a social tool for collaboration.",
          "These early communication tools revealed the value of networks beyond resource sharing, shaping expectations that computers could connect people as well as machines.",
        ],
      },
      {
        id: 3,
        subTitle: "Scene3: TCP/IP and a Standard Internet",
        img: "/assets/3.png",
        text: [
          "Different networks needed a common language to exchange data reliably. TCP/IP emerged as a standard set of protocols, making it possible to connect diverse systems into a single interoperable network.",
          "By adopting shared standards, the Internet became more scalable and resilient—able to expand across institutions and eventually into public life.",
        ],
      },
      {
        id: 4,
        subTitle: "Scene4: From Research to Public Infrastructure",
        img: "/assets/1.png",
        text: [
          "As networking spread, new services and communities emerged. The shift from academic and government use to broader public access accelerated innovation and demand.",
          "Over time, the Internet evolved into a global platform supporting information access, communication, and new forms of creativity and work.",
        ],
      },
    ],
      []
    );
  
    const version2Scenes: Scene[] = useMemo(() => [
      {
        id: 1,
        subTitle: "Scene1: The Birth of the Internet",
        img: "/assets/2.png",
        text: [
          "Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.",
          "ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.",
        ],
      },
      {
        id: 2,
        subTitle: "Scene2: Email and Early Communication",
        img: "/assets/1.png",
        text: [
          "As ARPANET grew, early users began experimenting with new ways to communicate. Email quickly became one of the most popular applications, turning a research network into a social tool for collaboration.",
          "These early communication tools revealed the value of networks beyond resource sharing, shaping expectations that computers could connect people as well as machines.",
        ],
      },
      {
        id: 3,
        subTitle: "Scene3: TCP/IP and a Standard Internet",
        img: "/assets/3.png",
        text: [
          "Different networks needed a common language to exchange data reliably. TCP/IP emerged as a standard set of protocols, making it possible to connect diverse systems into a single interoperable network.",
          "By adopting shared standards, the Internet became more scalable and resilient—able to expand across institutions and eventually into public life.",
        ],
      },
      {
        id: 4,
        subTitle: "Scene4: From Research to Public Infrastructure",
        img: "/assets/4.png",
        text: [
          "As networking spread, new services and communities emerged. The shift from academic and government use to broader public access accelerated innovation and demand.",
          "Over time, the Internet evolved into a global platform supporting information access, communication, and new forms of creativity and work.",
        ],
      },
    ],
      []
    ); */

  const navigate = useNavigate();
  const [userSelectData, setUserSelectData] = useState<ScriptVersion[]>([]);

  useEffect(() => {
    const raw = sessionStorage.getItem("draftOptions");
    const options = raw ? JSON.parse(raw) : null;

    if (!options || options.length < 2) {
      // 用户刷新/直接进select会没数据，送回输入页（按你实际路由改）
      navigate("/");
      return;
    }

    // options: [{id:"A", instruction, scenes:[...]}, {id:"B", ...}]
    const mapped: ScriptVersion[] = options.map((d: any, idx: number) => ({
      versionId: idx + 1,
      title: d.mainTitle ?? (d.id === "A" ? "VERSION A" : "VERSION B"), // 如果后端有 mainTitle 就用它，否则用默认标题
      scenes: d.scenes,
      // 如果你想把 draft 整个传给 UserSelect，也可以加字段（但要改类型）
      draft: d,
    }));

    setUserSelectData(mapped);
  }, [navigate]);


  /*   const userSelectData: ScriptVersion[] = [
      { versionId: 1, title: "HISTORY OF THE INTERNET", scenes: version1Scenes },
      { versionId: 2, title: "THE ORIGINS OF THE INTERNET", scenes: version2Scenes },
    ]; */

  return (
    <div className="backGround">
      <div className='logo'>
        <img src={logoSvg} alt="" />
      </div>
      <div className='tips'>
        <h4>
          Which one would you like to start from?
        </h4>
      </div>
      <div className='paper'>
        {userSelectData.map((item) => (
          <UserSelect
            key={item.versionId}
            title={item.title}
            previewScene={item.scenes[0]}
            draft={item.draft}
          />
        ))}
        <div className="divider" />
        <div className='sceneCount1'>
          <p>{userSelectData[0]?.scenes?.length ?? 0} Scenes</p>
        </div>
        <div className='sceneCount2'>
          <p>{userSelectData[1]?.scenes?.length ?? 0} Scenes</p>
        </div>
      </div>
    </div>
  )
}

export default HomePage1