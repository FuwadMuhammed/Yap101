import { cva, type VariantProps } from "class-variance-authority";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Pill buttons. `arrow` adds the white arrow square on the right (the "go" button). */
export const yapButton = cva(
  "tap inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-5 [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
  {
    variants: {
      variant: {
        primary: "bg-ink text-white hover:bg-[#2b2927]",
        accent: "bg-yap text-white hover:bg-[#ff7a40]",
        soft: "surface text-ink hover:bg-mist",
        mist: "bg-mist text-ink hover:bg-[#e6e3dd]",
        white: "bg-white text-ink hover:bg-white/90",
        ghost: "text-ink hover:bg-mist",
      },
      size: {
        sm: "h-10 px-4 text-sm",
        md: "h-12 px-5 text-[15px]",
        lg: "h-14 px-7 text-base",
        xl: "h-16 px-8 text-[17px]",
        icon: "size-12",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Variants = VariantProps<typeof yapButton> & { arrow?: boolean };

function Inner({ children, arrow, variant }: { children: React.ReactNode; arrow?: boolean; variant?: Variants["variant"] }) {
  if (!arrow) return <>{children}</>;
  return (
    <>
      <span className="flex flex-1 items-center justify-center gap-2">{children}</span>
      <span className={cn("grid aspect-square h-[calc(100%-12px)] shrink-0 place-items-center rounded-full", variant === "primary" || !variant ? "bg-white text-ink" : "bg-ink text-white")}>
        <ArrowRight />
      </span>
    </>
  );
}

export function YapButton({ className, variant, size, block, arrow, children, ...props }: React.ComponentProps<"button"> & Variants) {
  return (
    <button className={cn(yapButton({ variant, size, block }), arrow && "pr-1.5 pl-6", className)} {...props}>
      <Inner arrow={arrow} variant={variant}>{children}</Inner>
    </button>
  );
}

export function YapLink({ className, variant, size, block, arrow, children, ...props }: React.ComponentProps<typeof Link> & Variants) {
  return (
    <Link className={cn(yapButton({ variant, size, block }), arrow && "pr-1.5 pl-6", className)} {...props}>
      <Inner arrow={arrow} variant={variant}>{children}</Inner>
    </Link>
  );
}
