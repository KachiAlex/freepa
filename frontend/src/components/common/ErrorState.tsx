type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
};

function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this view. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="state-box">
      <h3>{title}</h3>
      <p>{description}</p>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export default ErrorState;
