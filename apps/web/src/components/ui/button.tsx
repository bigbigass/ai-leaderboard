import { cva, type VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        outline: 'border border-border bg-card hover:bg-muted',
        ghost: 'hover:bg-muted',
      },
      size: { default: 'h-9 px-3', sm: 'h-8 px-2.5 text-xs' },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  },
);

export function ButtonLink({ className, variant, size, ...props }: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
