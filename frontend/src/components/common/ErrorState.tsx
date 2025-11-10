type ErrorStateProps = {
  title?: string
  description?: string
  actionLabel?: string
  onRetry?: () => void
}

function ErrorState({
  title = 'Unable to load data',
  description = 'Something went wrong while fetching data. Please try again.',
  actionLabel = 'Try again',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry ? (
        <button type="button" className="button button--primary" onClick={onRetry}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export default ErrorState

