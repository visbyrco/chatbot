export function LegalDocument({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 md:px-6 md:py-16">
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        {children}
      </article>
    </main>
  );
}
