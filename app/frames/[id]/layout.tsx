"use client";

import { FrameNav } from "@/components/FrameNav";
import { use } from "react";

export default function FrameLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <div className="pb-20">
      <FrameNav frameId={id} />
      {children}
    </div>
  );
}
