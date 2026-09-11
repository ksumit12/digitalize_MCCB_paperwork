"use client";

import { FrameNav } from "@/components/FrameNav";
import { use, useMemo } from "react";
import { usePathname } from "next/navigation";

export default function FrameLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const pathname = usePathname();
  const wash = useMemo(() => {
    if (
      pathname.includes("/more") ||
      pathname.includes("/handover") ||
      pathname.includes("/install") ||
      pathname.includes("/ancillary") ||
      pathname.includes("/testing")
    ) {
      return "bg-indigo-50";
    }
    if (pathname.includes("/map") || pathname.includes("/cbsds")) {
      return "bg-teal-50";
    }
    return "bg-paper";
  }, [pathname]);

  return (
    <div className={`min-h-screen pb-20 ${wash}`}>
      <FrameNav frameId={id} />
      {children}
    </div>
  );
}
