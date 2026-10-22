import type * as React from 'react';

export function PageHeader({ title, intro, children }: { title: string; intro?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 space-y-2">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {intro ? <p className="max-w-3xl text-muted-foreground">{intro}</p> : null}
      {children}
    </div>
  );
}
