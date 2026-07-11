interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="error-message" role="alert">
      <div className="error-message__icon" aria-hidden="true">⚠</div>
      <div className="error-message__body">
        <p className="error-message__title">Something went wrong</p>
        <p className="error-message__text">{message}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
