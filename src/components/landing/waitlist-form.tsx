"use client";

import { useState } from "react";
import { Yapper } from "@/components/brand/mascot";
import { YapButton } from "@/components/yap/yap-button";
import { isDemo } from "@/lib/data/mode";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Email capture for the launch waitlist. `dark` for use on the ink CTA block. */
export function WaitlistForm({ source, dark, className }: { source: string; dark?: boolean; className?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL.test(value)) {
      setState("error");
      setMessage("That email doesn't look right.");
      return;
    }
    setState("saving");
    try {
      if (isDemo) {
        try {
          const list: string[] = JSON.parse(localStorage.getItem("yap101-waitlist") ?? "[]");
          if (!list.includes(value.toLowerCase())) list.push(value.toLowerCase());
          localStorage.setItem("yap101-waitlist", JSON.stringify(list));
        } catch {}
      } else {
        const { error } = await createClient().from("waitlist").insert({ email: value, source });
        // 23505 = already on the list: that's a success from the user's point of view.
        if (error && error.code !== "23505") throw error;
      }
      setState("done");
    } catch {
      setState("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  if (state === "done")
    return (
      <div className={cn("flex items-center justify-center gap-3", className)} role="status">
        <Yapper shape="bubble" mood="cheer" className="size-12" />
        <p className="text-left font-semibold">You&apos;re on the list! We&apos;ll email you at launch.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className={cn("flex w-full flex-col gap-2", className)} noValidate>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          aria-label="Email address"
          aria-invalid={state === "error"}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          className={cn(
            "h-14 flex-1 rounded-full px-6 text-base outline-none",
            dark ? "bg-white/10 text-white placeholder:text-white/50 focus:bg-white/15" : "surface focus:border-ink",
          )}
        />
        <YapButton type="submit" size="lg" variant={dark ? "white" : "primary"} arrow disabled={state === "saving"}>
          {state === "saving" ? "Joining…" : "Join the waitlist"}
        </YapButton>
      </div>
      <p className={cn("text-sm", state === "error" ? "text-cherry" : dark ? "text-white/60" : "text-stone")} role={state === "error" ? "alert" : undefined}>
        {state === "error" ? message : "Get launch news and early access. No spam, unsubscribe any time."}
      </p>
    </form>
  );
}
