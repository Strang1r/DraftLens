import "./ExportPDF.scss"

type ExportPDFProps = {
  handleExportPDF: () => void;
}

const ExportPDF = (props: ExportPDFProps) => {

  return (
    <div className="exportPDF" onClick={props.handleExportPDF}>
    </div>
  )
}

export default ExportPDF