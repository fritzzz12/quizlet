export function AuthFrame({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden bg-navy px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <p className="font-display text-4xl">Folio</p>
        <div>
          <h1 className="font-display text-6xl leading-tight">Quizzes that stay inside the lesson.</h1>
          <p className="mt-4 max-w-md text-white/75">Upload a PDF. Folio reads it, writes questions from that text, and shows where each answer came from.</p>
        </div>
        <p className="text-sm text-white/50">Easy, moderate, and hard. Multiple choice, modified true or false, and identification.</p>
      </section>
      <section className="flex items-center px-6 py-12">
        <div className="mx-auto w-full max-w-md">
          <p className="font-display text-4xl lg:hidden">Folio</p>
          <h2 className="mt-6 font-display text-4xl">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
          <div className="mt-6">{children}</div>
        </div>
      </section>
    </div>
  );
}
