import './SceneModel.scss'

type SceneModelProps = {
  id: string;
  subTitle: string;
  scriptText: string | string[];
  scriptImg: string;
}

const SceneModel = ({ id, subTitle, scriptText, scriptImg }: SceneModelProps) => {
  return (
    <div className='sceneModel' id={id}>
      <div className='subTitle'>
        <h4>{subTitle}</h4>
      </div>
      <div className='script'>
        <div className='scriptText'>
          {Array.isArray(scriptText) ? (
            scriptText.map((text, index) => <><p key={index}>{text}</p></>)
          ) : (
            <p>{scriptText}</p>
          )}
        </div>
        <div className='scriptImg'>
          <img src={scriptImg} alt="" />
        </div>
      </div>
    </div>

  )
}

export default SceneModel