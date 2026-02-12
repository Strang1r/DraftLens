import './Final1.scss'
import logoSvg from '../src/assets/logo.svg'
import titleDecPng from '../assets/titleDec.png'
import SceneModel from '../components/SceneModel'
import { useLocation } from "react-router-dom";

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

  const finalScript: FinalScript = {
    title: location.state?.title || 'HISTORY OF THE INTERNET',
    scenes: location.state?.scenes || []
  };

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
        <div className='textArea'>
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