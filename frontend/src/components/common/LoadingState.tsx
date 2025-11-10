type LoadingStateProps = {
  message?: string
}

function LoadingState({ message = 'Loading data…' }: LoadingStateProps) {
  return (
    <div className="loading-state">
      <span aria-busy="true" />
      <p>{message}</p>
    </div>
  )
}

export default LoadingState

