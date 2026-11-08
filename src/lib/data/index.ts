"use client";

import { demoApi } from "./demo";
import { isDemo } from "./mode";
import { supabaseApi } from "./supabase";

export const api = isDemo ? demoApi : supabaseApi;
export { isDemo };
export * from "./types";
