function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="route-loading">
      <span aria-busy="true">{message}</span>
    </div>
  );
}

export default LoadingState;
