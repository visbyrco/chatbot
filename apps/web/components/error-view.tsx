"use client";

type ErrorViewProps = {
  title: string;
  message?: string;
  digest?: string;
  onReset: () => void;
};

export function ErrorView({ title, message, digest, onReset }: ErrorViewProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="font-semibold text-lg">{title}</h2>
      <p className="max-w-md text-muted-foreground text-sm">
        {message || "An unexpected error occurred. Please try again."}
      </p>
      {digest ? (
        <p className="text-muted-foreground text-xs">Error ID: {digest}</p>
      ) : null}
      <button
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm"
        onClick={onReset}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
