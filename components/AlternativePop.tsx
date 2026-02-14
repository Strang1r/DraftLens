import "./AlternativePop.scss"

type AlternativePopProps = {
  id: string;
  subTitle: string;
  img: string;
  text: string[];
  onReplaceText: () => void;
  onReplaceAll: () => void;
}

const AlternativePop = (props: AlternativePopProps) => {
  return (
    <div className='alternativePop'>
      <div className='mainTitle'>
        <div className='subTitle'>
          <h4>{props.subTitle}</h4>
        </div>
        <div className='alterTitle'>
          <h4>Alternative {props.id}</h4>
        </div>
      </div>
      <div className='script'>
        <div className='scriptImg'>
          <img src={props.img} alt="" />
        </div>
        <div className='scriptText'>
          {props.text.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      </div>
      <div
        className='selectBtn'
      >
        <div className='replaceText' onClick={props.onReplaceText}>Replace Text</div>
        <div className='replaceAll' onClick={props.onReplaceAll}>Replace Text+Image</div>
      </div>

    </div>
  )

}

export default AlternativePop;